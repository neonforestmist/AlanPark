/* Alan Park audio: window.GameAudio = { unlock, playMusic, stopMusic, sfx, toggleMute, isMuted }
   Plain browser script, no dependencies. Every method is safe to call at any time. */
(function () {
  'use strict';

  var MUSIC_VOL = 0.35;
  var SFX_VOL = 0.6;
  var LS_KEY = 'alanParkMuted';
  var BASE = 'assets/audio/';
  var FADE_MS = 350;
  var SFX_THROTTLE_MS = 40;
  // per-track loudness trim: these two source tracks are mastered ~4 dB quieter than the rest
  var MUSIC_TRIM = { castle: 1.5, night: 1.5 };

  var MUSIC_NAMES = ['menu', 'grass', 'desert', 'cave', 'snow', 'castle', 'night', 'win', 'gameover'];
  var ONE_SHOT = { win: true, gameover: true };
  var SFX_NAMES = ['jump', 'coin', 'stomp', 'hurt', 'die', 'checkpoint', 'heart', 'win', 'gameover', 'select', 'bump'];
  var SFX_ALIAS = {
    death: 'die', dead: 'die', hit: 'hurt', damage: 'hurt', kick: 'stomp', squish: 'stomp',
    flag: 'checkpoint', life: 'heart', '1up': 'heart', oneup: 'heart', powerup: 'heart',
    clear: 'win', victory: 'win', lose: 'gameover', click: 'select', menu: 'select',
    start: 'select', pause: 'select', land: 'bump', block: 'bump'
  };

  var ctx = null, master = null, sfxGain = null, synthGain = null, noiseBuf = null;
  var muted = false;
  var unlocked = false;
  var lastToggleAt = -1e9;

  var sfxRaw = {};      // name -> ArrayBuffer (fetched, not yet decoded)
  var sfxBuf = {};      // name -> AudioBuffer
  var sfxFailed = {};   // name -> true when the file is missing/undecodable
  var sfxLast = {};     // name -> last start time (ms)

  var wanted = null;    // requested music name
  var current = null;   // { name, el, synth, started, dead }
  var musicFailed = {}; // name -> true when the file is missing/unplayable
  var button = null;

  function now() {
    try { return (window.performance && performance.now) ? performance.now() : Date.now(); } catch (e) { return Date.now(); }
  }

  try { muted = window.localStorage.getItem(LS_KEY) === '1'; } catch (e) { muted = false; }

  /* ------------------------------------------------------------------ WebAudio core */

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = SFX_VOL;
      sfxGain.connect(master);
      synthGain = ctx.createGain();
      synthGain.gain.value = MUSIC_VOL;
      synthGain.connect(master);
      for (var k in sfxRaw) { if (Object.prototype.hasOwnProperty.call(sfxRaw, k)) decodeSfx(k); }
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function resumeCtx() {
    try {
      if (ctx && ctx.state !== 'running' && ctx.resume) {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) {}
  }

  function decodeSfx(name) {
    var raw = sfxRaw[name];
    if (!raw || !ctx) return;
    delete sfxRaw[name];
    var ok = function (buf) { if (buf) sfxBuf[name] = buf; else sfxFailed[name] = true; };
    var bad = function () { sfxFailed[name] = true; };
    try {
      var p = ctx.decodeAudioData(raw, ok, bad);
      if (p && p.catch) p.catch(bad);
    } catch (e) { bad(); }
  }

  function preloadSfx() {
    if (typeof window.fetch !== 'function') {
      SFX_NAMES.forEach(function (n) { sfxFailed[n] = true; });
      return;
    }
    SFX_NAMES.forEach(function (name) {
      try {
        window.fetch(BASE + 'sfx/' + name + '.mp3').then(function (r) {
          if (!r || !r.ok) throw new Error('missing');
          return r.arrayBuffer();
        }).then(function (ab) {
          if (!ab || ab.byteLength < 64) throw new Error('empty');
          sfxRaw[name] = ab;
          if (ctx) decodeSfx(name);
        }).catch(function () { sfxFailed[name] = true; });
      } catch (e) { sfxFailed[name] = true; }
    });
  }

  /* ------------------------------------------------------------------ synth helpers */

  function tone(dest, type, f0, f1, t0, dur, vol) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    g.gain.setValueAtTime(vol, t0 + dur * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
    return o;
  }

  function noise(dest, t0, dur, vol) {
    if (!noiseBuf) {
      var len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = ctx.createBufferSource();
    var g = ctx.createGain();
    s.buffer = noiseBuf;
    g.gain.setValueAtTime(vol, t0);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    s.connect(g);
    g.connect(dest);
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  function seq(dest, type, notes, t0, step, vol, hold) {
    for (var i = 0; i < notes.length; i++) {
      if (notes[i] > 0) tone(dest, type, notes[i], 0, t0 + i * step, step * (hold || 0.95), vol);
    }
  }

  var SYNTH_SFX = {
    jump: function (t) { tone(sfxGain, 'square', 300, 720, t, 0.16, 0.22); },
    coin: function (t) {
      tone(sfxGain, 'square', 988, 0, t, 0.07, 0.2);
      tone(sfxGain, 'square', 1319, 0, t + 0.07, 0.28, 0.2);
    },
    stomp: function (t) {
      tone(sfxGain, 'square', 420, 90, t, 0.12, 0.25);
      noise(sfxGain, t, 0.07, 0.18);
    },
    hurt: function (t) {
      tone(sfxGain, 'sawtooth', 520, 130, t, 0.12, 0.2);
      tone(sfxGain, 'square', 300, 80, t + 0.1, 0.18, 0.2);
    },
    die: function (t) {
      seq(sfxGain, 'square', [784, 740, 698, 659, 622, 587, 554, 523, 392, 330, 262], t, 0.065, 0.2);
    },
    checkpoint: function (t) { seq(sfxGain, 'square', [523, 659, 784, 1047], t, 0.08, 0.2); },
    heart: function (t) { seq(sfxGain, 'square', [659, 784, 1319, 1047, 1175, 1568], t, 0.09, 0.2); },
    win: function (t) {
      seq(sfxGain, 'square', [523, 659, 784, 1047, 784, 1047, 1319], t, 0.1, 0.2);
      tone(sfxGain, 'triangle', 262, 0, t + 0.7, 0.5, 0.3);
      tone(sfxGain, 'square', 1568, 0, t + 0.7, 0.5, 0.18);
    },
    gameover: function (t) {
      seq(sfxGain, 'triangle', [523, 0, 392, 0, 330, 440, 494, 440, 415, 466, 415, 392], t, 0.13, 0.32);
    },
    select: function (t) {
      tone(sfxGain, 'square', 660, 0, t, 0.05, 0.18);
      tone(sfxGain, 'square', 990, 0, t + 0.05, 0.07, 0.18);
    },
    bump: function (t) { tone(sfxGain, 'square', 170, 70, t, 0.09, 0.26); },
    _default: function (t) { tone(sfxGain, 'square', 740, 0, t, 0.06, 0.15); }
  };

  /* ------------------------------------------------------------------ sfx */

  function sfx(name) {
    try {
      if (name === undefined || name === null) return;
      name = String(name).toLowerCase();
      if (!SYNTH_SFX.hasOwnProperty(name) && SFX_ALIAS.hasOwnProperty(name)) name = SFX_ALIAS[name];
      var t = now();
      if (sfxLast[name] !== undefined && t - sfxLast[name] < SFX_THROTTLE_MS) return;
      sfxLast[name] = t;
      if (muted) return;
      if (!ctx && !unlocked) return;       // no gesture yet: nothing could be heard anyway
      if (!ensureCtx()) return;
      if (ctx.state !== 'running') { resumeCtx(); if (ctx.state !== 'running') return; }
      var buf = sfxBuf[name];
      if (buf) {
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(sfxGain);
        src.start(0);
        return;
      }
      var fn = (name !== '_default' && SYNTH_SFX.hasOwnProperty(name)) ? SYNTH_SFX[name] : SYNTH_SFX._default;
      fn(ctx.currentTime + 0.005);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ synth music fallback */

  var N = { C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, Bb3: 233.08, B3: 246.94 };
  // prog: bass roots (Hz), chord: semitone offsets for the arpeggio, bpm, lead wave
  var SYNTH_SONGS = {
    menu:   { bpm: 120, wave: 'square',   prog: [N.C3, N.A3 / 2, N.F3, N.G3], chords: [[0, 4, 7, 12], [0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 10]] },
    grass:  { bpm: 150, wave: 'square',   prog: [N.C3, N.F3, N.G3, N.C3],     chords: [[0, 4, 7, 12], [0, 4, 7, 12], [0, 4, 7, 11], [0, 7, 12, 16]] },
    desert: { bpm: 132, wave: 'square',   prog: [N.D3, N.D3, N.E3 * 0.944, N.D3], chords: [[0, 1, 4, 7], [0, 4, 7, 8], [0, 4, 7, 10], [0, 1, 4, 7]] },
    cave:   { bpm: 104, wave: 'triangle', prog: [N.A3 / 2, N.A3 / 2, N.F3 / 2, N.E3 / 2], chords: [[0, 3, 7, 12], [0, 3, 6, 12], [0, 4, 7, 12], [0, 4, 7, 10]] },
    snow:   { bpm: 112, wave: 'triangle', prog: [N.F3, N.C3, N.D3, N.Bb3 / 2], chords: [[0, 4, 7, 14], [0, 4, 7, 12], [0, 3, 7, 12], [0, 4, 7, 14]] },
    castle: { bpm: 140, wave: 'sawtooth', prog: [N.E3 / 2, N.E3 / 2, N.G3 / 2, N.B3 / 2 * 0.944], chords: [[0, 3, 7, 12], [0, 3, 6, 9], [0, 4, 7, 12], [0, 4, 7, 10]] },
    night:  { bpm: 96,  wave: 'triangle', prog: [N.D3, N.Bb3 / 2, N.G3 / 2, N.A3 / 2], chords: [[0, 3, 7, 10], [0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 10]] }
  };
  var SYNTH_JINGLES = {
    win:      { step: 0.12, wave: 'square',   notes: [523, 659, 784, 1047, 0, 784, 1047, 1319, 0, 1047, 1319, 1568, 1568, 1568] },
    gameover: { step: 0.2,  wave: 'triangle', notes: [523, 0, 392, 0, 330, 0, 440, 494, 440, 415, 466, 415, 392, 392] }
  };

  function startSynthMusic(name, onEnd) {
    if (!ensureCtx()) return null;
    var out = ctx.createGain();
    out.gain.value = 1;
    out.connect(synthGain);
    var handle = { out: out, timer: null, stopped: false };

    if (ONE_SHOT[name]) {
      var j = SYNTH_JINGLES[name] || SYNTH_JINGLES.win;
      seq(out, j.wave, j.notes, ctx.currentTime + 0.05, j.step, 0.5);
      handle.timer = setTimeout(function () { if (!handle.stopped && onEnd) onEnd(); }, (j.notes.length * j.step + 0.3) * 1000);
      return handle;
    }

    var song = SYNTH_SONGS[name] || SYNTH_SONGS.grass;
    var stepDur = 60 / song.bpm / 2;         // eighth notes
    var step = 0;
    var nextT = ctx.currentTime + 0.06;
    var order = [0, 1, 2, 3, 2, 1, 2, 3];
    var tick = function () {
      if (handle.stopped || !ctx) return;
      try {
        if (ctx.state !== 'running') { nextT = ctx.currentTime + 0.06; return; }
        if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.03;
        while (nextT < ctx.currentTime + 0.3) {
          var bar = Math.floor(step / 8) % song.prog.length;
          var root = song.prog[bar];
          var chord = song.chords[bar];
          var semi = chord[order[step % 8] % chord.length];
          tone(out, song.wave, root * 2 * Math.pow(2, semi / 12), 0, nextT, stepDur * 0.9, 0.3);
          if (step % 4 === 0) tone(out, 'triangle', root, 0, nextT, stepDur * 1.9, 0.6);
          if (step % 4 === 2) noise(out, nextT, 0.04, 0.12);
          nextT += stepDur;
          step++;
        }
      } catch (e) {}
    };
    tick();
    handle.timer = setInterval(tick, 100);
    return handle;
  }

  function stopSynthMusic(handle) {
    if (!handle || handle.stopped) return;
    handle.stopped = true;
    try { clearInterval(handle.timer); clearTimeout(handle.timer); } catch (e) {}
    try {
      var t = ctx.currentTime;
      handle.out.gain.cancelScheduledValues(t);
      handle.out.gain.setValueAtTime(handle.out.gain.value, t);
      handle.out.gain.linearRampToValueAtTime(0.0001, t + FADE_MS / 1000);
      setTimeout(function () { try { handle.out.disconnect(); } catch (e) {} }, FADE_MS + 400);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ music */

  function fadeEl(el, to, ms, done) {
    try {
      if (el._fade) clearInterval(el._fade);
      var from = el.volume, t0 = now();
      el._fade = setInterval(function () {
        try {
          var k = Math.min(1, (now() - t0) / ms);
          el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
          if (k >= 1) { clearInterval(el._fade); el._fade = null; if (done) done(); }
        } catch (e) { clearInterval(el._fade); el._fade = null; if (done) done(); }
      }, 30);
    } catch (e) { if (done) done(); }
  }

  function killTrack(tr, fade) {
    if (!tr || tr.dead) return;
    tr.dead = true;
    if (tr.synth) { stopSynthMusic(tr.synth); tr.synth = null; }
    var el = tr.el;
    if (el) {
      tr.el = null;
      var fin = function () { try { el.pause(); el.removeAttribute('src'); if (el.load) el.load(); } catch (e) {} };
      if (fade && tr.started && !el.paused && !muted) fadeEl(el, 0, FADE_MS, fin); else fin();
    }
  }

  function trackEnded(tr) {
    if (current !== tr) return;
    killTrack(tr, false);
    current = null;
    if (wanted === tr.name) wanted = null;
  }

  function useSynth(tr) {
    if (tr.dead || current !== tr) return;
    if (tr.el) { try { tr.el.pause(); } catch (e) {} tr.el = null; }
    tr.started = false;
    if (!unlocked && !ctx) return;          // will be started by unlock()
    var h = startSynthMusic(tr.name, function () { trackEnded(tr); });
    if (h) { tr.synth = h; tr.started = true; resumeCtx(); }
  }

  function tryStart(tr) {
    if (!tr || tr.dead || current !== tr || tr.started) return;
    if (musicFailed[tr.name] || !tr.el) { if (!tr.synth) useSynth(tr); return; }
    try {
      var el = tr.el;
      var p = el.play();
      var ok = function () {
        if (tr.dead) { try { el.pause(); } catch (e) {} return; }
        if (!tr.started) { tr.started = true; fadeEl(el, Math.min(1, MUSIC_VOL * (MUSIC_TRIM.hasOwnProperty(tr.name) ? MUSIC_TRIM[tr.name] : 1)), 200); }
      };
      if (p && p.then) {
        p.then(ok).catch(function (err) {
          // NotAllowedError = autoplay blocked: wait for unlock(). Anything else = unusable file.
          if (tr.dead || !err || err.name === 'NotAllowedError' || err.name === 'AbortError') return;
          musicFailed[tr.name] = true;
          useSynth(tr);
        });
      } else {
        ok();
      }
    } catch (e) {
      musicFailed[tr.name] = true;
      useSynth(tr);
    }
  }

  function playMusic(name) {
    try {
      if (name === undefined || name === null || name === '') { stopMusic(); return; }
      name = String(name).toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!name) return;
      if (current && !current.dead && current.name === name) {
        wanted = name;
        if (!current.started) tryStart(current);
        return;
      }
      wanted = name;
      var old = current;
      current = null;
      killTrack(old, true);

      var tr = { name: name, el: null, synth: null, started: false, dead: false };
      current = tr;
      var known = MUSIC_NAMES.indexOf(name) !== -1;
      if (known && !musicFailed[name] && typeof window.Audio === 'function') {
        try {
          var el = new window.Audio();
          el.preload = 'auto';
          el.loop = !ONE_SHOT[name];
          el.volume = 0;
          el.muted = muted;
          el.addEventListener('error', function () {
            musicFailed[name] = true;
            if (tr.el === el) useSynth(tr);
          });
          el.addEventListener('ended', function () { if (!el.loop) trackEnded(tr); });
          el.src = BASE + 'music/' + name + '.mp3';
          tr.el = el;
        } catch (e) { tr.el = null; }
      }
      tryStart(tr);
    } catch (e) {}
  }

  function stopMusic() {
    try {
      wanted = null;
      var old = current;
      current = null;
      killTrack(old, true);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ unlock / mute */

  function unlock() {
    try {
      unlocked = true;
      ensureCtx();
      resumeCtx();
      if (current && !current.dead && !current.started) tryStart(current);
      else if (!current && wanted) playMusic(wanted);
    } catch (e) {}
  }

  function applyMute() {
    try {
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
      }
    } catch (e) {}
    try { if (current && current.el) current.el.muted = muted; } catch (e) {}
    try { window.localStorage.setItem(LS_KEY, muted ? '1' : '0'); } catch (e) {}
    renderButton();
  }

  function toggleMute() {
    try {
      var t = now();
      // game.js and this file may both react to the same "m" keypress: count it once
      if (t - lastToggleAt < 120) return muted;
      lastToggleAt = t;
      muted = !muted;
      applyMute();
      if (!muted && unlocked) { resumeCtx(); if (current && !current.started) tryStart(current); }
    } catch (e) {}
    return muted;
  }

  function isMuted() { return !!muted; }

  /* ------------------------------------------------------------------ mute button */

  var ICON_ON = [
    '............',
    '.....#......',
    '....##...#..',
    '.####..#..#.',
    '.####...#.#.',
    '.####...#.#.',
    '.####...#.#.',
    '.####..#..#.',
    '....##...#..',
    '.....#......',
    '............'
  ];
  var ICON_OFF = [
    '............',
    '.....#......',
    '....##......',
    '.####.#...#.',
    '.####..#.#..',
    '.####...#...',
    '.####..#.#..',
    '.####.#...#.',
    '....##......',
    '.....#......',
    '............'
  ];

  function iconSvg(rows) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 11" width="24" height="22" shape-rendering="crispEdges" aria-hidden="true">';
    for (var y = 0; y < rows.length; y++) {
      for (var x = 0; x < rows[y].length; x++) {
        if (rows[y].charAt(x) === '#') s += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="currentColor"/>';
      }
    }
    return s + '</svg>';
  }

  function renderButton() {
    try {
      if (!button) return;
      button.innerHTML = iconSvg(muted ? ICON_OFF : ICON_ON);
      button.className = muted ? 'is-muted' : '';
      button.setAttribute('aria-pressed', muted ? 'true' : 'false');
      button.title = muted ? 'Sound off (M)' : 'Sound on (M)';
      button.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    } catch (e) {}
  }

  function injectButton() {
    try {
      if (button || !document.body) return;
      if (!document.getElementById('audio-toggle-style')) {
        var st = document.createElement('style');
        st.id = 'audio-toggle-style';
        st.textContent =
          '#audio-toggle{position:fixed;right:12px;bottom:12px;z-index:2147483000;width:44px;height:44px;min-width:40px;min-height:40px;' +
          'margin:0;padding:0;display:flex;align-items:center;justify-content:center;box-sizing:border-box;cursor:pointer;' +
          'background:#1d2b53;color:#fff1e8;border:3px solid #fff1e8;border-radius:0;box-shadow:3px 3px 0 #000;' +
          'image-rendering:pixelated;font:12px/1 monospace;-webkit-tap-highlight-color:transparent;touch-action:manipulation;' +
          'user-select:none;-webkit-user-select:none;opacity:.85}' +
          '#audio-toggle:hover{opacity:1;background:#29366f}' +
          '#audio-toggle:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #000}' +
          '#audio-toggle:focus{outline:none}' +
          '#audio-toggle:focus-visible{outline:2px solid #ffec27;outline-offset:2px}' +
          '#audio-toggle.is-muted{color:#ff004d;border-color:#ff004d}' +
          '#audio-toggle svg{display:block;pointer-events:none}';
        (document.head || document.documentElement).appendChild(st);
      }
      button = document.getElementById('audio-toggle');
      if (!button) {
        button = document.createElement('button');
        button.id = 'audio-toggle';
        button.type = 'button';
        document.body.appendChild(button);
      }
      button.tabIndex = -1;
      // keep keyboard focus on the game so Space/Enter never re-trigger the button
      button.addEventListener('mousedown', function (e) { try { e.preventDefault(); } catch (err) {} });
      button.addEventListener('click', function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
        unlock();
        toggleMute();
        try { button.blur(); } catch (err) {}
      });
      renderButton();
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ wiring */

  function isTyping(target) {
    try {
      if (!target || !target.tagName) return false;
      var tag = String(target.tagName).toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || !!target.isContentEditable;
    } catch (e) { return false; }
  }

  try {
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchstart', unlock, true);
    window.addEventListener('mousedown', unlock, true);
    window.addEventListener('keydown', function (e) {
      unlock();
      try {
        if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if ((e.key === 'm' || e.key === 'M') && !isTyping(e.target)) toggleMute();
      } catch (err) {}
    }, true);
  } catch (e) {}

  try {
    if (document.body) injectButton();
    else document.addEventListener('DOMContentLoaded', injectButton);
    window.addEventListener('load', injectButton);
  } catch (e) {}

  try { preloadSfx(); } catch (e) {}

  window.GameAudio = {
    unlock: unlock,
    playMusic: playMusic,
    stopMusic: stopMusic,
    sfx: sfx,
    toggleMute: toggleMute,
    isMuted: isMuted
  };
})();
