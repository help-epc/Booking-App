const test = require('node:test');
const assert = require('node:assert/strict');

// Stub imports so the route's pure failure classifier can be tested without installing dependencies.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '@supabase/supabase-js') return { createClient() {} };
  if (request === '../booking-ops') return { processBookingOps() {}, safeDocuments() { return {}; } };
  if (request === '../v2-calendar-sync') return { processV2CalendarQueue() {} };
  return originalLoad.call(this, request, parent, isMain);
};
const { legacyCalendarFailed } = require('../api/cron/sync-bookings-to-calendar');
Module._load = originalLoad;

test('legacy calendar failures are surfaced', () => {
  assert.equal(legacyCalendarFailed({ calendar_event: { created: false, reason: 'Google OAuth environment variables are missing.' } }), true);
  assert.equal(legacyCalendarFailed({ calendar_event: { created: true, event_id: 'abc' } }), false);
  assert.equal(legacyCalendarFailed({ calendar_event: { created: false, event_id: 'abc', reason: 'Already synced' } }), false);
});

