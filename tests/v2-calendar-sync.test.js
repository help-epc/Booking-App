const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEvent, eventIdForJob, insertEvent } = require('../api/v2-calendar-sync');

test('event IDs are deterministic and Google-compatible', () => {
  assert.equal(eventIdForJob('4aa7bd3f-9ff5-4d8c-98f1-5aa84fcab46e'), 'v24aa7bd3f9ff54d8c98f15aa84fcab46e');
});

test('buildEvent preserves V2 appointment and customer details', () => {
  const event = buildEvent({
    calendarRow: { calendar_id: 'primary' },
    job: { id: '4aa7bd3f-9ff5-4d8c-98f1-5aa84fcab46e', reference: 'JOB-1', appointment_date: '2026-08-07', appointment_period: 'AM' },
    item: { fee_pence: 8000, deposit_pence: 4000, service_type: 'domestic_epc' },
    group: { reference: 'V2-529D8DDC5772' },
    property: { address_line_1: '15 Westbourne Terrace', postcode: 'W23UN' },
    contact: { full_name: 'Peter Papadakos', email: 'panther950@hotmail.com', phone: '07780111850' }
  });
  assert.equal(event.body.start.dateTime, '2026-08-07T08:00:00');
  assert.equal(event.body.end.dateTime, '2026-08-07T13:00:00');
  assert.match(event.body.summary, /Peter Papadakos/);
  assert.match(event.body.description, /V2-529D8DDC5772/);
});

test('a duplicate deterministic event is treated as synced', async () => {
  const result = await insertEvent({ calendarId: 'primary', eventId: 'v2abc', body: { id: 'v2abc' } }, 'token', async () => ({ status: 409, ok: false, json: async () => ({}) }));
  assert.deepEqual(result, { event_id: 'v2abc', existing: true });
});

