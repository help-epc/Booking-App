function isoDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

function dateRange(from, to, maximumDays = 46) {
  const first = isoDate(from);
  const last = isoDate(to);
  if (!first || !last) throw new Error('Valid from and to dates are required.');
  const start = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  if (end < start) throw new Error('The availability date range is invalid.');
  const dates = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    if (dates.length >= maximumDays) throw new Error(`A maximum of ${maximumDays} days can be checked.`);
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function normaliseSnapshot(date, rows) {
  const periods = {};
  for (const row of rows || []) {
    if (!['AM', 'PM'].includes(row.period)) continue;
    periods[row.period] = {
      standard_capacity: Number(row.standard_capacity || 0),
      used_units: Number(row.used_units || 0),
      blocked_units: Number(row.blocked_units || 0),
      override_units: Number(row.override_units || 0),
      remaining_units: Math.max(0, Number(row.remaining_units || 0))
    };
  }
  if (!periods.AM || !periods.PM) throw new Error(`Capacity snapshot is incomplete for ${date}.`);
  return { date, periods };
}

async function mapInBatches(values, batchSize, mapper) {
  const output = [];
  for (let index = 0; index < values.length; index += batchSize) {
    output.push(...await Promise.all(values.slice(index, index + batchSize).map(mapper)));
  }
  return output;
}

module.exports = { dateRange, isoDate, mapInBatches, normaliseSnapshot };

