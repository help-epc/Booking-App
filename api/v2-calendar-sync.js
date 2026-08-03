Exit code: 0
Wall time: 1.6 seconds
Output:
const crypto = require('node:crypto');

function env(name, fallback = '') {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function eventIdForJob(jobId) {
  const compact = String(jobId || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (!compact) throw new Error('V2 calendar job ID is invalid.');
  return `v2${compact}`;
}

function money(value) {
  return `Â£${(Number(value || 0) / 100).toFixed(2)}`;
}

function buildEvent({ calendarRow, job, item, group, property, contact }) {
  if (!job || !job.appointment_date) throw new Error('V2 booking date is missing.');
  if (!['AM', 'PM'].includes(job.appointment_period)) throw new Error('V2 booking period is invalid.');
  const eventId = eventIdForJob(job.id);
  const startClock = job.appointment_period === 'PM' ? '13:00:00' : '08:00:00';
  const endClock = job.appointment_period === 'PM' ? '17:00:00' : '13:00:00';
  const reference = group.reference || job.reference;
  const balancePence = Number(item.fee_pence || 0) - Number(item.deposit_pence || 0);
  return {
    eventId,
    calendarId: calendarRow.calendar_id || env('GOOGLE_CALENDAR_ID', 'primary'),
    body: {
      id: eventId,
      summary: `EPC: ${contact.full_name || 'Customer'} - ${property.postcode || reference} - ${job.appointment_period}`,
      location: [property.address_line_1, property.address_line_2, property.city, property.postcode].filter(Boolean).join(', '),
      description: [
        `Reference: ${reference}`,
        `Job: ${job.reference}`,
        `Customer: ${contact.full_name || 'Customer'}`,
        `Email: ${contact.email || ''}`,
        `Phone: ${contact.phone || 'Not provided'}`,
        `Service: ${item.service_type || 'EPC'}`,
        `Source: EPC Pro V2`,
        `Total: ${money(item.fee_pence)}`,
        `Deposit: ${money(item.deposit_pence)}`,
        `Balance due: ${money(balancePence)}`,
        '',
        `Access/details: ${property.access_notes || 'None provided'}`
      ].join('\n'),
      start: { dateTime: `${job.appointment_date}T${startClock}`, timeZone: env('GOOGLE_CALENDAR_TIMEZONE', 'Europe/London') },
      end: { dateTime: `${job.appointment_date}T${endClock}`, timeZone: env('GOOGLE_CALENDAR_TIMEZONE', 'Europe/London') },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 120 }, { method: 'popup', minutes: 30 }] }
    }
  };
}

async function googleToken(fetchImpl = fetch) {
  const clientId = env('GOOGLE_CLIENT_ID');
  const clientSecret = env('GOOGLE_CLIENT_SECRET');
  const refreshToken = env('GMAIL_REFRESH_TOKEN') || env('GOOGLE_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Google OAuth environment variables are missing.');
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || `Google token failed ${response.status}`);
  return data.access_token;
}

async function insertEvent(event, accessToken, fetchImpl = fetch) {
  const calendarId = encodeURIComponent(event.calendarId);
  const response = await fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event.body)
  });
  if (response.status === 409) return { event_id: event.eventId, existing: true };
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : `Calendar failed ${response.status}`);
  return { event_id: data.id || event.eventId, html_link: data.htmlLink || null, existing: false };
}

async function loadByIds(supabase, table, ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from(table).select('*').in('id', ids);
  if (error) throw error;
  return data || [];
}

function indexBy(rows, key = 'id') {
  return new Map(rows.map(row => [row[key], row]));
}

async function processV2CalendarQueue(supabase, options = {}) {
  const maximum = Number(options.maximum || process.env.BOOKING_SYNC_MAX || 25);
  const { data: calendarRows, error } = await supabase.from('v2_calendar_events').select('*').in('status', ['pending', 'failed']).order('created_at', { ascending: true }).limit(maximum);
  if (error) throw error;
  if (!calendarRows || !calendarRows.length) return { checked: 0, synced: 0, failed: 0, items: [] };

  const jobs = await loadByIds(supabase, 'v2_jobs', [...new Set(calendarRows.map(row => row.job_id).filter(Boolean))]);
  const items = await loadByIds(supabase, 'v2_booking_items', [...new Set(jobs.map(row => row.booking_item_id).filter(Boolean))]);
  const groupsResult = await supabase.from('v2_booking_groups').select('*').in('id', [...new Set(items.map(row => row.booking_group_id).filter(Boolean))]);
  if (groupsResult.error) throw groupsResult.error;
  const properties = await loadByIds(supabase, 'v2_properties', [...new Set(items.map(row => row.property_id).filter(Boolean))]);
  const contacts = await loadByIds(supabase, 'v2_contacts', [...new Set((groupsResult.data || []).map(row => row.contact_id).filter(Boolean))]);
  const maps = { jobs: indexBy(jobs), items: indexBy(items), groups: indexBy(groupsResult.data || []), properties: indexBy(properties), contacts: indexBy(contacts) };
  const accessToken = await (options.getToken || googleToken)(options.fetchImpl);
  const results = [];

  for (const calendarRow of calendarRows) {
    try {
      const job = maps.jobs.get(calendarRow.job_id);
      const item = job && maps.items.get(job.booking_item_id);
      const group = item && maps.groups.get(item.booking_group_id);
      const property = item && maps.properties.get(item.property_id);
      const contact = group && maps.contacts.get(group.contact_id);
      if (!job || !item || !group || !property || !contact) throw new Error('V2 calendar queue record has incomplete booking relations.');
      const event = buildEvent({ calendarRow, job, item, group, property, contact });
      const created = await (options.insertEvent || insertEvent)(event, accessToken, options.fetchImpl);
      const now = new Date().toISOString();
      const fingerprint = crypto.createHash('sha256').update(JSON.stringify(event.body)).digest('hex');
      const update = await supabase.from('v2_calendar_events').update({ status: 'synced', google_event_id: created.event_id, last_synced_at: now, last_error: null, event_fingerprint: fingerprint }).eq('id', calendarRow.id);
      if (update.error) throw update.error;
      results.push({ id: calendarRow.id, job_id: job.id, reference: group.reference, status: 'synced', event_id: created.event_id, existing: created.existing });
    } catch (queueError) {
      const message = queueError.message || String(queueError);
      const update = await supabase.from('v2_calendar_events').update({ status: 'failed', last_error: message }).eq('id', calendarRow.id);
      if (update.error) console.error('v2_calendar_failure_state_update_failed', { id: calendarRow.id, message: update.error.message || String(update.error) });
      results.push({ id: calendarRow.id, job_id: calendarRow.job_id, status: 'failed', error: message });
    }
  }
  return { checked: calendarRows.length, synced: results.filter(item => item.status === 'synced').length, failed: results.filter(item => item.status === 'failed').length, items: results };
}

module.exports = { buildEvent, eventIdForJob, insertEvent, processV2CalendarQueue };

