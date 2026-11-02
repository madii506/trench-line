// the newest pump.fun coins (Jupiter recent + GeckoTerminal new pump.fun pools)
const { wrap } = require('../lib/http'); const M = require('../lib/market');
module.exports = wrap(async () => ({ at: Date.now(), coins: await M.fresh() }), { cache: 'public, max-age=5, s-maxage=8, stale-while-revalidate=30' });
