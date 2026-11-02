/* .trench · the sound of the trench walk: rain, distant artillery, near blasts, dirt falling, boots on duckboards.
   no music. everything is synthesized live with Web Audio and only starts after a click with sound on. */
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const L = []; const emit = () => L.forEach(f => { try { f(api.on) } catch (_) { } });
  let pref = 'on'; try { pref = localStorage.getItem('trench:sound') || 'on' } catch (_) { }
  let ctx = null, master, comp, lim, muf, sfx, rev, rainG, rumbleG, noise, vol = .95, tag = null;

  function build() {
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = 0;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = .005; comp.release.value = .25;
    lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .002; lim.release.value = .1;
    muf = ctx.createBiquadFilter(); muf.type = 'lowpass'; muf.frequency.value = 16000; muf.Q.value = .5;
    sfx = ctx.createGain(); sfx.connect(muf); muf.connect(master); master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // an outdoor slap-back for the blasts
    rev = ctx.createConvolver(); const n = ctx.sampleRate * 2.6 | 0, ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * .2; d[i] = lp * Math.pow(1 - i / n, 3) } }
    rev.buffer = ir; const rg = ctx.createGain(); rg.gain.value = .35; rev.connect(rg); rg.connect(muf);
    // rain on mud and helmets
    const rs = ctx.createBufferSource(); rs.buffer = noise; rs.loop = true;
    const rb = ctx.createBiquadFilter(); rb.type = 'bandpass'; rb.frequency.value = 2400; rb.Q.value = .4;
    rainG = ctx.createGain(); rainG.gain.value = 0; rs.connect(rb); rb.connect(rainG); rainG.connect(sfx); rs.start();
    // the front: a low rumble that never stops
    const ru = ctx.createBufferSource(); ru.buffer = noise; ru.loop = true; ru.playbackRate.value = .5;
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 110;
    rumbleG = ctx.createGain(); rumbleG.gain.value = 0; ru.connect(rl); rl.connect(rumbleG); rumbleG.connect(sfx); ru.start();
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (api.on) ctx.resume() });
  }
  function src(t, off, dur) { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, off == null ? Math.random() * 1.9 : off); s.stop(t + dur); return s }
  function unlock() { // iOS: a playing media element moves Web Audio off the ringer channel
    try { if (!tag) { tag = new Audio('data:audio/wav;base64,UklGRgAGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YdwFAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA='); tag.loop = true; tag.setAttribute('playsinline', ''); tag.volume = .01 } const p = tag.play(); if (p && p.catch) p.catch(() => { }) } catch (_) { }
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => addEventListener(ev, () => { if (ctx && api.on && ctx.state !== 'running') { ctx.resume(); unlock() } }, { passive: true }));

  const api = {
    ok: !!AC, on: false, started: false, pref,
    start() {
      if (!AC) return false;
      if (!ctx) build();
      if (ctx.state !== 'running') ctx.resume();
      unlock();
      if (!api.started) { api.started = true; const t = ctx.currentTime; rainG.gain.setTargetAtTime(.06, t, 1); rumbleG.gain.setTargetAtTime(.5, t, 1.5) }
      api.set(true); return true;
    },
    set(on) {
      api.on = !!on; api.pref = on ? 'on' : 'off'; try { localStorage.setItem('trench:sound', api.pref) } catch (_) { }
      if (ctx) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(on ? vol : 0, t + (on ? 1 : .4)); if (on && ctx.state !== 'running') ctx.resume() }
      emit();
    },
    toggle() { if (!api.started) return api.start(); api.set(!api.on) },
    stop(sec) { // the war stays outside: everything fades as you go into the PC
      if (!ctx) return; const t = ctx.currentTime, d = sec || 2; api.on = false; emit();
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + d);
      setTimeout(() => { api.started = false; try { tag && tag.pause() } catch (_) { } try { ctx.suspend() } catch (_) { } }, d * 1000 + 300);
    },
    boom(near, delay) { // near: 0 far on the horizon … 1 right over the parapet
      if (!ctx || !api.on) return; const t = ctx.currentTime + (delay || 0), k = Math.max(0, Math.min(1, near));
      const s = src(t, null, 5), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(140 + k * 2600, t); f.frequency.exponentialRampToValueAtTime(80 + k * 300, t + 1.5);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12 + k * .9, t + .01 + (1 - k) * .08); g.gain.exponentialRampToValueAtTime(.0001, t + 1.2 + (1 - k) * 2.5);
      s.connect(f); f.connect(g); g.connect(sfx); const w = ctx.createGain(); w.gain.value = .6; g.connect(w); w.connect(rev);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(26, t + 1.4); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.12 + k * .55, t + .02); og.gain.exponentialRampToValueAtTime(.0001, t + 1.8); o.connect(og); og.connect(sfx); o.start(t); o.stop(t + 1.9);
      if (k > .45) { const c = src(t, null, .25), cf = ctx.createBiquadFilter(), cg = ctx.createGain(); cf.type = 'highpass'; cf.frequency.value = 700; cg.gain.setValueAtTime(.55 * k, t); cg.gain.exponentialRampToValueAtTime(.0001, t + .12); c.connect(cf); cf.connect(cg); cg.connect(sfx); api.patter(k, (delay || 0) + .35) }
    },
    patter(k, delay) { // dirt and stones coming down after a close one
      if (!ctx || !api.on) return; const t0 = ctx.currentTime + (delay || 0), n = 10 + (k * 30 | 0);
      for (let i = 0; i < n; i++) { const t = t0 + Math.pow(Math.random(), 1.6) * 1.6, s = src(t, null, .06), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 2500; f.Q.value = 1.2; g.gain.setValueAtTime(.05 + Math.random() * .12 * k, t); g.gain.exponentialRampToValueAtTime(.0001, t + .04); s.connect(f); f.connect(g); g.connect(sfx) }
    },
    step(heavy) { // a boot on a wet duckboard
      if (!ctx || !api.on) return; const t = ctx.currentTime, s = src(t, null, .18), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 420 + Math.random() * 160; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(heavy ? .28 : .2, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + .14); s.connect(f); f.connect(g); g.connect(sfx);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(95 + Math.random() * 20, t); o.frequency.exponentialRampToValueAtTime(55, t + .1); og.gain.setValueAtTime(.12, t); og.gain.exponentialRampToValueAtTime(.0001, t + .12); o.connect(og); og.connect(sfx); o.start(t); o.stop(t + .13);
    },
    muffle(sec) { // ringing ears after a near miss
      if (!ctx) return; const t = ctx.currentTime; muf.frequency.cancelScheduledValues(t); muf.frequency.setTargetAtTime(300, t, .02); muf.frequency.setTargetAtTime(16000, t + (sec || 1.5), .6);
      if (!api.on) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 3900; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.012, t + .08); g.gain.exponentialRampToValueAtTime(.0001, t + 2.6); o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.7);
    },
    whoosh() {
      if (!ctx || !api.on) return; const t = ctx.currentTime, s = src(t, 0, 1.6), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.Q.value = 1.3; f.frequency.setValueAtTime(240, t); f.frequency.exponentialRampToValueAtTime(5000, t + .95); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.3, t + .8); g.gain.exponentialRampToValueAtTime(.0001, t + 1.5); s.connect(f); f.connect(g); g.connect(sfx);
    },
    radio() { }, site() { },
    onChange(fn) { L.push(fn) },
  };
  window.TRS = api;
})();
