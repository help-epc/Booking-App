function env(name, fallback = '') {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function safeDocuments(row) {
  if (!row || !row.documents) return {};
  if (typeof row.documents === 'object') return row.documents;
  try { return JSON.parse(row.documents); } catch { return {}; }
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return '';
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function moneyText(value) {
  return `£${money(value).toFixed(2)}`;
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function jobInfo(job) {
  const docs = safeDocuments(job);
  const total = money(firstPresent(job.invoice_amount, docs.invoice_amount, docs.quote_amount, docs.price, 0));
  const deposit = money(firstPresent(job.deposit_amount, docs.deposit_amount, docs.deposit, 0));
  const balance = money(firstPresent(job.balance_due, docs.balance_due, Math.max(0, total - deposit)));

  return {
    docs,
    reference: firstPresent(job.reference, docs.public_reference, docs.reference, 'EPC booking'),
    customerName: firstPresent(docs.customer_name, docs.client_name, docs.name, 'Customer'),
    customerEmail: firstPresent(docs.customer_email, docs.client_email, docs.email, ''),
    customerPhone: firstPresent(docs.customer_phone, docs.client_phone, docs.phone, ''),
    address: firstPresent(docs.property_address, docs.address, ''),
    postcode: firstPresent(docs.postcode, job.postcode, ''),
    bookingDate: firstPresent(job.booking_date, docs.booking_date, docs.date, ''),
    bookingWindow: String(firstPresent(job.booking_window, docs.booking_window, docs.window, 'AM')).toUpperCase() === 'PM' ? 'PM' : 'AM',
    serviceType: firstPresent(job.epc_type, docs.epc_type, docs.service_type, 'EPC'),
    total,
    deposit,
    balance,
    source: firstPresent(job.source, docs.source, docs.referral, 'Booking app'),
    access: firstPresent(job.notes, docs.access_instructions, docs.access, ''),
    status: firstPresent(job.status, docs.status, 'Booked')
  };
}

function dateText(value) {
  if (!value) return 'No date selected';
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function windowText(value) {
  return String(value || '').toUpperCase() === 'PM' ? 'PM — 13:00 to 17:00' : 'AM — 08:00 to 13:00';
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = env('RESEND_API_KEY');
  if (!apiKey) return { sent: false, skipped: true, reason: 'RESEND_API_KEY missing' };
  if (!to) return { sent: false, skipped: true, reason: 'Recipient missing' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('RESEND_FROM_EMAIL', 'EPC Pro <help@theepc.pro>'),
      to,
      reply_to: env('BOOKING_CONFIRMATION_REPLY_TO', 'help@theepc.pro'),
      subject,
      html,
      text
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Resend failed ${response.status}`);
  return { sent: true, id: result.id || null };
}

function ownerEmail(job) {
  const i = jobInfo(job);
  const subject = `New EPC booking - ${i.bookingDate || 'date TBC'} ${i.bookingWindow} - ${i.postcode || i.reference}`;
  const text = `New EPC booking received.\n\nReference: ${i.reference}\nCustomer: ${i.customerName}\nEmail: ${i.customerEmail}\nPhone: ${i.customerPhone || 'Not provided'}\nProperty: ${i.address}${i.postcode ? `, ${i.postcode}` : ''}\nDate: ${dateText(i.bookingDate)}\nWindow: ${windowText(i.bookingWindow)}\nService: ${i.serviceType}\nSource: ${i.source}\nStatus: ${i.status}\nTotal: ${moneyText(i.total)}\nDeposit: ${moneyText(i.deposit)}\nBalance due: ${moneyText(i.balance)}\nAccess/details: ${i.access || 'None provided'}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.55;max-width:680px;margin:0 auto;"><h2 style="color:#1a3d5c;">New EPC booking received</h2><p><strong>Reference:</strong> ${esc(i.reference)}</p><p><strong>Customer:</strong> ${esc(i.customerName)}</p><p><strong>Email:</strong> ${esc(i.customerEmail)}</p><p><strong>Phone:</strong> ${esc(i.customerPhone || 'Not provided')}</p><p><strong>Property:</strong> ${esc(i.address)}${i.postcode ? `, ${esc(i.postcode)}` : ''}</p><p><strong>Date:</strong> ${esc(dateText(i.bookingDate))}</p><p><strong>Window:</strong> ${esc(windowText(i.bookingWindow))}</p><p><strong>Source:</strong> ${esc(i.source)}</p><p><strong>Status:</strong> ${esc(i.status)}</p><p><strong>Total:</strong> ${esc(moneyText(i.total))}</p><p><strong>Deposit:</strong> ${esc(moneyText(i.deposit))}</p><p><strong>Balance:</strong> ${esc(moneyText(i.balance))}</p><p><strong>Access/details:</strong><br>${esc(i.access || 'None provided')}</p></div>`;
  return { to: env('OWNER_NOTIFICATION_EMAIL', 'help@theepc.pro'), subject, html, text };
}

async function googleToken() {
  const clientId = env('GOOGLE_CLIENT_ID');
  const clientSecret = env('GOOGLE_CLIENT_SECRET');
  const refreshToken = env('GMAIL_REFRESH_TOKEN') || env('GOOGLE_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) return { ok: false, reason: 'Google OAuth env vars missing' };

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) return { ok: false, reason: data.error_description || data.error || `Google token failed ${response.status}` };
  return { ok: true, accessToken: data.access_token };
}

async function createCalendarEvent(job) {
  const i = jobInfo(job);
  if (!i.bookingDate) return { created: false, skipped: true, reason: 'Booking date missing' };
  if (i.docs.google_calendar_event_id) return { created: false, skipped: true, reason: 'Already synced', event_id: i.docs.google_calendar_event_id };

  const token = await googleToken();
  if (!token.ok) return { created: false, skipped: true, reason: token.reason };

  const startClock = i.bookingWindow === 'PM' ? '13:00:00' : '08:00:00';
  const endClock = i.bookingWindow === 'PM' ? '17:00:00' : '13:00:00';
  const timeZone = env('GOOGLE_CALENDAR_TIMEZONE', 'Europe/London');
  const calendarId = encodeURIComponent(env('GOOGLE_CALENDAR_ID', 'primary'));
  const description = [`Reference: ${i.reference}`, `Customer: ${i.customerName}`, `Email: ${i.customerEmail}`, `Phone: ${i.customerPhone || 'Not provided'}`, `Service: ${i.serviceType}`, `Source: ${i.source}`, `Total: ${moneyText(i.total)}`, `Deposit: ${moneyText(i.deposit)}`, `Balance due: ${moneyText(i.balance)}`, '', `Access/details: ${i.access || 'None provided'}`].join('\n');

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: `EPC: ${i.customerName} - ${i.postcode || i.reference} - ${i.bookingWindow}`,
      location: [i.address, i.postcode].filter(Boolean).join(', '),
      description,
      start: { dateTime: `${i.bookingDate}T${startClock}`, timeZone },
      end: { dateTime: `${i.bookingDate}T${endClock}`, timeZone },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 120 }, { method: 'popup', minutes: 30 }] }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { created: false, reason: data.error && data.error.message ? data.error.message : `Calendar failed ${response.status}` };
  return { created: true, event_id: data.id || '', html_link: data.htmlLink || '' };
}

async function processBookingOps(supabase, job) {
  const docs = safeDocuments(job);
  let ownerNotification = { sent: false, skipped: true, reason: 'Already sent' };
  let calendarEvent = { created: false, skipped: true, reason: 'Already attempted' };

  if (!docs.owner_booking_notification_sent) {
    try { ownerNotification = await sendEmail(ownerEmail(job)); } catch (e) { ownerNotification = { sent: false, error: e.message || String(e) }; }
  }

  try { calendarEvent = await createCalendarEvent(job); } catch (e) { calendarEvent = { created: false, error: e.message || String(e) }; }

  const updatedDocs = {
    ...docs,
    owner_booking_notification_sent: docs.owner_booking_notification_sent || Boolean(ownerNotification.sent),
    owner_booking_notification_sent_at: docs.owner_booking_notification_sent_at || (ownerNotification.sent ? new Date().toISOString() : null),
    owner_booking_notification_result: ownerNotification,
    google_calendar_event_id: docs.google_calendar_event_id || calendarEvent.event_id || null,
    google_calendar_event_link: docs.google_calendar_event_link || calendarEvent.html_link || null,
    google_calendar_sync_result: calendarEvent,
    booking_ops_processed_at: new Date().toISOString()
  };

  const { error } = await supabase.from('jobs').update({ documents: updatedDocs }).eq('id', job.id);
  if (error) throw error;
  return { owner_notification: ownerNotification, calendar_event: calendarEvent };
}

module.exports = { processBookingOps, safeDocuments, jobInfo };
