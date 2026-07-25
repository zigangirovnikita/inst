(function funnelScreen() {
  const PLAN_VERSION = 14;
  const number = value => new Intl.NumberFormat('ru-RU').format(Math.round(value || 0));
  const percent = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const variantWord = value => {
    const modulo100 = Math.abs(value) % 100;
    const modulo10 = Math.abs(value) % 10;
    if (modulo100 > 10 && modulo100 < 20) return 'вариантов';
    if (modulo10 === 1) return 'вариант';
    if (modulo10 > 1 && modulo10 < 5) return 'варианта';
    return 'вариантов';
  };

  function ensureStyles() {
    if (document.querySelector('#funnel-styles')) return;
    const style = document.createElement('style');
    style.id = 'funnel-styles';
    style.textContent = '.funnel-loading{min-height:68vh;display:grid;place-items:center;text-align:center}.funnel-orbit{position:relative;width:230px;height:230px;margin:15px auto 30px}.funnel-core{position:absolute;inset:74px;border-radius:50%;display:grid;place-items:center;background:#f0b54d;color:#211806;font-size:34px;box-shadow:0 0 45px #f0b54d55}.funnel-icon{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px;border-radius:14px;display:grid;place-items:center;background:#28222f;border:1px solid #695080;font-size:23px;animation:funnel-float 4.6s linear infinite}.funnel-icon:nth-child(2){animation-delay:-.8s}.funnel-icon:nth-child(3){animation-delay:-1.6s}.funnel-icon:nth-child(4){animation-delay:-2.4s}.funnel-icon:nth-child(5){animation-delay:-3.2s}.funnel-icon:nth-child(6){animation-delay:-4s}@keyframes funnel-float{from{transform:rotate(0deg) translateX(96px) rotate(0deg)}to{transform:rotate(360deg) translateX(96px) rotate(-360deg)}}.funnel-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:14px 0}.funnel-metric{padding:14px;border:1px solid #44374d;border-radius:16px;background:#1c1a20}.funnel-metric b{display:block;color:#f0b54d;font-size:21px;margin-top:5px}.funnel-choice{padding:18px;border:1px solid #39343f;border-radius:20px;background:#1c1a20;margin:14px 0}.funnel-choice.selected{border-color:#f0b54d;box-shadow:0 0 0 1px #f0b54d55}.funnel-choice-top{display:block}.funnel-choice h2{font-size:19px;margin:5px 0 8px}.funnel-choice-label{color:#f0b54d;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.03em}.funnel-choice p{margin:7px 0;color:#b9b3c1}.funnel-select-panel{display:grid;gap:10px;margin:18px 0 20px}.choose-funnel{width:100%;padding:15px 16px;background:#f0b54d;color:#211806;text-align:left;white-space:normal}.choose-funnel.selected{background:#42334f;color:#fff;box-shadow:inset 0 0 0 1px #ffffff24}.choose-funnel span{display:block;font-size:13px;opacity:.76;margin-top:4px}.funnel-step{display:flex;gap:12px;align-items:flex-start;position:relative;padding:0 0 16px 4px}.funnel-step:not(:last-child):before{content:"";position:absolute;left:13px;top:30px;bottom:0;border-left:2px solid #5f4970}.funnel-dot{width:20px;height:20px;min-width:20px;border-radius:50%;margin-top:2px;background:#f0b54d;z-index:1}.funnel-step b{display:block}.funnel-step span{color:#b9b3c1;font-size:14px}.funnel-note{color:#b9b3c1;font-size:14px}.funnel-assumptions{padding-left:19px;color:#b9b3c1}.funnel-assumptions li{margin:7px 0}@media(max-width:520px){.funnel-summary{grid-template-columns:1fr 1fr}.funnel-metric b{font-size:18px}}';
    document.head.append(style);
  }

  function loadingMarkup() {
    return '<section class="funnel-loading screen"><div><div class="funnel-orbit"><div class="funnel-core">⌁</div><span class="funnel-icon">▶</span><span class="funnel-icon">🤖</span><span class="funnel-icon">📚</span><span class="funnel-icon">🎬</span><span class="funnel-icon">💬</span><span class="funnel-icon">☎</span></div><h1>Вычисляю оптимальную воронку</h1><p class="muted">Перебираю бесплатные и платные шаги, трипваеры, созвоны и переписки…</p></div></section>';
  }

  function renderStages(stages) {
    return stages.map(stage => '<div class="funnel-step"><i class="funnel-dot"></i><div><b>' + esc(stage.label) + ' · ' + number(stage.people) + '</b>' + (stage.note ? '<span>' + esc(stage.note) + '</span>' : '') + '</div></div>').join('');
  }

  function renderMetrics(item) {
    const sales = item.salesBreakdown || { automatic: 0, chat: 0, call: 0 };
    const flow = item.flow || { chatsHandled: 0, callsHeld: item.calls || 0, lost: item.lostLeads || 0 };
    return '<div class="funnel-summary"><article class="funnel-metric">Выручка<b>' + number(item.revenue) + ' ₽</b></article><article class="funnel-metric">Автопокупки<b>' + number(sales.automatic) + '</b></article><article class="funnel-metric">Продажи в переписке<b>' + number(sales.chat) + '</b></article><article class="funnel-metric">Продажи на созвоне<b>' + number(sales.call) + '</b></article><article class="funnel-metric">Обработано переписок<b>' + number(flow.chatsHandled) + '</b></article><article class="funnel-metric">Состоялось созвонов<b>' + number(flow.callsHeld) + '</b></article><article class="funnel-metric">Потерялись / остыли<b>' + number(flow.lost) + '</b></article><article class="funnel-metric">С трипваера<b>' + number(item.tripwireRevenue) + ' ₽</b></article></div>';
  }

  function renderChoices(plan) {
    return (plan.choices || []).map(choice => {
      const selected = choice.key === plan.selectedChoiceKey;
      return '<article class="funnel-choice ' + (selected ? 'selected' : '') + '"><div class="funnel-choice-top"><span class="funnel-choice-label">' + esc(choice.label) + '</span><h2>' + esc(choice.scenario.title) + '</h2><p>' + esc(choice.description) + '</p></div>' + renderMetrics(choice.scenario) + renderStages(choice.scenario.stages) + '</article>';
    }).join('');
  }

  function renderChoiceButtons(plan) {
    const labels = { simple: 'Самый простой', recommended: 'Оптимальный сейчас', maxRevenue: 'Лучший по продажам' };
    return '<div class="funnel-select-panel"><h2>Какой вариант выбираем?</h2>' + (plan.choices || []).map(choice => {
      const selected = choice.key === plan.selectedChoiceKey;
      return '<button class="choose-funnel ' + (selected ? 'selected' : '') + '" data-choice="' + esc(choice.key) + '">' + esc(labels[choice.key] || choice.label) + '. Дал ' + number(choice.scenario.revenue) + ' ₽<span>' + esc(choice.scenario.title) + (selected ? ' · выбрано' : '') + '</span></button>';
    }).join('') + '</div>';
  }

  window.renderFunnelLoading = function renderFunnelLoading() {
    ensureStyles();
    app.innerHTML = loadingMarkup();
  };

  window.renderFunnelResult = function renderFunnelResult() {
    ensureStyles();
    const plan = state.analysis && state.analysis.funnelPlan;
    if (!plan || plan.version !== PLAN_VERSION) return window.startFunnel();
    app.innerHTML = '<section class="screen"><button class="back" id="back-to-errors">← К анализу ошибок</button><h1>Если Reels наберут 1 000 000 просмотров</h1><p class="lead">Представим, что за 30 дней твои Reels получили ' + number(plan.startViews) + ' просмотров: примерно ' + number(plan.dailyViews || plan.startViews / 30) + ' просмотров в день. ' + percent(plan.inboxRate * 100) + '% напишут в Direct — это ' + number(plan.startViews * plan.inboxRate) + ' сообщений за месяц.</p><p class="funnel-note">Симулятор перебрал ' + number(plan.evaluatedVariants) + ' совместимых ' + variantWord(plan.evaluatedVariants) + ' и показывает три решения: самый простой запуск, оптимальный сейчас и максимум по выручке.</p><h2>Варианты воронки</h2>' + renderChoices(plan) + renderChoiceButtons(plan) + '<ul class="funnel-assumptions"><li>Это модель, а не прогноз продаж.</li><li>Расходы на трафик, бота, менеджера и производство материалов не включены.</li><li>Ручная нагрузка считается по дням: максимум ' + number(plan.dailyChatCapacity || 40) + ' переписок и ' + number(plan.dailyCallCapacity || 6) + ' созвонов в день.</li></ul></section>';
    document.querySelector('#back-to-errors').onclick = () => { state.screen = 'errors'; persist(); render(); };
    document.querySelectorAll('[data-choice]').forEach(button => button.onclick = async () => {
      const choice = plan.choices.find(item => item.key === button.dataset.choice);
      if (!choice) return;
      plan.selectedChoiceKey = choice.key;
      plan.selectedScenarioId = choice.scenario.id;
      plan.best = choice.scenario;
      if (state.analysis) state.analysis.growthPlan = null;
      persist();
      button.disabled = true;
      button.textContent = 'Собираю план под этот вариант…';
      try {
        const updatedPlan = await api('/api/analyses/' + state.analysisId + '/funnel-plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selectedChoiceKey: choice.key }) });
        if (state.analysis) state.analysis.funnelPlan = updatedPlan;
        persist();
        window.startGrowthPlan();
      } catch (error) {
        button.disabled = false;
        window.renderFunnelResult();
        alert(error.message || 'Не удалось выбрать вариант воронки.');
      }
    });
  };

  window.startFunnel = async function startFunnel() {
    if (!state.analysisId) return;
    state.screen = 'funnelLoading';
    persist();
    window.renderFunnelLoading();
    const startedAt = Date.now();
    try {
      const plan = await api('/api/analyses/' + state.analysisId + '/funnel-plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      state.analysis.funnelPlan = plan;
      const elapsed = Date.now() - startedAt;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - elapsed)));
      state.screen = 'funnelResult';
      persist();
      window.renderFunnelResult();
    } catch (error) {
      state.screen = 'errors';
      persist();
      render();
      alert(error.message);
    }
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('#next-stage');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.startFunnel();
  }, true);
}());
