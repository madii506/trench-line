/* .trench · the live pump.fun stream (PumpPortal's public data websocket, straight from the chain).
   new launches, trades on the coins you watch, migrations. reconnects on its own. */
(function () {
  'use strict';
  const URL = 'wss://pumpportal.fun/api/data';
  const L = {}; const on = (ev, fn) => { (L[ev] = L[ev] || []).push(fn) }; const emit = (ev, d) => (L[ev] || []).forEach(f => { try { f(d) } catch (e) { console.error(e) } });
  let ws = null, backoff = 1000, want = new Set(), subbed = new Set(), state = 'connecting', t0 = Date.now(), creates = [], timer = 0, alive = 0;
  function setState(s) { if (s !== state) { state = s; emit('status', status()) } }
  function status() { const now = Date.now(); creates = creates.filter(t => now - t < 60000); return { state, perMin: creates.length, since: t0 } }
  function send(o) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)) } catch (_) { } }
  function syncSubs() {
    const add = [...want].filter(m => !subbed.has(m)), drop = [...subbed].filter(m => !want.has(m));
    if (drop.length) { send({ method: 'unsubscribeTokenTrade', keys: drop }); drop.forEach(m => subbed.delete(m)) }
    if (add.length) { send({ method: 'subscribeTokenTrade', keys: add }); add.forEach(m => subbed.add(m)) }
  }
  function connect() {
    clearTimeout(timer); setState('connecting');
    try { ws = new WebSocket(URL) } catch (_) { return retry() }
    ws.onopen = () => { backoff = 1000; subbed.clear(); send({ method: 'subscribeNewToken' }); send({ method: 'subscribeMigration' }); syncSubs(); setState('live'); alive = Date.now() };
    ws.onmessage = ev => {
      alive = Date.now();
      let d; try { d = JSON.parse(ev.data) } catch (_) { return }
      if (!d || !d.mint) return;
      const tx = d.txType;
      if (tx === 'create') { creates.push(Date.now()); emit('create', d); emit('status', status()) }
      else if (tx === 'buy' || tx === 'sell') emit('trade', d);
      else if (tx === 'migrate' || d.pool === 'pump-amm' && !tx) emit('migrate', d);
    };
    ws.onclose = () => { setState('down'); retry() };
    ws.onerror = () => { try { ws.close() } catch (_) { } };
  }
  function retry() { clearTimeout(timer); timer = setTimeout(connect, backoff); backoff = Math.min(15000, backoff * 1.8) }
  // a quiet socket for 45 s is a dead socket
  setInterval(() => { if (state === 'live' && Date.now() - alive > 45000) { try { ws.close() } catch (_) { } } emit('status', status()) }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!ws || ws.readyState > 1)) connect() });
  window.TS = {
    on, status,
    watch(mints) { want = new Set(mints.filter(Boolean).slice(0, 40)); syncSubs() },
  };
  connect();
})();
