// recent trades of a coin's deepest pool
const { wrap, fail } = require('../lib/http'); const M = require('../lib/market');
module.exports = wrap(async req => {
  const mint = String((req.query && req.query.mint) || ''); if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw fail(400, 'bad mint');
  return { mint, trades: await M.trades(mint).catch(() => []) };
}, { cache: 'public, max-age=5, s-maxage=8, stale-while-revalidate=30' });
