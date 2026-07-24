const POLZA_URL = 'https://api.polza.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-3.1-flash-lite';
const MAX_ATTEMPTS = 3;

function parseJson(content) {
  if (typeof content === 'object' && content) return content;
  const text = String(content || '').trim().replace(/^\`\`\`json\s*|\s*\`\`\`$/g, '');
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function hasCommentCta(caption) {
  return /(?:напиш|пиши|оставь|поставь).{0,35}(?:коммент|в комментар|слово)|(?:comment|write).{0,35}(?:comment|below)/i.test(caption || '');
}

function createPrompt(reel) {
  return `Analyze one public Instagram Reel for a marketing audit. The instructions are in English, but EVERY text value in your JSON response must be in Russian. Do not mention commenters or identify people by name. Do not invent facts.

Caption:
"""${reel.caption || 'No caption'}"""

Identify the strongest call to action in the caption, spoken words, or meaningful on-screen text. A conversion CTA asks for a concrete next step with a benefit: write a code word/comment/Direct message to receive a useful item, selection, diagnostic, check, booking, or other lead magnet. An engagement-only CTA asks only to subscribe, like, save, or share. A profile-link CTA is not a conversion CTA unless a specific useful result is stated. Set ctaType to exactly "conversion", "engagement_only", or "none". ctaText must quote or concisely describe the actual CTA; use an empty string if none. Determine whether the caption explicitly asks viewers to leave a comment or write a word in comments.

For videoDescription, you MUST describe the video scene by scene, never as a general summary. Use this exact readable format:
Сцена 1 (approximate time range): what is visible and what action happens. Надписи: meaningful non-subtitle writing, or “нет”.
Сцена 2 (...): ...
Create a new scene whenever the camera, place, person, action, or visible message changes. Include all distinct scenes, even very short ones. Do NOT copy subtitles or spoken captions into “Надписи”. End the field with exactly one separate sentence: “Субтитры: есть.” or “Субтитры: нет.”

Return ONLY a valid JSON object with exactly these keys:
{
  "transcript": "Complete Russian transcription or Russian translation of spoken words. Empty string if no intelligible speech.",
  "videoDescription": "Numbered scene-by-scene Russian description in the mandatory format, ending with the required subtitles sentence.",
  "coverDescription": "Concise Russian description of the reel cover: visible image and text.",
  "captionHasCommentCTA": false,
  "ctaType": "none",
  "ctaText": ""
}`;
}

async function analyseOneReel(reel, index, token, log) {
  const reelDetails = { reelIndex: index + 1, reelId: reel.id || 'unknown' };
  const startedAt = Date.now();
  if (!reel.videoUrl) {
    log('polza_skipped', { ...reelDetails, reason: 'video_url_missing' });
    return { ...reel, analysis: null, adjustedCommentsCount: reel.commentsCount, analysisError: 'Видео недоступно для анализа.' };
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    log('polza_started', { ...reelDetails, attempt });
    try {
      const content = [{ type: 'text', text: createPrompt(reel) }, { type: 'video_url', video_url: { url: reel.videoUrl } }];
      if (reel.thumbnailUrl) content.push({ type: 'image_url', image_url: { url: reel.thumbnailUrl } });
      const response = await fetch(POLZA_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL, messages: [{ role: 'user', content }], response_format: { type: 'json_object' },
          max_tokens: 1200, temperature: 0.1,
        }),
        signal: AbortSignal.timeout(240000),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || `Polza AI returned ${response.status}`);
      const result = parseJson(body?.choices?.[0]?.message?.content);
      const commentCta = result.captionHasCommentCTA === true || String(result.captionHasCommentCTA).toLowerCase() === 'true' || hasCommentCta(reel.caption);
      const ctaType = ['conversion', 'engagement_only', 'none'].includes(result.ctaType) ? result.ctaType : 'none';
      log('polza_completed', { ...reelDetails, attempt, commentCta, ctaType, durationMs: Date.now() - startedAt });
      return {
        ...reel,
        analysis: {
          transcript: result.transcript || '',
          videoDescription: result.videoDescription || '',
          coverDescription: result.coverDescription || '',
          captionHasCommentCTA: commentCta,
          ctaType,
          ctaText: result.ctaText || '',
        },
        adjustedCommentsCount: commentCta ? Math.round(Number(reel.commentsCount || 0) / 2) : reel.commentsCount,
      };
    } catch (error) {
      const message = error.message || 'unknown_error';
      if (attempt < MAX_ATTEMPTS) {
        log('polza_retry', { ...reelDetails, attempt, error: message });
        await wait(attempt * 1500);
        continue;
      }
      log('polza_failed', { ...reelDetails, attempt, durationMs: Date.now() - startedAt, error: message });
      return { ...reel, analysis: null, adjustedCommentsCount: reel.commentsCount, analysisError: 'Не удалось проанализировать видео.' };
    }
  }
  return { ...reel, analysis: null, adjustedCommentsCount: reel.commentsCount, analysisError: 'Не удалось проанализировать видео.' };
}

function analyseReels(reels, token, log) {
  return Promise.all(reels.map((reel, index) => analyseOneReel(reel, index, token, log)));
}

module.exports = { analyseReels };
