// GET ?uid= (yours) | ?mint= (a coin) | feed. Settles due calls on the way.
const { wrap } = require('../lib/http'); const K = require('../lib/calls');
module.exports = wrap(async req => {
  const qy = req.query || {};
  await K.settle(10).catch(() => 0);
  const uid = /^[a-f0-9]{24,64}$/.test(qy.uid || '') ? qy.uid : null;
  const mint = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(qy.mint || '') ? qy.mint : null;
  return { at: Date.now(), calls: await K.list({ uid, mint, limit: qy.limit }), stats: await K.stats() };
});
