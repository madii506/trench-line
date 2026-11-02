// Shared helpers for /api handlers.
function site(req) {
  if (process.env.TRENCH_SITE) return process.env.TRENCH_SITE.replace(/\/$/, '');
  const h = (req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'localhost:8787';
  const proto = (req && req.headers && req.headers['x-forwarded-proto']) || (/^localhost|^127\./.test(h) ? 'http' : 'https');
  return proto + '://' + h;
}

function wrap(fn, { cache } = {}) {
  return async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    res.setHeader('cache-control', cache || 'no-store');
    try {
      if (req.body && typeof req.body === 'string') { try { req.body = JSON.parse(req.body) } catch (_) { } }
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.status(200).json(out);
    } catch (e) {
      const code = e.status || 500;
      if (!res.headersSent) { res.setHeader('cache-control', 'no-store'); res.status(code).json({ error: e.expose || code < 500 ? e.message : 'server error', detail: code >= 500 ? String(e.message || e).slice(0, 300) : undefined, sigs: e.sigs, logs: e.logs ? e.logs.slice(-8) : undefined }) }
      if (code >= 500) console.error(e);
    }
  };
}

function fail(status, message) { const e = new Error(message); e.status = status; e.expose = true; return e }

async function fetchT(url, opts = {}, ms = 9000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal, headers: { 'user-agent': 'trench/1.0', accept: 'application/json', ...(opts.headers || {}) } }) }
  finally { clearTimeout(t) }
}
async function getJSON(url, opts, ms) {
  const r = await fetchT(url, opts, ms);
  if (!r.ok) throw new Error(url.split('?')[0] + ' ' + r.status);
  return r.json();
}

module.exports = { site, wrap, fail, fetchT, getJSON };
