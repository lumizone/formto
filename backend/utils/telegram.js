/**
 * Telegram notification helper
 * Uses the Telegram Bot API — no extra dependencies needed (just fetch).
 *
 * Setup for users:
 *   1. Create a bot via @BotFather → get the Bot Token
 *   2. Add the bot to a group or start a chat with it
 *   3. Get the Chat ID (e.g. via @userinfobot or the getUpdates API)
 */

function escapeMarkdown(text) {
  // Escape special chars for MarkdownV2
  return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

/**
 * Send a Telegram notification for a new form submission.
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId   - Telegram chat/group/channel ID
 * @param {object} opts     - { formName, submissionData }
 */
export async function sendTelegramNotification(botToken, chatId, { formName, submissionData }) {
  const fields = Object.entries(submissionData)
    .slice(0, 15) // cap at 15 fields to stay within Telegram message limits
    .map(([key, val]) => `• *${escapeMarkdown(key)}:* ${escapeMarkdown(String(val ?? ''))}`)
    .join('\n');

  const date = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const text = [
    `📬 *New submission* — ${escapeMarkdown(formName)}`,
    `🕐 ${escapeMarkdown(date)}`,
    '',
    fields || '_\\(no fields\\)_',
    '',
    '— FormTo'
  ].join('\n');

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:    chatId,
      text,
      parse_mode: 'MarkdownV2'
    })
  });

  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram API error: ${json.description || json.error_code}`);
  }
  return { success: true };
}
