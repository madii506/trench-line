// Live pump.fun market data: Jupiter (tokens, prices), Dexscreener (pools), GeckoTerminal (candles).
const fs = require('fs'), path = require('path');
const { getJSON } = require('./http');
const JUP = 'https://lite-api.jup.ag';
const SOL = 'So11111111111111111111111111111111111111112';
// names we never show (slurs, sexual content)
const BLOCK = /n[i1]gg|f[a@]gg?ot|retard|kike|tranny|hitler|nazi|\brape|pedo|porn|titt|\btits?\b|\bcum\b|\bsex|onlyfans|nsfw/i;
const isPump = x => x && (x.launchpad === 'pump.fun' || String(x.id || '').endsWith('pump'));
const num = v => (v == null || !isFinite(+v)) ? 0 : +v;
function norm(x) {
  const s5 = x.stats5m || {}, s1 = x.stats1h || {}, s6 = x.stats6h || {}, s24 = x.stats24h || {};
  return {
    mint: x.id, sym: String(x.symbol || '').slice(0, 14), name: String(x.name || '').slice(0, 40), icon: x.icon || null,
    price: num(x.usdPrice), mcap: num(x.mcap), liq: num(x.liquidity), holders: num(x.holderCount), organic: Math.round(num(x.organicScore)),
    ch5m: num(s5.priceChange), ch1h: num(s1.priceChange), ch6h: num(s6.priceChange), ch24h: num(s24.priceChange),
    vol1h: num(s1.buyVolume) + num(s1.sellVolume), vol24h: num(s24.buyVolume) + num(s24.sellVolume),
    traders1h: num(s1.numTraders), buys1h: num(s1.numBuys), sells1h: num(s1.numSells),
    created: (x.firstPool && x.firstPool.createdAt) || x.createdAt || null,
  };
}
const clean = c => c && c.mint && c.price > 0 && !BLOCK.test(c.name + ' ' + c.sym);

// dev: a real snapshot instead of the network (the sandbox has none)
function mockRows() {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dev', 'real.json'), 'utf8'));
  return rows.map(r => ({ mint: r[0], sym: r[1], name: r[2], icon: null, price: r[3], mcap: r[4], liq: r[5], holders: r[6], organic: r[7], ch5m: r[8], ch1h: r[9], ch6h: r[10] / 2, ch24h: r[10], vol1h: r[11], vol24h: r[12], traders1h: r[13], buys1h: Math.round(r[13] * 1.4), sells1h: Math.round(r[13] * 1.1), created: r[14] }));
}

let U = { t: 0, list: [] };
async function universe() {
  if (process.env.TRENCH_MOCK) return mockRows().filter(clean);
  if (Date.now() - U.t < 10000 && U.list.length) return U.list;
  const eps = ['toptrending/1h', 'toptrending/6h', 'toptrending/24h', 'toporganicscore/1h', 'toptraded/1h', 'toptraded/24h'];
  const res = await Promise.allSettled(eps.map(e => getJSON(`${JUP}/tokens/v2/${e}?limit=100`, {}, 8000)));
  const m = new Map();
  for (const r of res) if (r.status === 'fulfilled' && Array.isArray(r.value)) for (const x of r.value) if (isPump(x) && !m.has(x.id)) m.set(x.id, norm(x));
  const list = [...m.values()].filter(clean);
  if (!list.length) { if (U.list.length) return U.list; throw Object.assign(new Error('market data unavailable'), { status: 503, expose: true }) }
  U = { t: Date.now(), list };
  return list;
}

// one coin by mint (pump.fun only), from the universe or Jupiter search
async function coin(mint) {
  const u = await universe(); const hit = u.find(c => c.mint === mint); if (hit) return hit;
  if (process.env.TRENCH_MOCK) return null;
  const r = await getJSON(`${JUP}/tokens/v2/search?query=${encodeURIComponent(mint)}`, {}, 8000).catch(() => []);
  const x = (r || []).find(t => t.id === mint);
  if (!x || !isPump(x)) return null;
  const c = norm(x); return clean(c) ? c : null;
}
// find by ticker or mint in the universe (terminal commands)
async function find(q) {
  q = String(q || '').trim(); if (!q) return null;
  const u = await universe();
  if (q.length > 30) return u.find(c => c.mint === q) || coin(q);
  const s = q.replace(/^\$/, '').toLowerCase();
  const hits = u.filter(c => c.sym.toLowerCase() === s).sort((a, b) => b.vol24h - a.vol24h);
  return hits[0] || null;
}

// fresh USD prices (not the cached universe) for call entries
async function prices(mints) {
  if (process.env.TRENCH_MOCK) { const u = mockRows(); const o = {}; for (const m of mints) { const c = u.find(x => x.mint === m); if (c) o[m] = c.price } return o }
  const o = {};
  for (let i = 0; i < mints.length; i += 50) {
    const j = await getJSON(`${JUP}/price/v3?ids=${mints.slice(i, i + 50).join(',')}`, {}, 8000);
    for (const [k, v] of Object.entries(j || {})) if (v && v.usdPrice > 0) o[k] = +v.usdPrice;
  }
  return o;
}

// the deepest pool of a coin (Dexscreener), cached
const POOLS = new Map();
async function pool(mint) {
  if (process.env.TRENCH_MOCK) return { id: 'dev', base: true, dex: 'dev' };
  if (POOLS.has(mint)) return POOLS.get(mint);
  const j = await getJSON(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, {}, 8000);
  const ps = (Array.isArray(j) ? j : []).filter(p => p.chainId === 'solana').sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
  const p = ps[0] ? { id: ps[0].pairAddress, base: ps[0].baseToken && ps[0].baseToken.address === mint, dex: ps[0].dexId, url: ps[0].url } : null;
  if (p) POOLS.set(mint, p);
  return p;
}
// candles [[t(sec),o,h,l,c,v]] oldest→newest, USD, for the coin side of its deepest pool
const TF = { '1m': ['minute', 1], '5m': ['minute', 5], '15m': ['minute', 15], '1h': ['hour', 1], '4h': ['hour', 4] };
async function candles(mint, tf = '5m', limit = 96, before) {
  if (process.env.TRENCH_MOCK) return devWalk(mint, tf, limit); // dev only: the sandbox has no network
  const [unit, agg] = TF[tf] || TF['5m'];
  const p = await pool(mint); if (!p) return [];
  const u = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${p.id}/ohlcv/${unit}?aggregate=${agg}&limit=${limit}&currency=usd&token=${p.base ? 'base' : 'quote'}` + (before ? `&before_timestamp=${before}` : '');
  const j = await getJSON(u, { headers: { accept: 'application/json;version=20230302' } }, 9000);
  const list = (j && j.data && j.data.attributes && j.data.attributes.ohlcv_list) || [];
  return list.map(r => r.map(Number)).sort((a, b) => a[0] - b[0]);
}
// dev-only stand-in candles (a seeded walk ending at the snapshot price). never used in production.
function devWalk(mint, tf, limit) {
  const c = mockRows().find(x => x.mint === mint); if (!c) return [];
  let seed = [...mint].reduce((a, ch) => a * 31 + ch.charCodeAt(0) >>> 0, 7); const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const step = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400 }[tf] || 300, now = Math.floor(Date.now() / 1000 / step) * step;
  const out = []; let p = c.price;
  for (let i = 0; i < limit; i++) { const o = p / (1 + (r() - .5) * .06), h = Math.max(o, p) * (1 + r() * .02), l = Math.min(o, p) * (1 - r() * .02); out.unshift([now - i * step, o, h, l, p, 2000 + r() * 30000]); p = o }
  return out;
}
// the price at a past moment: the 1-minute candle that contains it
async function priceAt(mint, tsMs) {
  const ts = Math.floor(tsMs / 1000);
  const rows = await candles(mint, '1m', 10, ts + 60);
  let best = null;
  for (const r of rows) if (r[0] <= ts) best = r;
  return best ? best[4] : null;
}
// the newest pump.fun coins: Jupiter's recent list + GeckoTerminal's new pump.fun pools
async function fresh() {
  if (process.env.TRENCH_MOCK) return mockRows().filter(clean).sort((a, b) => Date.parse(b.created) - Date.parse(a.created)).slice(0, 20);
  const [jr, gr] = await Promise.allSettled([
    getJSON(`${JUP}/tokens/v2/recent`, {}, 8000),
    getJSON('https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token&page=1', { headers: { accept: 'application/json;version=20230302' } }, 9000),
  ]);
  const m = new Map();
  if (jr.status === 'fulfilled' && Array.isArray(jr.value)) for (const x of jr.value) if (isPump(x)) m.set(x.id, norm(x));
  if (gr.status === 'fulfilled' && gr.value && Array.isArray(gr.value.data)) {
    const toks = new Map((gr.value.included || []).map(t => [t.id, t.attributes || {}]));
    for (const p of gr.value.data) {
      const a = p.attributes || {}, rel = p.relationships || {}, dex = rel.dex && rel.dex.data && rel.dex.data.id;
      if (!/pump/.test(String(dex || ''))) continue;
      const bid = rel.base_token && rel.base_token.data && rel.base_token.data.id; const t = toks.get(bid) || {};
      const mint = t.address || String(bid || '').replace(/^solana_/, ''); if (!mint || m.has(mint)) continue;
      const pc = a.price_change_percentage || {}, vol = a.volume_usd || {}, tx = a.transactions || {};
      m.set(mint, { mint, sym: String(t.symbol || '').slice(0, 14), name: String(t.name || '').slice(0, 40), icon: t.image_url && !/missing/.test(t.image_url) ? t.image_url : null,
        price: num(a.base_token_price_usd), mcap: num(a.market_cap_usd || a.fdv_usd), liq: num(a.reserve_in_usd), holders: 0, organic: 0,
        ch5m: num(pc.m5), ch1h: num(pc.h1), ch6h: num(pc.h6), ch24h: num(pc.h24), vol1h: num(vol.h1), vol24h: num(vol.h24),
        traders1h: num(tx.h1 && tx.h1.buyers) + num(tx.h1 && tx.h1.sellers), buys1h: num(tx.h1 && tx.h1.buys), sells1h: num(tx.h1 && tx.h1.sells), created: a.pool_created_at || null, pool: a.address || null });
    }
  }
  return [...m.values()].filter(clean).sort((a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0)).slice(0, 60);
}
// recent trades of a coin's deepest pool (GeckoTerminal), newest first. side and SOL are from the coin's side of the pool.
async function trades(mint) {
  if (process.env.TRENCH_MOCK) return [];
  const p = await pool(mint); if (!p) return [];
  const j = await getJSON(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${p.id}/trades`, { headers: { accept: 'application/json;version=20230302' } }, 9000);
  return ((j && j.data) || []).slice(0, 60).map(d => {
    const a = d.attributes || {};
    const inCoin = a.to_token_address === mint, outCoin = a.from_token_address === mint;
    const buy = inCoin ? true : outCoin ? false : (p.base ? a.kind === 'buy' : a.kind !== 'buy');
    const sol = a.from_token_address === SOL ? num(a.from_token_amount) : a.to_token_address === SOL ? num(a.to_token_amount) : null;
    const amount = buy ? num(inCoin ? a.to_token_amount : a.from_token_amount) : num(outCoin ? a.from_token_amount : a.to_token_amount);
    const price = inCoin ? num(a.price_to_in_usd) : outCoin ? num(a.price_from_in_usd) : num(buy ? a.price_to_in_usd : a.price_from_in_usd);
    return { t: Date.parse(a.block_timestamp) || 0, side: buy ? 'buy' : 'sell', usd: num(a.volume_in_usd), sol, amount, price, wallet: a.tx_from_address || null, sig: a.tx_hash || null };
  });
}
// many coins by mint in one call (Jupiter search takes a comma list of mints), pump.fun only
async function many(mints) {
  mints = [...new Set(mints)].filter(m => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)).slice(0, 60); if (!mints.length) return [];
  if (process.env.TRENCH_MOCK) { const u = mockRows(); return mints.map(m => u.find(x => x.mint === m)).filter(Boolean) }
  const r = await getJSON(`${JUP}/tokens/v2/search?query=${mints.join(',')}`, {}, 9000).catch(() => []);
  return (Array.isArray(r) ? r : []).filter(isPump).map(norm).filter(c => c.mint && !BLOCK.test(c.name + ' ' + c.sym));
}
async function solPrice() { if (process.env.TRENCH_MOCK) return 185; const p = await prices([SOL]).catch(() => ({})); return p[SOL] || null }

module.exports = { universe, coin, find, prices, pool, candles, priceAt, solPrice, fresh, trades, many, isPump, SOL, BLOCK };
