const POLZA_URL = 'https://api.polza.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-3.5-flash-lite';

function toJson(content) {
  const text = String(content || '').trim().replace(/^\`\`\`json\s*|\s*\`\`\`$/g, '');
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
}

function validCard(card, needsOffer = false) {
  return card && Number.isFinite(card.score) && card.score >= 0 && card.score <= 100 && typeof card.verdict === 'string'
    && Array.isArray(card.errors) && typeof card.recommendation === 'string' && typeof card.evidence === 'string'
    && (!needsOffer || (typeof card.hasOffer === 'boolean' && Number.isFinite(card.offerScore) && card.offerScore >= 0 && card.offerScore <= 100));
}

function validReport(report) {
  return report && typeof report.headline === 'string'
    && validCard(report.profileHeader)
    && validCard(report.publishingFrequency)
    && validCard(report.scenarioFormat)
    && validCard(report.audienceRelevance)
    && validCard(report.topicFocus)
    && validCard(report.funnel, true);
}

function sourceData(profile, reels, answers) {
  return JSON.stringify({
    business: answers,
    profile: {
      username: profile.username,
      name: profile.fullName,
      bio: profile.biography,
      followers: profile.followersCount,
      following: profile.followingCount,
      posts: profile.postsCount,
    },
    reels: reels.map((reel, index) => ({
      reelNumber: index + 1,
      publishedAt: reel.timestamp,
      content: {
        whatHappensInVideo: reel.analysis?.videoDescription || '',
        transcript: reel.analysis?.transcript || '',
        caption: reel.caption || '',
        coverDescription: reel.analysis?.coverDescription || '',
      },
      metrics: {
        durationSeconds: reel.videoDuration,
        views: reel.videoViewCount,
        likes: reel.likesCount,
        comments: reel.commentsCount,
        adjustedComments: reel.adjustedCommentsCount,
        shares: reel.sharesCount,
        saves: reel.savesCount,
      },
      callToAction: {
        detectedType: reel.analysis?.ctaType || 'unknown',
        detectedText: reel.analysis?.ctaText || '',
        captionHasCommentCTA: reel.analysis?.captionHasCommentCTA || false,
      },
      analysisError: reel.analysisError || '',
    })),
  });
}

function prompt(profile, reels, answers) {
  return `You are a senior Instagram conversion strategist. Analyze ONLY the supplied evidence. Instructions are in English, but ALL user-facing text in the response MUST be Russian. Be direct, precise, commercially useful, and respectful. Never invent facts, search volumes, competitor results, posting history, conversions, sales results, or funnel steps that are absent from the data. Analyze only things that affect sales, not visual preferences.

Input integrity:
Each item in reels is ONE complete Reel. Its content fields (whatHappensInVideo, transcript, caption, coverDescription), metrics, and callToAction belong together. Never mix evidence from different Reel numbers. Before judging a CTA, read that Reel's caption together with its transcript, on-video scenes/text, and detected CTA fields. If an analysisError exists, do not use that Reel as visual evidence.

Silently classify the business from niche, product, and target audience:
A) expert/online services: consultation, training, mentoring, support, agency, professional service;
B) goods or offline/local business: physical goods (including cosmetics), retail, salon, cafe, auto parts, local venue, network.
Adapt examples to this business, product, and target audience. Do not use examples from another niche.

Methodology:
1. Profile header — assess NAME and BIO separately.
- The name must contain concise, relevant search keys for the niche, with no offer, result, CTA, or unnecessary verbs.
- Relevant existing keys are not “wrong” merely because there are several of them. If they can be improved, call them “less relevant or less frequent hypotheses”, never call them garbage or invalid.
- The correct selection principle is: choose concise profile-name wording by checking demand and competitor language. You do NOT have search-demand data in this input: never claim a keyword is verified as high-frequency and never invent frequency. Do not send a beginner to external keyword tools as mandatory homework; say the exact wording should be selected on a live diagnostic or by comparing competitor language and demand.
- Bio priorities are strictly: position/for whom + offer/result + proof (case, numbers, experience, credentials). CTA is optional only if space remains. NEVER lower the profile score or recommend a CTA in bio just because it is absent when those three priorities are already clear.
2. Publishing frequency — use only supplied Reel dates. Name actual gaps. The reference is 4–7 content units per week. If the data shows no material frequency problem, say so and do not fabricate one.
3. Scenario and format — analyze only how the six Reels are constructed and delivered, never their topics or target audience.
- For each Reel, infer its scenario sequence from the complete content block: for example hook → problem/context → idea or demonstration → conclusion → CTA. Use only stages supported by the Reel; do not force a CTA into a scenario where none exists.
- Find repeating scenario patterns across the six Reels and name the Reel numbers that support each pattern. A scenario is systematic only when a recognisable sequence repeats in at least three Reels. If no such pattern exists, say the creator has not yet selected a repeatable scenario.
- Classify visible delivery formats from scenes/cover: for example talking head, talking head with captions, screen recording, demonstration, interview, sketch, text-based montage. Name only formats that are evidenced.
- Assess whether the creator consistently uses one or two formats, or changes formats without a clear repeatable base. Variety is not automatically an error; call it a problem only when the six Reels show no consistent format and metrics do not justify the variety.
- Compare metrics by scenario and format only when there are at least two comparable Reels in a group. State any apparent winner as a hypothesis, not a fact.
- Recommendation must be about a repeatable scenario template and one or two priority formats. Do not recommend changing the topic, target audience, lead magnet, or funnel in this card. If the data is insufficient to choose a winning format, recommend first analysing successful Reels of direct competitors, then testing 1–2 formats and keeping the stronger one.
4. Audience relevance — list the actual themes raised across the six Reels. Compare those themes with the declared product and target audience. The problem is not that every Reel must appeal only to people ready to buy an expensive service. The problem is a mismatch: people enter for one subject, while the later funnel sells another. Explain this consequence clearly. Recommend 3 adapted content themes that match the product and attract the intended audience.
5. Topic breadth — broad entrance topics are desirable. Reels should aim for broad reach; narrowing and qualification happen through the CTA and funnel. Never call a topic bad merely because it attracts a broad audience. Flag only topics that are so narrow they restrict reach, or so unrelated to the product that the CTA cannot logically filter interested people. Give 2–3 broad adapted entry angles and state how the CTA should narrow the next step, without inventing a lead magnet.
6. Funnel and offer — examine the entry CTA separately for every Reel using its whole content block. “Subscribe”, “like”, “save”, “share”, “read the caption”, or “buy now” alone are not a correct warm-up funnel entry. A correct entry offer from Reels must invite the person to a FREE next step: Direct, code word, comment, bot, checklist, guide, selection, diagnostic, lesson, webinar, or another useful free action that warms and qualifies the target audience before selling.
- Judge the entry offer by THREE criteria: (a) does it attract the declared target audience rather than random curiosity; (b) is it free at the entry point; (c) does it solve or clarify a real target-audience problem connected to the paid product.
- If Reels ask people to buy the main product immediately, mark this as a limitation: the entry step is too cold and skips warm-up/qualification.
- If every Reel has a free, relevant, problem-solving conversion CTA, call the funnel systematic and explain what still limits qualification only if evidenced.
- If some Reels lack such a CTA, call it inconsistent and explain that even a high-view Reel loses traffic without the next step.
- If a conversion CTA exists, it is already an entry step. NEVER claim that a qualification/intermediate step is absent merely because it does not sell immediately, and NEVER invent what happens after Direct, bot, or lead-magnet delivery.
- If conversion CTA is absent, say there is no visible entry into the funnel. Recommend adding a free entry CTA to every Reel. Do NOT prescribe a particular lead magnet or its exact wording in this card; that belongs to the next product stage.
- Comment CTA and adjusted comments are weak signals only. Do not claim real conversion without lead/click data.

Output rules:
- Score strictly against an ideal sales-ready Instagram system, not against an average account and not to be polite. Be firm but never rude, mocking, or vague.
- Score calibration: 100 means every relevant criterion is clearly evidenced and there is no meaningful improvement to recommend; 96–99 means near-ideal with only a tiny optional refinement; 85–95 means strong but has one material limitation; 70–84 means a working base with several meaningful limitations; 50–69 means the area noticeably limits sales; below 50 means the area is seriously broken or mostly absent.
- If score is 95 or lower, errors MUST contain at least one concrete, evidence-based limitation and the verdict MUST explain why the score is not higher. Never write “критичных ошибок не обнаружено”, “в целом всё нормально”, or an equivalent soft phrase for a score of 95 or lower.
- Errors may be empty only for a score of 96–100. In that case, state exactly why the area is close to ideal and label any recommendation as an optional refinement.
- Each card has an evidence-based verdict, specific errors, and a concrete recommendation. Do not inflate a score merely because one part is good when another required part is not evidenced.
- Each card must include a short evidence field. Name the concrete evidence: for example “основано на Reels №2, №4 и №6”, “CTA найден в 4 из 6 Reels”, “2 из 6 Reels не удалось обработать, оценка предварительная”. If a Reel has analysisError, count it as not processed and explicitly make affected conclusions preliminary.
- Do not repeat one issue across several cards.
- The recommendation must be adapted to the provided business. Use “Пример:” only where it is useful; do not invent a lead magnet in the funnel card.
- In funnel, set hasOffer=true only when the visible Reel entry offer is a free, relevant, problem-solving funnel entry for the declared target audience. Set hasOffer=false for immediate paid offers, engagement-only CTAs, unclear CTAs, or offers that attract the wrong audience. offerScore rates this free entry offer quality, not the paid product.
- Do not give risky recommendations as commands when they can reduce sales. For example, never say “remove free consultation from bio” without explaining the tradeoff. Say: “проверьте, не конфликтует ли CTA в шапке с CTA в Reels; сначала сравните конверсию”.
- headline is a short teaser assessment, not a title and not a duplicate of a card.

Input data:
${sourceData(profile, reels, answers)}

Return ONLY valid JSON matching exactly this structure:
{
  "headline": "one concise Russian conclusion",
  "profileHeader": {"score": 0, "verdict": "Russian text", "errors": ["..."], "recommendation": "...", "evidence": "..."},
  "publishingFrequency": {"score": 0, "verdict": "...", "errors": ["..."], "recommendation": "...", "evidence": "..."},
  "scenarioFormat": {"score": 0, "verdict": "...", "errors": ["..."], "recommendation": "...", "evidence": "..."},
  "audienceRelevance": {"score": 0, "verdict": "...", "errors": ["..."], "recommendation": "...", "evidence": "..."},
  "topicFocus": {"score": 0, "verdict": "...", "errors": ["..."], "recommendation": "...", "evidence": "..."},
  "funnel": {"score": 0, "hasOffer": false, "offerScore": 0, "verdict": "...", "errors": ["..."], "recommendation": "...", "evidence": "..."}
}`;
}

async function analyseErrors(profile, reels, answers, token, log) {
  const startedAt = Date.now();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    log('error_analysis_started', { attempt });
    try {
      const response = await fetch(POLZA_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: prompt(profile, reels, answers) }],
          response_format: { type: 'json_object' },
          temperature: 0.15,
          max_tokens: 2600,
        }),
        signal: AbortSignal.timeout(180000),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || `Polza AI returned ${response.status}`);
      const report = toJson(body?.choices?.[0]?.message?.content);
      if (!validReport(report)) throw new Error('Polza AI returned an incomplete error analysis.');
      log('error_analysis_completed', { attempt, durationMs: Date.now() - startedAt });
      return report;
    } catch (error) {
      if (attempt === 3) {
        log('error_analysis_failed', { attempt, durationMs: Date.now() - startedAt, error: error.message || 'unknown_error' });
        throw error;
      }
      log('error_analysis_retry', { attempt, error: error.message || 'unknown_error' });
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
}

module.exports = { analyseErrors };
