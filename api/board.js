const { wrap } = require('../lib/http'); const K = require('../lib/calls');
module.exports = wrap(async req => {
  await K.settle(10).catch(() => 0);
  const p = String((req.query && req.query.p) || 'all');
  const since = p === '24h' ? Date.now() - 864e5 : p === '7d' ? Date.now() - 7 * 864e5 : 0;
  return { p, board: await K.board({ since }) };
});
