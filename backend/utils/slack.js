/**
 * Slack notification helper — uses Incoming Webhooks (no OAuth needed).
 * Setup: api.slack.com/apps → Create App → Incoming Webhooks → Add to Workspace
 */

export async function sendSlackNotification(webhookUrl, { formName, submissionData }) {
  const fields = Object.entries(submissionData)
    .slice(0, 10) // Slack section blocks allow max 10 fields
    .map(([key, val]) => ({
      type: 'mrkdwn',
      text: `*${key}*\n${String(val ?? '')}`,
      short: true
    }));

  const payload = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📬 *New submission* — ${formName}`
        }
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: fields.length > 0 ? fields : [{ type: 'mrkdwn', text: '_no fields_' }]
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}> · FormTo`
        }]
      }
    ]
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Slack webhook error: ${res.status} ${text}`);
  }
  return { success: true };
}
