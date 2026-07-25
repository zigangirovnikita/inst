const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createAnalysisLogger } = require('./services/analysisLogger');
const { analyseErrors } = require('./services/errorAnalysis');
const { analyseReels } = require('./services/reelAnalysis');
const { optimiseFunnel, VERSION: FUNNEL_VERSION } = require('./services/funnelOptimizer');
const { generateGrowthPlan, VERSION: GROWTH_PLAN_VERSION } = require('./services/growthPlan');
const { deliverLeadToTelegram, isTelegramConfigured } = require('./services/telegramLead');
const { createAnalysis, findClientAnalysis, saveContent, saveAnswers, claimErrorAnalysis, saveErrorAnalysis, saveFunnelPlan, saveGrowthPlan, saveLeadRequest, updateLeadRequest, failErrorAnalysis, failContent, getAnalysis } = require('./services/database');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3100);
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const POLZA_AI_TOKEN = process.env.POLZA_AI_TOKEN;
const ACTOR_URL = 'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items';
const MAX_REQUEST_BYTES = 32 * 1024;
const ANALYSIS_WINDOW_MS = 60 * 60 * 1000;
const ANALYSIS_LIMIT_PER_IP = 5;
const LIVE_AUDIT_ASSETS_DIR = path.resolve(process.env.LIVE_AUDIT_ASSETS_DIR || path.join(__dirname, 'public', 'assets', 'live-audit'));
const LIVE_AUDIT_ASSETS = new Set(['hero-online-product.png', 'case-jobs.png', 'case-numerology.png', 'case-hypno.png', 'case-china.png', 'case-funnel.png', 'review-01.png', 'review-02.png', 'review-03.png', 'review-04.png', 'review-05.png', 'review-06.png']);
const analysisAttempts = new Map();


function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function normalizeProfileUrl(value) {
  const input = value.trim();
  const username = input.replace(/^@/, '');
  if (/^[a-zA-Z0-9._]{1,30}$/.test(username)) return `https://www.instagram.com/${username}/`;
  let parsed;
  try { parsed = new URL(input); } catch { throw new Error('Введи ник Instagram или ссылку на профиль.'); }
  if (!['instagram.com', 'www.instagram.com'].includes(parsed.hostname.toLowerCase())) throw new Error('Нужна ссылка именно на профиль Instagram.');
  const profileUsername = parsed.pathname.split('/').filter(Boolean)[0];
  if (!profileUsername || ['p', 'reel', 'reels', 'stories', 'explore'].includes(profileUsername.toLowerCase())) throw new Error('Введи ник или ссылку на профиль, а не на отдельный пост или Reel.');
  return `https://www.instagram.com/${profileUsername}/`;
}

function first(value, fallback = '') { return value === undefined || value === null ? fallback : value; }
function toDate(item) { return item.timestamp || item.takenAt || item.date || item.createdAt || ''; }

function mapProfile(item, profileUrl) {
  return {
    username: first(item.username || item.ownerUsername || item.igUsername), fullName: first(item.fullName || item.ownerFullName || item.name),
    biography: first(item.biography || item.bio || item.description), profilePicUrl: first(item.profilePicUrl || item.profilePicUrlHD || item.profilePictureUrl),
    followersCount: first(item.followersCount || item.followers), followingCount: first(item.followsCount || item.following), postsCount: first(item.postsCount || item.mediaCount),
    isVerified: Boolean(item.verified || item.isVerified), url: profileUrl,
  };
}

function mapReel(item) {
  return {
    id: first(item.id || item.shortCode || item.shortcode), url: first(item.url || item.postUrl || item.webUrl), caption: first(item.caption || item.text || item.description),
    thumbnailUrl: first(item.displayUrl || item.thumbnailUrl || item.videoThumbnailUrl || item.imageUrl || item.images?.[0]), thumbnailFallbackUrl: first(item.images?.[0]),
    isPinned: Boolean(item.isPinned || item.pinned || item.isPinnedPost),
    videoUrl: first(item.videoUrl), timestamp: toDate(item), likesCount: first(item.likesCount || item.likes), commentsCount: first(item.commentsCount || item.comments),
    videoViewCount: first(item.videoViewCount || item.videoPlayCount || item.viewsCount || item.viewCount), sharesCount: first(item.sharesCount || item.shareCount || item.reshareCount, null),
    savesCount: first(item.savesCount || item.saveCount || item.bookmarkCount, null), videoDuration: first(item.videoDuration || item.duration),
  };
}

async function runActor(input, log, stage) {
  const startedAt = Date.now();
  log(`${stage}_started`);
  try {
    const response = await fetch(`${ACTOR_URL}?token=${encodeURIComponent(APIFY_TOKEN)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(180000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message || body?.message || `Apify returned ${response.status}`);
    log(`${stage}_completed`, { durationMs: Date.now() - startedAt, resultsCount: Array.isArray(body) ? body.length : 0 });
    return Array.isArray(body) ? body : [];
  } catch (error) {
    log(`${stage}_failed`, { durationMs: Date.now() - startedAt, error: error.message || 'unknown_error' });
    throw error;
  }
}

async function collectContent(analysisId, profileUrl, log) {
  const startedAt = Date.now();
  log('content_collection_started');
  try {
    const [details, reels] = await Promise.all([
      runActor({ resultsType: 'details', directUrls: [profileUrl], resultsLimit: 1 }, log, 'apify_profile'),
      runActor({ resultsType: 'reels', directUrls: [profileUrl], resultsLimit: 6 }, log, 'apify_reels'),
    ]);
    const profile = mapProfile(details[0] || {}, profileUrl);
    const reelItems = reels.map(mapReel).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)).slice(0, 6);
    const analysedReels = await analyseReels(reelItems, POLZA_AI_TOKEN, log);
    saveContent(analysisId, profile, analysedReels);
    log('content_collection_completed', { durationMs: Date.now() - startedAt, reelsCount: analysedReels.length });
    void maybeStartErrorAnalysis(analysisId);
  } catch (error) {
    failContent(analysisId, error.message || 'Не удалось собрать данные Instagram.');
    log('content_collection_failed', { durationMs: Date.now() - startedAt, error: error.message || 'unknown_error' });
  }
}

async function maybeStartErrorAnalysis(analysisId) {
  if (!claimErrorAnalysis(analysisId)) return;
  const analysis = getAnalysis(analysisId);
  const { log } = createAnalysisLogger(analysis.profileUrl, analysisId);
  try {
    const report = await analyseErrors(analysis.profile, analysis.reels, analysis.answers, POLZA_AI_TOKEN, log);
    saveErrorAnalysis(analysisId, report);
  } catch (error) {
    failErrorAnalysis(analysisId, 'Не удалось подготовить анализ ошибок.');
  }
}

function areAnswersComplete(answers) {
  return ['niche', 'product', 'price', 'audience', 'name'].every(key => typeof answers?.[key] === 'string' && answers[key].trim());
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function securityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

function canStartAnalysis(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const attempts = (analysisAttempts.get(ip) || []).filter(timestamp => now - timestamp < ANALYSIS_WINDOW_MS);
  if (attempts.length >= ANALYSIS_LIMIT_PER_IP) return false;
  attempts.push(now);
  analysisAttempts.set(ip, attempts);
  return true;
}
function sendIndex(res) {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  for (const file of ['funnel.js', 'growth-plan.js', 'live-audit.js']) {
    const script = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
    html = html.replace(`<script src="/${file}"></script>`, `<script>\n${script}\n</script>`);
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  res.end(html);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        tooLarge = true;
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) return reject(new Error('Слишком большой запрос.'));
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Некорректные данные запроса.')); }
    });
    req.on('error', reject);
  });
}

function validLeadText(value, limit) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit;
}

function escapeSvg(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
}

function liveAuditFallbackSvg(name) {
  const labels = {
    'hero-online-product.png': ['Никита', 'маркетолог и автор разбора'],
    'case-jobs.png': ['Кейс', 'заявки и автооплаты'],
    'case-numerology.png': ['Кейс', 'рост подписчиков и оплат'],
    'case-hypno.png': ['Кейс', 'кодовые слова и оплаты'],
    'case-china.png': ['Кейс', 'первые продажи из воронки'],
    'case-funnel.png': ['Кейс', 'конверсии и выручка'],
    'review-01.png': ['Отзыв', 'разбор ценообразования'],
    'review-02.png': ['Отзыв', 'воронка и офферы'],
    'review-03.png': ['Отзыв', 'понимание бизнеса'],
    'review-04.png': ['Отзыв', 'чёткая информация'],
    'review-05.png': ['Отзыв', 'экологичный подход'],
    'review-06.png': ['Отзыв', 'точки роста'],
  };
  const [title, subtitle] = labels[name] || ['Материал', 'живой разбор'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#101115"/>
        <stop offset=".58" stop-color="#24202d"/>
        <stop offset="1" stop-color="#4d2035"/>
      </linearGradient>
      <radialGradient id="glow" cx=".7" cy=".24" r=".7">
        <stop offset="0" stop-color="#ff6f9f" stop-opacity=".78"/>
        <stop offset=".42" stop-color="#6d8dff" stop-opacity=".28"/>
        <stop offset="1" stop-color="#101115" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="800" height="1000" rx="44" fill="url(#bg)"/>
    <rect width="800" height="1000" rx="44" fill="url(#glow)"/>
    <rect x="52" y="52" width="696" height="896" rx="34" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="3"/>
    <circle cx="650" cy="172" r="76" fill="#ff6f9f" fill-opacity=".9"/>
    <circle cx="588" cy="238" r="30" fill="#ffffff" fill-opacity=".9"/>
    <text x="90" y="530" fill="#f4f4f7" font-family="Arial, sans-serif" font-size="76" font-weight="800">${escapeSvg(title)}</text>
    <text x="90" y="610" fill="#c9c7d0" font-family="Arial, sans-serif" font-size="42" font-weight="600">${escapeSvg(subtitle)}</text>
    <text x="90" y="820" fill="#ff6f9f" font-family="Arial, sans-serif" font-size="32" font-weight="700">insta.marketologii.ru</text>
  </svg>`;
}

function isInstagramCdnUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname.endsWith('.cdninstagram.com') || url.hostname.endsWith('.fbcdn.net')); } catch { return false; }
}

async function sendThumbnail(res, imageUrls) {
  const urls = imageUrls.filter(isInstagramCdnUrl);
  if (!urls.length) { res.writeHead(400); return res.end(); }
  for (const imageUrl of urls) {
    try {
      const upstream = await fetch(imageUrl, { headers: { accept: 'image/avif,image/webp,image/*,*/*;q=0.8', referer: 'https://www.instagram.com/', 'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/138 Safari/537.36' }, signal: AbortSignal.timeout(15000) });
      const contentType = upstream.headers.get('content-type') || '';
      if (!upstream.ok || !contentType.startsWith('image/')) continue;
      const image = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, { 'content-type': contentType, 'cache-control': 'private, max-age=3600', 'content-length': image.length });
      return res.end(image);
    } catch {}
  }
  res.writeHead(404); res.end();
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const requestUrl = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && requestUrl.pathname === '/') return sendIndex(res);
  if (req.method === 'GET' && requestUrl.pathname === '/glass-signal.css') { res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'public', 'glass-signal.css'))); }
  if (req.method === 'GET' && requestUrl.pathname === '/design-concepts') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(__dirname, 'public', 'design-concepts.html'))); }
  if (req.method === 'GET' && requestUrl.pathname === '/funnel.js') { res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'public', 'funnel.js'))); }
  if (req.method === 'GET' && requestUrl.pathname === '/growth-plan.js') { res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'public', 'growth-plan.js'))); }
  if (req.method === 'GET' && requestUrl.pathname === '/live-audit.js') { res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'public', 'live-audit.js'))); }
  if (req.method === 'GET' && requestUrl.pathname.startsWith('/live-audit-assets/')) {
    const name = requestUrl.pathname.slice('/live-audit-assets/'.length);
    if (!LIVE_AUDIT_ASSETS.has(name)) { res.writeHead(404); return res.end(); }
    try { const image = fs.readFileSync(path.join(LIVE_AUDIT_ASSETS_DIR, name)); res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' }); return res.end(image); } catch { res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' }); return res.end(liveAuditFallbackSvg(name)); }
  }
  if (req.method === 'GET' && requestUrl.pathname === '/api/thumbnail') { try { await sendThumbnail(res, requestUrl.searchParams.getAll('url')); } catch { res.writeHead(404); res.end(); } return; }
  if (req.method === 'GET' && requestUrl.pathname.startsWith('/api/analyses/')) {
    const analysis = getAnalysis(requestUrl.pathname.slice('/api/analyses/'.length));
    return analysis ? sendJson(res, 200, analysis) : sendJson(res, 404, { error: 'Анализ не найден.' });
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/analyses') {
    try {
      if (!APIFY_TOKEN || !POLZA_AI_TOKEN) throw new Error('Не найдены ключи Apify или Polza AI.');
      if (!canStartAnalysis(req)) throw new Error('Слишком много запусков анализа. Попробуй через час.');
      const { url, clientId, force } = await readJson(req); const profileUrl = normalizeProfileUrl(url || '');
      const existing = force === true ? null : findClientAnalysis(clientId, profileUrl);
      if (existing) return sendJson(res, 200, { analysisId: existing.analysisId, reused: true });
      const analysisId = crypto.randomUUID();
      createAnalysis(analysisId, profileUrl, clientId); const { log } = createAnalysisLogger(profileUrl, analysisId); log('analysis_queued');
      void collectContent(analysisId, profileUrl, log); return sendJson(res, 202, { analysisId });
    } catch (error) { return sendJson(res, 400, { error: error.message || 'Не удалось запустить анализ.' }); }
  }
  if (req.method === 'POST' && requestUrl.pathname.startsWith('/api/analyses/') && requestUrl.pathname.endsWith('/funnel-plan')) {
    try {
      const analysisId = requestUrl.pathname.split('/')[3];
      const analysis = getAnalysis(analysisId);
      if (!analysis) throw new Error('Анализ не найден.');
      if (!areAnswersComplete(analysis.answers)) throw new Error('Сначала ответь на вопросы о продукте и аудитории.');
      const body = await readJson(req).catch(() => ({}));
      const plan = analysis.funnelPlan?.version === FUNNEL_VERSION ? analysis.funnelPlan : optimiseFunnel(analysis.answers);
      const selected = plan.choices?.find(choice => choice.key === body.selectedChoiceKey || choice.scenario.id === body.selectedScenarioId);
      if (selected) {
        plan.selectedChoiceKey = selected.key;
        plan.selectedScenarioId = selected.scenario.id;
        plan.best = selected.scenario;
      }
      saveFunnelPlan(analysisId, plan);
      const { log } = createAnalysisLogger(analysis.profileUrl, analysisId);
      log('funnel_plan_completed', { scenarioId: plan.selectedScenarioId, revenue: plan.best.revenue });
      return sendJson(res, 200, plan);
    } catch (error) { return sendJson(res, 400, { error: error.message || 'Не удалось рассчитать воронку.' }); }
  }
  if (req.method === 'POST' && requestUrl.pathname.startsWith('/api/analyses/') && requestUrl.pathname.endsWith('/growth-plan')) {
    try {
      const analysisId = requestUrl.pathname.split('/')[3];
      const analysis = getAnalysis(analysisId);
      if (!analysis) throw new Error('Анализ не найден.');
      if (analysis.errorStatus !== 'ready' || !analysis.funnelPlan) throw new Error('Сначала дождись анализа ошибок и расчёта воронки.');
      if (analysis.growthPlan?.version === GROWTH_PLAN_VERSION && analysis.growthPlan?.selectedScenarioId === analysis.funnelPlan.selectedScenarioId) return sendJson(res, 200, analysis.growthPlan);
      const { log } = createAnalysisLogger(analysis.profileUrl, analysisId);
      const plan = await generateGrowthPlan(analysis, POLZA_AI_TOKEN, log);
      saveGrowthPlan(analysisId, plan);
      return sendJson(res, 200, plan);
    } catch (error) { return sendJson(res, 400, { error: error.message || 'Не удалось собрать план на 30 дней.' }); }
  }
  if (req.method === 'POST' && requestUrl.pathname.startsWith('/api/analyses/') && requestUrl.pathname.endsWith('/lead')) {
    try {
      const analysisId = requestUrl.pathname.split('/')[3];
      const analysis = getAnalysis(analysisId);
      if (!analysis) throw new Error('Анализ не найден.');
      const body = await readJson(req);
      if (!validLeadText(body.name, 120) || !validLeadText(body.contact, 180)) throw new Error('Укажи имя и Telegram или номер телефона.');
      if (String(body.website || '').trim()) throw new Error('Не удалось отправить заявку.');
      if (!isTelegramConfigured()) throw new Error('Telegram-бот для заявок пока не настроен.');
      const lead = {
        id: crypto.randomUUID(), analysisId, name: body.name.trim(), contact: body.contact.trim(),
        product: String(body.product || analysis.answers?.product || '').trim().slice(0, 240),
        productPrice: Number(String(body.productPrice || analysis.answers?.price || '').replace(/[^\d]/g, '')) || 0,
        socialLink: String(body.socialLink || analysis.profile?.username || '').trim().slice(0, 240),
        comment: String(body.comment || '').trim().slice(0, 1000), funnelRevenue: analysis.funnelPlan?.best?.revenue || 0,
      };
      saveLeadRequest(lead.id, analysisId, lead, 'pending');
      try { await deliverLeadToTelegram(lead); updateLeadRequest(lead.id, 'delivered'); } catch (error) { updateLeadRequest(lead.id, 'failed', error.message || 'telegram_failed'); throw new Error('Не удалось отправить заявку. Попробуй ещё раз позже.'); }
      const { log } = createAnalysisLogger(analysis.profileUrl, analysisId); log('live_audit_lead_delivered', { leadId: lead.id });
      return sendJson(res, 200, { ok: true });
    } catch (error) { return sendJson(res, 400, { error: error.message || 'Не удалось отправить заявку.' }); }
  }
  if (req.method === 'POST' && requestUrl.pathname.startsWith('/api/analyses/') && requestUrl.pathname.endsWith('/answers')) {
    try {
      const analysisId = requestUrl.pathname.split('/')[3]; const analysis = getAnalysis(analysisId); if (!analysis) throw new Error('Анализ не найден.');
      const { answers } = await readJson(req); if (!areAnswersComplete(answers)) throw new Error('Ответь на все пять вопросов.');
      saveAnswers(analysisId, answers); const { log } = createAnalysisLogger(analysis.profileUrl, analysisId); log('questionnaire_completed'); void maybeStartErrorAnalysis(analysisId);
      return sendJson(res, 200, getAnalysis(analysisId));
    } catch (error) { return sendJson(res, 400, { error: error.message || 'Не удалось сохранить ответы.' }); }
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log(`Instagram profile checker: http://localhost:${PORT}`));
