function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function money(value) {
  return Number(value || 0).toLocaleString('ru-RU') + ' ₽';
}

async function deliverLeadToTelegram(lead) {
  if (!isTelegramConfigured()) throw new Error('Telegram-бот для заявок не настроен.');
  const text = [
    'Новая заявка на бесплатный разбор',
    '',
    `Имя: ${lead.name}`,
    `Контакт: ${lead.contact}`,
    `Продукт: ${lead.product || 'не указан'}`,
    `Чек: ${money(lead.productPrice)}`,
    lead.socialLink ? `Instagram: ${lead.socialLink}` : null,
    lead.comment ? `Запрос: ${lead.comment}` : null,
    '',
    `Анализ: ${lead.analysisId}`,
    lead.funnelRevenue ? `Прогноз воронки: ${money(lead.funnelRevenue)}` : null,
  ].filter(Boolean).join('\n');
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
}

module.exports = { deliverLeadToTelegram, isTelegramConfigured };
