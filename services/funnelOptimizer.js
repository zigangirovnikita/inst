const START_VIEWS = 1_000_000;
const INBOX_RATE = 0.005;
const CODEWORD_SHARE = 0.7;
const MANUAL_FIRST_DAY_CAPACITY = 50;
const MONTHLY_CALL_CAPACITY = 20;
const DIRECT_TRIPWIRE_990_RATE = 0.15;
const VERSION = 12;
const PRICE_POINTS = [4_000, 9_000, 19_000, 29_000, 49_000, 60_000, 100_000, 150_000];

const MATERIALS = {
  guide: { title: 'Гайд', simple: 0.13, ai: 0.18 },
  checklist: { title: 'Чек-лист', simple: 0.15, ai: 0.20 },
  article: { title: 'Статья', simple: 0.10, ai: 0.14 },
  longread: { title: 'Лонгрид', simple: 0.08, ai: 0.12 },
};
const LESSON = { simple: { view: 0.45, interest: 0.55, price: 0.30 }, ai: { view: 0.627, interest: 0.717, price: 0.398 } };
const WEBINAR = { simple: 0.24, ai: 0.30, attendance: 0.45, interest: 0.55, price: 0.45 };
const TRIPWIRE_PURCHASE = { 990: 0.25, 2990: 0.22, 4990: 0.18, 7990: 0.15 };

const whole = value => Math.max(0, Math.floor(value));
const money = value => Math.round(value);
const number = value => value.toLocaleString('ru-RU');
const add = (stages, label, people, note = '') => stages.push({ label, people: whole(people), note });
const priceOf = answers => Math.max(0, Number(String(answers.price || '').replace(/[^\d]/g, '')) || 0);
const botName = bot => bot === 'ai' ? 'ИИ-бот' : 'Обычный бот';

function interpolate(price, values) {
  if (price <= PRICE_POINTS[0]) return values[0];
  for (let index = 1; index < PRICE_POINTS.length; index += 1) {
    if (price <= PRICE_POINTS[index]) {
      const leftPrice = PRICE_POINTS[index - 1];
      const part = (Math.log(price) - Math.log(leftPrice)) / (Math.log(PRICE_POINTS[index]) - Math.log(leftPrice));
      return values[index - 1] + (values[index] - values[index - 1]) * part;
    }
  }
  return values.at(-1);
}
function isMentoring(answers) { return /наставнич|ментор/i.test(`${answers.product || ''} ${answers.niche || ''}`); }
function training(answers) { return /курс|обуч|наставнич|повышен|программ/i.test(`${answers.product || ''} ${answers.niche || ''}`); }
function chatRate(price) { return interpolate(price, [0.18, 0.16, 0.12, 0.10, 0.08, 0.07, 0.05, 0.03]); }
function callRates(price) {
  return {
    application: interpolate(price, [0.10, 0.12, 0.15, 0.17, 0.20, 0.22, 0.26, 0.30]),
    show: interpolate(price, [0.85, 0.84, 0.82, 0.80, 0.78, 0.76, 0.74, 0.72]),
    sale: interpolate(price, [0.30, 0.30, 0.32, 0.32, 0.35, 0.35, 0.38, 0.40]),
  };
}
function directPurchaseRate(tool, bot, price, answers) {
  if (price >= 100_000 || (isMentoring(answers) && price >= 50_000)) return 0;
  const rates = {
    material: [0.20, 0.16, 0.12, 0.09, 0.06, 0.04, 0, 0],
    webinar: [0.25, 0.20, 0.16, 0.12, 0.08, 0.05, 0, 0],
    lessonAi: [0.28, 0.22, 0.19, 0.14, 0.09, 0.055, 0, 0],
    lessonSimple: [0.20, 0.16, 0.14, 0.10, 0.06, 0.035, 0, 0],
  };
  if (tool === 'lesson' && bot === 'ai' && price === 15_000) return 0.452;
  const key = tool === 'lesson' ? (bot === 'ai' ? 'lessonAi' : 'lessonSimple') : tool;
  return interpolate(price, rates[key]);
}
function allowedTripwires(price) {
  if (price <= 10_000) return [];
  if (price <= 20_000) return [990, 2990];
  if (price <= 50_000) return [990, 2990, 4990];
  return [990, 2990, 4990, 7990];
}
function emptyResult() { return { automaticSales: 0, chatRequested: 0, chatsHandled: 0, chatSales: 0, callApplications: 0, calls: 0, callSales: 0, lost: 0 }; }
function combine(...results) { return results.reduce((total, item) => Object.fromEntries(Object.keys(total).map(key => [key, total[key] + item[key]])), emptyResult()); }

function inbox(stages) {
  const total = whole(START_VIEWS * INBOX_RATE);
  const codewords = whole(total * CODEWORD_SHARE);
  add(stages, 'Reels', START_VIEWS, 'Желаемый сценарий за 30 дней');
  add(stages, 'Написали в Direct', total, '0,5% от просмотров');
  add(stages, 'Написали кодовое слово', codewords, '70% входящих сообщений');
  add(stages, 'Задали отвлечённый вопрос', total - codewords, '30% входящих сообщений');
  return { total, codewords, offTopic: total - codewords };
}
function botPopulation(stages, bot, flow) {
  const people = bot === 'ai' ? flow.total : flow.codewords;
  add(stages, botName(bot), people, bot === 'ai' ? 'Отвечает на кодовые слова и отвлечённые вопросы' : 'Ведёт только написавших кодовое слово');
  return people;
}
function closeChat(stages, candidates, price) {
  const requested = whole(candidates);
  const handled = Math.min(requested, MANUAL_FIRST_DAY_CAPACITY);
  const lost = requested - handled;
  const sales = whole(handled * chatRate(price));
  add(stages, 'Запросили ручную переписку', requested);
  add(stages, 'Получили своевременный ответ', handled, 'Лимит: 50 новых диалогов в первые сутки');
  if (lost) add(stages, 'Остыли без своевременного ответа', lost);
  add(stages, 'Продали в переписке', sales, `${Math.round(chatRate(price) * 100)}% обработанных переписок`);
  return { ...emptyResult(), chatRequested: requested, chatsHandled: handled, chatSales: sales, lost };
}
function closeCalls(stages, candidates, price, applicationsReady = false, manualIntake = false) {
  let eligible = whole(candidates);
  let lost = 0;
  if (manualIntake) {
    const handled = Math.min(eligible, MANUAL_FIRST_DAY_CAPACITY);
    lost += eligible - handled;
    eligible = handled;
    add(stages, 'Получили своевременный первый ответ', handled, 'Лимит: 50 новых диалогов в первые сутки');
    if (lost) add(stages, 'Остыли без своевременного ответа', lost);
  }
  const rates = callRates(price);
  const applications = applicationsReady ? eligible : whole(eligible * rates.application);
  if (!applicationsReady) add(stages, 'Оставили заявку на созвон', applications, `${Math.round(rates.application * 100)}% тёплых лидов`);
  const slots = Math.min(applications, MONTHLY_CALL_CAPACITY);
  lost += applications - slots;
  add(stages, 'Получили слот на созвон', slots, 'Лимит: 20 созвонов в месяц');
  if (applications > slots) add(stages, 'Не попали на созвон из-за лимита', applications - slots);
  const calls = whole(slots * rates.show);
  const sales = whole(calls * rates.sale);
  add(stages, 'Созвон состоялся', calls, `${Math.round(rates.show * 100)}% записавшихся`);
  add(stages, 'Продали на созвоне', sales, `${Math.round(rates.sale * 100)}% состоявшихся созвонов`);
  return { ...emptyResult(), callApplications: applications, calls, callSales: sales, lost };
}
function handleSimpleBotOffTopic(stages, flow) {
  const handled = Math.min(flow.offTopic, MANUAL_FIRST_DAY_CAPACITY);
  const lost = flow.offTopic - handled;
  add(stages, 'Отвлечённые вопросы получили ручной ответ', handled, 'Лимит: 50 новых диалогов в первые сутки');
  if (lost) add(stages, 'Отвлечённые вопросы остыли без ответа', lost);
  return { ...emptyResult(), chatsHandled: handled, lost };
}
function autoSales(stages, people, rate) {
  const sales = whole(people * rate);
  add(stages, 'Купили автоматически', sales, `${Math.round(rate * 1000) / 10}% увидевших цену`);
  return { ...emptyResult(), automaticSales: sales };
}
function scenarioComplexity(id) {
  if (id.startsWith('manual_')) return 1;
  if (id.includes('_direct_')) return 2;
  if (id.includes('checklist') || id.includes('guide')) return 3;
  if (id.includes('article') || id.includes('longread')) return 4;
  if (id.includes('lesson')) return 5;
  if (id.includes('webinar')) return 6;
  if (id.includes('tripwire')) return 7;
  return 4;
}
function finish({ id, title, stages, productPrice, result, tripwireRevenue = 0, note }) {
  const mainProductSales = result.automaticSales + result.chatSales + result.callSales;
  const mainProductRevenue = mainProductSales * productPrice;
  return {
    id, title, name: title, stages, productPrice, mainProductSales, mainProductRevenue: money(mainProductRevenue), tripwireRevenue: money(tripwireRevenue),
    revenue: money(mainProductRevenue + tripwireRevenue), lostLeads: result.lost, calls: result.calls,
    complexity: scenarioComplexity(id), salesBreakdown: { automatic: result.automaticSales, chat: result.chatSales, call: result.callSales },
    flow: { chatsRequested: result.chatRequested, chatsHandled: result.chatsHandled, callApplications: result.callApplications, callsHeld: result.calls, lost: result.lost }, note,
  };
}
function manualRoute(productPrice, method) {
  const stages = [];
  const flow = inbox(stages);
  const result = method === 'chat' ? closeChat(stages, flow.total, productPrice) : closeCalls(stages, flow.total, productPrice, false, true);
  return finish({ id: `manual_${method}`, title: `Всё вручную → ${method === 'chat' ? 'переписка' : 'созвон'}`, stages, productPrice, result, note: 'Все входящие требуют ручного первого ответа.' });
}
function botDirectRoute(bot, productPrice, method) {
  const stages = [];
  const flow = inbox(stages);
  const population = botPopulation(stages, bot, flow);
  const warm = whole(population * (bot === 'ai' ? 0.30 : 0.25));
  add(stages, 'Квалифицированы ботом', warm, `${bot === 'ai' ? 30 : 25}% вошедших в бот`);
  const result = method === 'chat' ? closeChat(stages, warm + (bot === 'simple' ? flow.offTopic : 0), productPrice) : combine(closeCalls(stages, warm, productPrice), bot === 'simple' ? handleSimpleBotOffTopic(stages, flow) : emptyResult());
  return finish({ id: `${bot}_direct_${method}`, title: `${botName(bot)} → ${method === 'chat' ? 'переписка' : 'созвон'}`, stages, productPrice, result, note: 'Без бесплатного материала: бот сразу квалифицирует человека для продажи.' });
}
function materialRoute(bot, materialId, productPrice, answers, method, selling = false) {
  const stages = [];
  const flow = inbox(stages);
  const population = botPopulation(stages, bot, flow);
  const material = MATERIALS[materialId];
  const active = whole(population * material[bot]);
  add(stages, `Получили ${material.title.toLowerCase()}`, population);
  add(stages, 'Сделали действие после материала', active, `${Math.round(material[bot] * 100)}% после выдачи`);
  const destination = method === 'chat' ? 'переписки' : 'созвона';
  const contentName = selling ? `продающий ${material.title.toLowerCase()}` : `${material.title.toLowerCase()} для ${destination}`;
  const priced = whole(active * 0.45);
  add(stages, 'Узнали цену', priced, '45% активных после материала');
  const auto = selling ? autoSales(stages, priced, directPurchaseRate('material', bot, productPrice, answers)) : emptyResult();
  if (method === 'chat') {
    const chat = closeChat(stages, whole(active * 0.35) + (bot === 'simple' ? flow.offTopic : 0), productPrice);
    return finish({ id: `${bot}_${selling ? 'selling_' : ''}${materialId}_chat`, title: `${botName(bot)} → ${contentName}${selling ? ' → покупка / переписка' : ''}`, stages, productPrice, result: combine(auto, chat), note: selling ? 'Автопокупки и продажи из переписки показаны раздельно.' : 'Материал прогревает и ведёт только в переписку; прямой оффер отсутствует.' });
  }
  const calls = closeCalls(stages, whole(active * 0.20), productPrice);
  const result = combine(calls, bot === 'simple' ? handleSimpleBotOffTopic(stages, flow) : emptyResult());
  return finish({ id: `${bot}_${selling ? 'selling_' : ''}${materialId}_call`, title: `${botName(bot)} → ${contentName}${selling ? ' → покупка / созвон' : ''}`, stages, productPrice, result: combine(auto, result), note: selling ? 'Продающий материал допускает прямую покупку; продажи по каналам показаны раздельно.' : 'Материал ведёт только к заявке; продажа происходит на созвоне.' });
}
function lessonRoute(bot, productPrice, answers, method, selling = false) {
  const stages = [];
  const flow = inbox(stages);
  const population = botPopulation(stages, bot, flow);
  const rates = LESSON[bot];
  const views = whole(population * rates.view);
  const interest = whole(views * rates.interest);
  const priced = whole(interest * rates.price);
  add(stages, 'Посмотрели урок', views, `${Math.round(rates.view * 1000) / 10}% из вошедших в бот`);
  add(stages, 'Заинтересовались продуктом', interest, `${Math.round(rates.interest * 1000) / 10}% после урока`);
  add(stages, 'Узнали цену', priced, `${Math.round(rates.price * 1000) / 10}% заинтересовавшихся`);
  const auto = selling ? autoSales(stages, priced, directPurchaseRate('lesson', bot, productPrice, answers)) : emptyResult();
  const contentName = selling ? 'продающий урок' : `урок для ${method === 'chat' ? 'переписки' : 'созвона'}`;
  if (method === 'chat') {
    const chat = closeChat(stages, whole((priced - auto.automaticSales) * 0.20) + (bot === 'simple' ? flow.offTopic : 0), productPrice);
    return finish({ id: `${bot}_${selling ? 'selling_lesson' : 'lesson'}_chat`, title: `${botName(bot)} → ${contentName}${selling ? ' → покупка / переписка' : ''}`, stages, productPrice, result: combine(auto, chat), note: selling ? (bot === 'ai' && productPrice === 15_000 ? 'Для автопокупки использована фактическая конверсия продающего ИИ-урока: 45,2% после узнавания цены.' : 'Автопокупки после продающего урока плавно снижаются с ростом чека.') : 'Обычный урок прогревает и ведёт в переписку; прямой оффер отсутствует.' });
  }
  const calls = closeCalls(stages, priced - auto.automaticSales, productPrice);
  const result = combine(calls, bot === 'simple' ? handleSimpleBotOffTopic(stages, flow) : emptyResult());
  return finish({ id: `${bot}_${selling ? 'selling_lesson' : 'lesson'}_call`, title: `${botName(bot)} → ${contentName}${selling ? ' → покупка / созвон' : ''}`, stages, productPrice, result: combine(auto, result), note: selling ? 'Продающий урок допускает прямую покупку; непокупатели идут на созвон. Продажи показаны раздельно.' : 'Обычный урок только прогревает и приводит к заявке; продажа происходит на созвоне.' });
}
function webinarRoute(bot, productPrice, answers, method, selling = false) {
  const stages = [];
  const flow = inbox(stages);
  const population = botPopulation(stages, bot, flow);
  const registrations = whole(population * WEBINAR[bot]);
  const attendees = whole(registrations * WEBINAR.attendance);
  const interest = whole(attendees * WEBINAR.interest);
  const priced = whole(interest * WEBINAR.price);
  add(stages, 'Зарегистрировались на вебинар', registrations, `${Math.round(WEBINAR[bot] * 100)}% из вошедших в бот`);
  add(stages, 'Пришли на вебинар', attendees, '45% зарегистрировавшихся');
  add(stages, 'Заинтересовались продуктом', interest, '55% после вебинара');
  add(stages, 'Узнали цену', priced, '45% заинтересовавшихся');
  const auto = selling ? autoSales(stages, priced, directPurchaseRate('webinar', bot, productPrice, answers)) : emptyResult();
  const contentName = selling ? 'продающий вебинар' : `вебинар для ${method === 'chat' ? 'переписки' : 'созвона'}`;
  if (method === 'chat') {
    const chat = closeChat(stages, whole(attendees * 0.15) + (bot === 'simple' ? flow.offTopic : 0), productPrice);
    return finish({ id: `${bot}_${selling ? 'selling_webinar' : 'webinar'}_chat`, title: `${botName(bot)} → ${contentName}${selling ? ' → покупка / переписка' : ''}`, stages, productPrice, result: combine(auto, chat), note: selling ? 'Автопокупки и продажи из переписки показаны раздельно.' : 'Обычный вебинар прогревает и ведёт в переписку; прямой оффер отсутствует.' });
  }
  const calls = closeCalls(stages, priced - auto.automaticSales, productPrice);
  const result = combine(calls, bot === 'simple' ? handleSimpleBotOffTopic(stages, flow) : emptyResult());
  return finish({ id: `${bot}_${selling ? 'selling_webinar' : 'webinar'}_call`, title: `${botName(bot)} → ${contentName}${selling ? ' → покупка / созвон' : ''}`, stages, productPrice, result: combine(auto, result), note: selling ? 'Продающий вебинар допускает прямую покупку; непокупатели идут на созвон. Продажи показаны раздельно.' : 'Обычный вебинар приводит к заявке; продажа происходит на созвоне.' });
}
function tripwireRoute(bot, productPrice, tripwirePrice, afterLesson) {
  const stages = [];
  const flow = inbox(stages);
  const population = botPopulation(stages, bot, flow);
  const source = afterLesson ? whole(population * LESSON[bot].view) : population;
  const rate = afterLesson ? TRIPWIRE_PURCHASE[tripwirePrice] : DIRECT_TRIPWIRE_990_RATE;
  if (afterLesson) add(stages, 'Посмотрели урок', source, `${Math.round(LESSON[bot].view * 1000) / 10}% из вошедших в бот`);
  const buyers = whole(source * rate);
  const consumed = whole(buyers * 0.70);
  const applications = whole(consumed * 0.20);
  add(stages, `Купили трипваер · ${number(tripwirePrice)} ₽`, buyers, `${Math.round(rate * 100)}% ${afterLesson ? 'посмотревших урок' : 'вошедших в бот'}`);
  add(stages, 'Потребили трипваер', consumed, '70% покупателей');
  add(stages, 'Оставили заявку на личную консультацию', applications, '20% потребивших');
  const result = combine(closeCalls(stages, applications, productPrice, true), bot === 'simple' ? handleSimpleBotOffTopic(stages, flow) : emptyResult());
  return finish({ id: `${bot}_tripwire_${afterLesson ? 'lesson_' : 'direct_'}${tripwirePrice}`, title: `${botName(bot)} → ${afterLesson ? 'урок → ' : ''}трипваер ${number(tripwirePrice)} ₽ → консультация`, stages, productPrice, result, tripwireRevenue: buyers * tripwirePrice, note: afterLesson ? 'Трипваер дороже 990 ₽ предлагается только после урока.' : 'Прямое предложение из бота разрешено только для трипваера за 990 ₽.' });
}
function tripwireRoutes(bot, answers, productPrice) {
  if (productPrice <= 10_000) return [];
  return [tripwireRoute(bot, productPrice, 990, false), ...allowedTripwires(productPrice).filter(value => value > 990).map(value => tripwireRoute(bot, productPrice, value, true))];
}
function optimiseFunnel(answers) {
  const productPrice = priceOf(answers);
  if (!productPrice) throw new Error('Не удалось определить цену продукта для расчёта воронки.');
  const scenarios = [manualRoute(productPrice, 'chat'), manualRoute(productPrice, 'call')];
  for (const bot of ['simple', 'ai']) {
    scenarios.push(botDirectRoute(bot, productPrice, 'chat'), botDirectRoute(bot, productPrice, 'call'));
    for (const material of Object.keys(MATERIALS)) {
      scenarios.push(materialRoute(bot, material, productPrice, answers, 'chat'), materialRoute(bot, material, productPrice, answers, 'call'));
      scenarios.push(materialRoute(bot, material, productPrice, answers, 'chat', true), materialRoute(bot, material, productPrice, answers, 'call', true));
    }
    scenarios.push(lessonRoute(bot, productPrice, answers, 'chat'), lessonRoute(bot, productPrice, answers, 'call'));
    scenarios.push(lessonRoute(bot, productPrice, answers, 'chat', true), lessonRoute(bot, productPrice, answers, 'call', true));
    scenarios.push(webinarRoute(bot, productPrice, answers, 'chat'), webinarRoute(bot, productPrice, answers, 'call'));
    scenarios.push(webinarRoute(bot, productPrice, answers, 'chat', true), webinarRoute(bot, productPrice, answers, 'call', true));
    scenarios.push(...tripwireRoutes(bot, answers, productPrice));
  }
  scenarios.sort((a, b) => b.revenue - a.revenue || a.lostLeads - b.lostLeads || a.calls - b.calls);
  const maxRevenue = scenarios[0];
  const revenueTarget = maxRevenue.revenue * 0.55;
  const simple = scenarios
    .filter(item => item.revenue >= revenueTarget && item.complexity <= 3)
    .sort((a, b) => a.complexity - b.complexity || b.revenue - a.revenue || a.lostLeads - b.lostLeads)[0]
    || scenarios.slice().sort((a, b) => a.complexity - b.complexity || b.revenue - a.revenue)[0];
  const scoredScenarios = scenarios
    .map(item => {
      const manualLoadPenalty = Math.max(0, item.flow.chatsRequested - MANUAL_FIRST_DAY_CAPACITY) * productPrice * 0.015;
      const callLoadPenalty = Math.max(0, item.flow.callApplications - MONTHLY_CALL_CAPACITY) * productPrice * 0.03;
      const complexityPenalty = item.complexity * productPrice * 1.7;
      return { item, score: item.revenue - manualLoadPenalty - callLoadPenalty - complexityPenalty };
    })
    .sort((a, b) => b.score - a.score || b.item.revenue - a.item.revenue);
  let recommended = scoredScenarios[0].item;
  if (productPrice <= 5_000 && !training(answers)) {
    recommended = scenarios.find(item => item.id === 'simple_direct_chat') || simple;
  }
  if (recommended.id === maxRevenue.id) {
    recommended = scoredScenarios.find(({ item }) => item.id !== maxRevenue.id && item.id !== simple.id)?.item || recommended;
  }
  if (recommended.id === simple.id) {
    recommended = scoredScenarios.find(({ item }) => item.id !== simple.id && item.id !== maxRevenue.id)?.item || recommended;
  }
  const choices = [
    { key: 'simple', label: 'Самый простой', description: 'Минимум сборки и меньше технических зависимостей.', scenario: simple },
    { key: 'recommended', label: 'Оптимальный сейчас', description: 'Баланс выручки, сложности запуска и ручной нагрузки.', scenario: recommended },
    { key: 'maxRevenue', label: 'Лучший по выручке', description: 'Максимальная выручка в модели, даже если запуск сложнее.', scenario: maxRevenue },
  ];
  return { version: VERSION, startViews: START_VIEWS, inboxRate: INBOX_RATE, codewordShare: CODEWORD_SHARE, manualFirstDayCapacity: MANUAL_FIRST_DAY_CAPACITY, monthlyCallCapacity: MONTHLY_CALL_CAPACITY, productPrice, evaluatedVariants: scenarios.length, scenarios, choices, alternatives: choices.slice(1).map(choice => choice.scenario), selectedChoiceKey: choices.find(choice => choice.scenario.id === recommended.id)?.key || choices[0].key, selectedScenarioId: recommended.id, best: recommended };
}

module.exports = { optimiseFunnel, VERSION };
