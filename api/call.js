// POST {uid, callsign, mint, side: long|hedge, win: 15|60|240} → the call, entry price locked from Jupiter now
const { wrap, fail } = require('../lib/http'); const K = require('../lib/calls');
module.exports = wrap(async req => {
  if (req.method !== 'POST') throw fail(405, 'POST only');
  const b = req.body || {};
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || null;
  return { call: await K.create({ uid: b.uid, callsign: b.callsign, mint: b.mint, side: b.side, win: b.win, ip }) };
});
