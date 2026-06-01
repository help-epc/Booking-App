const { createClient } = require('@supabase/supabase-js');
const { processBookingOps, safeDocuments } = require('../booking-ops');

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error(`Missing ${name}`);
  return String(value).trim();
}

function createSupabase() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'));
}

function shouldProcessJob(job) {
  const docs = safeDocuments(job);
  if (!job || !job.booking_date) return false;
  if (docs.owner_booking_notification_sent && docs.google_calendar_event_id) return false;
  return true;
}

module.exports = async function handler(req, res) {
  const startedAt = new Date().toISOString();

  try {
    const configuredSecret = process.env.CRON_SECRET || '';
    const suppliedSecret =
      (req.query && req.query.secret) ||
      req.headers['x-cron-secret'] ||
      String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

    if (configuredSecret && suppliedSecret !== configuredSecret) {
      return res.status(401).json({
        ok: false,
        mode: 'booking_calendar_sync_unauthorised',
        message: 'Cron secret did not match. No booking notifications or calendar events were created.'
      });
    }

    const supabase = createSupabase();
    const since = new Date(Date.now() - Number(process.env.BOOKING_SYNC_LOOKBACK_HOURS || 72) * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .gte('created_at', since)
      .not('booking_date', 'is', null)
      .order('created_at', { ascending: true })
      .limit(Number(process.env.BOOKING_SYNC_MAX || 25));

    if (error) throw error;

    const checked = data || [];
    const processed = [];
    const skipped = [];

    for (const job of checked) {
      if (!shouldProcessJob(job)) {
        skipped.push({ id: job.id, reference: job.reference, reason: 'already_synced_or_missing_booking_date' });
        continue;
      }

      try {
        const result = await processBookingOps(supabase, job);
        processed.push({
          id: job.id,
          reference: job.reference,
          booking_date: job.booking_date,
          booking_window: job.booking_window,
          owner_notification: result.owner_notification,
          calendar_event: result.calendar_event
        });
      } catch (jobError) {
        skipped.push({ id: job.id, reference: job.reference, reason: jobError.message || String(jobError) });
      }
    }

    return res.status(200).json({
      ok: true,
      mode: 'booking_calendar_sync_complete',
      message: 'Booking notifications and Google Calendar sync checked recent bookings.',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      checked: checked.length,
      processed: processed.length,
      skipped: skipped.length,
      processed_items: processed,
      skipped_items: skipped
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      mode: 'booking_calendar_sync_failed',
      message: 'Booking notification / Google Calendar sync failed.',
      error: error.message || String(error),
      started_at: startedAt
    });
  }
};
