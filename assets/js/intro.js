/* trench intro: night on the front. from the gate you look down on a zigzag trench while flares, searchlights and tracers work the dark.
   enter, and you drop into the trench and walk it: duckboards, sandbags, lanterns, shells bursting over the parapet and dirt raining in.
   at the end of the trench a PC stands under a tin roof. you log in on its CRT and get thrown through the screen into the terminal.
   once per session. the sound (score.js) is effects only: rain, artillery, blasts, boots. it starts only after enter with sound on. */
const root = document.documentElement;
const box = document.getElementById('intro');
const $ = s => document.querySelector(s);
const SND = () => window.TRS || null;
let ended = false, cleanup = null, entered = false, goFn = null, capT = 0;

function setUser(n) {
  n = String(n || 'anon').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 12) || 'anon';
  try { localStorage.setItem('trench:callsign', n); } catch (_) { }
  window.dispatchEvent(new CustomEvent('trench:callsign', { detail: n }));
  return n;
}
function finish(fast) {
  if (ended) return; ended = true; clearTimeout(capT);
  try { sessionStorage.setItem('trench:intro', '1'); } catch (_) { }
  const s = SND(); if (s && s.started) s.stop(fast ? .8 : 2.6);
  const done = () => { root.classList.remove('intro'); box.classList.remove('out', 'flash-on', 'cine'); box.hidden = true; window.dispatchEvent(new Event('trench:introdone')); setTimeout(() => root.classList.remove('thrown'), 1200); };
  if (fast) { cleanup && cleanup(); return done(); }
  box.classList.add('flash-on');
  setTimeout(() => { cleanup && cleanup(); root.classList.add('thrown'); box.classList.add('out'); setTimeout(done, 560); }, 140);
}
window.__trenchSkip = () => finish(true);

/* ---------- the gate ---------- */
let soundOn = false;
function paintSnd() { const b = $('#introSnd'); if (!b) return; b.classList.toggle('on', soundOn); b.setAttribute('aria-pressed', soundOn); b.querySelector('span').textContent = soundOn ? 'sound on' : 'sound off'; }
function enter() {
  if (entered || ended) return; entered = true;
  const g = $('#introGate'); if (g) g.classList.add('gone');
  const s = SND(); if (soundOn && s) s.start();
  const t0 = Date.now();
  const cap = () => { if (ended) return; const h = window.__trenchHold || 0; if (Date.now() - h < 3000 && Date.now() - t0 < 55000) { capT = setTimeout(cap, 1500); return; } finish(false); };
  capT = setTimeout(cap, 40000);
  if (goFn) goFn();
}

if (!root.classList.contains('intro') || !box) { /* nothing to play */ }
else if (document.hidden) finish(true);
else {
  const s = SND(); soundOn = !!(s && s.ok && s.pref !== 'off'); paintSnd();
  const sb = $('#introSnd'); if (sb) { if (!s || !s.ok) sb.hidden = true; sb.addEventListener('click', e => { e.stopPropagation(); soundOn = !soundOn; paintSnd(); const a = SND(); if (a && a.started) a.set(soundOn); else if (a) a.pref = soundOn ? 'on' : 'off'; }); }
  const go = $('#introGo'); if (go) { go.addEventListener('click', e => { e.stopPropagation(); enter(); }); setTimeout(() => { try { go.focus({ preventScroll: true }); } catch (_) { } }, 300); }
  const sk = $('#introSkip'); if (sk) sk.addEventListener('click', e => { e.stopPropagation(); finish(true); });
  start().catch(e => { try { console.warn('intro:', e && e.message); } catch (_) { } finish(true); });
}

async function start() {
  const THREE = await import('/assets/vendor/three.module.min.js');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }); } catch (e) { return finish(true); }
  const LOW = innerWidth < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  let DPR = Math.min(LOW ? 1.25 : 1.5, devicePixelRatio || 1);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x050b07);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  box.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c1c12, 0.032);
  const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.03, 400);
  const rnd = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------- sky: slow clouds, artillery glow on the horizon, lightning ----------
  const skyU = { top: { value: new THREE.Color(0x010403) }, hor: { value: new THREE.Color(0x0c1c12) }, glow: { value: 0 }, bd: { value: V3(0, 0, -1) }, lit: { value: 0 }, time: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform vec3 top, hor, bd; uniform float glow, lit, time; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){ vec3 d = normalize(vP); float y = max(d.y, 0.);
        vec3 c = mix(hor, top, pow(y, .42));
        vec2 q = d.xz / (d.y + .22) * 2.2 + vec2(time * .012, time * .004);
        float cl = n(q) * .55 + n(q * 2.3) * .3 + n(q * 5.1) * .15;
        c += vec3(.05, .07, .055) * smoothstep(.42, .78, cl) * (1. - y * .6) * smoothstep(.0, .2, y);
        c += vec3(1., .72, .42) * pow(max(dot(d, bd), 0.), 30.) * glow * .55 * (1. - y);
        c += vec3(.62, .8, .7) * lit * (.25 + cl * .9) * .7;
        gl_FragColor = vec4(c, 1.); }`,
  }));
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0x5f8068, 0x2a2214, 1.25); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb4d0bd, 1.0); moon.position.set(-18, 30, -40); scene.add(moon);

  // ---------- the trench: a zigzag line you walk, ending in a bay where the PC stands ----------
  const WP = [[0, 31], [0, 17], [-3, 13.5], [-3, 6], [.6, 2.5], [.6, -5], [-2.4, -8.5], [-2.4, -12.6]];
  const BAY = { x0: -4.6, x1: -.2, z0: -15.7, z1: -12.1 }, FLOOR = -1.9;
  const segs = []; let SL = 0;
  for (let i = 0; i < WP.length - 1; i++) { const [ax, az] = WP[i], [bx, bz] = WP[i + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz); segs.push({ ax, az, bx, bz, dx: dx / len, dz: dz / len, len, s0: SL }); SL += len; }
  function near(x, z) { let best = 1e9, bs = null, bu = 0; for (const g of segs) { let u = (x - g.ax) * g.dx + (z - g.az) * g.dz; u = Math.max(0, Math.min(g.len, u)); const px = g.ax + g.dx * u - x, pz = g.az + g.dz * u - z, d = px * px + pz * pz; if (d < best) { best = d; bs = g; bu = u; } } return { d: Math.sqrt(best), g: bs, u: bu }; }
  const inBay = (x, z) => x > BAY.x0 && x < BAY.x1 && z > BAY.z0 && z < BAY.z1;
  const craters = []; for (let i = 0; i < 60; i++) { const x = (rnd() - .5) * 90, z = 30 - rnd() * 80; if (near(x, z).d > 5) craters.push([x, z, 1.2 + rnd() * 3]); }
  function ground(x, z) {
    let y = Math.sin(x * .21) * .35 + Math.cos(z * .17 + x * .05) * .3 + Math.sin(x * .9 + z * .7) * .08;
    for (const [cx, cz, r] of craters) { const d = Math.hypot(x - cx, z - cz) / r; if (d < 1.35) y += d < 1 ? -(1 - d * d) * r * .32 : (1.35 - d) * .5; }
    return y;
  }
  function height(x, z) {
    const y = ground(x, z), d = near(x, z).d;
    if (d < 1.0 || inBay(x, z)) return FLOOR;
    const bayD = Math.max(BAY.x0 - x, x - BAY.x1, BAY.z0 - z, z - BAY.z1); const dd = Math.min(d - 1.0, bayD > 0 ? bayD : 99);
    if (dd < .55) return FLOOR + dd / .55 * (y + .6 - FLOOR);
    if (dd < 2.4) return y + .6 * (1 - Math.pow((dd - .55) / 1.85, 1.4));
    return y;
  }
  const cMud = new THREE.Color(0x4a4130), cDark = new THREE.Color(0x221e16), cWet = new THREE.Color(0x2c3a2b);
  function landMesh(w, d, sx, sz, cx, cz, hollow) {
    const G = new THREE.PlaneGeometry(w, d, sx, sz); G.rotateX(-Math.PI / 2);
    const pos = G.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, z = pos.getZ(i) + cz; pos.setX(i, x); pos.setZ(i, z);
      let y = height(x, z); if (hollow && hollow(x, z)) y = -7; pos.setY(i, y);
      const c = cMud.clone().lerp(cDark, Math.min(1, Math.max(0, -y * .55))).lerp(cWet, rnd() * .25); col.push(c.r, c.g, c.b);
    }
    G.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); G.computeVertexNormals();
    const m = new THREE.Mesh(G, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); scene.add(m); return m;
  }
  const FINE = { x0: -24, x1: 22, z0: -22, z1: 34 };
  landMesh(FINE.x1 - FINE.x0, FINE.z1 - FINE.z0, LOW ? 138 : 184, LOW ? 168 : 224, (FINE.x0 + FINE.x1) / 2, (FINE.z0 + FINE.z1) / 2);
  landMesh(200, 200, 110, 110, -1, 0, (x, z) => x > FINE.x0 + 1.9 && x < FINE.x1 - 1.9 && z > FINE.z0 + 1.9 && z < FINE.z1 - 1.9);
  // puddles in the craters catch the flares
  const pud = new THREE.MeshPhongMaterial({ color: 0x0a1610, specular: 0x9dffb0, shininess: 90, transparent: true, opacity: .92 });
  craters.slice(0, 16).forEach(([cx, cz, r]) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r * .45, 20), pud); m.rotation.x = -Math.PI / 2; m.position.set(cx, height(cx, cz) + .05, cz); scene.add(m); });

  // planks, posts, sandbags and duckboards along every leg of the trench
  const plankTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { const v = 50 + (rnd() * 26 | 0); x.fillStyle = `rgb(${v + 18},${v + 4},${v - 12})`; x.fillRect(0, i * 32, 256, 32); x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, i * 32, 256, 2);
      for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(0,0,0,${(rnd() * .14).toFixed(3)})`; x.fillRect(rnd() * 256, i * 32 + 2 + rnd() * 28, 30 + rnd() * 90, 1); }
      x.fillStyle = 'rgba(20,14,8,.9)'; for (const nx of [10, 128, 246]) x.fillRect(nx, i * 32 + 14, 3, 3); }
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(25,20,10,.45)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const plankM = (rx, ry) => { const m = new THREE.MeshLambertMaterial({ map: plankTex.clone(), color: 0xb5a389 }); m.map.repeat.set(rx, ry); m.map.needsUpdate = true; return m; };
  const wood = new THREE.MeshLambertMaterial({ color: 0x4f3d2c, flatShading: true });
  const helm = new THREE.MeshLambertMaterial({ color: 0x4a4d33, flatShading: true });
  const bagGeo = new THREE.BoxGeometry(.6, .25, .34), bagMat = new THREE.MeshLambertMaterial({ color: 0x6e6548, flatShading: true });
  const dm = new THREE.Object3D(), bags = [], posts = [], slats = [];
  const add = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); scene.add(m); return m; };
  for (const g of segs) {
    const ang = Math.atan2(g.dx, g.dz), nx = g.dz, nz = -g.dx; // normal to the leg
    for (const side of [-1, 1]) {
      const mx = (g.ax + g.bx) / 2 + nx * side * 1.03, mz = (g.az + g.bz) / 2 + nz * side * 1.03;
      add(new THREE.BoxGeometry(.06, 1.75, g.len + .5), plankM((g.len + .5) / 2.2, .9), mx, FLOOR + .87, mz, 0, ang, 0);
      for (let u = .3; u < g.len; u += 1.6) posts.push([g.ax + g.dx * u + nx * side * .98, g.az + g.dz * u + nz * side * .98, ang]);
      for (let u = 0; u < g.len; u += .58) { const x = g.ax + g.dx * u + nx * side * 1.32, z = g.az + g.dz * u + nz * side * 1.32, top = Math.max(height(x + nx * side * .4, z + nz * side * .4), -.2); for (let r = 0; r < 2; r++) bags.push([x + nx * side * r * .08, top - .05 + r * .24, z + nz * side * r * .08, ang + Math.PI / 2 + (rnd() - .5) * .25]); }
    }
    for (let u = 0; u < g.len; u += .27) slats.push([g.ax + g.dx * u, g.az + g.dz * u, ang]);
  }
  for (let z = BAY.z1; z > BAY.z0 + .3; z -= .27) for (const x of [-3.6, -2.4, -1.2]) slats.push([x, z, 0]);
  const PB = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, 2.0, .13), wood, posts.length); posts.forEach(([x, z, a], i) => { dm.position.set(x, FLOOR + 1.0, z); dm.rotation.set(0, a, (rnd() - .5) * .05); dm.updateMatrix(); PB.setMatrixAt(i, dm.matrix); }); scene.add(PB);
  const SB = new THREE.InstancedMesh(bagGeo, bagMat, bags.length); bags.forEach(([x, y, z, a], i) => { dm.position.set(x, y, z); dm.rotation.set(0, a, (rnd() - .5) * .08); dm.updateMatrix(); SB.setMatrixAt(i, dm.matrix); }); scene.add(SB);
  const DK = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, .045, .1), new THREE.MeshLambertMaterial({ color: 0x5a4632, flatShading: true }), slats.length); slats.forEach(([x, z, a], i) => { dm.position.set(x, FLOOR + .04, z); dm.rotation.set(0, a + (rnd() - .5) * .05, 0); dm.updateMatrix(); DK.setMatrixAt(i, dm.matrix); }); scene.add(DK);
  // a strip of water along the duckboards
  for (const g of segs) add(new THREE.PlaneGeometry(1.5, g.len + .4), new THREE.MeshPhongMaterial({ color: 0x080f0b, specular: 0x24352a, shininess: 40 }), (g.ax + g.bx) / 2, FLOOR + .01, (g.az + g.bz) / 2, -Math.PI / 2, 0, Math.atan2(g.dx, g.dz));
  // barbed wire out in front, dead trees, helmets
  const wireMat = new THREE.LineBasicMaterial({ color: 0x8a9a86, transparent: true, opacity: .75 });
  for (const zr of [-19, -27, -36]) { const pts = []; for (let x = -34; x <= 34; x += .1) { const a = x * 3.1; pts.push(V3(x, ground(x, zr) + .55 + Math.sin(a) * .32, zr + Math.cos(a) * .32)); } scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat)); for (let x = -34; x <= 34; x += 2.6) add(new THREE.BoxGeometry(.07, 1.3, .07), wood, x, ground(x, zr) + .55, zr, 0, 0, (rnd() - .5) * .3); }
  for (let i = 0; i < 28; i++) { const x = (rnd() - .5) * 70, z = 30 - rnd() * 75; if (near(x, z).d < 4) continue; const h = rnd() < .35 ? 2.5 + rnd() * 3 : .4 + rnd() * .7; add(new THREE.CylinderGeometry(.06, .16, h, 6), wood, x, height(x, z) + h / 2, z, 0, 0, (rnd() - .5) * .35); if (h > 2) add(new THREE.CylinderGeometry(.03, .06, 1.2, 5), wood, x + .35, height(x, z) + h * .7, z, 0, 0, -1); }

  // things along the trench (s = metres along it, side = which wall)
  const at = (s, side, off) => { let g = segs[0]; for (const q of segs) if (s >= q.s0) g = q; const u = Math.min(g.len, s - g.s0), nx = g.dz, nz = -g.dx, o = off == null ? .72 : off; return { x: g.ax + g.dx * u + nx * side * o, z: g.az + g.dz * u + nz * side * o, ang: Math.atan2(g.dx, g.dz) }; };
  const crateM = new THREE.MeshLambertMaterial({ color: 0x5a4630, flatShading: true });
  { const p = at(16, -1); add(new THREE.BoxGeometry(.7, .42, .48), crateM, p.x, FLOOR + .21, p.z, 0, p.ang + .2, 0); add(new THREE.BoxGeometry(.62, .38, .44), crateM, p.x, FLOOR + .61, p.z, 0, p.ang - .1, 0); add(new THREE.SphereGeometry(.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), helm, p.x, FLOOR + .8, p.z); }
  { const p = at(21, 1, .78); for (const o of [-.3, .3]) add(new THREE.BoxGeometry(.06, 2.6, .06), wood, p.x + Math.sin(p.ang) * o, FLOOR + 1.2, p.z + Math.cos(p.ang) * o); for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(.66, .05, .05), wood, p.x, FLOOR + .3 + i * .34, p.z, 0, p.ang + Math.PI / 2, 0); }
  { const p = at(27, -1, .75); add(new THREE.CylinderGeometry(.26, .24, .7, 12), new THREE.MeshLambertMaterial({ color: 0x3c4232 }), p.x, FLOOR + .35, p.z); add(new THREE.CylinderGeometry(.02, .02, 1.6, 5), wood, p.x + .2, FLOOR + 1.6, p.z, 0, 0, .05); add(new THREE.BoxGeometry(.09, .16, .09), new THREE.MeshLambertMaterial({ color: 0x2b2f24 }), p.x + .2, FLOOR + 2.42, p.z); }
  { const p = at(31.5, 1, .7); for (let r = 0; r < 3; r++) for (let k = 0; k < 3 - r; k++) add(bagGeo, bagMat, p.x + (k - (2 - r) / 2) * .5 * Math.sin(p.ang), FLOOR + .13 + r * .25, p.z + (k - (2 - r) / 2) * .5 * Math.cos(p.ang), 0, p.ang + Math.PI / 2, 0); }
  // lanterns hanging from the posts
  const lanterns = [8, 24].slice(0, LOW ? 1 : 2).map((s, i) => { const p = at(s, i ? -1 : 1, .82); const m = add(new THREE.BoxGeometry(.1, .15, .1), new THREE.MeshBasicMaterial({ color: 0xffc27a }), p.x, -.55, p.z); const L = new THREE.PointLight(0xffa860, 1.6, 6.5, 1.6); L.position.set(p.x, -.45, p.z); scene.add(L); return { m, L, ph: rnd() * 6 }; });

  // ---------- the bay at the end: a tin roof on posts, a desk, the PC, a lamp ----------
  const DX = (BAY.x0 + BAY.x1) / 2, DZ = BAY.z0 + .62, PZ = DZ, TOP = FLOOR + .76;
  for (const [x, z] of [[BAY.x0 + .15, BAY.z0 + .15], [BAY.x1 - .15, BAY.z0 + .15], [BAY.x0 + .15, BAY.z1 - .2], [BAY.x1 - .15, BAY.z1 - .2]]) add(new THREE.BoxGeometry(.16, 2.5, .16), wood, x, FLOOR + 1.25, z);
  const iron = new THREE.PlaneGeometry(BAY.x1 - BAY.x0 + .6, BAY.z1 - BAY.z0 + .5, 50, 1); { const pa = iron.attributes.position; for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 18) * .025); iron.computeVertexNormals(); }
  add(iron, new THREE.MeshLambertMaterial({ color: 0x55574b, side: THREE.DoubleSide, flatShading: true }), DX, FLOOR + 2.4, (BAY.z0 + BAY.z1) / 2, Math.PI / 2 + .08, 0, 0);
  for (const sx of [BAY.x0 - .05, BAY.x1 + .05]) add(new THREE.BoxGeometry(.06, 1.75, BAY.z1 - BAY.z0), plankM(1.6, .9), sx, FLOOR + .87, (BAY.z0 + BAY.z1) / 2);
  add(new THREE.BoxGeometry(BAY.x1 - BAY.x0, 1.75, .06), plankM(2, .9), DX, FLOOR + .87, BAY.z0 - .03);
  // a map pinned up, a shelf of tins
  const mapTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 340; const x = c.getContext('2d');
    x.fillStyle = '#b9ad8a'; x.fillRect(0, 0, 512, 340); for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(80,60,30,${(rnd() * .08).toFixed(3)})`; x.fillRect(rnd() * 512, rnd() * 340, 2 + rnd() * 6, 2 + rnd() * 6); }
    x.strokeStyle = 'rgba(90,80,55,.35)'; for (let i = 0; i < 9; i++) { x.beginPath(); for (let k = 0; k <= 512; k += 8) { const yy = 30 + i * 36 + Math.sin(k * .02 + i) * 9; k ? x.lineTo(k, yy) : x.moveTo(k, yy); } x.stroke(); }
    const tr = (y0, col) => { x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); let xx = 0, yy = y0; x.moveTo(0, y0); while (xx < 512) { const up = rnd() < .5 ? -1 : 1; x.lineTo(xx + 8, yy); x.lineTo(xx + 8, yy + up * 9); x.lineTo(xx + 16, yy + up * 9); x.lineTo(xx + 16, yy); xx += 22; x.lineTo(xx, yy); } x.stroke(); };
    tr(250, '#2e7a46'); tr(92, '#8a2a20');
    for (const [px2, py2, col] of [[262, 96, '#c23b2a'], [120, 245, '#2e7a46'], [400, 84, '#c23b2a']]) { x.fillStyle = col; x.beginPath(); x.arc(px2, py2, 6, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  add(new THREE.PlaneGeometry(1.1, .73), new THREE.MeshLambertMaterial({ map: mapTex }), BAY.x1 - .1, FLOOR + 1.35, BAY.z0 + 1.6, 0, -Math.PI / 2, 0);
  add(new THREE.BoxGeometry(.3, .04, 1.2), wood, BAY.x0 + .2, FLOOR + 1.25, BAY.z0 + 1.4);
  for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(.05, .05, .12, 8), new THREE.MeshLambertMaterial({ color: [0x7a6a4a, 0x6b6f5a, 0x8a5a3a][i % 3] }), BAY.x0 + .2, FLOOR + 1.33, BAY.z0 + .95 + i * .22);
  // desk and PC
  const deskM = new THREE.MeshLambertMaterial({ color: 0x5b4632, flatShading: true });
  add(new THREE.BoxGeometry(1.6, .06, .78), deskM, DX, TOP - .03, DZ);
  for (const dx of [-.72, .72]) for (const dz of [-.32, .32]) add(new THREE.BoxGeometry(.07, .73, .07), deskM, DX + dx, FLOOR + .37, DZ + dz);
  const radioM = new THREE.MeshLambertMaterial({ color: 0x3d4430, flatShading: true });
  add(new THREE.BoxGeometry(.36, .24, .2), radioM, DX + .6, TOP + .12, DZ - .12, 0, -.3, 0);
  add(new THREE.CylinderGeometry(.006, .006, .7, 4), radioM, DX + .68, TOP + .55, DZ - .16, 0, 0, -.25);
  const rled = add(new THREE.BoxGeometry(.03, .03, .01), new THREE.MeshBasicMaterial({ color: 0x5fe08a }), DX + .51, TOP + .15, DZ - .01, 0, -.3, 0);
  const beige = new THREE.MeshLambertMaterial({ color: 0x8f8668, emissive: 0x2a2519 }), beigeD = new THREE.MeshLambertMaterial({ color: 0x6f6850, emissive: 0x1e1a12 });
  add(new THREE.BoxGeometry(.78, .14, .56), beige, DX, TOP + .07, PZ - .02);
  const MY = TOP + .14 + .3;
  add(new THREE.BoxGeometry(.66, .58, .56), beige, DX, MY, PZ - .06);
  add(new THREE.BoxGeometry(.56, .44, .02), beigeD, DX, MY + .03, PZ - .06 + .28);
  const SCW = 1024, SCH = 768, SW = .5, SH = .375;
  const sc = document.createElement('canvas'); sc.width = SCW; sc.height = SCH; const g = sc.getContext('2d');
  const tex = new THREE.CanvasTexture(sc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(DX, MY + .03, PZ - .06 + .292); scene.add(screen);
  add(new THREE.BoxGeometry(.6, .035, .2), beigeD, DX + .02, TOP + .02, PZ + .3, .06);
  add(new THREE.CylinderGeometry(.045, .04, .1, 10), new THREE.MeshLambertMaterial({ color: 0x6b6f5a }), DX - .55, TOP + .05, PZ + .2);
  const glow = new THREE.PointLight(0x5fe08a, .35, 4); glow.position.set(DX, MY + .1, PZ + .9); scene.add(glow);
  // the lamp under the roof swings when a shell lands
  const lampPivot = new THREE.Group(); lampPivot.position.set(BAY.x0 + .7, FLOOR + 2.32, BAY.z0 + 1.9); scene.add(lampPivot);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .5, 4), new THREE.MeshBasicMaterial({ color: 0x111111 })); cord.position.y = -.25; lampPivot.add(cord);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(.17, .13, 14, 1, true), new THREE.MeshLambertMaterial({ color: 0x2f3a2c, side: THREE.DoubleSide })); shade.position.y = -.53; lampPivot.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0 })); bulb.position.y = -.6; lampPivot.add(bulb);
  const lamp = new THREE.PointLight(0xffb36b, 2.6, 7, 1.5); lamp.position.y = -.66; lampPivot.add(lamp);
  let swA = .05, swV = 0, swB = 0, swW = 0, flick = 0;

  // ---------- flares, artillery, smoke, rain ----------
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const flares = [[-9, 12, 0], [8, 0, 1.3], [-6, -14, 2.4]].slice(0, LOW ? 2 : 3).map(([x, z, d]) => {
    const L = new THREE.PointLight(0x7dff9a, 0, 70, 1.5); scene.add(L);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xb6ffc8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(1.6, 1.6, 1); scene.add(s);
    return { L, s, x, z, d, per: 6.5 + rnd() * 2 };
  });
  const art = new THREE.PointLight(0xffd6a0, 0, 140, 1.2); art.position.set(0, 6, -80); scene.add(art);
  const artSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffcf96, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); artSpr.scale.set(30, 12, 1); artSpr.position.set(0, 2, -88); scene.add(artSpr);
  let nextBoom = 1.2, boom = 0, boomX = 0, shake = 0;
  const smoke = []; for (let i = 0; i < 34; i++) { const x = (rnd() - .5) * 60, z = 26 - rnd() * 70; if (near(x, z).d < 3.5) continue; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0x334036, transparent: true, opacity: .22, depthWrite: false })); s.position.set(x, ground(x, z) + .8 + rnd() * 2, z); const k = 3 + rnd() * 5; s.scale.set(k, k * .6, 1); s.userData.v = .1 + rnd() * .25; scene.add(s); smoke.push(s); }
  const RN = LOW ? 700 : 1500, rp = new Float32Array(RN * 6);
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rainBase = []; for (let i = 0; i < RN; i++) rainBase.push([(rnd() - .5) * 24, rnd() * 9, (rnd() - .5) * 24]);
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fbfaa, transparent: true, opacity: .26 })); rain.frustumCulled = false; scene.add(rain);

  // ---------- searchlights and tracers from the far side ----------
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { op: { value: .1 } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = -position.y / 90.; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float op; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float e = abs(dot(vN, vV)); float a = op * pow(1. - vY, 2.2) * smoothstep(.0, .7, e); gl_FragColor = vec4(vec3(.82, .95, .86) * a, a); }',
  });
  const coneGeo = new THREE.ConeGeometry(6, 90, 28, 1, true); coneGeo.translate(0, -45, 0);
  const lights2 = [[-20, -55, 0], [22, -60, 2.1]].map(([x, z, ph]) => { const p = new THREE.Group(); p.position.set(x, ground(x, z) + 1.4, z); scene.add(p); p.add(new THREE.Mesh(coneGeo, beamMat)); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xe8fff0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(2.4, 2.4, 1); s.position.copy(p.position); scene.add(s); return { p, ph }; });
  const DOWN = V3(0, -1, 0), tmpD = V3(0, 0, 0);
  const tracers = Array.from({ length: 14 }, (_, i) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: i % 3 ? 0xffc27a : 0xb6ffc8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); l.frustumCulled = false; scene.add(l); return { l, geo, a: V3(0, 0, 0), v: V3(0, 0, 0), t0: -1 }; });
  let nextBurst = 2, ti = 0;
  function burst(at2) { const x0 = (rnd() - .5) * 50, a = V3(x0, ground(x0, -42) + 1.1, -42), aim = V3(x0 + (rnd() - .5) * 30, 3 + rnd() * 8, 30); const v = aim.sub(a).normalize().multiplyScalar(70), n = 3 + (rnd() * 4 | 0); for (let k = 0; k < n; k++) { const tr = tracers[ti++ % tracers.length]; tr.a.copy(a); tr.v.copy(v).add(V3((rnd() - .5) * 1.5, (rnd() - .5) * 1.2, 0)); tr.t0 = at2 + k * .085; } }
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xe6fff0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); bolt.frustumCulled = false; scene.add(bolt);
  let nextBolt = 7 + rnd() * 4, boltT = -1;
  function strike() { const bx = (rnd() - .5) * 160, arr = boltGeo.attributes.position.array; let x = bx, y = 70; for (let i = 0; i < 18; i++) { arr.set([x, y, -150], i * 3); x += (rnd() - .5) * 9; y -= 70 / 17; } boltGeo.attributes.position.needsUpdate = true; boltT = t; const s = SND(); if (s && entered) s.boom(.1, 1.4 + rnd() * 1.2); }
  // ---------- post: glow from the mip chain, chromatic fringe, grade, grain, vignette ----------
  const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: LOW ? 0 : 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  const post = { tD: { value: rt.texture }, time: { value: 0 }, flash: { value: 0 }, ca: { value: .8 }, grain: { value: LOW ? .035 : .045 }, fade: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, glowK: { value: 1 } };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: post, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `uniform sampler2D tD; uniform float time, flash, ca, grain, fade, glowK; uniform vec2 res; varying vec2 vUv;
      void main(){
        vec2 d = vUv - .5; float r2 = dot(d, d);
        vec2 uv = .5 + d * (1. - .035 * r2);
        vec2 off = d * ca * (.5 + r2 * 3.) / res * 6.;
        vec3 c = vec3(texture2D(tD, uv - off).r, texture2D(tD, uv).g, texture2D(tD, uv + off).b);
        vec3 gl = textureLod(tD, uv, 2.5).rgb * .45 + textureLod(tD, uv, 4.5).rgb * .35 + textureLod(tD, uv, 6.5).rgb * .3;
        c += max(gl - vec3(.1), vec3(0.)) * glowK * .9;
        c *= vec3(.95, 1.03, .97);
        c = c / (1. + c * .18);
        c = pow(max(c, vec3(0.)), vec3(1. / 2.2));
        c = mix(vec3(dot(c, vec3(.299, .587, .114))), c, .9);
        c *= 1. - .62 * smoothstep(.1, .62, r2 * 1.7);
        float n = fract(sin(dot(gl_FragCoord.xy + fract(time * 7.13) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
        c += (n - .5) * grain;
        c = mix(c, vec3(.92, 1., .94), flash);
        gl_FragColor = vec4(c * fade, 1.);
      }`,
  }));
  const postScene = new THREE.Scene(); postScene.add(quad); const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let usePost = true;


  // ---------- shells: a fireball, a column of dirt, smoke, a flash; close ones shake you and rain dirt into the trench ----------
  const BN = 4, BLD = LOW ? 70 : 140, blasts = [];
  for (let b = 0; b < BN; b++) {
    const pos = new Float32Array(BLD * 3), vel = new Float32Array(BLD * 3), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x2a2118, size: .5, map: dot, transparent: true, opacity: 0, depthWrite: false })); pts.frustumCulled = false; scene.add(pts);
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffb070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(fire);
    const puffs = Array.from({ length: 5 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0x4a4a3c, transparent: true, opacity: 0, depthWrite: false })); scene.add(s); return s; });
    blasts.push({ pos, vel, geo, pts, fire, puffs, t0: -1, gy: 0, size: 1 });
  }
  const blastL = [0, 1].map(() => { const L = new THREE.PointLight(0xffa860, 0, 50, 1.3); L.userData = { t0: -99, k: 1 }; scene.add(L); return L; });
  const RD = LOW ? 120 : 260, rdp = new Float32Array(RD * 3).fill(-50), rdv = new Float32Array(RD);
  const rdGeo = new THREE.BufferGeometry(); rdGeo.setAttribute('position', new THREE.BufferAttribute(rdp, 3));
  const rdPts = new THREE.Points(rdGeo, new THREE.PointsMaterial({ color: 0x3a2e20, size: .06, transparent: true, opacity: .95 })); rdPts.frustumCulled = false; scene.add(rdPts);
  let bi = 0, li = 0; const fwd = V3(0, 0, 0);
  function blast(x, z, size) {
    const b = blasts[bi++ % BN], gy = height(x, z);
    b.t0 = t; b.gy = gy; b.size = size;
    for (let i = 0; i < BLD; i++) { const a = rnd() * Math.PI * 2, up = (8 + rnd() * 9) * size, out = (1 + rnd() * 3.5) * size; b.pos.set([x, gy + .2, z], i * 3); b.vel.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3); }
    b.fire.position.set(x, gy + 2.6 * size, z);
    b.puffs.forEach((s, i) => { s.position.set(x + (rnd() - .5) * 1.6 * size, gy + 1 + i * 1.1 * size, z + (rnd() - .5) * 1.6 * size); s.userData.k = (.8 + rnd() * .9) * size; });
    const L = blastL[li++ % 2]; L.position.set(x, gy + 1.5, z); L.userData.t0 = t; L.userData.k = size;
    const d = Math.hypot(x - cam.position.x, z - cam.position.z), nr = Math.max(0, Math.min(1, 1 - d / 26));
    shake = Math.max(shake, Math.min(1.6, size * 8 / Math.max(3, d)));
    post.flash.value = Math.max(post.flash.value, Math.min(.28, size * 1.4 / Math.max(3, d)));
    if (d < 10 && phase !== 'gate') { rdT = t; cam.getWorldDirection(fwd); for (let i = 0; i < RD; i++) { const f = 1 + rnd() * 4; rdp.set([cam.position.x + fwd.x * f + (rnd() - .5) * 2.6, .3 + rnd() * 2.4, cam.position.z + fwd.z * f + (rnd() - .5) * 2.6], i * 3); rdv[i] = -(1 + rnd() * 2.5); } }
    if (d < 14) { swV += (rnd() - .5) * 1.6; swW += (rnd() - .5) * 1.2; flick = 1; }
    const s = SND(); if (s && entered) { s.boom(nr, Math.min(.5, d / 340)); if (d < 6.5) s.muffle(1.6); }
  }
  function blastsTick(dt) {
    for (const b of blasts) {
      if (b.t0 < 0) continue; const ea = t - b.t0, gy = -9.8 * dt;
      for (let i = 0; i < BLD; i++) { const j = i * 3; if (b.pos[j + 1] < b.gy - .1 && b.vel[j + 1] < 0) continue; b.vel[j + 1] += gy; b.pos[j] += b.vel[j] * dt; b.pos[j + 1] += b.vel[j + 1] * dt; b.pos[j + 2] += b.vel[j + 2] * dt; }
      b.geo.attributes.position.needsUpdate = true; b.pts.material.opacity = ea < 2.5 ? 1 : Math.max(0, 1 - (ea - 2.5));
      const fk = Math.min(1, ea / .2), fz = (4 + fk * 12) * b.size; b.fire.scale.set(fz, fz * .8, 1); b.fire.material.opacity = Math.max(0, 1 - ea / .65);
      b.puffs.forEach(s => { const k = Math.min(1, ea / 4.5), sz = (1.2 + Math.sqrt(k) * 6.5) * s.userData.k; s.scale.set(sz, sz * .85, 1); s.position.y += dt * (.9 - k * .6); s.material.opacity = ea < .15 ? ea * 5 : Math.max(0, .7 * (1 - k)); s.material.color.setHex(ea < .45 ? 0x8a6a48 : 0x4a4a3c); });
      if (ea > 6) { b.t0 = -1; b.pts.material.opacity = 0; b.fire.material.opacity = 0; b.puffs.forEach(s => s.material.opacity = 0); }
    }
    for (const L of blastL) { const ea = t - L.userData.t0; L.intensity = ea < 3 ? 380 * L.userData.k * Math.exp(-ea * 6) : 0; }
    if (t - rdT < 4) { for (let i = 0; i < RD; i++) { const j = i * 3; if (rdp[j + 1] < FLOOR) { rdp[j + 1] = -50; continue; } rdv[i] -= 6 * dt; rdp[j + 1] += rdv[i] * dt; } rdGeo.attributes.position.needsUpdate = true; }
  }
  let rdT = -10;
  // ---------- the CRT ----------
  const S2 = { lines: [], input: null, hint: false, warp: 0, phase: 'off', dirty: true, blink: true, on: 0 };
  const wb = document.createElement('canvas'); wb.width = SCW; wb.height = SCH; const wg = wb.getContext('2d');
  const GR = '#5fe08a', GD = '#2f8f52', GB = '#b6ffc8';
  const FS = LOW ? 44 : 34, LH = LOW ? 60 : 50, LX = LOW ? 46 : 58;
  const COARSE = matchMedia('(pointer: coarse)').matches;
  function draw() {
    const rg = g.createRadialGradient(SCW / 2, SCH / 2, 80, SCW / 2, SCH / 2, SCW * .72); rg.addColorStop(0, '#0f2216'); rg.addColorStop(1, '#040906');
    g.fillStyle = rg; g.fillRect(0, 0, SCW, SCH);
    if (S2.phase === 'off') { tex.needsUpdate = true; S2.dirty = false; return; }
    g.font = '500 ' + FS + 'px JB, ui-monospace, Menlo, monospace'; g.textBaseline = 'top';
    let y = 50;
    for (const l of S2.lines) { if (!l.t && !l.ok) { y += LH; continue; } g.fillStyle = 'rgba(95,224,138,.28)'; g.fillText(l.t, LX + 1, y + 1); g.fillStyle = l.c || GR; g.fillText(l.t, LX, y); if (l.ok) { const w = g.measureText(l.t).width; g.fillStyle = GB; g.fillText(l.ok, LX + w, y); } y += LH; }
    if (S2.input != null) { const pre = 'callsign: '; g.fillStyle = GR; g.fillText(pre + S2.input, LX, y); const w = g.measureText(pre + S2.input).width; if (S2.blink) g.fillRect(LX + 2 + w, y + 2, Math.round(FS * .55), FS + 1); }
    else if (S2.phase !== 'push' && S2.lines.length && S2.blink) { const L = S2.lines[S2.lines.length - 1]; g.fillStyle = GR; g.fillRect(LX + g.measureText(L.t + (L.ok || '')).width + 4, 50 + (S2.lines.length - 1) * LH + 2, Math.round(FS * .55), FS + 1); }
    if (S2.hint) { g.font = '400 ' + (LOW ? 30 : 23) + 'px JB, ui-monospace, monospace'; g.fillStyle = GD; g.fillText(COARSE ? 'tap the screen to enter ↵' : 'type a callsign or press enter ↵', LX, SCH - (LOW ? 118 : 104)); }
    g.fillStyle = '#123a22'; g.fillRect(0, SCH - 54, SCW, 54);
    g.font = '500 21px JB, ui-monospace, monospace'; g.fillStyle = GR;
    g.fillText('.trench · line 7 · solana mainnet', 28, SCH - 40);
    const d = new Date(), clk = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
    g.fillText(clk, SCW - 28 - g.measureText(clk).width, SCH - 40);
    g.fillStyle = 'rgba(0,0,0,.24)'; for (let yy = 0; yy < SCH; yy += 3) g.fillRect(0, yy, SCW, 1);
    if (S2.on < 1) { g.fillStyle = 'rgba(4,9,6,' + (1 - S2.on).toFixed(3) + ')'; g.fillRect(0, 0, SCW, SCH); g.fillStyle = 'rgba(182,255,200,' + (S2.on * (1 - S2.on) * 2).toFixed(3) + ')'; g.fillRect(0, SCH / 2 - 2 - S2.on * SCH / 2, SCW, 4 + S2.on * SCH); }
    const W = S2.warp;
    if (W > 0) {
      wg.clearRect(0, 0, SCW, SCH); wg.drawImage(sc, 0, 0);
      const z = 1 + 1.6 * W * W, cx = SCW / 2, cy = SCH * .46;
      g.fillStyle = '#040906'; g.fillRect(0, 0, SCW, SCH); g.drawImage(wb, cx - cx * z, cy - cy * z, SCW * z, SCH * z);
      const sp = 6 + 46 * W * W, off = (performance.now() / 6) % sp;
      g.fillStyle = 'rgba(182,255,200,' + (0.18 + .5 * W).toFixed(3) + ')';
      for (let d2 = off; d2 < SCH; d2 += sp) { const h = 1 + Math.round(4 * W * d2 / SCH); g.fillRect(0, cy + d2, SCW, h); g.fillRect(0, cy - d2 - h, SCW, h); }
      const bl = g.createRadialGradient(cx, cy, 10, cx, cy, SCW * (.25 + .9 * W)); bl.addColorStop(0, 'rgba(236,255,240,' + Math.min(1, W * 1.25).toFixed(3) + ')'); bl.addColorStop(1, 'rgba(95,224,138,' + (W * W * .85).toFixed(3) + ')');
      g.fillStyle = bl; g.fillRect(0, 0, SCW, SCH);
    }
    tex.needsUpdate = true; S2.dirty = false;
  }
  const touch = () => { S2.dirty = true; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function typeLine(text, c, ms) { const l = { t: '', c }; S2.lines.push(l); for (let i = 1; i <= text.length; i++) { if (ended) return l; l.t = text.slice(0, i); touch(); await sleep(ms); } return l; }
  let submit = null, idleT = 0, typedAny = false;
  function armIdle(ms) { clearTimeout(idleT); idleT = setTimeout(autoLogin, ms); }
  let autoTyping = false;
  async function autoLogin() { if (S2.input == null || !submit) return; if (!typedAny) { let saved = 'anon'; try { saved = localStorage.getItem('trench:callsign') || 'anon'; } catch (_) { } autoTyping = true; for (const ch of saved) { if (S2.input == null || !autoTyping) return; S2.input += ch; touch(); await sleep(80); } await sleep(160); if (!autoTyping) return; autoTyping = false; } if (submit) submit(); }
  function onKey(e) {
    if (ended || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!entered) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); } return; }
    if (S2.input == null) return;
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(idleT); if (!S2.input) { typedAny = false; autoLogin(); } else if (submit) submit(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); S2.input = S2.input.slice(0, -1); touch(); window.__trenchHold = Date.now(); armIdle(2600); return; }
    if (e.key.length === 1 && /[a-zA-Z0-9_]/.test(e.key) && (S2.input.length < 12 || autoTyping)) { e.preventDefault(); if (autoTyping) { autoTyping = false; S2.input = ''; } typedAny = true; S2.input += e.key.toLowerCase(); touch(); window.__trenchHold = Date.now(); armIdle(2600); }
  }
  const onClick = e => { if (e.target.closest && e.target.closest('#introSkip, #introGate')) return; if (S2.input != null) { clearTimeout(idleT); if (S2.input) submit && submit(); else autoLogin(); } };
  addEventListener('keydown', onKey, true); box.addEventListener('click', onClick);

  // the CRT reads the real pump.fun stream state: no invented numbers
  function streamLine() {
    const ts = window.TS && window.TS.status ? window.TS.status() : null;
    if (!ts) return null;
    if (ts.state === 'live') return ['live · ' + ts.perMin + ' new coins since you got here', GB];
    return [ts.state === 'down' ? 'reconnecting' : 'connecting', GD];
  }
  async function script() {
    S2.phase = 'boot'; touch();
    for (let k = 0; k <= 12; k++) { S2.on = k / 12; touch(); await sleep(28); }
    await typeLine('.trench os · line 7', GB, 18);
    await typeLine(LOW ? 'own the trenches.' : 'live calls · the basket · the board', GD, 10);
    S2.lines.push({ t: '' }); touch(); await sleep(120); if (ended) return;
    S2.input = ''; S2.hint = true; touch();
    const name = await new Promise(res => { submit = () => { submit = null; clearTimeout(idleT); res(S2.input || 'anon'); }; armIdle(1700); });
    const user = setUser(name); window.__trenchHold = Date.now() + 5000;
    S2.lines.push({ t: 'callsign: ' + S2.input }); S2.input = null; S2.hint = false; touch();
    const au = await typeLine('radio check… ', GR, 9); await sleep(260); au.ok = 'clear'; touch();
    const st = await typeLine(LOW ? 'pump stream… ' : 'pump.fun stream… ', GR, 9);
    for (let i = 0; i < 6; i++) { const r = streamLine(); if (!r || r[0].startsWith('live')) break; await sleep(250); }
    const r = streamLine(); st.ok = r ? (LOW && r[0].startsWith('live') ? 'live' : r[0]) : 'offline'; touch(); await sleep(200);
    await typeLine('welcome to the trenches, ' + user + '.', GB, 22);
    await sleep(320); push();
  }


  // ---------- camera: the walk down the trench ----------
  const EYE = FLOOR + 1.72;
  const WS = [[0, 20.5], ...WP.slice(1)]; WS[WS.length - 1] = [WP[WP.length - 1][0], WP[WP.length - 1][1] + .2];
  const cps = [V3(WS[0][0], EYE, WS[0][1])];
  for (let i = 1; i < WS.length - 1; i++) { const [px, pz] = WS[i - 1], [cx, cz] = WS[i], [nx, nz] = WS[i + 1]; const li = Math.hypot(cx - px, cz - pz), lo = Math.hypot(nx - cx, nz - cz), r = Math.min(1.3, li * .4, lo * .4); cps.push(V3(cx - (cx - px) / li * r, EYE, cz - (cz - pz) / li * r), V3(cx + (nx - cx) / lo * r, EYE, cz + (nz - cz) / lo * r)); }
  cps.push(V3(WS[WS.length - 1][0], EYE, WS[WS.length - 1][1]));
  const walk = new THREE.CatmullRomCurve3(cps, false, 'centripetal'), S = walk.getLength();
  const VMAX = LOW ? 2.6 : 2.5, TA = .9, TD = 1.7, TW = S / VMAX + (TA + TD) / 2;
  function sOf(tt) { if (tt <= 0) return 0; if (tt < TA) return .5 * VMAX * tt * tt / TA; const s1 = .5 * VMAX * TA, tc = TW - TA - TD; if (tt < TA + tc) return s1 + VMAX * (tt - TA); const u = Math.min(TD, tt - TA - tc); return Math.min(S, s1 + VMAX * tc + VMAX * u - .5 * VMAX * u * u / TD); }
  const ptAt = s => walk.getPointAt(Math.max(0, Math.min(1, s / S)));
  const vfov = cam.fov * Math.PI / 180;
  const fitDist = frac => { const a = innerWidth / innerHeight; const hv = (SH / 2) / Math.tan(vfov / 2), hh = (SW / 2) / (Math.tan(vfov / 2) * a); return Math.max(hv, hh) / frac; };
  const readPos = () => V3(screen.position.x, screen.position.y + .01, screen.position.z + fitDist(innerWidth < innerHeight ? .95 : .62));
  const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const SWOOP = 3.4, P0 = ptAt(0), L0 = ptAt(3.4).setY(EYE + .12);
  let nf = 0, fps0 = 0, raf = 0, t = 0, last = 0, pushT = -1, booted = false, lastBlink = 0, lastClock = 0, flashed = false;
  let phase = 'gate', swT = 0, wT = 0, sPrev = 0, phi = 0, stepN = 0, nextBlast = 2.2, bigDone = false;
  const swFrom = V3(0, 0, 0), lookFrom = V3(0, 0, 0), look = V3(-1, -1.6, 3), tmpL = V3(0, 0, 0), tmpA = V3(0, 0, 0), tmpB = V3(0, 0, 0), right = V3(0, 0, 0), UP = V3(0, 1, 0);
  const orbit = tt => { const a = .9 + tt * .03; return V3(-1 + Math.sin(a) * 24, 14 + Math.sin(tt * .2) * 1.2, 4 + Math.cos(a) * 24); };
  goFn = () => { if (phase !== 'gate') return; phase = 'swoop'; swT = t; swFrom.copy(cam.position); lookFrom.copy(look); nextBlast = t + 2.6; };
  function push() { if (pushT < 0) { pushT = t; S2.phase = 'push'; window.__trenchHold = Date.now() + 2500; const s = SND(); if (s) s.whoosh(); } }
  function schedule() {
    if (phase === 'gate') { const x = -1 + (rnd() - .5) * 40, z = 4 - rnd() * 40; if (near(x, z).d > 4) blast(x, z, .8 + rnd() * .5); nextBlast = t + 2 + rnd() * 1.8; return; }
    if (phase === 'walk') {
      const s = sOf(t - wT);
      if (!bigDone && s > S * .48) { bigDone = true; const p = at(Math.min(SL - 1, s + 9), 1, 3.4); blast(p.x, p.z, 1.7); nextBlast = t + 2.2; return; }
      if (s < S - 6) { for (let k = 0; k < 6; k++) { const side = rnd() < .5 ? -1 : 1, p = at(Math.min(SL - 1, s + 11 + rnd() * 10), side, 3.6 + rnd() * 4); if (near(p.x, p.z).d > 3.6) { blast(p.x, p.z, .9 + rnd() * .45); break; } } }
      nextBlast = t + 1.1 + rnd() * 1.1; return;
    }
    // at the PC: the shelling goes on further off
    const x = cam.position.x + (rnd() - .5) * 40, z = cam.position.z - 14 - rnd() * 20; if (near(x, z).d > 4) blast(x, z, 1 + rnd() * .4); nextBlast = t + 3.5 + rnd() * 3;
  }
  function frame() { try { step() } catch (err) { try { console.warn('intro frame:', err && err.message) } catch (_) { } if (!ended) raf = requestAnimationFrame(frame) } }
  function step() {
    const now = performance.now(); const dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now; t += dt;
    if (++nf === 45) { const ms = (now - fps0) / 45; if (ms > 110) return finish(true); if (ms > 45) { usePost = false; DPR = 1; renderer.setPixelRatio(1); onResize(); } }
    post.fade.value = Math.min(1, post.fade.value + dt * .8); post.time.value = t; skyU.time.value = t;
    for (const f of flares) {
      const ph = ((t + f.d) % f.per) / f.per, up = Math.min(1, ph / .12), fall = Math.max(0, (ph - .12) / .88);
      const y = 2 + up * 16 - fall * 13, fl = .85 + .15 * Math.sin(t * 37 + f.d * 9) * Math.sin(t * 13), I = (ph < .12 ? up * 110 : 110 * (1 - fall * fall)) * fl;
      f.L.position.set(f.x + Math.sin(t * .4 + f.d) * 1.5, y, f.z); f.L.intensity = I; f.s.position.copy(f.L.position); f.s.material.opacity = Math.min(1, I / 50);
    }
    if (t > nextBoom) { boom = 1; boomX = (rnd() - .5) * 90; nextBoom = t + 1.4 + rnd() * 2.4; const s = SND(); if (s && entered) s.boom(.05 + rnd() * .1, .6 + rnd()); }
    boom *= Math.pow(.02, dt); shake *= Math.pow(.06, dt);
    art.intensity = boom * 260; art.position.x = boomX; artSpr.position.x = boomX; artSpr.material.opacity = boom * .9;
    skyU.glow.value = boom * 1.4; skyU.bd.value.set(boomX - cam.position.x, 4, -88 - cam.position.z).normalize();
    if (t > nextBolt) { strike(); nextBolt = t + 9 + rnd() * 8; }
    const bk = boltT < 0 ? 0 : t - boltT, lit = bk < .45 ? (bk < .06 ? 1 : bk < .12 ? .25 : bk < .2 ? .8 : Math.max(0, 1 - (bk - .2) / .25) * .5) : 0;
    skyU.lit.value = lit; bolt.material.opacity = bk < .3 ? lit : 0; moon.intensity = 1 + lit * 2.2; hemi.intensity = 1.25 + boom * .7 + lit * 1.4;
    if (t > nextBlast) schedule();
    blastsTick(dt);
    for (const s of smoke) { s.position.y += s.userData.v * dt * .3; s.position.x += .08 * dt; if (s.position.y > 6) s.position.y = 1; }
    const roof = inBay(cam.position.x, cam.position.z) ? 1 : 0;
    for (let i = 0; i < RN; i++) { const b = rainBase[i]; let y = (b[1] - t * 14) % 9; if (y < 0) y += 9; const x = cam.position.x + b[0], z = cam.position.z + b[2], yy = cam.position.y - 3 + y; rp.set([x, yy, z, x + .02, yy + .34, z], i * 6); }
    rainGeo.attributes.position.needsUpdate = true; rain.material.opacity += ((roof ? .06 : .26) - rain.material.opacity) * Math.min(1, dt * 3);
    for (const b of lights2) { const a = Math.sin(t * .21 + b.ph) * .55, e = .42 + Math.sin(t * .33 + b.ph * 2) * .14; tmpD.set(Math.sin(a), e, Math.cos(a)).normalize(); b.p.quaternion.setFromUnitVectors(DOWN, tmpD); }
    if (t > nextBurst) { burst(t); nextBurst = t + 1.2 + rnd() * 2.6; }
    for (const tr of tracers) { const age = t - tr.t0; if (tr.t0 < 0 || age < 0 || age > 1.5) { tr.l.material.opacity = 0; continue; } const p = tr.geo.attributes.position.array; tmpA.copy(tr.a).addScaledVector(tr.v, age); tmpB.copy(tmpA).addScaledVector(tr.v, -.045); p[0] = tmpA.x; p[1] = tmpA.y; p[2] = tmpA.z; p[3] = tmpB.x; p[4] = tmpB.y; p[5] = tmpB.z; tr.geo.attributes.position.needsUpdate = true; tr.l.material.opacity = Math.min(1, 1.5 - age); }
    for (const l of lanterns) l.L.intensity = 1.6 * (.9 + .1 * Math.sin(t * 11 + l.ph)) * (1 - flick * .6);
    swV += (-swA * 9 - swV * .5) * dt; swA += swV * dt; swW += (-swB * 9 - swW * .5) * dt; swB += swW * dt; lampPivot.rotation.set(swB * .6, 0, swA * .6);
    flick *= Math.pow(.02, dt); lamp.intensity = 2.6 * (1 - flick * (.5 + .5 * Math.sin(t * 90))) * (.96 + .04 * Math.sin(t * 13)); bulb.material.color.setScalar(1 - flick * .5);
    post.flash.value *= Math.pow(.004, dt); post.ca.value = .8 + (post.ca.value - .8) * Math.pow(.05, dt) + shake * .4;
    // camera
    const R = readPos();
    if (phase === 'gate') { cam.position.copy(orbit(t)); look.set(-1, -1.6, 3); cam.lookAt(look); }
    else if (phase === 'swoop') {
      const k = Math.min(1, (t - swT) / SWOOP), e = eio(k);
      const C = tmpA.set(P0.x + (swFrom.x - P0.x) * .3, 9, P0.z + 7);
      cam.position.set(0, 0, 0).addScaledVector(swFrom, (1 - e) * (1 - e)).addScaledVector(C, 2 * e * (1 - e)).addScaledVector(P0, e * e);
      look.copy(lookFrom).lerp(L0, eio(Math.min(1, k * 1.1))); cam.lookAt(look);
      if (k >= 1) { phase = 'walk'; wT = t; sPrev = 0; }
    } else if (pushT < 0) {
      const tw = t - wT, s = sOf(tw), ds = Math.max(0, s - sPrev); sPrev = s;
      const P = ptAt(s); cam.position.copy(P);
      tmpL.copy(ptAt(s + 3.4)); tmpL.y = EYE + .12;
      const ending = Math.max(0, Math.min(1, (s - (S - 4.5)) / 4.5)); tmpL.lerp(screen.position, eio(ending));
      // boots: a step every 0.8 m, the head bobs and sways with it
      phi += ds / .8 * Math.PI; const n = Math.floor(phi / Math.PI); if (n > stepN) { stepN = n; const sd = SND(); if (sd && ds > 0) sd.step(n % 2 === 0); }
      const walking = Math.min(1, ds / Math.max(1e-4, dt) / VMAX) * (1 - ending * .8);
      right.subVectors(tmpL, P).cross(UP).normalize();
      cam.position.y += Math.abs(Math.sin(phi)) * .055 * walking - .02 * walking; cam.position.addScaledVector(right, Math.sin(phi) * .028 * walking);
      if (tw >= TW) { const kk = Math.min(1, (tw - TW) / 1.3); cam.position.lerp(R, eio(kk)); if (!booted && kk > .35) { booted = true; script(); } }
      cam.position.x += (rnd() - .5) * shake * .1; cam.position.y += (rnd() - .5) * shake * .1;
      cam.lookAt(tw >= TW ? screen.position : tmpL);
      cam.rotation.z += Math.sin(phi) * .006 * walking + (rnd() - .5) * shake * .025;
    } else {
      const k = Math.min(1, (t - pushT) / .9), e = Math.pow(k, 2.6);
      cam.position.lerpVectors(R, tmpA.set(screen.position.x, screen.position.y, screen.position.z + .03), e); cam.lookAt(screen.position);
      cam.fov = 60 + 14 * e; cam.updateProjectionMatrix();
      S2.warp = Math.min(1, Math.pow(k, 1.6)); touch(); post.ca.value = .8 + e * 6;
      if (k > .78 && !flashed) { flashed = true; box.classList.add('flash-on'); }
      if (k >= 1) { draw(); render(); return finish(false); }
    }
    sky.position.copy(cam.position);
    glow.intensity = .3 + Math.sin(t * 9) * .03 + (S2.phase !== 'off' ? .25 : 0);
    rled.material.color.setHex(Math.sin(t * 5) > 0 ? 0x5fe08a : 0x1d4a2c);
    if (now - lastBlink > 530) { lastBlink = now; S2.blink = !S2.blink; touch(); }
    if (now - lastClock > 1000) { lastClock = now; touch(); }
    if (S2.dirty) draw();
    render();
    raf = requestAnimationFrame(frame);
  }
  function render() {
    if (!usePost) { renderer.setRenderTarget(null); renderer.render(scene, cam); return; }
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  }
  function onResize() { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); const w = Math.round(innerWidth * DPR), h = Math.round(innerHeight * DPR); rt.setSize(w, h); post.res.value.set(w, h); }
  const vis = () => { if (document.hidden && entered) finish(true); };
  addEventListener('resize', onResize); document.addEventListener('visibilitychange', vis);
  cleanup = () => {
    cancelAnimationFrame(raf); clearTimeout(idleT);
    removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', vis);
    removeEventListener('keydown', onKey, true); box.removeEventListener('click', onClick);
    try { rt.dispose(); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); renderer.domElement.remove(); } catch (_) { }
  };
  try { await Promise.race([document.fonts.load('500 34px JB'), sleep(1000)]); } catch (_) { }
  if (ended) return cleanup();
  onResize();
  try { cam.position.copy(orbit(0)); cam.lookAt(look); draw(); renderer.compile(scene, cam); render(); } catch (e) { usePost = false; try { renderer.render(scene, cam); } catch (_) { } }
  if (ended) return cleanup();
  box.classList.add('live');
  fps0 = performance.now();
  if (entered) goFn();
  raf = requestAnimationFrame(frame);
}
