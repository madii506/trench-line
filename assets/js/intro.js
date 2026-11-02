/* trench intro: night over no man's land. you wait at the gate above the field while flares, searchlights and tracers work the dark.
   enter, and the camera drops into our trench, climbs over the top, crosses the field (a shell lands close), and drops into the far
   trench where a PC is running. you log in on its CRT and get thrown through the screen into the terminal. once per session.
   the score ("line 7") is synthesized live by score.js and plays only after you press enter with sound on. */
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
  const s = SND(); if (s && s.started) s.site();
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
  box.classList.add('cine');
  const s = SND(); if (soundOn && s) s.start('intro');
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
  const sk = $('#introSkip'); if (sk) sk.addEventListener('click', e => { e.stopPropagation(); const a = SND(); if (!entered && soundOn && a && !a.started) a.start('site'); finish(true); });
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
  scene.fog = new THREE.FogExp2(0x0c1c12, 0.03);
  const cam = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.03, 400);
  const rnd = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

  // ---------- sky: a dome with slow clouds, the artillery glow on the horizon, lightning ----------
  const skyU = { top: { value: new THREE.Color(0x010403) }, hor: { value: new THREE.Color(0x0c1c12) }, glow: { value: 0 }, bd: { value: new THREE.Vector3(0, 0, -1) }, lit: { value: 0 }, time: { value: 0 } };
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
        float g = pow(max(dot(d, bd), 0.), 30.) * glow;
        c += vec3(1., .72, .42) * g * .55 * (1. - y);
        c += vec3(.62, .8, .7) * lit * (.25 + cl * .9) * .7;
        gl_FragColor = vec4(c, 1.); }`,
  }));
  scene.add(sky);

  // ---------- light ----------
  const hemi = new THREE.HemisphereLight(0x5f8068, 0x2a2214, 1.35); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb4d0bd, 1.1); moon.position.set(-18, 30, -40); scene.add(moon);

  // ---------- ground: mud, craters, two trenches ----------
  const craters = []; for (let i = 0; i < 46; i++) craters.push([(rnd() - .5) * 70, 26 - rnd() * 48, 1.2 + rnd() * 3.2]);
  const T1 = 31.2, T2 = -24.6; // the two trench lines (z)
  function height(x, z) {
    let y = Math.sin(x * .21) * .35 + Math.cos(z * .17 + x * .05) * .3 + Math.sin(x * .9 + z * .7) * .08;
    for (const [cx, cz, r] of craters) { const d = Math.hypot(x - cx, z - cz) / r; if (d < 1.35) y += d < 1 ? -(1 - d * d) * r * .32 : (1.35 - d) * .5; }
    const tr = (zc) => { const d = Math.abs(z - zc); return d < 1.3 ? -1.75 : d < 2.0 ? -1.75 * (2.0 - d) / .7 : 0; };
    y += tr(T1) + tr(T2);
    if (z > T1 + 1.3) y += .55; // the parados behind our trench
    return y;
  }
  const G = new THREE.PlaneGeometry(170, 170, 180, 180); G.rotateX(-Math.PI / 2);
  const pos = G.attributes.position, col = [];
  const cMud = new THREE.Color(0x4a4130), cDark = new THREE.Color(0x231f17), cWet = new THREE.Color(0x2c3a2b);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i) - 10; pos.setZ(i, z); const y = height(x, z); pos.setY(i, y);
    const c = cMud.clone().lerp(cDark, Math.min(1, Math.max(0, -y * .6))).lerp(cWet, rnd() * .25); col.push(c.r, c.g, c.b);
  }
  G.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); G.computeVertexNormals();
  scene.add(new THREE.Mesh(G, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  // puddles that catch the flares
  const pud = new THREE.MeshPhongMaterial({ color: 0x0a1610, specular: 0x9dffb0, shininess: 90, transparent: true, opacity: .92 });
  craters.slice(0, 16).forEach(([cx, cz, r]) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r * .45, 20), pud); m.rotation.x = -Math.PI / 2; m.position.set(cx, height(cx, cz) + .05, cz); scene.add(m); });

  // ---------- sandbags (instanced), planks, posts, wire ----------
  const bagGeo = new THREE.BoxGeometry(.62, .26, .36); const bagMat = new THREE.MeshLambertMaterial({ color: 0x8c805a, flatShading: true });
  const bags = []; const addBag = (x, y, z, ry) => bags.push([x, y, z, ry]);
  for (const [zc, dir] of [[T1, -1], [T2, 1]]) {
    for (let x = -26; x <= 26; x += .64) {
      const zt = zc + dir * 2.25, base = height(x, zt) + .1;
      for (let r = 0; r < 4; r++) addBag(x + (r % 2) * .32, base + r * .25, zt + (rnd() - .5) * .08, (rnd() - .5) * .2);
    }
  }
  const IB = new THREE.InstancedMesh(bagGeo, bagMat, bags.length); const dm = new THREE.Object3D();
  bags.forEach(([x, y, z, ry], i) => { dm.position.set(x, y, z); dm.rotation.set(0, ry, (rnd() - .5) * .08); dm.updateMatrix(); IB.setMatrixAt(i, dm.matrix); });
  scene.add(IB);
  const wood = new THREE.MeshLambertMaterial({ color: 0x544232, flatShading: true });
  for (const zc of [T1, T2]) for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(60, 1.6, .08), wood); p.position.set(0, -1.0, zc + s * 1.28); scene.add(p); }
  for (const zc of [T1, T2]) for (let x = -20; x <= 20; x += .9) { const d = new THREE.Mesh(new THREE.BoxGeometry(.8, .05, .9), wood); d.position.set(x, -1.72, zc); scene.add(d); }
  // a ladder up the front wall of our trench
  for (const lx of [-.42, .42]) { const r = new THREE.Mesh(new THREE.BoxGeometry(.06, 2.3, .06), wood); r.position.set(lx, -.7, T1 - 1.12); r.rotation.x = -.32; scene.add(r); }
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(.84, .05, .05), wood); r.position.set(0, -1.6 + i * .36, T1 - .82 - i * .12); scene.add(r); }
  const wireMat = new THREE.LineBasicMaterial({ color: 0x8a9a86, transparent: true, opacity: .8 });
  for (const zr of [22, 12.5, 1, -11, -18.5]) {
    const pts = [];
    for (let x = -34; x <= 34; x += 2.6) { const h = height(x, zr); const p = new THREE.Mesh(new THREE.BoxGeometry(.07, 1.3, .07), wood); p.position.set(x, h + .55, zr); p.rotation.z = (rnd() - .5) * .3; scene.add(p); }
    for (let x = -34; x <= 34; x += .08) { const a = x * 3.1; pts.push(new THREE.Vector3(x, height(x, zr) + .55 + Math.sin(a) * .32, zr + Math.cos(a) * .32)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    const top = []; for (let x = -34; x <= 34; x += 1.3) top.push(new THREE.Vector3(x, height(x, zr) + 1.15 + (rnd() - .5) * .1, zr));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(top), wireMat));
  }
  for (let i = 0; i < 26; i++) {
    const x = (rnd() - .5) * 64, z = 24 - rnd() * 46; if (Math.abs(x) < 3) continue;
    const h = rnd() < .3 ? 2.5 + rnd() * 3 : .4 + rnd() * .7;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(.06, .16, h, 6), wood); t.position.set(x, height(x, z) + h / 2, z); t.rotation.z = (rnd() - .5) * .35; scene.add(t);
    if (h > 2) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.03, .06, 1.2, 5), wood); b.position.set(x + .35, height(x, z) + h * .7, z); b.rotation.z = -1; scene.add(b); }
  }
  const helm = new THREE.MeshLambertMaterial({ color: 0x4a4d33, flatShading: true });
  for (let i = 0; i < 9; i++) { const x = (rnd() - .5) * 18, z = 20 - rnd() * 38; const h = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), helm); h.position.set(x, height(x, z) + .02, z); h.rotation.z = (rnd() - .5) * .8; scene.add(h); const br = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .02, 10), helm); br.position.copy(h.position); br.rotation.z = h.rotation.z; scene.add(br); }

  // ---------- the dugout: crates, the PC, a lantern, a field radio ----------
  const Y = -1.72, PZ = T2 - .95;
  const crateM = new THREE.MeshLambertMaterial({ color: 0x5a4630, flatShading: true });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, .62, .7), crateM); crate.position.set(0, Y + .31, PZ); scene.add(crate);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(.6, .45, .5), crateM); c2.position.set(1.15, Y + .22, PZ + .15); c2.rotation.y = .3; scene.add(c2);
  const radioM = new THREE.MeshLambertMaterial({ color: 0x3d4430, flatShading: true });
  const radio = new THREE.Mesh(new THREE.BoxGeometry(.36, .24, .2), radioM); radio.position.set(1.12, Y + .57, PZ + .14); radio.rotation.y = .3; scene.add(radio);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .7, 4), radioM); ant.position.set(1.22, Y + .98, PZ + .1); ant.rotation.z = -.25; scene.add(ant);
  const rled = new THREE.Mesh(new THREE.BoxGeometry(.03, .03, .01), new THREE.MeshBasicMaterial({ color: 0x5fe08a })); rled.position.set(1.06, Y + .6, PZ + .25); rled.rotation.y = .3; scene.add(rled);
  const beige = new THREE.MeshLambertMaterial({ color: 0x8f8668, emissive: 0x3a3424 }), beigeD = new THREE.MeshLambertMaterial({ color: 0x6f6850, emissive: 0x2a2519 });
  const TOP = Y + .62;
  const base = new THREE.Mesh(new THREE.BoxGeometry(.78, .14, .56), beige); base.position.set(0, TOP + .07, PZ - .02); scene.add(base);
  const MY = TOP + .14 + .3;
  const mon = new THREE.Mesh(new THREE.BoxGeometry(.66, .58, .56), beige); mon.position.set(0, MY, PZ - .06); scene.add(mon);
  const bez = new THREE.Mesh(new THREE.BoxGeometry(.56, .44, .02), beigeD); bez.position.set(0, MY + .03, PZ - .06 + .28); scene.add(bez);
  const SCW = 1024, SCH = 768, SW = .5, SH = .375;
  const sc = document.createElement('canvas'); sc.width = SCW; sc.height = SCH; const g = sc.getContext('2d');
  const tex = new THREE.CanvasTexture(sc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, MY + .03, PZ - .06 + .292); scene.add(screen);
  const kb = new THREE.Mesh(new THREE.BoxGeometry(.6, .035, .2), beigeD); kb.position.set(.02, TOP + .02, PZ + .3); kb.rotation.x = .06; scene.add(kb);
  const glow = new THREE.PointLight(0x5fe08a, .35, 4); glow.position.set(0, MY + .1, PZ + .9); scene.add(glow);
  const lant = new THREE.Mesh(new THREE.BoxGeometry(.12, .18, .12), new THREE.MeshBasicMaterial({ color: 0xffc27a })); lant.position.set(-.95, TOP + .1, PZ + .1); scene.add(lant);
  const lamp = new THREE.PointLight(0xffa860, 1.3, 4.5); lamp.position.set(-.95, TOP + .5, PZ + .3); scene.add(lamp);

  // ---------- particles: flares, artillery, smoke, mist, rain ----------
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const flares = [[-9, 3.4, 0], [11, 1.2, 1.3], [-3, -9, 2.4]].map(([x, z, d]) => {
    const L = new THREE.PointLight(0x7dff9a, 0, 70, 1.5); scene.add(L);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xb6ffc8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(1.6, 1.6, 1); scene.add(s);
    return { L, s, x, z, d, per: 6.5 + rnd() * 2 };
  });
  const art = new THREE.PointLight(0xffd6a0, 0, 140, 1.2); art.position.set(0, 6, -70); scene.add(art);
  const artSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffcf96, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); artSpr.scale.set(30, 12, 1); artSpr.position.set(0, 2, -78); scene.add(artSpr);
  let nextBoom = 1.2, boom = 0, boomX = 0, shake = 0;
  const smokeMat = new THREE.SpriteMaterial({ map: dot, color: 0x334036, transparent: true, opacity: .22, depthWrite: false });
  const smoke = []; for (let i = 0; i < 30; i++) { const s = new THREE.Sprite(smokeMat.clone()); const x = (rnd() - .5) * 50, z = 26 - rnd() * 52; s.position.set(x, height(x, z) + 1 + rnd() * 2, z); const k = 3 + rnd() * 5; s.scale.set(k, k * .7, 1); s.userData.v = .1 + rnd() * .25; scene.add(s); smoke.push(s); }
  // low mist: two drifting layers of soft noise
  const mistTex = (() => {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); const im = x.createImageData(N, N);
    const v = new Float32Array(N * N); for (const [k, a] of [[8, .55], [16, .3], [32, .15]]) { const gr = []; for (let i = 0; i <= k; i++) { gr.push([]); for (let j = 0; j <= k; j++) gr[i].push(rnd()); } for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) { const fx = xx / N * k, fy = y / N * k, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); const w = (gr[iy][ix] * (1 - sx) + gr[iy][(ix + 1) % k] * sx) * (1 - sy) + (gr[(iy + 1) % k][ix] * (1 - sx) + gr[(iy + 1) % k][(ix + 1) % k] * sx) * sy; v[y * N + xx] += w * a; } }
    for (let i = 0; i < N * N; i++) { const a = Math.max(0, Math.min(1, (v[i] - .42) * 2.6)); im.data[i * 4] = 190; im.data[i * 4 + 1] = 215; im.data[i * 4 + 2] = 198; im.data[i * 4 + 3] = a * 255; }
    x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); return t;
  })();
  const mists = [[-.05, .2], [.55, .12]].map(([yy, op], i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), new THREE.MeshBasicMaterial({ map: mistTex.clone(), transparent: true, opacity: op, depthWrite: false, color: 0x9fb9a5 })); m.material.map.repeat.set(4 + i * 2, 4 + i * 2); m.rotation.x = -Math.PI / 2; m.position.set(0, yy, -2); scene.add(m); return m; });
  const RN = LOW ? 700 : 1600, rp = new Float32Array(RN * 6);
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rainBase = []; for (let i = 0; i < RN; i++) rainBase.push([(rnd() - .5) * 26, rnd() * 9, (rnd() - .5) * 26]);
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fbfaa, transparent: true, opacity: .26 })); rain.frustumCulled = false; scene.add(rain);

  // ---------- searchlights behind the far line ----------
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { op: { value: .11 } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = -position.y / 90.; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float op; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float e = abs(dot(vN, vV)); float a = op * pow(1. - vY, 2.2) * smoothstep(.0, .7, e); gl_FragColor = vec4(vec3(.82, .95, .86) * a, a); }',
  });
  const beamGeo = new THREE.ConeGeometry(6, 90, 28, 1, true); beamGeo.translate(0, -45, 0);
  const beams = [[-17, -41, 0], [19, -44, 2.1]].map(([x, z, ph]) => {
    const p = new THREE.Group(); p.position.set(x, height(x, z) + 1.4, z); scene.add(p);
    const m = new THREE.Mesh(beamGeo, beamMat); p.add(m);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xe8fff0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(2.4, 2.4, 1); s.position.copy(p.position); scene.add(s);
    return { p, ph };
  });
  const DOWN = new THREE.Vector3(0, -1, 0), tmpD = new THREE.Vector3();

  // ---------- tracers ----------
  const tracers = Array.from({ length: 14 }, (_, i) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: i % 3 ? 0xffc27a : 0xb6ffc8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    l.frustumCulled = false; scene.add(l); return { l, geo, a: new THREE.Vector3(), v: new THREE.Vector3(), t0: -1 };
  });
  let nextBurst = 2, ti = 0;
  function burst(at) {
    const x0 = (rnd() - .5) * 46, a = new THREE.Vector3(x0, height(x0, -29) + 1.1, -29), aim = new THREE.Vector3(x0 + (rnd() - .5) * 34, 2.5 + rnd() * 8, 34 + rnd() * 20);
    const v = aim.sub(a).normalize().multiplyScalar(68), n = 3 + (rnd() * 4 | 0);
    for (let k = 0; k < n; k++) { const tr = tracers[ti++ % tracers.length]; tr.a.copy(a); tr.v.copy(v).add(new THREE.Vector3((rnd() - .5) * 1.5, (rnd() - .5) * 1.2, 0)); tr.t0 = at + k * .085; }
  }

  // ---------- the near miss: a shell lands beside you halfway across ----------
  const DN = LOW ? 140 : 320, dpos = new Float32Array(DN * 3), dvel = new Float32Array(DN * 3);
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const debris = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: 0x2a2118, size: .26, map: dot, transparent: true, opacity: 0, depthWrite: false })); debris.frustumCulled = false; scene.add(debris);
  const SN = 70, spos = new Float32Array(SN * 3), svel = new Float32Array(SN * 3);
  const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  const sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xffb26b, size: .3, map: dot, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); sparks.frustumCulled = false; scene.add(sparks);
  const exL = new THREE.PointLight(0xffa860, 0, 46, 1.3); scene.add(exL);
  const puffs = Array.from({ length: 10 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0x4a4a3c, transparent: true, opacity: 0, depthWrite: false })); scene.add(s); return s; });
  const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffb070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(fire);
  let exT = -1; const exP = new THREE.Vector3();
  function explode(p) {
    exT = t; exP.copy(p); exL.position.set(p.x, p.y + 1.2, p.z);
    for (let i = 0; i < DN; i++) { const a = rnd() * Math.PI * 2, up = 4 + rnd() * 9, out = 1 + rnd() * 5; dpos.set([p.x, p.y + .2, p.z], i * 3); dvel.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3); }
    for (let i = 0; i < SN; i++) { const a = rnd() * Math.PI * 2, up = 3 + rnd() * 7, out = 2 + rnd() * 6; spos.set([p.x, p.y + .3, p.z], i * 3); svel.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3); }
    puffs.forEach((s, i) => { s.position.set(p.x + (rnd() - .5) * 1.6, p.y + .4 + i * .45, p.z + (rnd() - .5) * 1.6); s.userData.k = .8 + rnd() * .9; });
    fire.position.set(p.x, p.y + 1, p.z);
    shake = 1.4; post.flash.value = .5; post.ca.value = 3.2;
    const s = SND(); if (s) { s.boom(1); s.muffle(1.9); }
  }

  // ---------- lightning far away ----------
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xe6fff0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); bolt.frustumCulled = false; scene.add(bolt);
  let nextBolt = 6 + rnd() * 4, boltT = -1;
  function strike() {
    const bx = (rnd() - .5) * 160, arr = boltGeo.attributes.position.array; let x = bx, y = 70;
    for (let i = 0; i < 18; i++) { arr.set([x, y, -150], i * 3); x += (rnd() - .5) * 9; y -= 70 / 17; }
    boltGeo.attributes.position.needsUpdate = true; boltT = t;
    const s = SND(); if (s) s.boom(.12, 1.4 + rnd() * 1.2);
  }

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

  // ---------- the CRT ----------
  const S = { lines: [], input: null, hint: false, warp: 0, phase: 'off', dirty: true, blink: true, on: 0 };
  const wb = document.createElement('canvas'); wb.width = SCW; wb.height = SCH; const wg = wb.getContext('2d');
  const GR = '#5fe08a', GD = '#2f8f52', GB = '#b6ffc8';
  const FS = LOW ? 44 : 34, LH = LOW ? 60 : 50, LX = LOW ? 46 : 58;
  const COARSE = matchMedia('(pointer: coarse)').matches;
  function draw() {
    const rg = g.createRadialGradient(SCW / 2, SCH / 2, 80, SCW / 2, SCH / 2, SCW * .72); rg.addColorStop(0, '#0f2216'); rg.addColorStop(1, '#040906');
    g.fillStyle = rg; g.fillRect(0, 0, SCW, SCH);
    if (S.phase === 'off') { tex.needsUpdate = true; S.dirty = false; return; }
    g.font = '500 ' + FS + 'px JB, ui-monospace, Menlo, monospace'; g.textBaseline = 'top';
    let y = 50;
    for (const l of S.lines) { if (!l.t && !l.ok) { y += LH; continue; } g.fillStyle = 'rgba(95,224,138,.28)'; g.fillText(l.t, LX + 1, y + 1); g.fillStyle = l.c || GR; g.fillText(l.t, LX, y); if (l.ok) { const w = g.measureText(l.t).width; g.fillStyle = GB; g.fillText(l.ok, LX + w, y); } y += LH; }
    if (S.input != null) { const pre = 'callsign: '; g.fillStyle = GR; g.fillText(pre + S.input, LX, y); const w = g.measureText(pre + S.input).width; if (S.blink) g.fillRect(LX + 2 + w, y + 2, Math.round(FS * .55), FS + 1); }
    else if (S.phase !== 'push' && S.lines.length && S.blink) { const L = S.lines[S.lines.length - 1]; g.fillStyle = GR; g.fillRect(LX + g.measureText(L.t + (L.ok || '')).width + 4, 50 + (S.lines.length - 1) * LH + 2, Math.round(FS * .55), FS + 1); }
    if (S.hint) { g.font = '400 ' + (LOW ? 30 : 23) + 'px JB, ui-monospace, monospace'; g.fillStyle = GD; g.fillText(COARSE ? 'tap the screen to enter ↵' : 'type a callsign or press enter ↵', LX, SCH - (LOW ? 118 : 104)); }
    g.fillStyle = '#123a22'; g.fillRect(0, SCH - 54, SCW, 54);
    g.font = '500 21px JB, ui-monospace, monospace'; g.fillStyle = GR;
    g.fillText('.trench · line 7 · solana mainnet', 28, SCH - 40);
    const d = new Date(), clk = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
    g.fillText(clk, SCW - 28 - g.measureText(clk).width, SCH - 40);
    g.fillStyle = 'rgba(0,0,0,.24)'; for (let yy = 0; yy < SCH; yy += 3) g.fillRect(0, yy, SCW, 1);
    if (S.on < 1) { g.fillStyle = 'rgba(4,9,6,' + (1 - S.on).toFixed(3) + ')'; g.fillRect(0, 0, SCW, SCH); g.fillStyle = 'rgba(182,255,200,' + (S.on * (1 - S.on) * 2).toFixed(3) + ')'; g.fillRect(0, SCH / 2 - 2 - S.on * SCH / 2, SCW, 4 + S.on * SCH); }
    const W = S.warp;
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
    tex.needsUpdate = true; S.dirty = false;
  }
  const touch = () => { S.dirty = true; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function typeLine(text, c, ms) { const l = { t: '', c }; S.lines.push(l); for (let i = 1; i <= text.length; i++) { if (ended) return l; l.t = text.slice(0, i); touch(); await sleep(ms); } return l; }
  let submit = null, idleT = 0, typedAny = false;
  function armIdle(ms) { clearTimeout(idleT); idleT = setTimeout(autoLogin, ms); }
  let autoTyping = false;
  async function autoLogin() { if (S.input == null || !submit) return; if (!typedAny) { let saved = 'anon'; try { saved = localStorage.getItem('trench:callsign') || 'anon'; } catch (_) { } autoTyping = true; for (const ch of saved) { if (S.input == null || !autoTyping) return; S.input += ch; touch(); await sleep(80); } await sleep(160); if (!autoTyping) return; autoTyping = false; } if (submit) submit(); }
  function onKey(e) {
    if (ended || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!entered) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); } return; }
    if (S.input == null) return;
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(idleT); if (!S.input) { typedAny = false; autoLogin(); } else if (submit) submit(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); S.input = S.input.slice(0, -1); touch(); window.__trenchHold = Date.now(); armIdle(2600); return; }
    if (e.key.length === 1 && /[a-zA-Z0-9_]/.test(e.key) && (S.input.length < 12 || autoTyping)) { e.preventDefault(); if (autoTyping) { autoTyping = false; S.input = ''; } typedAny = true; S.input += e.key.toLowerCase(); touch(); window.__trenchHold = Date.now(); armIdle(2600); }
  }
  const onClick = e => { if (e.target.closest && e.target.closest('#introSkip, #introGate')) return; if (S.input != null) { clearTimeout(idleT); if (S.input) submit && submit(); else autoLogin(); } };
  addEventListener('keydown', onKey, true); box.addEventListener('click', onClick);

  // the CRT reads the real pump.fun stream state: no invented numbers
  function streamLine() {
    const ts = window.TS && window.TS.status ? window.TS.status() : null;
    if (!ts) return null;
    if (ts.state === 'live') return ['live · ' + ts.perMin + ' new coins since you got here', GB];
    return [ts.state === 'down' ? 'reconnecting' : 'connecting', GD];
  }
  async function script() {
    S.phase = 'boot'; touch();
    for (let k = 0; k <= 12; k++) { S.on = k / 12; touch(); await sleep(28); }
    await typeLine('.trench os · line 7', GB, 18);
    await typeLine(LOW ? 'own the trenches.' : 'live calls · the basket · the board', GD, 10);
    S.lines.push({ t: '' }); touch(); await sleep(120); if (ended) return;
    S.input = ''; S.hint = true; touch();
    const name = await new Promise(res => { submit = () => { submit = null; clearTimeout(idleT); res(S.input || 'anon'); }; armIdle(1700); });
    const user = setUser(name); window.__trenchHold = Date.now() + 5000;
    S.lines.push({ t: 'callsign: ' + S.input }); S.input = null; S.hint = false; touch();
    const au = await typeLine('radio check… ', GR, 9); await sleep(260); au.ok = 'clear'; touch();
    const st = await typeLine(LOW ? 'pump stream… ' : 'pump.fun stream… ', GR, 9);
    for (let i = 0; i < 6; i++) { const r = streamLine(); if (!r || r[0].startsWith('live')) break; await sleep(250); }
    const r = streamLine(); st.ok = r ? (LOW && r[0].startsWith('live') ? 'live' : r[0]) : 'offline'; touch(); await sleep(200);
    await typeLine('welcome to the trenches, ' + user + '.', GB, 22);
    await sleep(320); push();
  }

  // ---------- subtitles ----------
  const subEl = $('#introSub'); let subTok = 0;
  async function sub(text, hold) {
    if (!subEl) return; const k = ++subTok; subEl.textContent = ''; subEl.classList.add('on');
    for (let i = 1; i <= text.length; i++) { if (k !== subTok || ended) return; subEl.textContent = text.slice(0, i); await sleep(26); }
    await sleep(hold || 2000); if (k === subTok) subEl.classList.remove('on');
  }
  const SUBS = [[.04, '03:14. line 7. the radio still works.'], [.3, 'out there, a new coin is born every few seconds.'], [.6, 'most of them won’t see the sun.'], [.83, 'the terminal is in the far trench.']];
  let subI = 0;

  // ---------- camera ----------
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -.55, T1 + .1), new THREE.Vector3(0, .9, T1 - .7), new THREE.Vector3(.2, 1.75, T1 - 4.5),
    new THREE.Vector3(.9, 1.7, 18), new THREE.Vector3(-.6, 1.8, 7), new THREE.Vector3(.5, 1.75, -5), new THREE.Vector3(0, 1.6, -15),
    new THREE.Vector3(0, .9, T2 + 3.4), new THREE.Vector3(0, -.32, T2 + 1.05),
  ], false, 'centripetal');
  const vfov = cam.fov * Math.PI / 180;
  const fitDist = frac => { const a = innerWidth / innerHeight; const hv = (SH / 2) / Math.tan(vfov / 2), hh = (SW / 2) / (Math.tan(vfov / 2) * a); return Math.max(hv, hh) / frac; };
  const readPos = () => new THREE.Vector3(0, screen.position.y + .01, screen.position.z + fitDist(innerWidth < innerHeight ? .95 : .62));
  const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const TRAVEL = LOW ? 8.2 : 9.0, SWOOP = 3.8, E0 = .085;
  const capEl = $('#introCap');
  let nf = 0, fps0 = 0, raf = 0, t = 0, last = 0, pushT = -1, booted = false, lastBlink = 0, lastClock = 0, flashed = false, capShown = 0;
  let phase = 'gate', swT = 0, trT = 0, missed = false, radioHalf = false;
  const swFrom = new THREE.Vector3(), lookFrom = new THREE.Vector3(), look = new THREE.Vector3(0, 0, 2), P0 = path.getPointAt(E0), A0 = path.getPointAt(E0 + .06), L0 = new THREE.Vector3(A0.x, A0.y - .15, A0.z - 2);
  const orbit = tt => { const a = .5 + tt * .03; return new THREE.Vector3(Math.sin(a) * 30, 13 + Math.sin(tt * .2) * 1.2, 6 + Math.cos(a) * 30); };
  goFn = () => { if (phase !== 'gate') return; phase = 'swoop'; swT = t; swFrom.copy(cam.position); lookFrom.copy(look); };
  function push() { if (pushT < 0) { pushT = t; S.phase = 'push'; window.__trenchHold = Date.now() + 2500; const s = SND(); if (s) s.whoosh(); } }
  const tmpL = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function frame() { try { step() } catch (err) { try { console.warn('intro frame:', err && err.message) } catch (_) { } if (!ended) raf = requestAnimationFrame(frame) } }
  function step() {
    const now = performance.now(); const dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now; t += dt;
    if (++nf === 45) { const ms = (now - fps0) / 45; if (ms > 110) return finish(true); if (ms > 45) { usePost = false; DPR = 1; renderer.setPixelRatio(1); onResize(); } }
    post.fade.value = Math.min(1, post.fade.value + dt * .8); post.time.value = t; skyU.time.value = t;
    // weather + war
    for (const f of flares) {
      const ph = ((t + f.d) % f.per) / f.per, up = Math.min(1, ph / .12), fall = Math.max(0, (ph - .12) / .88);
      const y = 2 + up * 16 - fall * 13, flick = .85 + .15 * Math.sin(t * 37 + f.d * 9) * Math.sin(t * 13);
      const I = (ph < .12 ? up * 110 : 110 * (1 - fall * fall)) * flick;
      f.L.position.set(f.x + Math.sin(t * .4 + f.d) * 1.5, y, f.z); f.L.intensity = I; f.s.position.copy(f.L.position); f.s.material.opacity = Math.min(1, I / 50);
    }
    if (t > nextBoom) { boom = 1; boomX = (rnd() - .5) * 90; nextBoom = t + 1.1 + rnd() * 2.2; if (rnd() < .45) shake = Math.max(shake, .5); const s = SND(); if (s && entered) s.boom(.06 + rnd() * .12, Math.min(1.6, Math.hypot(boomX - cam.position.x, -78 - cam.position.z) / 90)); }
    boom *= Math.pow(.02, dt); shake *= Math.pow(.05, dt);
    art.intensity = boom * 260; art.position.x = boomX; artSpr.position.x = boomX; artSpr.material.opacity = boom * .9;
    skyU.glow.value = boom * 1.4; skyU.bd.value.set(boomX - cam.position.x, 4, -78 - cam.position.z).normalize();
    if (t > nextBolt) { strike(); nextBolt = t + 9 + rnd() * 8; }
    const bk = boltT < 0 ? 0 : t - boltT, lit = bk < .45 ? (bk < .06 ? 1 : bk < .12 ? .25 : bk < .2 ? .8 : Math.max(0, 1 - (bk - .2) / .25) * .5) : 0;
    skyU.lit.value = lit; bolt.material.opacity = bk < .3 ? lit : 0; moon.intensity = 1.1 + lit * 2.2;
    hemi.intensity = 1.5 + boom * .8 + lit * 1.4;
    for (const s of smoke) { s.position.y += s.userData.v * dt * .3; s.position.x += .08 * dt; if (s.position.y > 6) s.position.y = 1; }
    mists.forEach((m, i) => { m.material.map.offset.set(t * (.004 + i * .003), t * .002 * (i ? -1 : 1)); });
    for (let i = 0; i < RN; i++) { const b = rainBase[i]; let y = (b[1] - t * 14) % 9; if (y < 0) y += 9; const x = cam.position.x + b[0], z = cam.position.z + b[2], yy = cam.position.y - 3 + y; rp.set([x, yy, z, x + .02, yy + .34, z], i * 6); }
    rainGeo.attributes.position.needsUpdate = true;
    for (const b of beams) { const a = Math.sin(t * .21 + b.ph) * .55, e = .42 + Math.sin(t * .33 + b.ph * 2) * .14; tmpD.set(Math.sin(a), e, Math.cos(a)).normalize(); b.p.quaternion.setFromUnitVectors(DOWN, tmpD); }
    if (t > nextBurst) { burst(t); nextBurst = t + 1.2 + rnd() * 2.6; }
    for (const tr of tracers) {
      const age = t - tr.t0; if (tr.t0 < 0 || age < 0 || age > 1.5) { tr.l.material.opacity = 0; continue; }
      const p = tr.geo.attributes.position.array; tmpA.copy(tr.a).addScaledVector(tr.v, age); tmpB.copy(tmpA).addScaledVector(tr.v, -.045);
      p[0] = tmpA.x; p[1] = tmpA.y; p[2] = tmpA.z; p[3] = tmpB.x; p[4] = tmpB.y; p[5] = tmpB.z; tr.geo.attributes.position.needsUpdate = true; tr.l.material.opacity = Math.min(1, 1.5 - age);
    }
    if (exT >= 0) {
      const ea = t - exT; exL.intensity = 900 * Math.exp(-ea * 7);
      const gy = -9.8 * dt;
      for (let i = 0; i < DN; i++) { const j = i * 3; if (dpos[j + 1] < exP.y - .1 && dvel[j + 1] < 0) continue; dvel[j + 1] += gy; dpos[j] += dvel[j] * dt; dpos[j + 1] += dvel[j + 1] * dt; dpos[j + 2] += dvel[j + 2] * dt; }
      for (let i = 0; i < SN; i++) { const j = i * 3; svel[j + 1] += gy * .6; spos[j] += svel[j] * dt; spos[j + 1] += svel[j + 1] * dt; spos[j + 2] += svel[j + 2] * dt; }
      dGeo.attributes.position.needsUpdate = true; sGeo.attributes.position.needsUpdate = true;
      debris.material.opacity = ea < 3 ? 1 : Math.max(0, 1 - (ea - 3)); sparks.material.opacity = Math.max(0, 1 - ea / 1.3);
      puffs.forEach((s, i) => { const k = Math.min(1, ea / 4), sz = (1.2 + Math.sqrt(k) * 7) * s.userData.k; s.scale.set(sz, sz * .85, 1); s.position.y += dt * (.9 - k * .6); s.material.opacity = ea < .15 ? ea * 5 : Math.max(0, .75 * (1 - k)); s.material.color.setHex(ea < .5 ? 0x8a6a48 : 0x4a4a3c); });
      { const fk = Math.min(1, ea / .22), fz = 2 + fk * 7; fire.scale.set(fz, fz * .8, 1); fire.material.opacity = Math.max(0, 1 - ea / .75); }
      if (ea > 5) exT = -1;
    }
    post.flash.value *= Math.pow(.004, dt); post.ca.value = .8 + (post.ca.value - .8) * Math.pow(.05, dt);
    // camera
    const R = readPos();
    if (phase === 'gate') {
      cam.position.copy(orbit(t)); look.set(0, -1, 2); cam.lookAt(look);
    } else if (phase === 'swoop') {
      const k = Math.min(1, (t - swT) / SWOOP), e = eio(k);
      const C = tmpA.set(swFrom.x * .25, 9.5, (swFrom.z + P0.z) / 2 + 9);
      cam.position.set(0, 0, 0).addScaledVector(swFrom, (1 - e) * (1 - e)).addScaledVector(C, 2 * e * (1 - e)).addScaledVector(P0, e * e);
      look.copy(lookFrom).lerp(L0, eio(Math.min(1, k * 1.15))); cam.lookAt(look);
      cam.position.x += (rnd() - .5) * shake * .1; cam.position.y += (rnd() - .5) * shake * .1;
      if (k >= 1) { phase = 'travel'; trT = t; }
    } else if (pushT < 0) {
      const k = Math.max(0, Math.min(1, (t - trT) / TRAVEL)) || 0, e = Math.max(0, Math.min(1, E0 + (1 - E0) * k * k * (3 - 2 * k)));
      const P = path.getPointAt(e); cam.position.copy(P);
      const ahead = path.getPointAt(Math.min(1, e + .06)); tmpL.set(ahead.x, ahead.y - .15, ahead.z - 2);
      const nearEnd = Math.max(0, (k - .82) / .18);
      tmpL.lerp(screen.position, eio(nearEnd));
      if (k >= 1) { const kk = Math.min(1, (t - trT - TRAVEL) / .9); cam.position.lerp(R, eio(kk)); if (!booted) { booted = true; box.classList.remove('cine'); const s = SND(); if (s) s.radio(1, 3); script(); } }
      if (!missed && e > .47) { missed = true; tmpA.set(P.x + 2.8, 0, P.z - 8.5); tmpA.y = height(tmpA.x, tmpA.z); explode(tmpA); }
      if (!radioHalf && k > .72) { radioHalf = true; const s = SND(); if (s) s.radio(.45, 3); }
      while (subI < SUBS.length && e >= SUBS[subI][0]) { sub(SUBS[subI][1], 1900); subI++; }
      cam.position.y += Math.sin(t * 6.2) * .025 * (1 - nearEnd) + (rnd() - .5) * shake * .14; cam.position.x += (rnd() - .5) * shake * .14;
      cam.lookAt(k >= 1 ? screen.position : tmpL);
      if (shake > .3) cam.rotation.z += (rnd() - .5) * shake * .02;
      if (capEl) { const c = k < .02 ? 0 : k < .55 ? 1 : 0; if (c !== capShown) { capShown = c; capEl.classList.toggle('on', !!c); } }
    } else {
      const k = Math.min(1, (t - pushT) / .9), e = Math.pow(k, 2.6);
      cam.position.lerpVectors(R, tmpA.set(0, screen.position.y, screen.position.z + .03), e); cam.lookAt(screen.position);
      cam.fov = 56 + 14 * e; cam.updateProjectionMatrix();
      S.warp = Math.min(1, Math.pow(k, 1.6)); touch(); post.ca.value = .8 + e * 6;
      if (k > .78 && !flashed) { flashed = true; box.classList.add('flash-on'); }
      if (k >= 1) { draw(); render(); return finish(false); }
    }
    sky.position.copy(cam.position);
    glow.intensity = .3 + Math.sin(t * 9) * .03 + (S.phase !== 'off' ? .25 : 0);
    rled.material.color.setHex(Math.sin(t * 5) > 0 ? 0x5fe08a : 0x1d4a2c);
    if (now - lastBlink > 530) { lastBlink = now; S.blink = !S.blink; touch(); }
    if (now - lastClock > 1000) { lastClock = now; touch(); }
    if (S.dirty) draw();
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
    cancelAnimationFrame(raf); clearTimeout(idleT); subTok++;
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
