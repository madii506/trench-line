/* .trench · "line 7", a calm waltz for the trenches. every note is synthesized live in the browser (Web Audio), nothing is downloaded.
   3/4 at 72 bpm in A minor: a music box over a harmonium, a felt harp and an upright bass, heard first through a far-off field radio
   with rain and record crackle. the radio clears as you reach the dugout; the melody arrives as you land on the line. */
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const L = []; const emit = () => L.forEach(f => { try { f(api.on) } catch (_) { } });
  let pref = 'on'; try { pref = localStorage.getItem('trench:sound') || 'on' } catch (_) { }
  let ctx = null, master, comp, music, hp, lp, peak, muf, rev, revIn, sfx, rainG, noise, timer = 0, beat = 0, nextT = 0, startBar = 0, crackleRate = 6, crackT = 0, vol = .9;
  const BPM = 72, SPB = 60 / BPM;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // two-bar blocks: [bass root, harmonium chord, harp tones]
  const CH = [
    [45, [57, 60, 64, 71], [69, 72, 76, 79]],   // Am(add9)
    [41, [53, 57, 60, 64], [65, 69, 72, 76]],   // Fmaj7
    [40, [55, 60, 64, 67], [67, 72, 76, 79]],   // C/E
    [40, [52, 55, 59, 62], [64, 67, 71, 74]],   // Em7
    [38, [50, 53, 57, 60], [62, 65, 69, 72]],   // Dm7
    [48, [57, 60, 64, 69], [69, 72, 76, 81]],   // Am/C
    [41, [53, 57, 60, 65], [65, 69, 72, 77]],   // F
    [40, [52, 56, 59, 62], [64, 68, 71, 74]],   // E7
  ];
  // the tune: [song beat, midi, beats]
  const MEL = [
    [0, 76, 1], [1, 81, 1], [2, 83, 1], [3, 84, 2], [5, 83, 1],
    [6, 81, 1.5], [7.5, 79, .5], [8, 77, 1], [9, 76, 3],
    [12, 79, 1], [13, 84, 1], [14, 86, 1], [15, 88, 2], [17, 86, 1],
    [18, 83, 1.5], [19.5, 81, .5], [20, 79, 1], [21, 83, 3],
    [24, 77, 1], [25, 81, 1], [26, 84, 1], [27, 86, 2], [29, 84, 1],
    [30, 88, 1.5], [31.5, 86, .5], [32, 84, 1], [33, 81, 3],
    [36, 84, 1], [37, 81, 1], [38, 77, 1], [39, 79, 2], [41, 81, 1],
    [42, 80, 1], [43, 83, 1], [44, 86, 1], [45, 88, 3],
  ];

  function build() {
    ctx = new AC({ latencyHint: 'playback' });
    master = ctx.createGain(); master.gain.value = 0;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .3;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = .002; lim.release.value = .12;
    muf = ctx.createBiquadFilter(); muf.type = 'lowpass'; muf.frequency.value = 16000; muf.Q.value = .5;
    master.connect(comp); comp.connect(lim); lim.connect(ctx.destination); muf.connect(master);
    // the radio: band-limited with a honky mid peak, opening up to full range
    music = ctx.createGain(); music.gain.value = 1.7; hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 340; lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = .9;
    peak = ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 1100; peak.Q.value = 1.1; peak.gain.value = 5;
    music.connect(hp); hp.connect(peak); peak.connect(lp); lp.connect(muf);
    // a small dark room
    rev = ctx.createConvolver(); const n = ctx.sampleRate * 3.2 | 0, ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lpv = 0; for (let i = 0; i < n; i++) { lpv += ((Math.random() * 2 - 1) - lpv) * .35; d[i] = lpv * Math.pow(1 - i / n, 2.6) } }
    rev.buffer = ir; revIn = ctx.createGain(); revIn.gain.value = .32; revIn.connect(rev); rev.connect(lp);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(muf);
    const sfxRev = ctx.createGain(); sfxRev.gain.value = .3; sfx.connect(sfxRev); sfxRev.connect(rev);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // rain bed
    const rs = ctx.createBufferSource(); rs.buffer = noise; rs.loop = true;
    const rb = ctx.createBiquadFilter(); rb.type = 'bandpass'; rb.frequency.value = 2600; rb.Q.value = .35;
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 7000;
    rainG = ctx.createGain(); rainG.gain.value = 0; rs.connect(rb); rb.connect(rl); rl.connect(rainG); rainG.connect(sfx); rs.start();
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (api.on) ctx.resume() });
  }
  const env = (g, t, a, peakV, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peakV, t + a); g.gain.setTargetAtTime(0, t + a, d / 4) };
  function pan(node, p) { if (!ctx.createStereoPanner) return node; const s = ctx.createStereoPanner(); s.pan.value = p; node.connect(s); return s }
  function out(node, wet) { node.connect(music); if (wet) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(revIn) } }
  function box(t, m, v) { // music-box tine: a bright fundamental and quick inharmonic partials
    const f = mtof(m), bus = ctx.createGain(); bus.gain.value = v; const p = pan(bus, (Math.random() - .5) * .5); out(p, 1.1);
    [[1, 1, 2.4], [1.0018, .45, 2.0], [2, .16, .9], [5.4, .07, .3], [8.9, .025, .16]].forEach(([k, a, d]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * k; const g = ctx.createGain(); env(g, t, .002, a, d); o.connect(g); g.connect(bus); o.start(t); o.stop(t + d + .3);
    });
  }
  function harp(t, m, v, dur) { // felt harp / soft piano
    const f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f / 2; fl.type = 'lowpass'; fl.frequency.setValueAtTime(2400, t); fl.frequency.setTargetAtTime(700, t, .25);
    const g2 = ctx.createGain(); g2.gain.value = .35; o2.connect(g2); g2.connect(fl); o.connect(fl); fl.connect(g); env(g, t, .006, v, dur || 1.8);
    out(pan(g, (Math.random() - .5) * .7), .8); o.start(t); o2.start(t); o.stop(t + (dur || 1.8) + .5); o2.stop(t + (dur || 1.8) + .5);
  }
  function bass(t, m, v) {
    const f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = .12;
    fl.type = 'lowpass'; fl.frequency.value = 520; o.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); env(g, t, .012, v, 2.2); out(g, .15);
    o.start(t); o2.start(t); o.stop(t + 2.8); o2.stop(t + 2.8);
  }
  function pad(t, ns, dur, v) { // harmonium: detuned reeds through a slow-breathing filter
    const fl = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    fl.type = 'lowpass'; fl.frequency.value = 780; fl.Q.value = .6; lfo.frequency.value = .13; lg.gain.value = 220; lfo.connect(lg); lg.connect(fl.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 1.7); g.gain.setValueAtTime(v, t + dur - .4); g.gain.linearRampToValueAtTime(0, t + dur + 1.6);
    fl.connect(g); out(g, .9); lfo.start(t); lfo.stop(t + dur + 2);
    ns.forEach(m => [-6, 6].forEach(c => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = c + (Math.random() - .5) * 3; o.connect(fl); o.start(t); o.stop(t + dur + 2) }));
  }
  function crackle(t) { const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800 + Math.random() * 3000; const g = ctx.createGain(); g.gain.setValueAtTime(.015 + Math.random() * .06, t); g.gain.exponentialRampToValueAtTime(.0001, t + .004 + Math.random() * .01); s.connect(f); f.connect(g); g.connect(music); s.start(t, Math.random() * 1.9, .03) }
  function playBeat(b, t) {
    const bar = Math.floor(b / 3) + startBar, inBar = b % 3, loop = Math.floor(bar / 16), sbar = bar % 16, blk = CH[sbar >> 1], second = sbar & 1;
    const hum = () => (Math.random() - .5) * .012;
    if (inBar === 0 && !second) pad(t, blk[1], SPB * 6, .013);
    if (bar >= 2 && inBar === 0) bass(t + hum(), second ? blk[0] + 7 : blk[0], .11);
    if (bar >= 4) { const h = blk[2]; if (inBar === 1) harp(t + hum(), h[second ? 2 : 1], .05); if (inBar === 2) harp(t + hum(), h[second ? 3 : 2], .042); if (inBar === 0 && second) harp(t + hum(), h[0], .035) }
    const mode = [0, 1, 2, 3][loop % 4]; // music box · box with octave sparkle · low felt piano · a breath with no tune
    if (bar >= 8 && mode !== 3) {
      const sb = (sbar * 3 + inBar);
      for (const [at, m, d] of MEL) if (at >= sb && at < sb + 1) {
        const tt = t + (at - sb) * SPB + hum();
        if (mode === 2) harp(tt, m - 12, .08, d * SPB + 1.2);
        else { box(tt, m, .1); if (mode === 1 && d >= 2) box(tt + .01, m + 12, .035) }
      }
    }
  }
  function tick() {
    if (!ctx) return; const ahead = ctx.currentTime + .3;
    while (nextT < ahead) { playBeat(beat, nextT); beat++; nextT += SPB }
    while (crackT < ahead) { crackle(crackT); crackT += (.05 + Math.random()) / crackleRate }
  }
  const api = {
    ok: !!AC, on: false, started: false, pref,
    start(mode) { // call from a click
      if (!AC) return false;
      if (!ctx) build();
      if (ctx.state !== 'running') ctx.resume();
      if (!api.started) {
        api.started = true; startBar = mode === 'site' ? 16 : 0; beat = 0; nextT = ctx.currentTime + .15; crackT = nextT;
        if (mode === 'site') { api.radio(1, .1); rainG.gain.value = 0; crackleRate = 2 } else { rainG.gain.setTargetAtTime(.05, ctx.currentTime, 1.2) }
        timer = setInterval(tick, 60); tick();
      }
      api.set(true); return true;
    },
    set(on) {
      api.on = !!on; try { localStorage.setItem('trench:sound', on ? 'on' : 'off') } catch (_) { } api.pref = on ? 'on' : 'off';
      if (ctx) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(on ? vol : 0, t + (on ? 1.6 : .5)); if (on && ctx.state !== 'running') ctx.resume() }
      emit();
    },
    toggle() { if (!api.started) return api.start('site'); api.set(!api.on) },
    radio(k, sec) { if (!ctx) return; const t = ctx.currentTime, s = sec == null ? 2.5 : sec; hp.frequency.setTargetAtTime(340 * (1 - k) + 22 * k, t, s / 3); lp.frequency.setTargetAtTime(1500 * Math.pow(10, k), t, s / 3); peak.gain.setTargetAtTime(5 * (1 - k), t, s / 3) },
    muffle(sec) { if (!ctx) return; const t = ctx.currentTime; muf.frequency.cancelScheduledValues(t); muf.frequency.setTargetAtTime(280, t, .03); muf.frequency.setTargetAtTime(16000, t + (sec || 1.6), .7);
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 3600; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.01, t + .1); g.gain.exponentialRampToValueAtTime(.0001, t + 2.6); o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.7) },
    boom(near, delay) { // near: 0 far away … 1 right next to you
      if (!ctx || !api.on) return; const t = ctx.currentTime + (delay || 0), k = Math.max(0, Math.min(1, near));
      const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 90 + k * 900; const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.035 + k * .32, t + .02 + (1 - k) * .1); g.gain.exponentialRampToValueAtTime(.0001, t + 1.4 + (1 - k) * 2.2); s.loop = true; s.connect(f); f.connect(g); g.connect(sfx); s.start(t, Math.random()); s.stop(t + 4);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(64, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.2); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.03 + k * .1, t + .03); og.gain.exponentialRampToValueAtTime(.0001, t + 1.6); o.connect(og); og.connect(sfx); o.start(t); o.stop(t + 1.7);
      if (k > .6) { const c = ctx.createBufferSource(); c.buffer = noise; const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 900; const cg = ctx.createGain(); cg.gain.setValueAtTime(.18 * k, t); cg.gain.exponentialRampToValueAtTime(.0001, t + .09); c.connect(cf); cf.connect(cg); cg.connect(sfx); c.start(t, Math.random(), .2) }
    },
    whoosh() {
      if (!ctx || !api.on) return; const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(5200, t + .95); const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.32, t + .8); g.gain.exponentialRampToValueAtTime(.0001, t + 1.5); s.connect(f); f.connect(g); g.connect(sfx); s.start(t, 0, 1.6);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(1320, t + .9); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.05, t + .7); og.gain.exponentialRampToValueAtTime(.0001, t + 1.4); o.connect(og); og.connect(sfx); o.start(t); o.stop(t + 1.5);
      box(t + .92, 93, .07); box(t + .93, 88, .05);
    },
    site() { // after the intro: the radio is clear, the rain fades, the waltz stays quiet under the terminal
      if (!ctx) return; const t = ctx.currentTime; api.radio(1, 1.2); rainG.gain.setTargetAtTime(0, t, 2); crackleRate = 2; vol = .6;
      if (api.on) { master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(vol, t + 4) }
    },
    onChange(fn) { L.push(fn) },
  };
  window.TRS = api;
})();
