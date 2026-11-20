/*
 * controls.js - on-screen touch controls + Gamepad API support.
 * Self-contained: injects its own <style> and DOM and talks to the game only
 * through synthetic keydown/keyup events dispatched on `window`.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__gameControlsLoaded) return;
  window.__gameControlsLoaded = true;

  var KEY_LEFT = 'ArrowLeft';
  var KEY_RIGHT = 'ArrowRight';
  var KEY_JUMP = ' ';
  var KEY_PAUSE = 'Escape';
  var KEY_NEXT = 'Enter';
  var CODES = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ' ': 'Space', Escape: 'Escape', Enter: 'Enter' };
  var GP_SOURCE = 'gamepad';
  var DEADZONE = 0.35;

  function safe(fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (e) { return undefined; }
    };
  }

  /* ---------------------------------------------------------------- keys */

  // key -> { sourceId: true }. A key is "down" for the game while at least one
  // source (a touch pointer or the gamepad) holds it.
  var held = {};

  function fire(type, key) {
    try {
      var ev;
      try {
        ev = new KeyboardEvent(type, { key: key, code: CODES[key] || '', bubbles: true, cancelable: true });
      } catch (e1) {
        ev = document.createEvent('Event');
        ev.initEvent(type, true, true);
        try { Object.defineProperty(ev, 'key', { value: key }); } catch (e2) { ev.key = key; }
      }
      window.dispatchEvent(ev);
    } catch (e) { /* never throw */ }
  }

  function holders(key) {
    var h = held[key];
    var n = 0;
    if (h) for (var s in h) if (h[s]) n++;
    return n;
  }

  function press(source, key) {
    var h = held[key] || (held[key] = {});
    if (h[source]) return;
    var wasDown = holders(key) > 0;
    h[source] = true;
    if (!wasDown) fire('keydown', key);
  }

  function release(source, key) {
    var h = held[key];
    if (!h || !h[source]) return;
    delete h[source];
    if (holders(key) === 0) fire('keyup', key);
  }

  function releaseSource(source) {
    for (var key in held) release(source, key);
  }

  function tap(key) {
    fire('keydown', key);
  }

  /* --------------------------------------------------------------- state */

  var root = null;
  var dpadEl = null;
  var jumpEl = null;
  var pauseEl = null;
  var touchEnabled = false;
  var menuOpen = false;
  var blurred = false;
  var pointers = {}; // pointerId -> { el, kind, key, dead }
  var gp = { left: false, right: false, jump: false, start: false, select: false };
  var rafId = 0;
  var observing = false;

  function isMenuOpen() {
    try { return !!(document.body && document.body.classList.contains('menu-open')); } catch (e) { return false; }
  }

  /* --------------------------------------------------------------- touch */

  var CSS = [
    '#gctl-root{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;display:none;pointer-events:none;overflow:hidden;',
    '-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;-webkit-touch-callout:none;',
    '-webkit-tap-highlight-color:rgba(0,0,0,0);font-family:"Press Start 2P","Courier New",monospace}',
    '#gctl-root.gctl-on{display:block}',
    '#gctl-root .gctl-btn{position:absolute;box-sizing:border-box;pointer-events:auto;touch-action:none;-ms-touch-action:none;cursor:pointer;',
    '-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;-webkit-touch-callout:none;',
    '-webkit-tap-highlight-color:rgba(0,0,0,0);opacity:1;transition:opacity .16s ease-out}',
    '#gctl-root .gctl-btn *{pointer-events:none}',
    '#gctl-root.gctl-off .gctl-btn{opacity:0;pointer-events:none}',

    '#gctl-root .gctl-dpad{left:8px;left:calc(env(safe-area-inset-left,0px) + 8px);bottom:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);width:188px;height:104px}',
    '#gctl-root .gctl-bar{position:absolute;left:8px;right:8px;top:12px;bottom:12px;border-radius:18px;',
    'background:linear-gradient(180deg,rgba(74,74,80,.62),rgba(22,22,26,.7));border:2px solid rgba(255,255,255,.24);',
    'box-shadow:0 6px 14px rgba(0,0,0,.35),inset 0 2px 0 rgba(255,255,255,.14),inset 0 -4px 0 rgba(0,0,0,.35);transition:transform .06s ease-out}',
    '#gctl-root .gctl-half{position:absolute;top:0;bottom:0;width:50%;display:flex;align-items:center;justify-content:center;transition:background-color .06s}',
    '#gctl-root .gctl-half-l{left:0;border-radius:16px 0 0 16px}',
    '#gctl-root .gctl-half-r{right:0;border-radius:0 16px 16px 0}',
    '#gctl-root .gctl-arrow{width:0;height:0;border-top:15px solid transparent;border-bottom:15px solid transparent;opacity:.88}',
    '#gctl-root .gctl-half-l .gctl-arrow{border-right:22px solid #ececf1;margin-right:14px}',
    '#gctl-root .gctl-half-r .gctl-arrow{border-left:22px solid #ececf1;margin-left:14px}',
    '#gctl-root .gctl-pivot{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;',
    'background:radial-gradient(circle at 40% 35%,rgba(96,96,102,.9),rgba(12,12,14,.9));box-shadow:inset 0 2px 3px rgba(0,0,0,.6),0 1px 0 rgba(255,255,255,.12)}',
    '#gctl-root .gctl-dpad.gctl-l .gctl-half-l,#gctl-root .gctl-dpad.gctl-r .gctl-half-r{background-color:rgba(255,255,255,.28)}',
    '#gctl-root .gctl-dpad.gctl-l .gctl-bar{transform:perspective(320px) rotateY(-8deg)}',
    '#gctl-root .gctl-dpad.gctl-r .gctl-bar{transform:perspective(320px) rotateY(8deg)}',
    '#gctl-root .gctl-dpad.gctl-l.gctl-r .gctl-bar{transform:none}',

    '#gctl-root .gctl-a{right:12px;right:calc(env(safe-area-inset-right,0px) + 12px);bottom:72px;bottom:calc(env(safe-area-inset-bottom,0px) + 72px);width:104px;height:104px}',
    '#gctl-root .gctl-a-face{position:absolute;left:8px;top:8px;right:8px;bottom:8px;border-radius:50%;',
    'background:radial-gradient(circle at 35% 30%,rgba(255,124,112,.8),rgba(204,26,38,.74) 60%,rgba(122,8,18,.8));',
    'border:3px solid rgba(255,255,255,.32);box-shadow:0 7px 0 rgba(90,6,14,.6),0 12px 18px rgba(0,0,0,.35),inset 0 3px 0 rgba(255,255,255,.3);',
    'display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.94);font-size:30px;font-weight:bold;line-height:1;',
    'text-shadow:0 2px 0 rgba(90,6,14,.8);transition:transform .05s,box-shadow .05s}',
    '#gctl-root .gctl-a.gctl-down .gctl-a-face{transform:translateY(5px);',
    'box-shadow:0 2px 0 rgba(90,6,14,.6),0 4px 8px rgba(0,0,0,.35),inset 0 3px 0 rgba(255,255,255,.2);border-color:rgba(255,255,255,.6)}',

    '#gctl-root .gctl-pause{right:4px;right:calc(env(safe-area-inset-right,0px) + 4px);top:60px;top:calc(env(safe-area-inset-top,0px) + 60px);width:64px;height:64px}',
    '#gctl-root .gctl-pause-face{position:absolute;left:10px;top:14px;right:10px;bottom:14px;border-radius:18px;',
    'background:linear-gradient(180deg,rgba(74,74,80,.6),rgba(22,22,26,.68));border:2px solid rgba(255,255,255,.24);',
    'box-shadow:0 3px 8px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center}',
    '#gctl-root .gctl-pause-face i{display:block;width:5px;height:14px;margin:0 3px;background:#ececf1;border-radius:1px;opacity:.92}',
    '#gctl-root .gctl-pause.gctl-down .gctl-pause-face{background:rgba(255,255,255,.34);transform:translateY(1px)}'
  ].join('');

  function el(tag, cls, parent) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  }

  function setClass(node, cls, on) {
    if (!node) return;
    try { if (on) node.classList.add(cls); else node.classList.remove(cls); } catch (e) { /* ignore */ }
  }

  function refreshVisuals() {
    var l = false, r = false, j = false, p = false;
    for (var id in pointers) {
      var ptr = pointers[id];
      if (ptr.dead) continue;
      if (ptr.key === KEY_LEFT) l = true;
      else if (ptr.key === KEY_RIGHT) r = true;
      else if (ptr.key === KEY_JUMP) j = true;
      if (ptr.kind === 'pause') p = true;
    }
    setClass(dpadEl, 'gctl-l', l);
    setClass(dpadEl, 'gctl-r', r);
    setClass(jumpEl, 'gctl-down', j);
    setClass(pauseEl, 'gctl-down', p);
  }

  function refreshVisibility() {
    if (!root) return;
    setClass(root, 'gctl-on', touchEnabled);
    setClass(root, 'gctl-off', menuOpen);
  }

  function setPointerKey(id, ptr, key) {
    if (ptr.key === key) return;
    var src = 'touch:' + id;
    if (ptr.key) release(src, ptr.key);
    ptr.key = key;
    if (key) press(src, key);
  }

  function inside(node, ev, slop) {
    try {
      var r = node.getBoundingClientRect();
      return ev.clientX >= r.left - slop && ev.clientX <= r.right + slop &&
        ev.clientY >= r.top - slop && ev.clientY <= r.bottom + slop;
    } catch (e) { return false; }
  }

  function dpadKey(ptr, ev) {
    var r = ptr.el.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var x = ev.clientX;
    // Small hysteresis so a finger resting on the centre does not flicker.
    if (ptr.key === KEY_LEFT) return x > cx + 10 ? KEY_RIGHT : KEY_LEFT;
    if (ptr.key === KEY_RIGHT) return x < cx - 10 ? KEY_LEFT : KEY_RIGHT;
    return x < cx ? KEY_LEFT : KEY_RIGHT;
  }

  function updatePointer(id, ptr, ev) {
    if (ptr.dead) return;
    if (ptr.kind === 'dpad') setPointerKey(id, ptr, dpadKey(ptr, ev));
    else if (ptr.kind === 'jump') setPointerKey(id, ptr, KEY_JUMP);
  }

  function endPointer(id, ev, isUp) {
    var ptr = pointers[id];
    if (!ptr) return;
    delete pointers[id];
    setPointerKey(id, ptr, null);
    try { if (ptr.el.hasPointerCapture && ptr.el.hasPointerCapture(id)) ptr.el.releasePointerCapture(id); } catch (e) { /* ignore */ }
    refreshVisuals();
    if (isUp && ptr.kind === 'pause' && !ptr.dead && !menuOpen && ev && inside(ptr.el, ev, 8)) tap(KEY_PAUSE);
  }

  // Drop every touch-held key but keep tracking the fingers so their eventual
  // pointerup is swallowed instead of re-pressing anything.
  function killPointers() {
    for (var id in pointers) {
      var ptr = pointers[id];
      setPointerKey(id, ptr, null);
      ptr.dead = true;
    }
    refreshVisuals();
  }

  function bindButton(node, kind) {
    node.addEventListener('pointerdown', safe(function (ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (ev.cancelable) ev.preventDefault();
      if (menuOpen || !touchEnabled) return;
      var id = ev.pointerId;
      if (pointers[id]) endPointer(id, ev, false);
      try { node.setPointerCapture(id); } catch (e) { /* synthetic / unsupported */ }
      var ptr = pointers[id] = { el: node, kind: kind, key: null, dead: false };
      updatePointer(id, ptr, ev);
      refreshVisuals();
    }));
    node.addEventListener('lostpointercapture', safe(function (ev) {
      endPointer(ev.pointerId, ev, false);
    }));
    var block = safe(function (ev) {
      if (ev.cancelable) ev.preventDefault();
    });
    var names = ['contextmenu', 'selectstart', 'dragstart', 'dblclick', 'gesturestart'];
    for (var i = 0; i < names.length; i++) node.addEventListener(names[i], block);
    // Cancelling touchstart suppresses double-tap zoom, long-press callouts and
    // the synthetic mouse/click events that could hit whatever is underneath.
    var touchNames = ['touchstart', 'touchmove', 'touchend'];
    for (var t = 0; t < touchNames.length; t++) {
      try { node.addEventListener(touchNames[t], block, { passive: false }); } catch (e) { node.addEventListener(touchNames[t], block, false); }
    }
  }

  function buildDom() {
    if (root || !document.body) return;
    var style = el('style');
    style.id = 'gctl-style';
    style.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(style);

    root = el('div');
    root.id = 'gctl-root';
    root.setAttribute('aria-hidden', 'true');

    dpadEl = el('div', 'gctl-btn gctl-dpad', root);
    var bar = el('div', 'gctl-bar', dpadEl);
    el('div', 'gctl-arrow', el('div', 'gctl-half gctl-half-l', bar));
    el('div', 'gctl-arrow', el('div', 'gctl-half gctl-half-r', bar));
    el('div', 'gctl-pivot', bar);

    jumpEl = el('div', 'gctl-btn gctl-a', root);
    el('div', 'gctl-a-face', jumpEl).appendChild(document.createTextNode('A'));

    pauseEl = el('div', 'gctl-btn gctl-pause', root);
    var face = el('div', 'gctl-pause-face', pauseEl);
    el('i', '', face);
    el('i', '', face);

    bindButton(dpadEl, 'dpad');
    bindButton(jumpEl, 'jump');
    bindButton(pauseEl, 'pause');

    document.body.appendChild(root);
    refreshVisibility();
  }

  function enableTouch() {
    if (touchEnabled) return;
    touchEnabled = true;
    refreshVisibility();
  }

  /* ------------------------------------------------------------- gamepad */

  function gpSet(name, key, on) {
    if (gp[name] === on) return;
    gp[name] = on;
    if (on) press(GP_SOURCE, key); else release(GP_SOURCE, key);
  }

  function gpReleaseHeld() {
    gp.left = gp.right = gp.jump = false;
    releaseSource(GP_SOURCE);
  }

  function btnDown(buttons, i) {
    var b = buttons[i];
    if (b === undefined || b === null) return false;
    if (typeof b === 'number') return b > 0.5;
    return !!b.pressed || b.value > 0.5;
  }

  function readPads() {
    var pads = null;
    try {
      if (navigator.getGamepads) pads = navigator.getGamepads();
      else if (navigator.webkitGetGamepads) pads = navigator.webkitGetGamepads();
    } catch (e) { pads = null; }
    return pads || [];
  }

  function schedulePoll() {
    if (rafId || !window.requestAnimationFrame) return;
    rafId = window.requestAnimationFrame(pollPads);
  }

  var pollPads = safe(function () {
    rafId = 0;
    var pads = readPads();
    var any = false, l = false, r = false, j = false, st = false, se = false;
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i];
      if (!pad || pad.connected === false) continue;
      any = true;
      var axes = pad.axes || [];
      var buttons = pad.buttons || [];
      var ax = typeof axes[0] === 'number' ? axes[0] : 0;
      if (ax < -DEADZONE || btnDown(buttons, 14)) l = true;
      if (ax > DEADZONE || btnDown(buttons, 15)) r = true;
      if (btnDown(buttons, 0) || btnDown(buttons, 1) || btnDown(buttons, 12)) j = true;
      if (btnDown(buttons, 9)) st = true;
      if (btnDown(buttons, 8)) se = true;
    }
    if (!any) {
      gpReleaseHeld();
      gp.start = gp.select = false;
      return; // stop polling until a pad connects again
    }
    var active = !blurred && !document.hidden;
    var playing = active && !menuOpen;
    gpSet('left', KEY_LEFT, playing && l);
    gpSet('right', KEY_RIGHT, playing && r);
    gpSet('jump', KEY_JUMP, playing && j);
    if (st && !gp.start && active) tap(KEY_PAUSE);
    if (se && !gp.select && active) tap(KEY_NEXT);
    gp.start = st;
    gp.select = se;
    schedulePoll();
  });

  /* ----------------------------------------------------------- lifecycle */

  function releaseEverything() {
    killPointers();
    gpReleaseHeld();
    // Safety net: nothing may stay down for the game.
    for (var key in held) {
      var had = holders(key) > 0;
      held[key] = {};
      if (had) fire('keyup', key);
    }
  }

  var syncMenu = safe(function () {
    var open = isMenuOpen();
    if (open === menuOpen) return;
    menuOpen = open;
    if (open) releaseEverything();
    refreshVisibility();
  });

  var init = safe(function () {
    if (!document.body) return;
    buildDom();
    menuOpen = isMenuOpen();
    refreshVisibility();
    if (observing) return;
    try {
      if (window.MutationObserver) {
        new MutationObserver(syncMenu).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        observing = true;
      }
    } catch (e) { /* ignore */ }
  });

  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) touchEnabled = true;
  } catch (e) { /* ignore */ }

  try {
    var onFirstTouch = safe(function () {
      window.removeEventListener('touchstart', onFirstTouch, true);
      enableTouch();
    });
    window.addEventListener('touchstart', onFirstTouch, true);

    window.addEventListener('pointermove', safe(function (ev) {
      var ptr = pointers[ev.pointerId];
      if (!ptr) return;
      updatePointer(ev.pointerId, ptr, ev);
      refreshVisuals();
    }), true);
    window.addEventListener('pointerup', safe(function (ev) {
      endPointer(ev.pointerId, ev, true);
    }), true);
    window.addEventListener('pointercancel', safe(function (ev) {
      endPointer(ev.pointerId, ev, false);
    }), true);

    window.addEventListener('blur', safe(function () {
      blurred = true;
      releaseEverything();
    }));
    window.addEventListener('focus', safe(function () {
      blurred = false;
    }));
    document.addEventListener('visibilitychange', safe(function () {
      if (document.hidden) releaseEverything();
    }));
    window.addEventListener('pagehide', safe(releaseEverything));

    window.addEventListener('gamepadconnected', safe(schedulePoll));
    window.addEventListener('gamepaddisconnected', safe(function () {
      gpReleaseHeld();
      schedulePoll();
    }));

    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
    // The body class may already be set by the time the DOM is complete.
    window.addEventListener('load', safe(function () {
      init();
      syncMenu();
      if (readPads().length) schedulePoll();
    }));
  } catch (e) { /* never throw */ }
})();
