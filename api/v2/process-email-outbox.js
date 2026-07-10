
const { createClient } = require('@supabase/supabase-js');
const { bridgeEnabled, groupedConfirmation, requiredEnv, timingSafeSecret } = require('../_lib/v2-bridge');

async function sendEmail(message, to) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${requiredEnv('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || 'EPC Pro <help@theepc.pro>', to, reply_to: 'help@theepc.pro', ...message })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Email provider returned ${response.status}`);
  return result.id || null;
}

module.exports = async function handler(req, res) {
  if (!bridgeEnabled()) return res.status(404).json({ ok: false });
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!timingSafeSecret(supplied, requiredEnv('V2_BOOKING_BRIDGE_SECRET'))) return res.status(401).json({ ok: false });
  const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: rows, error } = await supabase.from('v2_email_outbox').select('*').in('status', ['pending', 'failed']).lte('next_attempt_at', new Date().toISOString()).limit(10);
  if (error) return res.status(500).json({ ok: false });
  let sent = 0;
  for (const row of rows || []) {
    const { data: claimed } = await supabase.from('v2_email_outbox').update({ status: 'processing', attempt_count: row.attempt_count + 1 }).eq('id', row.id).in('status', ['pending', 'failed']).select().maybeSingle();
    if (!claimed) continue;
    try {
      const [{ data: group }, { data: items }] = await Promise.all([
        supabase.from('v2_booking_groups').select('*,contact:v2_contacts(*)').eq('id', row.booking_group_id).single(),
        supabase.from('v2_booking_items').select('*,property:v2_properties(*)').eq('booking_group_id', row.booking_group_id).order('created_at')
      ]);
      const message = groupedConfirmation({ group, contact: group.contact, items: items || [] });
      const providerId = await sendEmail(message, row.recipient_email);
      await supabase.from('v2_email_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: providerId, last_safe_error: null }).eq('id', row.id);
      sent += 1;
    } catch (sendError) {
      const delayMinutes = Math.min(60, Math.pow(2, row.attempt_count + 1));
      await supabase.from('v2_email_outbox').update({ status: 'failed', last_safe_error: String(sendError.message || sendError).slice(0, 300), next_attempt_at: new Date(Date.now() + delayMinutes * 60000).toISOString() }).eq('id', row.id);
    }
  }
  return res.status(200).json({ ok: true, processed: (rows || []).length, sent });
};

