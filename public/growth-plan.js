(function growthPlanScreen() {
  const PLAN_VERSION = 15;
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

  function ensureStyles() {
    if (document.querySelector('#growth-plan-styles')) return;
    const style = document.createElement('style');
    style.id = 'growth-plan-styles';
    style.textContent = '.growth-loading{min-height:68vh;display:grid;place-items:center;text-align:center}.growth-spark{font-size:58px;display:inline-block;animation:growth-pulse 1.5s ease-in-out infinite}@keyframes growth-pulse{50%{transform:scale(1.15) rotate(7deg)}}.growth-period{display:block;color:#f0b54d;font-weight:750;margin-bottom:8px}.growth-step p{margin-bottom:0}.growth-step{padding:19px 18px;border-left:3px solid #f0b54d;background:#1c1a20;border-radius:0 17px 17px 0;margin:12px 0}.growth-step h2{font-size:21px;margin-bottom:12px}.growth-actions{display:grid;gap:11px;margin:0;padding:0;list-style:none;counter-reset:action}.growth-actions li{position:relative;padding-left:31px;line-height:1.45;counter-increment:action}.growth-actions li:before{content:counter(action);position:absolute;left:0;top:1px;width:21px;height:21px;display:grid;place-items:center;border-radius:50%;background:#f0b54d;color:#211806;font-size:12px;font-weight:800}.growth-actions b{display:block;color:#fff}.growth-actions span{display:block;color:#b9b3c1;font-size:14px;margin-top:3px}.growth-note{color:#b9b3c1;text-align:center;margin:25px 0 8px}.footer-cta h2{font-size:clamp(23px,4.8vw,34px);line-height:1.12;margin:0 0 12px}.footer-cta p{color:#b9b3c1;margin:0 auto 16px;max-width:620px}';
    document.head.append(style);
  }

  window.renderGrowthPlanLoading = function renderGrowthPlanLoading() {
    ensureStyles();
    app.innerHTML = '<section class="growth-loading screen"><div><span class="growth-spark">✦</span><h1>Собираю твой план на 30 дней</h1><p class="muted">Раскладываю запуск на понятные шаги…</p></div></section>';
  };

  window.renderGrowthPlanResult = function renderGrowthPlanResult() {
    ensureStyles();
    const plan = state.analysis?.growthPlan;
    if (!plan || plan.version !== PLAN_VERSION) return window.startGrowthPlan();
    const steps = plan.steps.map(step => '<article class="growth-step"><span class="growth-period">' + esc(step.period) + '</span><h2>' + esc(step.title) + '</h2><ol class="growth-actions">' + step.actions.map(action => '<li><b>' + esc(action.action) + '</b><span>' + esc(action.why) + '</span></li>').join('') + '</ol></article>').join('');
    app.innerHTML = '<section class="screen"><button class="back" id="back-to-funnel">← К расчёту воронки</button><h1>Твоя точка роста на 30 дней</h1><p class="lead">' + esc(plan.headline) + '</p><h2>Как приблизиться к этому результату</h2>' + steps + '<div class="footer-cta"><h2>Этот план задает направление, осталось расписать конкретику</h2><p>Подробности по контенту, воронке и офферам Никита может собрать для тебя на бесплатном разборе.</p><button class="primary" id="show-live-audit">Узнать про бесплатный разбор</button></div></section>';
    document.querySelector('#back-to-funnel').onclick = () => { state.screen = 'funnelResult'; persist(); render(); };
  };

  window.startGrowthPlan = async function startGrowthPlan() {
    if (!state.analysisId) return;
    if (state.analysis?.growthPlan?.version === PLAN_VERSION && state.analysis.growthPlan.selectedScenarioId === state.analysis?.funnelPlan?.selectedScenarioId) {
      state.screen = 'growthPlan';
      persist();
      return window.renderGrowthPlanResult();
    }
    state.screen = 'growthPlanLoading';
    persist();
    window.renderGrowthPlanLoading();
    try {
      const selectedChoiceKey = state.analysis?.funnelPlan?.selectedChoiceKey;
      if (selectedChoiceKey) await api('/api/analyses/' + state.analysisId + '/funnel-plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selectedChoiceKey }) });
      const plan = await api('/api/analyses/' + state.analysisId + '/growth-plan', { method: 'POST' });
      state.analysis.growthPlan = plan;
      await refresh(false);
      state.screen = 'growthPlan';
      persist();
      window.renderGrowthPlanResult();
    } catch (error) {
      state.screen = 'funnelResult';
      persist();
      render();
      alert(error.message);
    }
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('#show-growth-plan');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.startGrowthPlan();
  }, true);
}());
