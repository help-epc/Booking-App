const { createClient } = require('@supabase/supabase-js');
const { dateRange, mapInBatches, normaliseSnapshot } = require('./_lib/availability');

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET.' });

  try {
    const dates = dateRange(req.query && req.query.from, req.query && req.query.to);
    const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_PUBLISHABLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const snapshots = await mapInBatches(dates, 8, async date => {
      const { data, error } = await supabase.rpc('v2_capacity_snapshot', { p_date: date });
      if (error) throw error;
      return normaliseSnapshot(date, data);
    });
    return res.status(200).json({ ok: true, source: 'v2_capacity_snapshot', from: dates[0], to: dates[dates.length - 1], dates: snapshots });
  } catch (error) {
    console.error('public_availability_failed', { message: error.message || String(error) });
    return res.status(400).json({ ok: false, error: 'Live availability could not be loaded. Please call 07831 363 622 to book.' });
  }
};
