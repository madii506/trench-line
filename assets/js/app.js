/* .trench · the terminal and the site */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (a, n = 4) => a ? a.slice(0, n) + '…' + a.slice(-n) : '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = () => Date.now();
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  function fp(p) { // price with subscript zeros: 0.0000741 → 0.0₄741
    p = +p; if (!p) return '—';
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(p >= 100 ? 2 : 3);
    if (p >= 0.01) return p.toPrecision(4);
    const s = p.toFixed(20).slice(2); const z = s.match(/^0*/)[0].length;
    return '0.0' + String(z).split('').map(d => SUB[+d]).join('') + s.slice(z, z + 4).replace(/0+$/, '');
  }
  const usd = v => { v = +v || 0; const a = Math.abs(v); return (v < 0 ? '-' : '') + '$' + (a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a.toFixed(a >= 10 ? 0 : 2)) };
  const pct = (v, d = 1) => { v = +v || 0; return (v > 0 ? '+' : '') + v.toFixed(Math.abs(v) >= 100 ? 0 : d) + '%' };
  const solx = v => { v = +v || 0; return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3) };
  const cls = v => (+v > 0 ? 'up' : +v < 0 ? 'dn' : '');
  const ago = t => { const s = Math.max(1, (now() - t) / 1000 | 0); return s < 60 ? s + 's' : s < 3600 ? (s / 60 | 0) + 'm' : s < 86400 ? (s / 3600 | 0) + 'h' : (s / 86400 | 0) + 'd' };
  const mmss = ms => { ms = Math.max(0, ms); const s = ms / 1000 | 0; const h = s / 3600 | 0, m = (s % 3600) / 60 | 0, ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0') };
  const hms = t => new Date(t).toTimeString().slice(0, 8);
  const tms = c => typeof c.created === 'number' ? c.created : (Date.parse(c.created) || 0);
  const BLOCK = /n[i1]gg|f[a@]gg?ot|retard|kike|tranny|hitler|nazi|\brape|pedo|porn|titt|\btits?\b|\bcum\b|\bsex|onlyfans|nsfw/i;
  async function api(path, body) {
    let r; try { r = await fetch('/api/' + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); } catch (_) { throw new Error('network error') }
    let j = null; try { j = await r.json() } catch (_) { }
    if (!r.ok) { const e = new Error((j && j.error) || 'request failed (' + r.status + ')'); e.status = r.status; throw e }
    return j;
  }
  let tt = 0;
  function toast(m, err) { const t = $('#toast'); t.textContent = m; t.classList.toggle('err', !!err); t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600) }
  const av = c => c.icon ? `<span class="av" style="background-image:url('${esc(c.icon)}')"></span>` : `<span class="av">${esc((c.sym || '?').slice(0, 2).toUpperCase())}</span>`;
  const throttle = (fn, ms) => { let t = 0; return () => { if (t) return; t = setTimeout(() => { t = 0; fn() }, ms) } };

  /* ---------- who you are ---------- */
  let uid = '', callsign = 'anon', WAL = null; // WAL = {wallet, token, uid, name} once a wallet has signed in
  try { callsign = localStorage.getItem('trench:callsign') || 'anon'; WAL = JSON.parse(localStorage.getItem('trench:wallet') || 'null') } catch (_) { }
  if (!WAL || !WAL.wallet || !WAL.token || !/^[a-f0-9]{32}$/.test(WAL.uid || '')) WAL = null; else uid = WAL.uid;
  function setName(n) { callsign = String(n || 'anon').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 12) || 'anon'; try { localStorage.setItem('trench:callsign', callsign) } catch (_) { } $('#psName').textContent = callsign; }
  setName(callsign);
  addEventListener('trench:callsign', e => setName(e.detail));

  /* ---------- state ---------- */
  const S = { map: new Map(), list: [], top: [], live: [], sort: 'live', sel: null, tf: '5m', side: 'long', win: 60, candles: [], liveAt: 0, trades: [], sigs: new Set(), mine: [], board: [], basket: null, cfg: {}, q: '', sol: 0 };
  const px = c => c ? (c.price || (c.priceSol && S.sol ? c.priceSol * S.sol : 0)) : 0;
  const mc = c => c ? (c.mcap || (c.mcapSol && S.sol ? c.mcapSol * S.sol : 0)) : 0;
  const LIVEKEYS = { price: 1, mcap: 1 };
  function merge(c) { // one object per coin; newer stream numbers are not overwritten by slower APIs
    if (!c || !c.mint) return null;
    const o = S.map.get(c.mint); if (!o) { S.map.set(c.mint, c); return c }
    const fresh = o.lastT && now() - o.lastT < 20000;
    for (const k in c) { const v = c[k]; if (v == null || v === '') continue; if (v === 0 && o[k]) continue; if (fresh && LIVEKEYS[k]) continue; o[k] = v }
    return o;
  }
  // the pump.fun bonding curve: 793.1M tokens for sale out of 1.073B virtual
  const curveOf = d => d && d.vTokensInBondingCurve ? Math.max(0, Math.min(100, (1073000000 - d.vTokensInBondingCurve) / 793100000 * 100)) : null;

  /* ---------- watchlist ---------- */
  let W = []; try { W = JSON.parse(localStorage.getItem('trench:watch') || '[]').filter(x => x && x.mint).slice(0, 40) } catch (_) { }
  W.forEach(w => merge({ ...w }));
  const watching = m => W.some(x => x.mint === m);
  function toggleWatch(m) {
    if (!m) return; const c = S.map.get(m) || { mint: m };
    if (watching(m)) W = W.filter(x => x.mint !== m); else W.unshift({ mint: m, sym: c.sym || '', name: c.name || '', icon: c.icon || null });
    try { localStorage.setItem('trench:watch', JSON.stringify(W)) } catch (_) { }
    const on = watching(m); const b = $('#chead .wbtn'); if (b && b.dataset.watch === m) { b.classList.toggle('on', on); b.textContent = on ? '★ watching' : '☆ watch' }
    if (S.sort === 'watch') paintList(true);
    syncWatch(); toast(on ? 'watching $' + (c.sym || short(m)) : 'removed $' + (c.sym || short(m)) + ' from your watch');
    return on;
  }

  /* ---------- config ---------- */
  api('config').then(c => {
    S.cfg = c;
    if (c.x) { const a = $('#xBtn'); a.href = c.x; a.hidden = false }
    if (c.ca) { $('#caTxt').textContent = short(c.ca); const p = $('#caPill'); p.hidden = false; p.onclick = () => navigator.clipboard.writeText(c.ca).then(() => toast('contract copied')) }
    if (!c.ready) $('#cnote').textContent = 'calls open once the database is switched on.';
    upCall();
  }).catch(() => { });

  /* ---------- status chips ---------- */
  const TS = window.TS || null;
  function paintStream() {
    const el = $('#stStream'), st = TS && TS.status();
    if (!st) { el.className = 'tchip bad'; el.innerHTML = '<i></i>pump stream off'; return }
    el.className = 'tchip' + (st.state === 'live' ? ' live' : st.state === 'down' ? ' bad' : '');
    el.innerHTML = '<i></i>' + (st.state === 'live' ? 'pump stream · ' + st.perMin + '/min' : st.state === 'down' ? 'pump stream · reconnecting' : 'pump stream · connecting');
    el.title = st.state === 'live' ? 'live from the pump.fun stream: ' + st.perMin + ' new coins in the last minute' : 'the pump.fun stream is ' + st.state + '. the newest coins still load from Jupiter and GeckoTerminal.';
    $('#liveN').classList.toggle('on', st.state === 'live');
  }
  function paintMarket(ok, msg) { const el = $('#stJup'); el.className = 'tchip' + (ok ? ' live' : ' bad'); el.innerHTML = '<i></i>' + esc(msg); }
  function paintSol() { $('#stSol').textContent = S.sol ? 'SOL $' + S.sol.toFixed(2) : 'SOL —' }

  // SOL/USD straight from Jupiter when the server could not get it (used to price stream coins)
  let solAt = 0;
  async function solDirect() { solAt = now(); try { const j = await fetch('https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112').then(r => r.json()); const v = j && j['So11111111111111111111111111111111111111112'] && +j['So11111111111111111111111111111111111111112'].usdPrice; if (v > 0) { S.sol = v; paintSol(); for (const c of S.map.values()) { if (c.mcapSol && !c.mcap) c.mcap = c.mcapSol * v; if (c.priceSol && !c.price) c.price = c.priceSol * v } dirtyList() } } catch (_) { } }
  /* ---------- the line: trending, gainers, losers (Jupiter) ---------- */
  async function loadTop() {
    const sort = ['trending', 'gainers', 'losers'].includes(S.sort) ? S.sort : 'trending';
    try {
      const j = await api('coins?sort=' + sort);
      if (j.sol) { S.sol = j.sol; paintSol() } else if (!S.sol || now() - solAt > 60000) solDirect();
      const list = j.coins.map(merge);
      if (sort === 'trending') { S.top = list; renderTape() }
      if (S.sort === sort) { S.list = list; paintList() }
      paintMarket(true, 'market · ' + j.coins.length + ' coins');
      if (!S.sel && list.length) select(list[0].mint, true);
      else if (S.sel) liveHead();
      renderMine();
    } catch (e) {
      paintMarket(false, 'market · ' + e.message);
      if (S.sort === sort && !S.list.length) $('#clist').innerHTML = '<div class="empty">the market feed is down: ' + esc(e.message) + '. retrying.</div>';
    }
  }

  /* ---------- the line: live launches (pump stream + Jupiter recent + GeckoTerminal new pools) ---------- */
  const MAXLIVE = 80;
  function pushLive(cs) {
    const set = new Set(S.live); let added = 0;
    for (const c of cs) if (c && !set.has(c.mint)) { set.add(c.mint); S.live.push(c.mint); added++ }
    if (!added) return 0;
    S.live.sort((a, b) => tms(S.map.get(b)) - tms(S.map.get(a)));
    if (S.live.length > MAXLIVE) S.live.length = MAXLIVE;
    paintStream(); syncWatch();
    return added;
  }
  let freshAt = 0;
  async function loadFresh() {
    freshAt = now();
    try {
      const j = await api('fresh');
      const cs = j.coins.filter(c => c.mint && !BLOCK.test(c.name + ' ' + c.sym)).map(c => { const o = merge({ ...c, created: tms(c) || null }); o.priced = o.priced || c.price > 0; if (c.grad && !o.gradAt) o.gradAt = tms(c); return o });
      pushLive(cs.filter(c => c.created && now() - tms(c) < 6 * 3600e3));
      if (S.sort === 'live') dirtyList();
      if (!S.sel && S.live.length) setTimeout(() => { if (!S.sel && S.live[0]) select(S.live[0], true) }, 3000);
    } catch (e) { if (S.sort === 'live' && !S.live.length) $('#clist').innerHTML = '<div class="empty">waiting for new pump.fun launches… (' + esc(e.message) + ')</div>' }
  }
  if (TS) {
    TS.on('status', paintStream);
    TS.on('create', d => {
      const name = String(d.name || '').slice(0, 40), sym = String(d.symbol || '').slice(0, 14);
      if (!d.mint || BLOCK.test(name + ' ' + sym)) return;
      const pSol = d.vSolInBondingCurve && d.vTokensInBondingCurve ? d.vSolInBondingCurve / d.vTokensInBondingCurve : 0;
      const c = merge({ mint: d.mint, sym, name, uri: d.uri || null, created: now(), dev: d.traderPublicKey || null, devSol: +d.solAmount || 0,
        mcapSol: +d.marketCapSol || 0, priceSol: pSol, curve: curveOf(d), pool: d.pool || 'pump', buys: 0, sells: 0, volSol: +d.solAmount || 0, lastT: now(), src: 'stream' });
      if (S.sol) { c.mcap = c.mcapSol * S.sol; c.price = pSol * S.sol }
      if (pushLive([c]) && S.sort === 'live') { born.add(c.mint); dirtyList() }
    });
    TS.on('trade', onTrade);
    TS.on('migrate', d => {
      if (!d.mint) return; const c = S.map.get(d.mint) || merge({ mint: d.mint });
      c.pool = 'pump-amm'; c.curve = 100; c.migrated = true; c.gradAt = now(); dirtyList(); enrichMany([d.mint]);
      if (!c.sym) return;
      cliOut('$' + (c.sym || short(d.mint)) + ' just graduated to PumpSwap', 'g');
      if (d.mint === S.sel) renderHead();
    });
  }
  function onTrade(d) {
    const c = S.map.get(d.mint); if (!c) return;
    const buy = d.txType === 'buy', sol = +d.solAmount || 0, tok = +d.tokenAmount || 0;
    const pSol = d.vSolInBondingCurve && d.vTokensInBondingCurve ? d.vSolInBondingCurve / d.vTokensInBondingCurve : (tok ? sol / tok : 0);
    if (pSol) { c.priceSol = pSol; if (S.sol) c.price = pSol * S.sol }
    if (d.marketCapSol) { c.mcapSol = +d.marketCapSol; if (S.sol) c.mcap = c.mcapSol * S.sol }
    const cv = curveOf(d); if (cv != null) c.curve = cv;
    if (d.pool) c.pool = d.pool;
    c.buys = (c.buys || 0) + (buy ? 1 : 0); c.sells = (c.sells || 0) + (buy ? 0 : 1); c.volSol = (c.volSol || 0) + sol; c.lastT = now();
    dirtyList();
    if (d.mint === S.sel) {
      const u = S.sol ? sol * S.sol : 0;
      addTrades([{ t: now(), side: buy ? 'buy' : 'sell', sol, usd: u, amount: tok, price: px(c), wallet: d.traderPublicKey || null, sig: d.signature || null }], true);
      if (px(c)) liveTick(px(c), u);
      dirtyHead();
    }
  }
  // TS watches the open coin, your watchlist and the newest launches
  const syncWatch = throttle(() => { if (TS) TS.watch([S.sel, ...W.map(w => w.mint).slice(0, 8), ...stretch().slice(0, 8).map(c => c.mint), ...S.live.slice(0, 24)]) }, 1200);

  // images for stream coins: the coin's own metadata json (its uri)
  const metaQ = [], metaTried = new Set(); let metaRun = 0;
  function wantMeta(c) { if (!c || c.icon || !c.uri || metaTried.has(c.mint)) return; metaTried.add(c.mint); metaQ.push(c); pumpMeta() }
  function pumpMeta() {
    while (metaRun < 3 && metaQ.length) {
      const c = metaQ.shift(); metaRun++;
      const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 6000);
      fetch(c.uri, { signal: ac.signal }).then(r => r.ok ? r.json() : null).then(j => {
        if (j && typeof j.image === 'string' && /^https?:\/\//.test(j.image)) { c.icon = j.image; dirtyList(); if (c.mint === S.sel) renderHead() }
        if (j && !c.twitter && typeof j.twitter === 'string') c.twitter = j.twitter;
        if (j && !c.website && typeof j.website === 'string') c.website = j.website;
      }).catch(() => { }).finally(() => { clearTimeout(to); metaRun--; pumpMeta() });
    }
  }
  // Jupiter fills in prices, icons and holders for the newest coins once it has indexed them
  const tried = new Map();
  async function enrichMany(mints) {
    mints = mints.filter(m => { const c = S.map.get(m); return c && (!c.priced || !c.icon) && now() - (tried.get(m) || 0) > 45000 }).slice(0, 40);
    if (!mints.length) return; mints.forEach(m => tried.set(m, now()));
    try { const j = await api('coin?mints=' + mints.join(',')); j.coins.forEach(x => { const c = merge(x); if (c) c.priced = true }); dirtyList(); if (S.sel && mints.includes(S.sel)) { renderHead(); upCall() } } catch (_) { }
  }

  /* ---------- painting the list (keyed, so clicks never land on a replaced row) ---------- */
  const rows = new Map(); const born = new Set(); let paintedSort = null;
  const curveOfC = c => c.curve != null ? c.curve : c.bonding != null ? c.bonding : null;
  const isGrad = c => c.migrated || c.pool === 'pump-amm' || c.grad;
  function stretch() { return [...S.map.values()].filter(c => { const v = curveOfC(c); return v != null && v >= 50 && v < 100 && !isGrad(c) && now() - (c.lastT || tms(c) || 0) < 20 * 60e3 }).sort((a, b) => curveOfC(b) - curveOfC(a)).slice(0, 60) }
  function grads() { return [...S.map.values()].filter(c => isGrad(c) && (c.gradAt || tms(c)) && now() - (c.gradAt || tms(c)) < 12 * 3600e3).sort((a, b) => (b.gradAt || tms(b)) - (a.gradAt || tms(a))).slice(0, 60) }
  function current() {
    if (S.sort === 'live') return S.live.map(m => S.map.get(m)).filter(Boolean);
    if (S.sort === 'stretch') return stretch();
    if (S.sort === 'grad') return grads();
    if (S.sort === 'watch') return W.map(w => S.map.get(w.mint) || w);
    return S.list;
  }
  function filtered() { const q = S.q.toLowerCase(); return current().filter(c => !q || (c.sym || '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q) || c.mint === S.q) }
  function rowHTML(c) {
    const star = c.inBasket ? '<span class="star" title="in the basket">★</span>' : '';
    const amm = c.pool === 'pump-amm' || c.migrated ? '<span class="badge" title="graduated to PumpSwap">amm</span>' : '';
    const fresh = S.sort === 'live' || S.sort === 'stretch' || S.sort === 'grad' || (!c.priced && c.created);
    if (fresh) {
      const t = S.sort === 'grad' && c.gradAt ? c.gradAt : tms(c);
      return `${av(c)}<span class="nm"><b>$${esc(c.sym || '?')}${star}${amm}</b><small>${esc(c.name || '')}${t ? ' · <span class="age" data-t="' + t + '"></span>' : ''}${c.devSol ? ' · dev ' + solx(c.devSol) : ''}</small></span><span class="px">${mc(c) ? usd(mc(c)) : '—'}<small>${c.curve != null && !amm ? 'curve ' + c.curve.toFixed(0) + '%' : c.ch5m ? '<i class="' + cls(c.ch5m) + '">' + pct(c.ch5m) + ' 5m</i>' : c.buys || c.sells ? c.buys + 'b ' + c.sells + 's' : ''}</small></span>${c.curve != null && !amm ? '<span class="cvb"><i style="width:' + c.curve.toFixed(1) + '%"></i></span>' : ''}`;
    }
    return `${av(c)}<span class="nm"><b>$${esc(c.sym || '?')}${star}${amm}</b><small>${esc(c.name || '')} · ${usd(mc(c))}</small></span><span class="px">$${fp(px(c))}<small class="${cls(c.ch1h)}">${pct(c.ch1h)} 1h</small></span>`;
  }
  function paintList(reset) {
    const box = $('#clist');
    if (reset || paintedSort !== S.sort) { rows.clear(); box.innerHTML = ''; paintedSort = S.sort; born.clear() }
    const list = filtered();
    if (!list.length) {
      rows.clear();
      box.innerHTML = '<div class="empty">' + (S.q ? 'nothing on the line matches "' + esc(S.q) + '". paste a mint to open any pump.fun coin.'
        : S.sort === 'watch' ? 'your watchlist is empty. open a coin and press ☆ watch (or w).'
        : S.sort === 'live' ? 'waiting for new pump.fun launches…' : 'no coins right now.') + '</div>';
      return;
    }
    const em = box.querySelector(':scope > .empty'); if (em) em.remove();
    if (frozen && rows.size && !reset) { // the pointer is on the list: no row moves under it, new launches wait
      let waiting = 0; for (const c of list) { const el = rows.get(c.mint); if (!el) { waiting++; continue } const h = rowHTML(c); if (el._h !== h) { el.innerHTML = h; el._h = h } el.classList.toggle('on', c.mint === S.sel) }
      const pl = $('#lpause'); pl.hidden = !waiting; pl.textContent = 'paused · ' + waiting + ' new ↑'; tickAges(); return;
    }
    $('#lpause').hidden = true;
    const keep = new Set(list.map(c => c.mint));
    for (const [m, el] of rows) if (!keep.has(m)) { el.remove(); rows.delete(m) }
    let prev = null;
    for (const c of list) {
      let el = rows.get(c.mint);
      if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'cr'; el.dataset.m = c.mint; rows.set(c.mint, el); if (born.has(c.mint)) { el.classList.add('new'); born.delete(c.mint) } }
      const h = rowHTML(c); if (el._h !== h) { el.innerHTML = h; el._h = h }
      const v = S.sort === 'live' ? mc(c) : px(c);
      if (el._v && v && v !== el._v) { el.classList.remove('flash-up', 'flash-dn'); void el.offsetWidth; el.classList.add(v > el._v ? 'flash-up' : 'flash-dn') }
      el._v = v;
      el.classList.toggle('on', c.mint === S.sel);
      const want = prev ? prev.nextSibling : box.firstChild;
      if (want !== el) box.insertBefore(el, want);
      prev = el;
      if (S.sort === 'live' || S.sort === 'watch') wantMeta(c);
    }
    tickAges();
  }
  const dirtyList = throttle(() => paintList(), 650);
  function tickAges() { $$('#clist [data-t], #chead [data-t]').forEach(e => { e.textContent = ago(+e.dataset.t) }) }
  setInterval(tickAges, 1000);

  $('#clist').addEventListener('click', e => { const b = e.target.closest('.cr'); if (b) select(b.dataset.m) });
  let frozen = false;
  $('#clist').addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && ['live', 'stretch', 'grad'].includes(S.sort)) frozen = true });
  $('#clist').addEventListener('pointerleave', () => { if (frozen) { frozen = false; paintList() } });
  $('#lpause').addEventListener('click', () => { frozen = false; paintList(); $('#clist').scrollTop = 0 });
  function setSort(s) {
    S.sort = s; frozen = false; $$('.tl .tabs button').forEach(x => x.classList.toggle('on', x.dataset.s === s));
    if (s === 'live') { paintList(true); if (now() - freshAt > 8000) loadFresh() }
    else if (s === 'stretch' || s === 'grad') { paintList(true); enrichMany(current().map(c => c.mint)) }
    else if (s === 'watch') { paintList(true); enrichMany(W.map(w => w.mint)) }
    else { S.list = []; paintList(true); $('#clist').innerHTML = '<div class="empty">loading the line…</div>'; loadTop() }
  }
  $$('.tl .tabs').forEach(t => t.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSort(b.dataset.s) }));
  setInterval(() => { const a = stretch().length, b = grads().length; $('#strN').textContent = a || ''; $('#gradN').textContent = b || ''; if (S.sort === 'stretch' || S.sort === 'grad') dirtyList() }, 2000);
  $('#q').addEventListener('input', e => { S.q = e.target.value.trim(); paintList(); if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(S.q)) openMint(S.q) });
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = filtered()[0]; if (f) { select(f.mint); e.target.blur() } } });
  function openMint(m) { merge({ mint: m }); select(m) }

  /* ---------- the open coin ---------- */
  let enrichT = 0;
  function select(mint, quiet) {
    if (!mint) return; const changed = S.sel !== mint; S.sel = mint; const c = S.map.get(mint);
    for (const [m, el] of rows) el.classList.toggle('on', m === mint);
    renderHead(); upCall();
    if (changed) { S.trades = []; S.sigs = new Set(); trows.clear(); $('#trades').innerHTML = ''; paintTrades(); $('#flow').innerHTML = ''; renderInfo(); S.candles = []; S.liveAt = 0; const young = c && tms(c) && now() - tms(c) < 3 * 3600e3; if (young && S.tf !== '1m') setTf('1m', true); loadChart(); loadTrades(); syncWatch() }
    enrich(mint);
    if (c) wantMeta(c);
    if (!quiet) cliOut('opened $' + (c && c.sym ? c.sym : short(mint)), 'g');
  }
  async function enrich(mint) {
    clearTimeout(enrichT);
    try { const j = await api('coin?mint=' + mint); const c = merge(j.coin); c.priced = true; if (S.sel === mint) { renderHead(); upCall() } }
    catch (e) {
      const c = S.map.get(mint); if (c) { c.priced = false; c.why = e.status === 404 ? 'no price feed yet' : e.message }
      if (S.sel === mint) { renderHead(); upCall(); enrichT = setTimeout(() => { if (S.sel === mint) enrich(mint) }, 15000) }
    }
  }
  function renderHead() {
    const c = S.map.get(S.sel); if (!c) { $('#chead').innerHTML = '<div class="empty">pick a coin on the line.</div>'; return }
    const w = watching(c.mint), amm = c.pool === 'pump-amm' || c.migrated, curve = c.curve != null && !amm;
    const where = amm ? 'pumpswap' : curve ? 'bonding curve' : '';
    const st = [['mcap', `<em id="hMc">${mc(c) ? usd(mc(c)) : '—'}</em>`]];
    if (c.liq) st.push(['liq', `<em>${usd(c.liq)}</em>`]);
    if (c.holders) st.push(['holders', `<em>${c.holders.toLocaleString()}</em>`]);
    if (c.vol1h) st.push(['vol 1h', `<em>${usd(c.vol1h)}</em>`]);
    if (c.organic) st.push(['organic', `<em>${c.organic}</em>`]);
    if (c.ch5m) st.push(['5m', `<em class="${cls(c.ch5m)}">${pct(c.ch5m)}</em>`]);
    if (curve) st.push(['curve', `<em id="hCv">${c.curve.toFixed(1)}%</em>`]);
    if (tms(c)) st.push(['age', `<em data-t="${tms(c)}"></em>`]);
    if (c.devSol) st.push(['dev buy', `<em>${solx(c.devSol)} SOL</em>`]);
    st.push(['seen', `<em id="hSeen">${seen(c)}</em>`]);
    const ch = c.priced && (c.ch1h || c.ch24h) ? `<span class="${cls(c.ch1h)}">${pct(c.ch1h)} 1h</span> <span class="${cls(c.ch24h)}" style="font-size:12px">${pct(c.ch24h)} 24h</span>` : `<span style="color:var(--mut2);font-size:12px">${c.priced === false ? esc(c.why || 'no price feed yet') + ' · live from the pump stream' : c.src === 'stream' ? 'live from the pump stream' : ''}</span>`;
    const links = `<a href="https://pump.fun/coin/${c.mint}" target="_blank" rel="noopener">pump.fun ↗</a><a href="https://dexscreener.com/solana/${c.mint}" target="_blank" rel="noopener">chart ↗</a>${c.twitter && /^https:\/\/(x|twitter)\.com\//.test(c.twitter) ? `<a href="${esc(c.twitter)}" target="_blank" rel="noopener">𝕏 ↗</a>` : ''}`;
    $('#chead').innerHTML = `${av(c)}<div class="ti"><b>$${esc(c.sym || '?')}</b> <span style="color:var(--mut)">${esc(c.name || '')}</span><small>${esc(short(c.mint, 6))}<button type="button" data-copy="${c.mint}">copy</button>${c.inBasket ? ' · <span class="up">★ in the basket</span>' : ''}${where ? ' · ' + where : ''}</small></div>
      <button type="button" class="wbtn${w ? ' on' : ''}" data-watch="${c.mint}" title="watch this coin (w)">${w ? '★ watching' : '☆ watch'}</button>
      <div class="big"><b id="hPx">${px(c) ? '$' + fp(px(c)) : '—'}</b>${ch}</div>
      <div class="stats">${st.map(([k, v]) => `<span>${k} ${v}</span>`).join('')}${links}</div>`;
    tickAges();
  }
  const seen = c => c.buys || c.sells ? `<span class="up">${c.buys} buys</span> · <span class="dn">${c.sells} sells</span>` : '—';
  function liveHead() { // numbers only, so the buttons in the header are never replaced mid-click
    const c = S.map.get(S.sel); if (!c) return;
    const a = $('#hPx'), b = $('#hMc'), v = $('#hCv'), s = $('#hSeen');
    if (a) { const t = px(c) ? '$' + fp(px(c)) : '—'; if (a.textContent !== t) { a.textContent = t; a.classList.remove('tick'); void a.offsetWidth; a.classList.add('tick') } }
    if (b) b.textContent = mc(c) ? usd(mc(c)) : '—';
    if (v && c.curve != null) v.textContent = c.curve.toFixed(1) + '%';
    if (s) s.innerHTML = seen(c);
  }
  const dirtyHead = throttle(liveHead, 400);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]'); if (b) navigator.clipboard.writeText(b.dataset.copy).then(() => toast('copied'));
    const w = e.target.closest('[data-watch]'); if (w) toggleWatch(w.dataset.watch);
  });

  /* ---------- trades on the open coin ---------- */
  let tradesT = 0;
  async function loadTrades() {
    clearTimeout(tradesT); const m = S.sel; if (!m) return;
    try { const j = await api('trades?mint=' + m); if (S.sel === m && j.trades.length) { addTrades(j.trades.map(t => ({ ...t, sol: t.sol == null && S.sol && t.usd ? t.usd / S.sol : t.sol })), false); if (!S.candles.length && S.trades.length > 2) { S.candles = fromTrades(S.trades); $('#cmsg').textContent = ''; drawChart() } } } catch (_) { }
    const live = TS && TS.status().state === 'live';
    if (S.sel === m) tradesT = setTimeout(loadTrades, live ? 30000 : 12000);
  }
  function addTrades(list, fresh) {
    let n = 0;
    for (const t of list) { const k = t.sig || (t.t + ':' + t.wallet + ':' + t.sol); if (S.sigs.has(k)) continue; S.sigs.add(k); t._f = fresh; S.trades.push(t); n++ }
    if (!n) return;
    S.trades.sort((a, b) => b.t - a.t); if (S.trades.length > 240) S.trades.length = 240;
    dirtyTrades(); dirtyInfo(); if (S.candles.length < 8) { $('#cmsg').textContent = ''; dirtyChart() }
  }
  const trows = new Map(); // keyed rows: existing rows are never rebuilt, only new trades slide in
  const tkey = t => t.sig || (t.t + ':' + t.wallet + ':' + t.sol);
  function paintTrades() {
    const box = $('#trades'), c = S.map.get(S.sel) || {};
    if (!S.trades.length) { trows.clear(); box.innerHTML = '<div class="empty">' + (S.sel ? 'waiting for trades on $' + esc(c.sym || short(S.sel)) + '…' : 'pick a coin.') + '</div>'; return }
    const em = box.querySelector(':scope > .empty'); if (em) em.remove();
    const show = S.trades.slice(0, 60), keep = new Set(show.map(tkey));
    for (const [k, el] of trows) if (!keep.has(k)) { el.remove(); trows.delete(k) }
    let prev = null;
    for (const t of show) {
      const k = tkey(t); let el = trows.get(k);
      if (!el) {
        const big = (t.usd || 0) >= 1000 || (t.sol || 0) >= 5, who = t.wallet ? (c.dev && t.wallet === c.dev ? 'dev' : short(t.wallet, 3)) : '';
        el = document.createElement('a'); el.className = 'trd ' + t.side + (big ? ' big' : '') + (t._f ? ' fresh' : '');
        if (t.sig) { el.href = 'https://solscan.io/tx/' + t.sig; el.target = '_blank'; el.rel = 'noopener' }
        el.title = t.side + (t.amount ? ' ' + Math.round(t.amount).toLocaleString() + ' tokens' : '') + (t.price ? ' at $' + fp(t.price) : '');
        el.innerHTML = `<span class="tm">${hms(t.t)}</span><span class="sd">${t.side}</span><span>${t.sol != null ? solx(t.sol) : '—'}</span><span class="u">${t.usd ? usd(t.usd) : '—'}</span><span class="w">${esc(who)}</span>`;
        trows.set(k, el); t._f = false;
      }
      const want = prev ? prev.nextSibling : box.firstChild;
      if (want !== el) box.insertBefore(el, want);
      prev = el;
    }
  }
  const dirtyTrades = throttle(paintTrades, 350);

  /* ---------- chart ---------- */
  const TFS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 };
  const cv = $('#chart'), cx = cv.getContext('2d'); let hover = null;
  async function loadChart() {
    const m = S.sel, tf = S.tf; if (!m) return;
    if (!S.candles.length) $('#cmsg').textContent = 'loading candles…';
    drawChart();
    try {
      const j = await api('candles?mint=' + m + '&tf=' + tf); if (S.sel !== m || S.tf !== tf) return;
      const cs = j.candles || [];
      if (cs.length) { S.candles = cs; $('#cmsg').textContent = '' }
      else if (S.trades.length > 2) { S.candles = fromTrades(S.trades); $('#cmsg').textContent = '' }
      else if (!S.candles.length) $('#cmsg').textContent = 'no candles yet. this chart builds itself from live trades.';
    } catch (e) { if (S.sel === m && !S.candles.length) $('#cmsg').textContent = S.trades.length > 2 ? '' : 'candles unavailable: ' + e.message + '. live trades still draw here.'; if (S.trades.length > 2 && !S.candles.length) S.candles = fromTrades(S.trades) }
    drawChart();
  }
  function fromTrades(ts) { // candles from real trades (newest coins have no candle feed yet)
    const step = TFS[S.tf] || 300, m = new Map();
    for (const t of ts.slice().sort((a, b) => a.t - b.t)) { if (!t.price) continue; const b = Math.floor(t.t / 1000 / step) * step; const k = m.get(b); if (!k) m.set(b, [b, t.price, t.price, t.price, t.price, t.usd || 0]); else { k[2] = Math.max(k[2], t.price); k[3] = Math.min(k[3], t.price); k[4] = t.price; k[5] += t.usd || 0 } }
    const out = [...m.values()]; for (let i = 1; i < out.length; i++) { out[i][1] = out[i - 1][4]; out[i][2] = Math.max(out[i][2], out[i][1]); out[i][3] = Math.min(out[i][3], out[i][1]) }
    return out;
  }
  function liveTick(p, vol) {
    const step = TFS[S.tf] || 300, b = Math.floor(now() / 1000 / step) * step, cs = S.candles, last = cs[cs.length - 1];
    if (last && last[0] === b) { last[2] = Math.max(last[2], p); last[3] = Math.min(last[3], p); last[4] = p; last[5] += vol }
    else if (!last || b > last[0]) { const o = last ? last[4] : p; cs.push([b, o, Math.max(o, p), Math.min(o, p), p, vol]); if (cs.length > 200) cs.shift() }
    S.liveAt = now(); const l = $('#clive'); if (!l.classList.contains('on')) { l.classList.add('on'); l.textContent = 'live · pump stream' }
    $('#cmsg').textContent = ''; dirtyChart();
  }
  setInterval(() => { if (S.liveAt && now() - S.liveAt > 30000) { S.liveAt = 0; const l = $('#clive'); l.classList.remove('on'); l.textContent = '' } }, 3000);
  function setTf(tf, quiet) { S.tf = tf; $$('#ctf button').forEach(x => x.classList.toggle('on', x.dataset.tf === tf)); S.candles = []; if (!quiet) loadChart() }
  $('#ctf').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTf(b.dataset.tf) });
  function drawChart() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (!r.width) return;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, r.width, r.height);
    const W2 = r.width, H = r.height, padR = 74, padT = 34, padB = 22, volH = H * .16;
    cx.strokeStyle = 'rgba(238,243,226,.05)'; cx.lineWidth = 1;
    for (let i = 1; i < 5; i++) { const y = padT + (H - padT - padB) * i / 5; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W2 - padR, y); cx.stroke() }
    const tk = S.candles.length < 8 ? S.trades.filter(t => t.price > 0).slice(0, 240).reverse() : null;
    if (tk && tk.length >= 2) return drawTicks(tk, W2, H, padR, padT, padB, volH);
    const cs = S.candles.slice(-120); if (!cs.length) return;
    const lo = Math.min(...cs.map(c => c[3])), hi = Math.max(...cs.map(c => c[2])), vmax = Math.max(...cs.map(c => c[5])) || 1;
    const opens = S.mine.filter(c => c.mint === S.sel && !c.result);
    const lo2 = Math.min(lo, ...opens.map(c => c.entry)), hi2 = Math.max(hi, ...opens.map(c => c.entry));
    const span = (hi2 - lo2) || hi2 * .01 || 1;
    const y = v => padT + (H - padT - padB - volH) * (1 - (v - lo2) / span);
    const n = Math.max(cs.length, 24), bw = (W2 - padR - 8) / n, x = i => 4 + i * bw + bw / 2;
    for (let i = 0; i < cs.length; i++) { const c = cs[i], up = c[4] >= c[1]; cx.fillStyle = up ? 'rgba(95,224,138,.22)' : 'rgba(255,107,94,.2)'; const vh = c[5] / vmax * volH; cx.fillRect(x(i) - bw * .35, H - padB - vh, bw * .7, vh) }
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], up = c[4] >= c[1], col = up ? '#5fe08a' : '#ff6b5e';
      cx.strokeStyle = col; cx.beginPath(); cx.moveTo(x(i), y(c[2])); cx.lineTo(x(i), y(c[3])); cx.stroke();
      cx.fillStyle = col; const t = y(Math.max(c[1], c[4])), b = y(Math.min(c[1], c[4])); cx.fillRect(x(i) - bw * .32, t, Math.max(1, bw * .64), Math.max(1, b - t));
    }
    cx.font = '11px JB, monospace'; cx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) { const v = lo2 + span * i / 4; cx.fillStyle = 'rgba(147,179,156,.7)'; cx.fillText(fp(v), W2 - padR + 8, y(v)) }
    const last = cs[cs.length - 1][4]; cx.setLineDash([2, 4]); cx.strokeStyle = 'rgba(238,243,226,.35)'; cx.beginPath(); cx.moveTo(0, y(last)); cx.lineTo(W2 - padR, y(last)); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = '#eef3e2'; cx.fillRect(W2 - padR + 2, y(last) - 9, padR - 4, 18); cx.fillStyle = '#06120b'; cx.fillText(fp(last), W2 - padR + 8, y(last));
    if (S.liveAt) { const lx = x(cs.length - 1), ly = y(last), k = (now() % 1600) / 1600; cx.fillStyle = 'rgba(95,224,138,' + (.5 * (1 - k)).toFixed(3) + ')'; cx.beginPath(); cx.arc(lx, ly, 3 + k * 9, 0, 7); cx.fill(); cx.fillStyle = '#5fe08a'; cx.beginPath(); cx.arc(lx, ly, 3, 0, 7); cx.fill() }
    for (const o of opens) { const col = o.side === 'long' ? '#5fe08a' : '#ff6b5e'; cx.strokeStyle = col; cx.setLineDash([6, 4]); cx.beginPath(); cx.moveTo(0, y(o.entry)); cx.lineTo(W2 - padR, y(o.entry)); cx.stroke(); cx.setLineDash([]); cx.fillStyle = col; cx.fillText((o.side === 'long' ? 'long ' : 'hedge ') + mmss(o.endsAt - now()), 8, y(o.entry) - 9) }
    if (hover != null && hover >= 0 && hover < cs.length) { const c = cs[hover]; cx.strokeStyle = 'rgba(238,243,226,.25)'; cx.beginPath(); cx.moveTo(x(hover), padT); cx.lineTo(x(hover), H - padB); cx.stroke(); $('#ctip').innerHTML = `${new Date(c[0] * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · o ${fp(c[1])} h ${fp(c[2])} l ${fp(c[3])} c <b>${fp(c[4])}</b> · vol ${usd(c[5])}` } else $('#ctip').textContent = '';
  }
  // a brand-new coin has no candles yet: draw every trade (a tick chart)
  function drawTicks(tk, W2, H, padR, padT, padB, volH) {
    const ps = tk.map(t => t.price), opens = S.mine.filter(c => c.mint === S.sel && !c.result);
    const lo = Math.min(...ps, ...opens.map(c => c.entry)), hi = Math.max(...ps, ...opens.map(c => c.entry)), span = (hi - lo) || hi * .02 || 1;
    const y = v => padT + (H - padT - padB - volH) * (1 - (v - lo) / span), n = tk.length, x = i => 6 + i * (W2 - padR - 14) / Math.max(1, n - 1);
    const vmax = Math.max(...tk.map(t => t.usd || t.sol || 0)) || 1;
    tk.forEach((t, i) => { cx.fillStyle = t.side === 'buy' ? 'rgba(95,224,138,.3)' : 'rgba(255,107,94,.28)'; const vh = (t.usd || t.sol || 0) / vmax * volH; cx.fillRect(x(i) - 1.5, H - padB - vh, 3, vh) });
    const gr = cx.createLinearGradient(0, padT, 0, H - padB - volH); gr.addColorStop(0, 'rgba(95,224,138,.22)'); gr.addColorStop(1, 'rgba(95,224,138,0)');
    cx.beginPath(); tk.forEach((t, i) => i ? cx.lineTo(x(i), y(t.price)) : cx.moveTo(x(i), y(t.price))); cx.lineTo(x(n - 1), H - padB - volH); cx.lineTo(x(0), H - padB - volH); cx.closePath(); cx.fillStyle = gr; cx.fill();
    cx.beginPath(); tk.forEach((t, i) => i ? cx.lineTo(x(i), y(t.price)) : cx.moveTo(x(i), y(t.price))); cx.strokeStyle = '#5fe08a'; cx.lineWidth = 1.6; cx.stroke(); cx.lineWidth = 1;
    if (n < 90) tk.forEach((t, i) => { cx.fillStyle = t.side === 'buy' ? '#5fe08a' : '#ff6b5e'; cx.fillRect(x(i) - 1.5, y(t.price) - 1.5, 3, 3) });
    cx.font = '11px JB, monospace'; cx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) { const v = lo + span * i / 4; cx.fillStyle = 'rgba(147,179,156,.7)'; cx.fillText(fp(v), W2 - padR + 8, y(v)) }
    const last = ps[n - 1]; cx.fillStyle = '#eef3e2'; cx.fillRect(W2 - padR + 2, y(last) - 9, padR - 4, 18); cx.fillStyle = '#06120b'; cx.fillText(fp(last), W2 - padR + 8, y(last));
    if (S.liveAt) { const k = (now() % 1600) / 1600; cx.fillStyle = 'rgba(95,224,138,' + (.5 * (1 - k)).toFixed(3) + ')'; cx.beginPath(); cx.arc(x(n - 1), y(last), 3 + k * 9, 0, 7); cx.fill() }
    for (const o of opens) { const col = o.side === 'long' ? '#5fe08a' : '#ff6b5e'; cx.strokeStyle = col; cx.setLineDash([6, 4]); cx.beginPath(); cx.moveTo(0, y(o.entry)); cx.lineTo(W2 - padR, y(o.entry)); cx.stroke(); cx.setLineDash([]); cx.fillStyle = col; cx.fillText((o.side === 'long' ? 'long ' : 'hedge ') + mmss(o.endsAt - now()), 8, y(o.entry) - 9) }
    cx.fillStyle = 'rgba(147,179,156,.6)'; cx.fillText('every trade · ' + n + (n === 1 ? ' trade' : ' trades'), 8, padT - 16);
    $('#ctip').textContent = '';
  }
  const dirtyChart = throttle(drawChart, 250);
  (function pulse() { if (S.liveAt && !document.hidden && !reduce) drawChart(); setTimeout(pulse, 120) })();
  cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); const n = Math.max(Math.min(S.candles.length, 120), 24); if (!S.candles.length) return; hover = Math.floor((e.clientX - r.left - 4) / ((r.width - 82) / n)); drawChart() });
  cv.addEventListener('pointerleave', () => { hover = null; drawChart() });
  new ResizeObserver(() => drawChart()).observe($('#chartBox'));
  setInterval(() => { if (S.sel && !document.hidden) loadChart() }, 60000);

  /* ---------- making a call ---------- */
  function segInd(el) { const on = $('button.on', el), ind = $('.sind', el); if (on && ind) { ind.style.left = on.offsetLeft + 'px'; ind.style.width = on.offsetWidth + 'px' } }
  $$('.seg').forEach(s => { segInd(s); new ResizeObserver(() => segInd(s)).observe(s) });
  function setSide(s) { S.side = s; $$('#side button').forEach(x => x.classList.toggle('on', x.dataset.side === s)); $('#side').classList.toggle('hedge', s === 'hedge'); segInd($('#side')); upCall() }
  function setWin(w) { S.win = w; $$('#win button').forEach(x => x.classList.toggle('on', +x.dataset.w === w)); segInd($('#win')); upCall() }
  $('#side').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSide(b.dataset.side) });
  $('#win').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setWin(+b.dataset.w) });
  const wl = w => w === 240 ? '4h' : w === 60 ? '1h' : '15m';
  function upCall() {
    const go = $('#callGo'), c = S.map.get(S.sel);
    go.classList.toggle('hedge', S.side === 'hedge');
    go.querySelector('span').textContent = c ? (S.side === 'long' ? 'long' : 'hedge') + ' $' + (c.sym || short(c.mint)) + ' · ' + wl(S.win) : 'call it';
    const unpriced = c && c.priced === false;
    if (!WAL) { go.querySelector('span').textContent = 'connect wallet to call'; go.disabled = S.cfg.ready === false }
    else go.disabled = !c || S.cfg.ready === false || unpriced;
    const note = $('#cnote');
    if (!note.classList.contains('ok') && !note.classList.contains('err')) note.textContent = S.cfg.ready === false ? 'calls open once the database is switched on.' : !WAL ? 'connect a wallet to make calls. signing in is free: no transaction, no fees.' : unpriced ? 'this coin has no price feed yet, so calls on it open in a minute or two. its trades still stream in live.' : 'points only, no money. the entry locks at the live price when you call it.';
  }
  $('#callGo').addEventListener('click', () => { if (!WAL) return openWallets(); makeCall(S.sel, S.side, S.win) });
  async function makeCall(mint, side, win) {
    const note = $('#cnote'), go = $('#callGo'); if (!WAL) { openWallets(); cliOut('connect your wallet to make calls', 'e'); return } if (!mint || go.disabled && !arguments[3]) return;
    go.disabled = true; note.className = 'cnote'; note.textContent = 'locking the entry at the live price…';
    try {
      const { call } = await api('call', { wallet: WAL.wallet, token: WAL.token, callsign, mint, side, win });
      S.mine.unshift(call); renderMine(); drawChart(); loadBoard(); loadFeed();
      const msg = side + ' $' + call.sym + ' for ' + wl(win) + ' at $' + fp(call.entry);
      note.className = 'cnote ok'; note.textContent = 'called: ' + msg + '. settles at ' + new Date(call.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.';
      cliOut('called: ' + msg, 'g'); toast('called: ' + msg);
      setTimeout(() => { if (note.classList.contains('ok')) { note.className = 'cnote'; upCall() } }, 9000);
      return call;
    } catch (e) { note.className = 'cnote err'; note.textContent = e.message; cliOut(e.message, 'e'); toast(e.message, true); setTimeout(() => { if (note.classList.contains('err')) { note.className = 'cnote'; upCall() } }, 7000) }
    finally { upCall() }
  }

  /* ---------- right side: trades · calls · board · basket ---------- */
  function setR(r) { $$('#rtabs button').forEach(x => x.classList.toggle('on', x.dataset.r === r)); $$('.tr .rp').forEach(p => p.classList.toggle('on', p.dataset.r === r)); segInd($('#rtabs')); if (r === 'info') renderInfo() }
  $('#rtabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setR(b.dataset.r) });

  /* ---------- your calls ---------- */
  async function loadMine() { if (!uid) { S.mine = []; renderMine(); return } try { const j = await api('calls?uid=' + uid); S.mine = j.calls; renderMine(); drawChart() } catch (_) { } }
  function liveMove(c) { const p = px(S.map.get(c.mint)); if (!p || c.result) return null; return (p - c.entry) / c.entry }
  function renderMine() {
    const box = $('#mycalls'); const pts = S.mine.reduce((s, c) => s + (c.points || 0), 0), open = S.mine.filter(c => !c.result).length;
    $('#myN').textContent = open ? String(open) : '';
    const won = S.mine.filter(c => c.result === 'won').length, lost = S.mine.filter(c => c.result === 'lost').length;
    $('#myPts').innerHTML = S.mine.length ? `<b>${pts} pts</b> · ${won}W ${lost}L · ${open} open` : '';
    if (!S.mine.length) { box.innerHTML = '<div class="empty">' + (WAL ? 'no calls yet. pick a coin, long or hedge it.' : 'connect your wallet to make calls. signing in is free: no transaction, no fees.') + '</div>'; return }
    box.innerHTML = S.mine.slice(0, 16).map(c => {
      const op = !c.result, m = op ? liveMove(c) : c.move, good = m == null ? null : (c.side === 'long' ? m > 0 : m < 0);
      const left = c.endsAt - now(), frac = Math.min(1, Math.max(0, 1 - left / (c.win * 60e3)));
      return `<div class="mc ${c.result || ''}" data-m="${c.mint}"><span><span class="s">$${esc(c.sym)}</span><span class="tag ${c.side}">${c.side}</span></span><span class="r ${good == null ? '' : good ? 'up' : 'dn'}">${m == null ? '—' : pct(m * 100, 2)}</span>
        <small>${op ? 'settles in <b class="cd" data-end="' + c.endsAt + '">' + mmss(left) + '</b>' : c.result === 'void' ? 'void · no price' : c.result + ' · ' + (c.points > 0 ? '+' : '') + c.points + ' pts'}</small><small class="r">$${fp(c.entry)}${c.exit ? ' → $' + fp(c.exit) : ''}</small>
        ${op ? '<span class="bar"><i style="width:' + (frac * 100).toFixed(1) + '%"></i></span>' : ''}</div>`;
    }).join('');
  }
  $('#mycalls').addEventListener('click', e => { const r = e.target.closest('.mc[data-m]'); if (r) { if (!S.map.has(r.dataset.m)) merge({ mint: r.dataset.m }); select(r.dataset.m) } });
  setInterval(() => { $$('#mycalls .cd').forEach(e => { const l = +e.dataset.end - now(); e.textContent = l <= 0 ? 'settling…' : mmss(l) }); if (S.mine.some(c => !c.result && c.endsAt <= now() - 15000)) loadMine() }, 1000);
  setInterval(() => { if (!document.hidden) renderMine() }, 5000);

  /* ---------- the feed of calls ---------- */
  async function loadFeed() {
    try {
      const j = await api('calls?limit=24'); const el = $('#feed');
      el.innerHTML = j.calls.length ? j.calls.map(c => `<div class="fc"><span><b>${esc(c.callsign)}</b><small>#${esc(c.tag)}</small> <span class="${c.side === 'long' ? 'up' : 'dn'}">${c.side}</span> $${esc(c.sym)}</span><span class="${c.result === 'won' ? 'up' : c.result === 'lost' ? 'dn' : ''}">${c.result ? (c.result === 'void' ? 'void' : (c.points > 0 ? '+' : '') + c.points) : 'open'}</span><small>${wl(c.win)} · entry $${fp(c.entry)}${c.exit ? ' → $' + fp(c.exit) : ''}</small><small>${ago(c.entryAt)} ago</small></div>`).join('') : '<div class="empty">no calls yet. be the first on the line.</div>';
    } catch (e) { if (/database/.test(e.message)) $('#feed').innerHTML = '<div class="empty">calls open once the database is switched on.</div>' }
  }

  /* ---------- the board ---------- */
  let P = 'all';
  async function loadBoard() {
    try {
      const j = await api('board?p=' + P); S.board = j.board;
      const row = r => `<div class="lbr${r.rank === 1 ? ' top1' : ''}${uid && r.tag === uid.slice(-4) && r.callsign === callsign ? ' me' : ''}"><span class="rk">#${r.rank}</span><span><b>${esc(r.callsign)}</b> <small style="color:var(--mut2)">#${esc(r.tag)}</small></span><span class="pts">${r.points} pts</span><span>${r.won}W · ${r.lost}L</span><span class="hide">${r.open} open</span><span class="hide">${r.best == null ? '—' : '+' + r.best + '%'}</span></div>`;
      $('#lb').innerHTML = j.board.length ? '<div class="lbr h"><span>rank</span><span>callsign</span><span>points</span><span>record</span><span class="hide">open</span><span class="hide">best call</span></div>' + j.board.map(row).join('') : '<div class="empty" style="padding:22px">nobody on the board yet. make the first call.</div>';
      renderPodium(j.board);
      $('#miniBoard').innerHTML = j.board.length ? j.board.slice(0, 10).map(r => `<div class="row"><em>#${r.rank}</em><span>${esc(r.callsign)}</span><span class="up">${r.points}</span></div>`).join('') : '<div class="empty">nobody on the board yet.</div>';
    } catch (e) { const m = /database/.test(e.message) ? 'the board opens once the database is switched on.' : e.message; $('#lb').innerHTML = '<div class="empty" style="padding:22px">' + esc(m) + '</div>'; $('#miniBoard').innerHTML = '<div class="empty">' + esc(m) + '</div>' }
  }
  $('#ptabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; P = b.dataset.p; $$('#ptabs button').forEach(x => x.classList.toggle('on', x === b)); segInd($('#ptabs')); loadBoard() });

  /* ---------- the basket ---------- */
  async function loadBasket() {
    try {
      const j = await api('basket'); S.basket = j; const t = j.target;
      t.forEach(x => { const c = S.map.get(x.mint); if (c) c.inBasket = true });
      $('#miniBasket').innerHTML = t.length ? t.map(x => `<div class="row" data-m="${x.mint}">${av(x)}<span>$${esc(x.sym)}</span><span>${(x.weight * 100).toFixed(0)}%</span><span class="wbar"><i style="width:${(x.weight / 0.25 * 100).toFixed(1)}%"></i></span></div>`).join('') : '<div class="empty">no coin passes the gates right now.</div>';
      const v = j.vs;
      $('#vs').innerHTML = [['basket · 1h', v.basket1h, 2], ['median coin · 1h', v.market1h, 2], ['basket · 24h', v.basket24h, 1], ['median coin · 24h', v.market24h, 1]].map(([l, x, d]) => `<div><small>${l}</small><b class="${cls(x)}" data-to="${x}" data-d="${d}">${pct(x, d)}</b></div>`).join('');
      countUp($('#vs'));
      $('#bk').innerHTML = t.length ? '<div class="bkr h"><span>#</span><span>coin</span><span>weight</span><span></span><span>score</span><span class="hide">1h</span><span class="hide2">24h</span></div>' + t.map((x, i) => `<div class="bkr" data-m="${x.mint}"><span style="color:var(--mut2)">${i + 1}</span><span class="n">${av(x)}<b>$${esc(x.sym)}</b></span><span class="wb"><i style="--w:${(x.weight / 0.25).toFixed(3)}"></i></span><span>${(x.weight * 100).toFixed(1)}%</span><span>${x.score.toFixed(1)}</span><span class="hide ${cls(x.why.ch1h)}">${pct(x.why.ch1h)}</span><span class="hide2 ${cls(x.why.ch24h)}">${pct(x.why.ch24h)}</span>
        <div class="why"><span>6h <em class="${cls(x.why.ch6h)}">${pct(x.why.ch6h)}</em></span><span>vol 1h <em>${usd(x.why.vol1h)}</em></span><span>organic <em>${x.why.organic}</em></span><span>holders <em>${x.why.holders.toLocaleString()}</em></span><span>liq <em>${usd(x.why.liq)}</em></span><span>mcap <em>${usd(x.why.mcap)}</em></span><span>age <em>${x.why.ageH}h</em></span></div></div>`).join('') : '<div class="empty" style="padding:22px">no coin passes the gates right now. the basket waits in SOL.</div>';
      bkIO && bkIO.observe($('#bk')); renderTmap(t);
      const R = j.rules; $('#gates').innerHTML = `<span>gates</span><span>liq ≥ ${usd(R.minLiq)}</span><span>mcap ≥ ${usd(R.minMcap)}</span><span>holders ≥ ${R.minHolders}</span><span>organic ≥ ${R.minOrganic}</span><span>age ≥ ${R.minAgeH}h</span><span>vol 1h ≥ ${usd(R.minVol1h)}</span><span>top ${R.n} · ${R.floor * 100}–${R.cap * 100}% each</span>`;
      const eng = $('#engine');
      if (!j.engine) eng.innerHTML = '<b>engine: off.</b> it switches on with the $TRENCH treasury. until then the table above is the live target it will buy, scored from real data every minute.';
      else eng.innerHTML = `<b>engine wallet</b> <a href="https://solscan.io/account/${j.engine}" target="_blank" rel="noopener">${short(j.engine, 6)} ↗</a>${j.held ? ` · holds <b>${usd(j.held.total)}</b> (${j.held.sol.toFixed(3)} SOL + ${j.held.tokens.length} coins)` : ''}${j.heldError ? ' · ' + esc(j.heldError) : ''}
        <div class="log">${j.log.length ? j.log.slice(0, 10).map(l => `<span>${ago(l.t)} ago · ${esc(l.kind)}${l.sym ? ' $' + esc(l.sym) : ''}${l.data && l.data.usd ? ' · ' + usd(l.data.usd) : ''}${l.data && l.data.sol ? ' · ' + (+l.data.sol).toFixed(4) + ' SOL' : ''}${l.sig ? ` · <a href="https://solscan.io/tx/${l.sig}" target="_blank" rel="noopener">tx ↗</a>` : ''}</span>`).join('') : '<span>no rebalances yet.</span>'}</div>`;
    } catch (e) { $('#bk').innerHTML = '<div class="empty" style="padding:22px">' + esc(e.message) + '</div>' }
  }
  $('#bk').addEventListener('click', e => { const r = e.target.closest('.bkr[data-m]'); if (r) r.classList.toggle('open') });
  $('#miniBasket').addEventListener('click', e => { const r = e.target.closest('.row[data-m]'); if (r) { const x = (S.basket.target || []).find(t => t.mint === r.dataset.m); if (x && !S.map.has(x.mint)) merge({ mint: x.mint, sym: x.sym, icon: x.icon }); select(r.dataset.m) } });
  let bkIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) x.target.classList.add('shown') }), { threshold: .2 }) : null;

  /* numbers roll up the first time they come into view (always to the real value) */
  const seenEl = new WeakSet();
  function countUp(root) {
    $$('[data-to]', root).forEach(el => {
      const to = +el.dataset.to, d = +el.dataset.d || 1;
      const go = () => { if (seenEl.has(el) || reduce) { el.textContent = pct(to, d); return } seenEl.add(el); const t0 = performance.now(); const f = t => { const k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3); el.textContent = pct(to * e, d); if (k < 1) requestAnimationFrame(f) }; requestAnimationFrame(f) };
      if (seenEl.has(el)) return go();
      const ob = new IntersectionObserver(es => { if (es[0].isIntersecting) { ob.disconnect(); go() } }, { threshold: .4 }); ob.observe(el);
    });
  }

  /* ---------- the tape ---------- */
  function renderTape() {
    const top = S.top.slice(0, 24); if (!top.length) return;
    const one = top.map(c => `<span>$${esc(c.sym)} <em>$${fp(px(c))}</em> <em class="${cls(c.ch1h)}">${pct(c.ch1h)}</em></span>`).join('');
    $('#tape').innerHTML = one + one;
  }

  /* ---------- the command line ---------- */
  const out = $('#tout');
  function cliOut(t, c) { const d = document.createElement('div'); if (c) d.className = c; d.textContent = t; out.appendChild(d); while (out.children.length > 60) out.firstChild.remove(); out.scrollTop = out.scrollHeight }
  const HELP = ['commands:',
    '  call <$ticker|mint> long|hedge [15m|1h|4h]   make a call',
    '  long <$ticker> [1h] · hedge <$ticker> [1h]   the same, shorter',
    '  open <$ticker|mint>                          open a coin',
    '  live | trending | gainers | losers | watch   switch the line',
    '  watch [$ticker]                              watch the open coin (or a ticker)',
    '  trades                                       last trades on the open coin',
    '  stream                                       the pump.fun stream',
    '  basket | board | calls                       the basket, the board, your calls',
    '  callsign <name>                              change your callsign',
    '  clear',
    'keys: ↑↓ or j k move · l long · h hedge · 1 2 3 window · c call · w watch · / find · ` here'];
  const findCoin = q => {
    q = String(q || '').replace(/^\$/, '').trim(); if (!q) return null;
    if (q.length > 30) return S.map.get(q) || merge({ mint: q });
    const l = q.toLowerCase(), all = [...filtered(), ...S.map.values()];
    return all.find(c => (c.sym || '').toLowerCase() === l) || null;
  };
  async function run(line) {
    const [cmd, ...a] = line.trim().split(/\s+/); if (!cmd) return;
    cliOut(callsign + '@trench ~ % ' + line, 'c');
    const k = cmd.toLowerCase();
    if (k === 'help' || k === '?') return HELP.forEach(h => cliOut(h));
    if (k === 'clear') { out.innerHTML = ''; return }
    if (['live', 'new', 'top', 'trending', 'gainers', 'losers'].includes(k) || (k === 'watch' && !a[0])) { const s = k === 'top' ? 'trending' : k === 'new' ? 'live' : k; setSort(s); return cliOut('the line: ' + s, 'g') }
    if (k === 'watch') { const c = findCoin(a[0]); if (!c) return cliOut('no coin "' + a[0] + '" on the line', 'e'); const on = toggleWatch(c.mint); return cliOut((on ? 'watching $' : 'stopped watching $') + (c.sym || short(c.mint)), 'g') }
    if (k === 'open') { const c = findCoin(a[0]); if (!c) return cliOut('no coin "' + (a[0] || '') + '" on the line', 'e'); return select(c.mint) }
    if (k === 'call' || k === 'long' || k === 'hedge' || k === 'short') {
      const side = k === 'call' ? (a[1] || '').toLowerCase() : k === 'short' ? 'hedge' : k; const w = (k === 'call' ? a[2] : a[1]) || '1h';
      const c = a[0] ? findCoin(a[0]) : S.map.get(S.sel); if (!c) return cliOut('no coin "' + (a[0] || '') + '" on the line. try: long $' + ((S.top[0] || {}).sym || 'TICKER') + ' 1h', 'e');
      if (!['long', 'hedge'].includes(side)) return cliOut('side is long or hedge', 'e');
      const win = { '15m': 15, '15': 15, '1h': 60, '60': 60, '60m': 60, '4h': 240, '240': 240 }[w.toLowerCase()]; if (!win) return cliOut('window is 15m, 1h or 4h', 'e');
      if (S.sel !== c.mint) select(c.mint, true);
      return makeCall(c.mint, side, win, true);
    }
    if (k === 'trades') { if (!S.trades.length) return cliOut('no trades seen on the open coin yet'); return S.trades.slice(0, 10).forEach(t => cliOut(`${hms(t.t)}  ${t.side.padEnd(4)}  ${(t.sol != null ? solx(t.sol) + ' SOL' : '').padStart(10)}  ${(t.usd ? usd(t.usd) : '').padStart(8)}  ${t.wallet ? short(t.wallet, 4) : ''}`)) }
    if (k === 'stream') { const st = TS && TS.status(); if (!st) return cliOut('the stream script did not load', 'e'); return cliOut('pump stream: ' + st.state + (st.state === 'live' ? ' · ' + st.perMin + ' new coins/min · ' + S.live.length + ' on the live line' : ''), st.state === 'live' ? 'g' : '') }
    if (k === 'basket') { const t = (S.basket && S.basket.target) || []; if (!t.length) return cliOut('no coin passes the gates right now'); return t.forEach((x, i) => cliOut(`${String(i + 1).padStart(2)}  $${x.sym.padEnd(10)} ${(x.weight * 100).toFixed(1).padStart(5)}%   1h ${pct(x.why.ch1h)}   24h ${pct(x.why.ch24h)}`)) }
    if (k === 'board') { if (!S.board.length) return cliOut('nobody on the board yet'); return S.board.slice(0, 10).forEach(r => cliOut(`#${String(r.rank).padEnd(3)} ${r.callsign.padEnd(13)} ${String(r.points).padStart(6)} pts   ${r.won}W ${r.lost}L`)) }
    if (k === 'calls') { setR('calls'); if (!S.mine.length) return cliOut('no calls yet'); return S.mine.slice(0, 10).forEach(c => cliOut(`$${c.sym.padEnd(10)} ${c.side.padEnd(6)} ${String(c.win).padStart(3)}m  entry $${fp(c.entry)}  ${c.result ? c.result + ' ' + c.points + ' pts' : 'settles in ' + mmss(c.endsAt - now())}`)) }
    if (k === 'callsign' || k === 'login') { if (!a[0]) return cliOut('callsign: ' + callsign); setName(a[0]); return cliOut('callsign set: ' + callsign, 'g') }
    if (k === 'whoami') return cliOut(callsign + (WAL ? ' · ' + WAL.wallet : ' · no wallet connected'));
    if (k === 'connect' || k === 'wallet') { if (WAL) return cliOut('connected: ' + WAL.wallet, 'g'); openWallets(); return }
    if (k === 'disconnect') { disconnect(); return cliOut('wallet disconnected') }
    cliOut('unknown command "' + cmd + '". type help', 'e');
  }
  const hist = []; let hi = -1;
  $('#cli').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = e.target.value; e.target.value = ''; if (v.trim()) { hist.unshift(v); hi = -1; run(v) } }
    else if (e.key === 'ArrowUp') { if (hist[hi + 1] != null) { hi++; e.target.value = hist[hi]; e.preventDefault() } }
    else if (e.key === 'ArrowDown') { if (hi > 0) { hi--; e.target.value = hist[hi] } else { hi = -1; e.target.value = '' } }
  });
  cliOut('.trench os · line 7 · type help', 'g');

  /* ---------- keys ---------- */
  function termInView() { if (document.documentElement.classList.contains('intro')) return false; const r = $('#term').getBoundingClientRect(); return r.top < innerHeight * .6 && r.bottom > innerHeight * .4 }
  function move(d) {
    const list = filtered(); if (!list.length) return;
    let i = list.findIndex(c => c.mint === S.sel); i = i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + d));
    select(list[i].mint, true); const el = rows.get(list[i].mint); if (el) el.scrollIntoView({ block: 'nearest' });
  }
  const SORTS = ['live', 'stretch', 'grad', 'trending', 'gainers', 'losers', 'watch'];
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tg = e.target, typing = tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable);
    if (typing) { if (e.key === 'Escape') tg.blur(); return }
    if (!termInView()) return;
    const k = e.key;
    if (k === '/') { e.preventDefault(); $('#q').focus() }
    else if (k === '`') { e.preventDefault(); $('#cli').focus() }
    else if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); move(1) }
    else if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); move(-1) }
    else if (k === 'l') setSide('long');
    else if (k === 'h') setSide('hedge');
    else if (k === '1') setWin(15); else if (k === '2') setWin(60); else if (k === '3') setWin(240);
    else if (k === 'c') { if (!$('#callGo').disabled) makeCall(S.sel, S.side, S.win) }
    else if (k === 'w') toggleWatch(S.sel);
    else if (k === '[' || k === ']') { const i = SORTS.indexOf(S.sort); setSort(SORTS[(i + (k === ']' ? 1 : SORTS.length - 1)) % SORTS.length]) }
  });

  /* ---------- wallet: sign in with any Solana wallet (free, no transaction) ---------- */
  const WALLETS = [
    { id: 'phantom', name: 'Phantom', get: () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom && window.phantom.solana) || (window.solana && window.solana.isPhantom && window.solana) || null, install: 'https://phantom.app/download', open: u => 'https://phantom.app/ul/browse/' + encodeURIComponent(u) + '?ref=' + encodeURIComponent(location.origin) },
    { id: 'solflare', name: 'Solflare', get: () => (window.solflare && window.solflare.isSolflare && window.solflare) || null, install: 'https://solflare.com/download', open: u => 'https://solflare.com/ul/v1/browse/' + encodeURIComponent(u) + '?ref=' + encodeURIComponent(location.origin) },
    { id: 'backpack', name: 'Backpack', get: () => (window.backpack && window.backpack.isBackpack && window.backpack) || null, install: 'https://backpack.app/downloads' },
  ];
  const generic = () => { const p = window.solana; return p && !p.isPhantom && typeof p.connect === 'function' ? p : null };
  const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const wb = $('#walletBtn'), wm = $('#wmenu');
  function paintWallet() {
    wb.classList.toggle('on', !!WAL);
    wb.querySelector('span').textContent = WAL ? WAL.wallet.slice(0, 4) + '…' + WAL.wallet.slice(-4) : 'connect wallet';
    wb.title = WAL ? WAL.wallet : 'sign in with a Solana wallet';
    upCall(); renderMine();
  }
  function closeMenu() { wm.hidden = true; wb.setAttribute('aria-expanded', 'false') }
  function openWallets() {
    if (WAL) { wm.innerHTML = `<div class="wh">connected${WAL.name ? ' · ' + esc(WAL.name) : ''}</div><button type="button" data-w="copy"><span>${esc(short(WAL.wallet, 6))}</span><em>copy</em></button><a href="https://solscan.io/account/${WAL.wallet}" target="_blank" rel="noopener"><span>view on solscan</span><em>↗</em></a><button type="button" data-w="out"><span>disconnect</span></button>` }
    else {
      const rowsW = WALLETS.map(w => { const p = w.get(); if (p) return `<button type="button" data-w="${w.id}"><span>${w.name}</span><em>detected</em></button>`; if (mobile && w.open) return `<a href="${w.open(location.href)}"><span>${w.name}</span><em>open in app</em></a>`; return `<a href="${w.install}" target="_blank" rel="noopener"><span>${w.name}</span><em>install</em></a>` }).join('');
      const g = generic() ? '<button type="button" data-w="generic"><span>browser wallet</span><em>detected</em></button>' : '';
      wm.innerHTML = `<div class="wh">sign in with a wallet</div>${rowsW}${g}<p>signing in is free. it only proves you own the wallet: no transaction, no fees, nothing leaves your wallet.</p>`;
    }
    wm.hidden = false; wb.setAttribute('aria-expanded', 'true');
  }
  wb.addEventListener('click', e => { e.stopPropagation(); if (!wm.hidden) return closeMenu(); openWallets() });
  document.addEventListener('click', e => { if (!wm.hidden && !e.target.closest('#wal')) closeMenu() });
  wm.addEventListener('click', e => {
    const b = e.target.closest('button[data-w]'); if (!b) return; const k = b.dataset.w;
    if (k === 'copy') { navigator.clipboard.writeText(WAL.wallet).then(() => toast('address copied')); return closeMenu() }
    if (k === 'out') { disconnect(); return closeMenu() }
    const w = WALLETS.find(x => x.id === k), p = k === 'generic' ? generic() : w && w.get();
    if (p) signIn(p, w ? w.name : 'wallet');
  });
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s) };
  async function signIn(p, name) {
    closeMenu(); wb.classList.add('busy'); wb.querySelector('span').textContent = 'check your wallet…';
    try {
      const r = await p.connect(); const pkObj = (r && r.publicKey) || p.publicKey; if (!pkObj) throw new Error('the wallet did not share an address');
      const pk = pkObj.toString();
      const msg = '.trench wants you to sign in with your Solana wallet.\n\nwallet: ' + pk + '\nsite: ' + location.host + '\nissued: ' + new Date().toISOString() + '\n\nsigning is free. it only proves you own this wallet: no transaction, no fees.';
      const sr = await p.signMessage(new TextEncoder().encode(msg), 'utf8');
      let sig = sr && (sr.signature || sr); if (sig && sig.data && !sig.length) sig = sig.data;
      sig = new Uint8Array(sig); if (sig.length !== 64) throw new Error('the wallet did not return a signature');
      const j = await api('login', { wallet: pk, msg, sig: b64(sig) });
      WAL = { wallet: j.wallet, token: j.token, uid: j.uid, name }; uid = j.uid;
      try { localStorage.setItem('trench:wallet', JSON.stringify(WAL)) } catch (_) { }
      toast('signed in as ' + short(pk)); cliOut('wallet connected: ' + pk, 'g');
      if (p.on) try { p.on('accountChanged', a => { if (WAL && (!a || a.toString() !== WAL.wallet)) { disconnect(); toast('wallet changed. connect again.') } }) } catch (_) { }
      loadMine(); loadBoard();
    } catch (e) { const m = /reject|denied|cancel|declin/i.test(e && e.message || '') ? 'sign-in cancelled' : (e && e.message) || 'the wallet refused'; toast(m, true); cliOut(m, 'e') }
    finally { wb.classList.remove('busy'); paintWallet() }
  }
  function disconnect() {
    const w = WAL && WALLETS.find(x => x.name === WAL.name), p = w && w.get(); try { p && p.disconnect && p.disconnect() } catch (_) { }
    WAL = null; uid = ''; S.mine = []; try { localStorage.removeItem('trench:wallet') } catch (_) { }
    paintWallet(); drawChart(); toast('wallet disconnected');
  }
  paintWallet();

  /* ---------- info: everything known about the open coin ---------- */
  function flowOf() { let b = 0, s2 = 0, nb = 0, ns = 0; for (const t of S.trades) { const v = t.sol != null ? t.sol : (S.sol && t.usd ? t.usd / S.sol : 0); if (t.side === 'buy') { b += v; nb++ } else { s2 += v; ns++ } } return { b, s: s2, nb, ns } }
  function paintFlow() {
    const f = flowOf(), tot = f.b + f.s, el = $('#flow');
    if (!tot) { el.innerHTML = ''; return }
    const pb = f.b / tot * 100;
    el.innerHTML = `<div class="fl"><span class="up">buys ${f.nb} · ${solx(f.b)} SOL</span><span class="dn">sells ${f.ns} · ${solx(f.s)} SOL</span></div><div class="fb"><i style="width:${pb.toFixed(1)}%"></i></div>`;
  }
  function renderInfo() {
    const c = S.map.get(S.sel), el = $('#info'); if (!c) { el.innerHTML = '<div class="empty">pick a coin.</div>'; return }
    const cv = curveOfC(c), grad = isGrad(c), row = (k, v) => v == null || v === '' ? '' : `<div class="ir"><span>${k}</span><b>${v}</b></div>`;
    const ws = new Map(); for (const t of S.trades) { if (!t.wallet) continue; const v = t.sol != null ? t.sol : (S.sol && t.usd ? t.usd / S.sol : 0); const o = ws.get(t.wallet) || { net: 0, n: 0 }; o.net += t.side === 'buy' ? v : -v; o.n++; ws.set(t.wallet, o) }
    const top = [...ws.entries()].sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net)).slice(0, 6);
    const soc = [['𝕏', c.twitter], ['site', c.website], ['tg', c.telegram]].filter(([, u]) => typeof u === 'string' && /^https:\/\//.test(u));
    el.innerHTML = `<div class="ic"><span>${grad ? 'graduated · trading on PumpSwap' : cv != null ? 'bonding curve' : 'curve'}</span><b>${grad ? '100%' : cv != null ? cv.toFixed(1) + '%' : '—'}</b></div><div class="cvbar"><i style="width:${grad ? 100 : cv || 0}%"></i></div>
      ${row('price', px(c) ? '$' + fp(px(c)) : null)}${row('market cap', mc(c) ? usd(mc(c)) : null)}${row('liquidity', c.liq ? usd(c.liq) : null)}${row('holders', c.holders ? c.holders.toLocaleString() : null)}${row('volume 1h', c.vol1h ? usd(c.vol1h) : null)}${row('buys · sells 1h', c.buys1h || c.sells1h ? c.buys1h + ' · ' + c.sells1h : null)}${row('traders 1h', c.traders1h || null)}${row('organic score', c.organic || null)}${row('age', tms(c) ? '<span data-t="' + tms(c) + '"></span>' : null)}${row('dev buy', c.devSol ? solx(c.devSol) + ' SOL' : null)}
      ${c.dev ? `<div class="ir"><span>dev wallet</span><b><a href="https://solscan.io/account/${c.dev}" target="_blank" rel="noopener">${short(c.dev, 4)} ↗</a></b></div>` : ''}
      <div class="ir"><span>mint</span><b><button type="button" data-copy="${c.mint}">${short(c.mint, 5)} copy</button></b></div>
      ${top.length ? `<div class="ih">biggest wallets in the trades seen</div>${top.map(([w, o]) => `<a class="iw" href="https://solscan.io/account/${w}" target="_blank" rel="noopener"><span>${c.dev === w ? 'dev' : short(w, 4)}</span><em>${o.n} tx</em><b class="${o.net >= 0 ? 'up' : 'dn'}">${o.net >= 0 ? '+' : ''}${solx(o.net)} SOL</b></a>`).join('')}` : ''}
      <div class="il">${soc.map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${k} ↗</a>`).join('')}<a href="https://pump.fun/coin/${c.mint}" target="_blank" rel="noopener">pump.fun ↗</a><a href="https://dexscreener.com/solana/${c.mint}" target="_blank" rel="noopener">dexscreener ↗</a><a href="https://solscan.io/token/${c.mint}" target="_blank" rel="noopener">solscan ↗</a></div>`;
    tickAges();
  }
  const dirtyInfo = throttle(() => { paintFlow(); if ($('.rp[data-r="info"]').classList.contains('on')) renderInfo() }, 900);
  setInterval(dirtyInfo, 3000);

  /* ---------- the podium ---------- */
  function renderPodium(b) {
    const el = $('#podium'); if (!el) return;
    const slot = (r, n) => r ? `<div class="pod p${n}"><div class="who">${esc(r.callsign)}<small>#${esc(r.tag)} · ${r.won}W ${r.lost}L</small></div><div class="blk"><b data-pts="${r.points}">${r.points}</b><span>#${n} · pts</span></div></div>`
      : `<div class="pod p${n} open"><div class="who">open<small>${n === 1 ? 'make the first call' : 'take the spot'}</small></div><div class="blk"><b>#${n}</b><span>nobody yet</span></div></div>`;
    el.innerHTML = slot(b[1], 2) + slot(b[0], 1) + slot(b[2], 3);
  }
  renderPodium([]);

  /* ---------- the basket as a map: tile size = weight, colour = the last hour ---------- */
  function squarify(items, x, y, w, h) {
    const out = []; let rest = items.slice();
    while (rest.length) {
      const sh = Math.min(w, h); let row = [], best = Infinity;
      for (const it of rest) { const r2 = row.concat(it), sum = r2.reduce((a, b) => a + b.v, 0), mx = Math.max(...r2.map(r => r.v)), mn = Math.min(...r2.map(r => r.v)); const worst = Math.max(sh * sh * mx / (sum * sum), sum * sum / (sh * sh * mn)); if (worst <= best) { row = r2; best = worst } else break }
      const sum = row.reduce((a, b) => a + b.v, 0);
      if (w >= h) { const cw = sum / h; let yy = y; for (const it of row) { const ch = it.v / cw; out.push({ ...it, x, y: yy, w: cw, h: ch }); yy += ch } x += cw; w -= cw }
      else { const ch = sum / w; let xx = x; for (const it of row) { const cw2 = it.v / ch; out.push({ ...it, x: xx, y, w: cw2, h: ch }); xx += cw2 } y += ch; h -= ch }
      rest = rest.slice(row.length);
    }
    return out;
  }
  let tmapData = [];
  function renderTmap(t) {
    const el = $('#tmap'); if (!el) return; if (t) tmapData = t;
    if (!tmapData.length) { el.innerHTML = '<div class="empty">no coin passes the gates right now. the basket waits in SOL.</div>'; return }
    const r = el.getBoundingClientRect(), W = 100 * (r.width / Math.max(1, r.height) || 1.6), H = 100;
    const tot = tmapData.reduce((a, b) => a + b.weight, 0) || 1;
    const tiles = squarify(tmapData.slice().sort((a, b) => b.weight - a.weight).map(x => ({ ...x, v: x.weight / tot * W * H })), 0, 0, W, H);
    el.innerHTML = tiles.map((x, i) => {
      const ch = x.why.ch1h, k = Math.min(1, Math.abs(ch) / 25), bg = ch >= 0 ? `rgba(95,224,138,${(.08 + .32 * k).toFixed(3)})` : `rgba(255,107,94,${(.08 + .3 * k).toFixed(3)})`;
      const small = x.w / W * r.width < 120 || x.h / H * r.height < 80;
      return `<button type="button" class="tile${small ? ' sm' : ''}" data-m="${x.mint}" style="left:${(x.x / W * 100).toFixed(3)}%;top:${(x.y / H * 100).toFixed(3)}%;width:${(x.w / W * 100).toFixed(3)}%;height:${(x.h / H * 100).toFixed(3)}%;background:${bg};animation:pop .6s var(--e) ${(i * .06).toFixed(2)}s both"><span class="tt">${av(x)}<b>$${esc(x.sym)}</b></span><span><span class="tw">${(x.weight * 100).toFixed(1)}%</span><br><span class="tc ${cls(ch)}">${pct(ch)} 1h · ${pct(x.why.ch24h)} 24h</span></span><span class="tx">mcap ${usd(x.why.mcap)} · vol 1h ${usd(x.why.vol1h)} · ${x.why.holders.toLocaleString()} holders · open in the terminal ›</span></button>`;
    }).join('');
  }
  $('#tmap').addEventListener('click', e => { const b = e.target.closest('.tile'); if (!b) return; const x = tmapData.find(t => t.mint === b.dataset.m); if (x && !S.map.has(x.mint)) merge({ mint: x.mint, sym: x.sym, icon: x.icon }); select(b.dataset.m); scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }) });
  new ResizeObserver(() => renderTmap()).observe($('#tmap'));

  /* ---------- try the scoring ---------- */
  const calc = { side: 'long', move: 6 };
  function scoreOf(side, movePct) { const m = movePct / 100; if (Math.abs(m) < .002) return ['push', 0]; const good = side === 'long' ? m > 0 : m < 0; return good ? ['won', 100 + Math.min(400, Math.round(Math.abs(m) * 1000))] : ['lost', -50] }
  function paintCalc() {
    const [res, pts] = scoreOf(calc.side, calc.move), m = calc.move;
    $('#cMoveV').textContent = pct(m, 1); $('#cMove').value = Math.max(-30, Math.min(30, m));
    const box = $('.cres'); box.className = 'cres ' + res; $('#cRes').textContent = res; $('#cPts').textContent = (pts > 0 ? '+' : '') + pts + ' pts';
    // a little price path from the entry to the close
    const W = 420, H = 160, y0 = H * .55, span = Math.max(12, Math.abs(m)) * 1.25, yOf = v => y0 - v / span * (H * .42);
    let seed = Math.round(Math.abs(m) * 10) + (calc.side === 'long' ? 1 : 7); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts2 = []; for (let i = 0; i <= 40; i++) { const k = i / 40, v = m * (k * k * (3 - 2 * k)) + (i && i < 40 ? (rnd() - .5) * span * .18 : 0); pts2.push([20 + k * (W - 60), yOf(v)]) }
    const col = res === 'won' ? '#5fe08a' : res === 'lost' ? '#ff6b5e' : '#93b39c';
    $('#cChart').innerHTML = `<line x1="0" x2="${W}" y1="${y0}" y2="${y0}" stroke="rgba(238,243,226,.25)" stroke-dasharray="4 5"/><text x="6" y="${y0 - 6}" fill="rgba(147,179,156,.8)" font-size="11" font-family="JB,monospace">entry</text>
      <path d="M${pts2.map(p => p.map(n => n.toFixed(1)).join(' ')).join(' L')}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>
      <circle cx="${pts2[40][0].toFixed(1)}" cy="${pts2[40][1].toFixed(1)}" r="5" fill="${col}"><animate attributeName="r" values="4;8;4" dur="1.6s" repeatCount="indefinite"/></circle>
      <text x="${(pts2[40][0] - 8).toFixed(1)}" y="${(pts2[40][1] + (m >= 0 ? -12 : 20)).toFixed(1)}" fill="${col}" font-size="12" text-anchor="end" font-family="JB,monospace">close ${pct(m, 1)}</text>`;
  }
  $('#cSide').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; calc.side = b.dataset.side; $$('#cSide button').forEach(x => x.classList.toggle('on', x === b)); $('#cSide').classList.toggle('hedge', calc.side === 'hedge'); segInd($('#cSide')); paintCalc() });
  $('#cMove').addEventListener('input', e => { calc.move = +e.target.value; paintCalc() });
  $$('.cpre button').forEach(b => b.addEventListener('click', () => { calc.move = +b.dataset.m; paintCalc() }));
  paintCalc();

  /* ---------- how it works: the money and the calls, moving ---------- */
  (function pipe() {
    const svg = $('#pipeSvg'); if (!svg) return;
    const N = [[90, 70, 'pump.fun', 'v0'], [330, 70, '$TRENCH trades', 'every buy and sell'], [570, 70, 'creator fees', 'claimed hourly'], [810, 70, 'the engine', 'public wallet'], [1080, 70, 'the basket', 'v4'], [330, 190, 'you', 'a callsign'], [600, 190, 'calls', 'long or hedge'], [870, 190, 'the board', 'v7']];
    const L = [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7]];
    const STEP = { 0: [0, 1, 1, 2], 1: [2, 3, 3, 4], 2: [4, 4, 3, 4], 3: [5, 6, 6, 7] };
    const nd = ([x, y, t, sub], i) => `<g class="nd" data-i="${i}" transform="translate(${x},${y})"><rect x="-95" y="-30" width="190" height="60" rx="12"/><text text-anchor="middle" y="-3">${esc(t)}</text><text class="${/^v\d$/.test(sub) ? 'v' : 's'}" text-anchor="middle" y="16" id="pv${i}">${/^v\d$/.test(sub) ? '…' : esc(sub)}</text></g>`;
    const path = ([a, b], i) => { const A = N[a], B = N[b]; return `<path class="pl" id="pl${i}" data-a="${a}" data-b="${b}" d="M${A[0] + 95} ${A[1]} C ${(A[0] + B[0]) / 2} ${A[1]}, ${(A[0] + B[0]) / 2} ${B[1]}, ${B[0] - 95} ${B[1]}"/>` };
    const loop = `<path class="pl" id="plL" d="M1150 50 C 1220 -10, 940 -10, 1010 50"/>`, link = `<path class="pl dash" id="plK" d="M600 160 C 600 120, 160 140, 110 100"/>`;
    svg.innerHTML = L.map(path).join('') + loop + link + N.map(nd).join('') + `<text class="lane" x="20" y="22">THE MONEY</text><text class="lane" x="20" y="242">THE CALLS</text><g id="pdots"></g>`;
    const paths = [...L.map((_, i) => $('#pl' + i, svg)), $('#plL', svg), $('#plK', svg)], dots = [];
    paths.forEach((p, pi) => { const len = p.getTotalLength(), k = Math.max(2, Math.round(len / 60)); for (let j = 0; j < k; j++) { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', pi === 7 ? 2 : 3); c.setAttribute('class', 'pd'); $('#pdots', svg).appendChild(c); dots.push({ c, p, len, off: j / k, pi }) } });
    let hot = -1;
    $$('#how .steps li').forEach((li, i) => { li.addEventListener('mouseenter', () => setHot(i)); li.addEventListener('mouseleave', () => setHot(-1)); li.addEventListener('click', () => setHot(hot === i ? -1 : i)) });
    function setHot(i) { hot = i; const on = i >= 0 ? STEP[i] : []; $$('.nd', svg).forEach(n => n.classList.toggle('hot', on.includes(+n.dataset.i))); paths.forEach((p, pi) => p.classList.toggle('hot', i >= 0 && ((pi < 6 && on.includes(+p.dataset.a) && on.includes(+p.dataset.b)) || (pi === 6 && i === 2) || (pi === 7 && i === 3)))) }
    let t0 = performance.now(), vis = false;
    new IntersectionObserver(es => { vis = es[0].isIntersecting }).observe(svg);
    (function loopF(now2) {
      requestAnimationFrame(loopF); if (!vis || document.hidden) return;
      const t = (now2 - t0) / 1000;
      for (const d of dots) { const fast = d.p.classList.contains('hot') ? 2.4 : 1, u = ((d.off + t * .12 * fast * (300 / d.len)) % 1 + 1) % 1, pt = d.p.getPointAtLength(u * d.len); d.c.setAttribute('cx', pt.x.toFixed(1)); d.c.setAttribute('cy', pt.y.toFixed(1)); d.c.setAttribute('opacity', (Math.sin(u * Math.PI) * (fast > 1 ? 1 : .7)).toFixed(2)) }
    })(t0);
    // live numbers on the nodes
    setInterval(() => {
      const st = TS && TS.status(); const v = (i, txt) => { const e = $('#pv' + i, svg); if (e) e.textContent = txt };
      v(0, st && st.state === 'live' ? st.perMin + ' new coins / min' : 'live coins');
      v(4, S.basket ? (S.basket.target.length ? S.basket.target.length + ' coins · rebalanced hourly' : 'waiting in SOL') : 'reading…');
      v(7, S.board.length ? S.board.length + ' on the board' : 'open for #1');
    }, 2000);
  })();

  /* ---------- clock ---------- */
  setInterval(() => { $('#tClk').textContent = new Date().toTimeString().slice(0, 8) }, 1000);

  /* ---------- scroll: reveals, split headings, nav, progress, trench maps ---------- */
  $$('.split').forEach(el => { const w = el.textContent.trim().split(/\s+/); let k = 0; el.innerHTML = w.map((x, i) => '<span class="w">' + Array.from(x).map(ch => '<span class="c" style="transition-delay:' + (k++ * 26) + 'ms">' + esc(ch) + '</span>').join('') + '</span>' + (i < w.length - 1 ? '<span class="sp"> </span>' : '')).join('') });
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target) } }), { rootMargin: '0px 0px -8% 0px', threshold: .1 }) : null;
  $$('.rv, .split').forEach(e => reduce || !io ? e.classList.add('shown') : io.observe(e));
  $$('.q button').forEach(b => b.addEventListener('click', () => { const q = b.parentElement, op = !q.classList.contains('open'); $$('.q.open').forEach(o => o.classList.remove('open')); if (op) q.classList.add('open'); b.setAttribute('aria-expanded', op) }));
  function trenchPath(w, y0, amp, bay, seed) {
    let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let x = 0, y = y0, d = 'M0 ' + y0;
    while (x < w) { const up = r() < .5 ? -1 : 1, t = bay * (.6 + r() * .8); d += ` L${(x + t * .4).toFixed(1)} ${y.toFixed(1)} L${(x + t * .4).toFixed(1)} ${(y + up * amp).toFixed(1)} L${(x + t * .7).toFixed(1)} ${(y + up * amp).toFixed(1)} L${(x + t * .7).toFixed(1)} ${y.toFixed(1)}`; x += t; d += ` L${x.toFixed(1)} ${y.toFixed(1)}`; y = Math.max(y0 - 26, Math.min(y0 + 26, y + (r() - .5) * 12)) }
    return d;
  }
  function fillMap(svg, w, rws, seed) { if (!svg) return []; svg.innerHTML = rws.map((y, i) => `<path d="${trenchPath(w, y, 14, 44, seed + i * 31)}"/>`).join('') + [180, 460, 720, 980].map(x => `<path class="c" d="M${x} ${rws[0]} L${x + 30} ${(rws[0] + rws[rws.length - 1]) / 2} L${x - 10} ${rws[rws.length - 1]}"/>`).join(''); return $$('path', svg).map(p => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; return [p, L] }) }
  const maps = [[$('#howMap'), fillMap($('#howMap'), 1200, [90, 260, 430], 7)], [$('#oMap'), fillMap($('#oMap'), 1200, [70, 150, 230], 99)]];
  const navA = $$('.pill a'), ind = $('#navInd'); let curNav = null;
  function onScroll() {
    const sy = scrollY, vh = innerHeight, max = document.documentElement.scrollHeight - vh;
    $('#prog').style.transform = 'scaleX(' + Math.min(1, sy / Math.max(1, max)).toFixed(4) + ')';
    let cur = null; for (const a of navA) { const t = document.getElementById(a.getAttribute('href').slice(1)); if (t && t.getBoundingClientRect().top < vh * .4) cur = a }
    if (cur !== curNav) { curNav = cur; navA.forEach(a => a.classList.toggle('on', a === cur)); if (cur) { ind.style.opacity = 1; ind.style.left = cur.offsetLeft + 'px'; ind.style.width = cur.offsetWidth + 'px' } else ind.style.opacity = 0 }
    const how = $('#how'), fl = $('#flare');
    if (how && fl) { const r = how.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (vh * .85 - r.top) / (r.height))); fl.style.setProperty('--fy', ((1 - p) * 100).toFixed(2) + '%'); fl.style.setProperty('--fx', (12 + p * 76).toFixed(2) + '%'); fl.style.setProperty('--fo', (p > 0 && p < 1 ? Math.min(1, p * 6, (1 - p) * 6) : 0).toFixed(2)); $$('.steps li').forEach((li, i) => li.classList.toggle('lit', p > .18 + i * .17)) }
    for (const [svg, paths] of maps) { if (!svg) continue; const r = svg.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height * .6))); paths.forEach(([el, L], i) => el.style.strokeDashoffset = (L * (1 - Math.min(1, p * (1.2 + i * .1)))).toFixed(1)) }
  }
  addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true }); addEventListener('resize', onScroll); onScroll();
  document.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (!a) return; const t = document.getElementById(a.getAttribute('href').slice(1)); if (!t) return; e.preventDefault(); scrollTo({ top: a.getAttribute('href') === '#top' || a.getAttribute('href') === '#line' ? 0 : t.getBoundingClientRect().top + scrollY - 64, behavior: reduce ? 'auto' : 'smooth' }) });

  /* ---------- background: drifting flares and dust ---------- */
  const bg = $('#bgfx'), bx = bg.getContext('2d'); let parts = [];
  function bgSize() { const d = Math.min(2, devicePixelRatio || 1); bg.width = innerWidth * d; bg.height = innerHeight * d; bx.setTransform(d, 0, 0, d, 0, 0); parts = Array.from({ length: Math.min(70, innerWidth * innerHeight / 22000 | 0) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, z: .3 + Math.random() * .7, v: .1 + Math.random() * .3, f: Math.random() < .06 })) }
  bgSize(); addEventListener('resize', bgSize);
  function bgLoop(t) {
    requestAnimationFrame(bgLoop); if (document.hidden || reduce) return;
    bx.clearRect(0, 0, innerWidth, innerHeight); const sy = scrollY;
    for (const p of parts) {
      p.y -= p.v * p.z * (p.f ? .4 : 1); if (p.y < -40) { p.y = innerHeight + 40; p.x = Math.random() * innerWidth }
      const y = ((p.y - sy * .08 * p.z) % (innerHeight + 80) + innerHeight + 80) % (innerHeight + 80) - 40;
      if (p.f) { const a = .12 + .08 * Math.sin(t / 700 + p.x); const g = bx.createRadialGradient(p.x, y, 0, p.x, y, 60 * p.z); g.addColorStop(0, 'rgba(95,224,138,' + a + ')'); g.addColorStop(1, 'rgba(95,224,138,0)'); bx.fillStyle = g; bx.fillRect(p.x - 60, y - 60, 120, 120) }
      else { bx.fillStyle = 'rgba(182,255,200,' + (.08 + .22 * p.z).toFixed(3) + ')'; bx.fillRect(p.x | 0, y | 0, p.z > .8 ? 2 : 1, p.z > .8 ? 2 : 1) }
    }
  }
  requestAnimationFrame(bgLoop);

  /* ---------- housekeeping: forget coins nobody is looking at ---------- */
  setInterval(() => {
    const keep = new Set([S.sel, ...S.live, ...stretch().map(c => c.mint), ...grads().map(c => c.mint), ...S.list.map(c => c.mint), ...S.top.map(c => c.mint), ...W.map(w => w.mint), ...S.mine.map(c => c.mint)]);
    for (const m of S.map.keys()) if (!keep.has(m)) S.map.delete(m);
  }, 300000);

  /* ---------- go ---------- */
  paintStream(); paintSol();
  loadTop(); loadFresh(); loadMine(); loadBoard(); loadBasket(); loadFeed();
  setInterval(() => { if (!document.hidden) loadTop() }, 20000);
  setInterval(() => { if (document.hidden) return; const live = TS && TS.status().state === 'live'; if (now() - freshAt > (live ? 30000 : 10000)) loadFresh() }, 2000);
  setInterval(() => { if (!document.hidden) enrichMany([...S.live.slice(0, 30), ...(S.sort === 'watch' ? W.map(w => w.mint) : [])]) }, 15000);
  setTimeout(() => enrichMany(S.live.slice(0, 30)), 4000);
  setInterval(() => { if (!document.hidden) { loadBoard(); loadFeed() } }, 30000);
  setInterval(() => { if (!document.hidden) loadMine() }, 20000);
  setInterval(() => { if (!document.hidden) loadBasket() }, 60000);
  addEventListener('trench:introdone', () => { setTimeout(() => { drawChart(); $$('.seg').forEach(segInd) }, 300); if (matchMedia('(pointer: fine)').matches) $('#cli').focus({ preventScroll: true }) });
})();
