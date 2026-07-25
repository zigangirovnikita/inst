(function liveAuditScreen() {
  const asset = name => '/live-audit-assets/' + name;
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const cases = [
    ['case-jobs.png', 'Кейс с ростом подписчиков, кодовыми словами, заявками и автооплатами'],
    ['case-numerology.png', 'Кейс с ростом подписчиков и оплатами после внедрения метода'],
    ['case-hypno.png', 'Кейс с ростом подписчиков, кодовыми словами и автооплатами практик'],
    ['case-china.png', 'Кейс с первыми продажами из воронки'],
    ['case-funnel.png', 'Кейс с конверсиями воронки и выручкой'],
  ];
  const reviews = [
    ['review-01.png', 'Отзыв о разборе ценообразования и модели продаж'], ['review-02.png', 'Отзыв о построении воронки и офферах'],
    ['review-03.png', 'Отзыв о консультации и понимании бизнеса через рассылки'], ['review-04.png', 'Короткий отзыв о чёткой информации'],
    ['review-05.png', 'Отзыв об экологичном подходе специалиста'], ['review-06.png', 'Отзыв о точках роста и пути к ним'],
  ];
  const defaultAuditPoints = [
    'Подготовит 7-дневный контент-план на основе успешных рилс русских и зарубежных экспертов в вашей нише.',
    'Опишет поэтапную воронку и офферы каждого этапа под выбранный маршрут.',
    'Определит, кто из аудитории будет покупать, кто не будет, и как привлекать нужных людей.',
    'Оценит, сколько времени и затрат потребует реализация, чтобы не платить за лишнее и не собирать неэффективные шаги.',
  ];

  function ensureStyles() {
    if (document.querySelector('#live-audit-styles')) return;
    const style = document.createElement('style');
    style.id = 'live-audit-styles';
    style.textContent = '.live-audit-hero{width:100%;padding:0;border:1px solid #5d4774;border-radius:22px;overflow:hidden;background:#1c1a20;cursor:zoom-in}.live-audit-hero img{display:block;width:100%;height:auto;max-height:none;object-fit:contain}.live-panel{padding:20px;border:1px solid #39343f;border-radius:20px;background:#1c1a20;margin:16px 0}.live-panel h2{font-size:23px}.live-points{padding-left:21px;margin:12px 0 0}.live-points li{margin:11px 0;line-height:1.42}.media-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:15px}.media-grid.cases{grid-template-columns:1fr}.media-button{padding:0;border:1px solid #4b4353;border-radius:14px;background:#25222a;overflow:hidden;cursor:zoom-in}.media-button img{display:block;width:100%;height:auto}.media-button:focus-visible,.live-audit-hero:focus-visible{outline:2px solid #f0b54d;outline-offset:3px}.live-urgency{padding:23px;background:linear-gradient(135deg,#3d2f1b,#211b22);border:1px solid #8a6630;border-radius:22px;margin:22px 0;text-align:center}.live-urgency h2{color:#f0b54d}.live-urgency p{font-size:18px}.image-lightbox{position:fixed;z-index:10;inset:0;border:0;background:#08070ae8;padding:24px;display:grid;place-items:center;cursor:zoom-out}.image-lightbox figure{margin:0;max-width:min(100%,860px);max-height:100%;display:grid;gap:10px}.image-lightbox img{display:block;max-width:100%;max-height:78vh;border-radius:14px}.image-lightbox figcaption{color:#fff;text-align:center}.lead-form-card{padding:22px;border:1px solid #4d3d5a;border-radius:22px;background:#1c1a20}.lead-form-card label{display:block;margin:14px 0}.lead-form-card input,.lead-form-card textarea{margin-top:7px}.lead-form-card textarea{min-height:95px}.lead-success-card{min-height:60vh;display:grid;place-items:center;text-align:center}.lead-success-card article{padding:30px;border:1px solid #70559a;border-radius:24px;background:#251e2c}.lead-success-card h1{font-size:32px}@media(max-width:420px){.live-panel{padding:17px}.media-grid{gap:7px}.image-lightbox{padding:14px}}';
    document.head.append(style);
  }

  function scrollPageTop() {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }

  function gallery(images, type) {
    return '<div class="media-grid ' + type + '">' + images.map(([name, alt]) => '<button class="media-button" data-image="' + esc(asset(name)) + '" data-alt="' + esc(alt) + '"><img src="' + esc(asset(name)) + '" alt="' + esc(alt) + '" width="800" height="1000" loading="lazy"></button>').join('') + '</div>';
  }

  function cleanText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').replace(/[.;:]+$/g, '');
  }

  function competitorGroup(points) {
    const fromBullet = cleanText(points?.[0]).match(/адаптировать темы под ([^.]+)$/i)?.[1];
    const answers = state.analysis?.answers || state.answers || {};
    return cleanText(fromBullet || answers.audience || answers.niche || 'экспертов в вашей нише').toLowerCase();
  }

  function actionPoint(value) {
    const text = cleanText(value);
    return text
      .replace(/^подготовить\b/i, 'Подготовит')
      .replace(/^описать\b/i, 'Опишет')
      .replace(/^определить\b/i, 'Определит')
      .replace(/^оценить\b/i, 'Оценит') + '.';
  }

  function auditPoints() {
    const fromPlan = state.analysis?.growthPlan?.liveReview?.bullets;
    const selectedRoute = state.analysis?.funnelPlan?.best?.title;
    const sourcePoints = Array.isArray(fromPlan) && fromPlan.length >= 3 ? fromPlan : selectedRoute ? [
      defaultAuditPoints[0],
      'Опишет поэтапную воронку и офферы каждого этапа: ' + selectedRoute + '.',
      'Определит, кто из вашей аудитории будет покупать, кто не будет, и как привлекать нужных людей.',
      defaultAuditPoints[3],
    ] : defaultAuditPoints;
    return [
      'Подготовит 7-дневный контент-план на основе успешных рилс русских и зарубежных ' + competitorGroup(sourcePoints) + '.',
      ...sourcePoints.slice(1, 4).map(actionPoint),
    ];
  }

  function bindLightbox() {
    document.querySelectorAll('[data-image]').forEach(button => button.onclick = () => {
      const overlay = document.createElement('button');
      overlay.className = 'image-lightbox'; overlay.type = 'button'; overlay.setAttribute('aria-label', 'Закрыть увеличенное изображение');
      overlay.innerHTML = '<figure><img src="' + esc(button.dataset.image) + '" alt="' + esc(button.dataset.alt) + '"><figcaption>Нажмите, чтобы закрыть</figcaption></figure>';
      overlay.onclick = () => overlay.remove(); document.body.append(overlay);
    });
  }

  window.renderLiveAudit = function renderLiveAudit() {
    ensureStyles();
    app.innerHTML = '<section class="screen"><button class="back" id="back-to-plan">← К плану на 30 дней</button><button class="live-audit-hero" data-image="' + asset('hero-online-product.png') + '" data-alt="Никита — маркетолог и автор разбора"><img src="' + asset('hero-online-product.png') + '" alt="Никита — маркетолог и автор разбора" width="800" height="450" fetchpriority="high"></button><article class="live-panel"><h1>50-минутный живой разбор</h1><p>На созвоне разберём выбранную воронку и соберём практичные решения для контента, офферов и следующего шага к продаже.</p><h2>Что Никита сделает на разборе для вас</h2><ol class="live-points">' + auditPoints().map(point => '<li>' + esc(point) + '</li>').join('') + '</ol></article><article class="live-panel"><h2>Кейсы и результаты</h2><p class="muted">Нажмите на картинку, чтобы рассмотреть её подробнее.</p>' + gallery(cases, 'cases') + '</article><article class="live-panel"><h2>Что люди говорят после разбора</h2>' + gallery(reviews, 'reviews') + '</article><article class="live-urgency"><h2>За 50 минут вы получите готовые решения, после которых не придется тратить лишние деньги и энергию</h2><p>Оставьте заявку сейчас, чтобы не потерять еще несколько месяцев на поиски оптимальных решений, слив заявок и оплат</p><button class="primary" id="open-lead-form">Оставить заявку на разбор</button></article></section>';
    scrollPageTop();
    bindLightbox();
    document.querySelector('#back-to-plan').onclick = () => { state.screen = 'growthPlan'; persist(); render(); };
    document.querySelector('#open-lead-form').onclick = () => { state.screen = 'leadForm'; persist(); render(); };
  };

  window.renderLeadForm = function renderLeadForm() {
    ensureStyles();
    const answers = state.analysis?.answers || state.answers || {};
    const profile = state.analysis?.profile || {};
    app.innerHTML = '<section class="screen"><button class="back" id="back-to-live-audit">← О бесплатном разборе</button><form class="lead-form-card" id="lead-form"><h1>Оставить заявку на 50-минутный разбор</h1><p class="lead">Заполни контакты. Никита ответит в течение 24 часов. До разбора подготовь ссылку на Instagram и основной продукт.</p><label>Имя *<input name="name" autocomplete="name" required value="' + esc(answers.name) + '"></label><label>Telegram / номер *<input name="contact" autocomplete="tel" required placeholder="@username или номер…"></label><label>Продукт<input name="product" autocomplete="off" value="' + esc(answers.product) + '"></label><label>Чек<input name="productPrice" autocomplete="off" inputmode="numeric" value="' + esc(answers.price) + '"></label><label>Instagram<input name="socialLink" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(profile.username ? '@' + profile.username : '') + '"></label><label>Что хочешь получить на разборе?<textarea name="comment" autocomplete="off" maxlength="1000" placeholder="Например: понять, какой оффер и воронку собрать…"></textarea></label><input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"><button class="primary" id="submit-lead" type="submit">Отправить заявку</button><p class="muted" id="lead-status" aria-live="polite"></p></form></section>';
    scrollPageTop();
    document.querySelector('#back-to-live-audit').onclick = () => { state.screen = 'liveAudit'; persist(); render(); };
    document.querySelector('#lead-form').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget; const submit = document.querySelector('#submit-lead'); const status = document.querySelector('#lead-status');
      const values = Object.fromEntries(new FormData(form).entries()); submit.disabled = true; submit.textContent = 'Отправляем…'; status.textContent = '';
      try { await api('/api/analyses/' + state.analysisId + '/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) }); state.screen = 'leadSuccess'; persist(); render(); }
      catch (error) { submit.disabled = false; submit.textContent = 'Отправить заявку'; status.textContent = error.message; }
    };
  };

  window.renderLeadSuccess = function renderLeadSuccess() {
    ensureStyles();
    app.innerHTML = '<section class="lead-success-card screen"><article><div class="growth-spark">✓</div><h1>Заявка принята</h1><p>Никита ответит в течение 24 часов. До созвона подготовьте ссылку на Instagram и основной продукт.</p><button class="primary" id="back-to-report">Вернуться к плану</button></article></section>';
    scrollPageTop();
    document.querySelector('#back-to-report').onclick = () => { state.screen = 'growthPlan'; persist(); render(); };
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('#show-live-audit');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation(); state.screen = 'liveAudit'; persist(); window.renderLiveAudit();
  }, true);
}());
