module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({
    error: 'Online booking is temporarily unavailable due to a technical fault.',
    code: 'BOOKING_SYSTEM_PAUSED',
    phone: '07831 363 622'
  });
};

