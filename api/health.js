// GET → which upstream data sources answer from the server right now (status + ms). no secrets.
const { wrap, fetchT } = require('../lib/http'); const M = require('../lib/market');
const SOL = 'So11111111111111111111111111111111111111112';
const SRC = {
  jupiter_trending: 'https://lite-api.jup.ag/tokens/v2/toptrending/1h?limit=5',
  jupiter_price: `https://lite-api.jup.ag/price/v3?ids=${SOL}`,
  jupiter_search: `https://lite-api.jup.ag/tokens/v2/search?query=${SOL}`,
  dexscreener: `https://api.dexscreener.com/tokens/v1/solana/${SOL}`,
  geckoterminal: 'https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1',
};
module.exports = wrap(async () => {
  const out = {};
  await Promise.all(Object.entries(SRC).map(async ([k, u]) => {
    const t0 = Date.now();
    try { const r = await fetchT(u, k === 'geckoterminal' ? { headers: { accept: 'application/json;version=20230302' } } : {}, 8000); const txt = await r.text(); out[k] = { status: r.status, ms: Date.now() - t0, bytes: txt.length, sample: r.ok ? undefined : txt.slice(0, 160) }; }
    catch (e) { out[k] = { error: String(e && e.message || e).slice(0, 160), ms: Date.now() - t0 }; }
  }));
  let px = null, sol = null, err = null;
  try { px = await M.prices([SOL]); sol = await M.solPrice(); } catch (e) { err = String(e && e.message || e).slice(0, 200); }
  return { at: Date.now(), sources: out, prices: px, sol, err };
});
