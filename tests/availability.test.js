const test = require('node:test');
const assert = require('node:assert/strict');
const { dateRange, normaliseSnapshot } = require('../api/_lib/availability');

test('dateRange validates and includes both endpoints', () => {
  assert.deepEqual(dateRange('2026-08-10', '2026-08-12'), ['2026-08-10', '2026-08-11', '2026-08-12']);
  assert.throws(() => dateRange('2026-08-12', '2026-08-10'));
  assert.throws(() => dateRange('not-a-date', '2026-08-10'));
});

test('normaliseSnapshot retains bookings, blocks, overrides and remaining units', () => {
  assert.deepEqual(normaliseSnapshot('2026-08-13', [
    { period: 'AM', standard_capacity: 5, used_units: 0, blocked_units: 5, override_units: 0, remaining_units: 0 },
    { period: 'PM', standard_capacity: 3, used_units: 1, blocked_units: 0, override_units: 1, remaining_units: 3 }
  ]), {
    date: '2026-08-13',
    periods: {
      AM: { standard_capacity: 5, used_units: 0, blocked_units: 5, override_units: 0, remaining_units: 0 },
      PM: { standard_capacity: 3, used_units: 1, blocked_units: 0, override_units: 1, remaining_units: 3 }
    }
  });
});

