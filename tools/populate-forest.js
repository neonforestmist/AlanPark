#!/usr/bin/env node
'use strict';
// Populates the forest (world 1) levels with an `entities` grid: coins, enemies, checkpoint, heart, spikes.
// Dependency-free, deterministic (seeded RNG) and idempotent: the grid is rebuilt from `tiles` on every run.
// Usage: node tools/populate-forest.js [--print]   (--print shows tiles+entities overlaid)
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'levels');
const LEVELS = [
  { file: 'forest-1-1.json', name: '1-1 Forest Stroll', timeLimit: 300, seed: 101, ground: 14, k: 3, f: 3, s: 0, j: 0, spikes: 1, coins: 70 },
  { file: 'forest-1-2.json', name: '1-2 Hollow Tree Climb', timeLimit: 400, seed: 202, ground: 17, k: 2, f: 4, s: 0, j: 0, spikes: 0, coins: 68 },
  { file: 'forest-1-3.json', name: '1-3 Mossy Lake Run', timeLimit: 300, seed: 303, ground: 22, k: 4, f: 4, s: 2, j: 2, spikes: 2, coins: 76 },
];
const ENEMY_RANGE = { 'forest-1-1.json': [14, 20], 'forest-1-2.json': [18, 26], 'forest-1-3.json': [22, 30] };
const ALLOWED = '.omc^gkfsjxp';
const GROUND = 'gksjp';
const ENEMIES = 'gkfsjxp';
const COIN_MIN = 50, COIN_MAX = 90;
const ENTITY_LEGEND = {
  'entity o': 'coin', 'entity m': 'heart (extra life)', 'entity c': 'checkpoint flag', 'entity ^': 'spikes',
  'entity g': 'walker enemy', 'entity k': 'beetle enemy', 'entity f': 'flyer enemy', 'entity s': 'spiky enemy (not stompable)',
  'entity j': 'jumper enemy', 'entity x': 'ghost enemy', 'entity p': 'popper enemy',
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick n items evenly spread over an ordered list.
function spread(list, n) {
  if (n >= list.length) return list.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.floor((i + 0.5) * list.length / n)]);
  return out;
}

function populate(cfg, print) {
  const file = path.join(DIR, cfg.file);
  const lvl = JSON.parse(fs.readFileSync(file, 'utf8'));
  const T = lvl.tiles, H = T.length, W = T[0].length;
  const rnd = rng(cfg.seed);
  const tile = (x, y) => (y < 0 || y >= H || x < 0 || x >= T[y].length) ? ' ' : T[y][x];
  const solid = (x, y) => { const t = tile(x, y); return t === '#' || t === 'b'; };
  const empty = (x, y) => tile(x, y) === '.';
  const water = (x, y) => { const t = tile(x, y); return t === 's' || t === 'w'; };
  const open = (x, y) => { const t = tile(x, y); return t !== '#' && t !== 'b' && t !== ' '; };
  const surface = (x, y) => empty(x, y) && solid(x, y + 1);
  const E = T.map(r => Array(r.length).fill('.'));
  const put = (x, y, ch) => { if (!empty(x, y) || E[y][x] !== '.') return false; E[y][x] = ch; return true; };
  const key = (x, y) => x + ',' + y;

  // ---- analysis: flat runs of walkable surface -------------------------------------------------
  const runs = [], runAt = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!surface(x, y)) continue;
    let x1 = x; while (surface(x1 + 1, y)) x1++;
    const r = { y, x0: x, x1, len: x1 - x + 1, reach: false };
    runs.push(r);
    for (let i = x; i <= x1; i++) runAt.set(key(i, y), r);
    x = x1;
  }

  // ---- analysis: rough platformer reachability (jump <= 3 up, gap <= 3, lifts +-3, water swimmable) ----
  const liftTop = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tile(x, y);
    for (let d = -3; d <= 3; d++) {
      if (t === 'h' && open(x + d, y - 1)) liftTop.add(key(x + d, y - 1));
      if (t === 'v' && open(x, y + d - 1)) liftTop.add(key(x, y + d - 1));
    }
  }
  const standable = (x, y) => surface(x, y) || water(x, y) || liftTop.has(key(x, y));
  const canHop = (x, y, x2, y2) => {
    const dx = Math.abs(x2 - x), up = y - y2;
    if (up > 3 || (dx === 0 && up === 0)) return false;
    const maxDx = up >= 3 ? 3 : up >= 0 ? 4 : 4 + Math.min(3, Math.floor(-up / 2));
    if (dx > maxDx) return false;
    const top = Math.min(y, y2), sx = Math.sign(x2 - x);
    for (let yy = y; yy >= top; yy--) if (!open(x, yy)) return false;
    for (let xx = x; xx !== x2; xx += sx) if (!open(xx, top)) return false;
    for (let yy = top; yy <= y2; yy++) if (!open(x2, yy)) return false;
    return true;
  };
  const sp = lvl.spawnTiles[0];
  let sy = sp.y; while (sy < H - 1 && !standable(sp.x, sy)) sy++;
  const dist = new Map([[key(sp.x, sy), 0]]), parent = new Map(), queue = [[sp.x, sy]];
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, y] = queue[qi], d = dist.get(key(x, y));
    for (let dx = -7; dx <= 7; dx++) for (let y2 = Math.max(0, y - 3); y2 < H; y2++) {
      const x2 = x + dx, k2 = key(x2, y2);
      if (dist.has(k2) || !standable(x2, y2) || !canHop(x, y, x2, y2)) continue;
      dist.set(k2, d + 1); parent.set(k2, [x, y]); queue.push([x2, y2]);
    }
  }
  const reached = (x, y) => dist.has(key(x, y));
  for (const r of runs) for (let x = r.x0; x <= r.x1; x++) if (reached(x, r.y)) r.reach = true;

  // main route = hop path from spawn to goal (or to the reachable node closest to the goal)
  const g = lvl.goalTile, gw = g.width || 1;
  let end = [g.x, g.y];
  if (!reached(g.x, g.y) && reached(g.x, g.y + 1)) end = [g.x, g.y + 1];
  if (!reached(end[0], end[1])) {
    let best = Infinity;
    for (const [x, y] of queue) { const dd = Math.abs(x - g.x) + Math.abs(y - g.y); if (dd < best) { best = dd; end = [x, y]; } }
  }
  const route = [];
  for (let n = end; n; n = parent.get(key(n[0], n[1]))) route.unshift(n);
  const goalReached = reached(g.x, g.y) || reached(g.x, g.y + 1);
  // the hop model is conservative: if it cannot prove the goal reachable, do not exclude any surface
  if (!goalReached) for (const r of runs) { r.reach = true; for (let x = r.x0; x <= r.x1; x++) if (!dist.has(key(x, r.y))) dist.set(key(x, r.y), 0); }

  // ---- safe zones ------------------------------------------------------------------------------
  const tall = H > W; // vertical level: the column rule only applies near the spawn/goal rows
  const nearSpawn = (x, y) => lvl.spawnTiles.some(s => Math.abs(x - s.x) <= 7 && (!tall || Math.abs(y - s.y) <= 6));
  const nearGoal = (x, y) => x >= g.x - 3 && x <= g.x + gw - 1 + 3 && (!tall || Math.abs(y - g.y) <= 6);
  const enemyZoneOk = (x, y) => !nearSpawn(x, y) && !nearGoal(x, y);

  // ---- checkpoint: surface node closest to the middle of the route ---------------------------
  let cp = null;
  {
    const cum = [0];
    for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.abs(route[i][0] - route[i - 1][0]) + Math.abs(route[i][1] - route[i - 1][1]));
    const half = cum[cum.length - 1] / 2;
    let best = Infinity;
    route.forEach(([x, y], i) => {
      const r = runAt.get(key(x, y));
      if (!r || r.len < 3 || nearSpawn(x, y) || nearGoal(x, y)) return;
      const sc = Math.abs(cum[i] - half);
      if (sc < best) { best = sc; cp = { x, y }; }
    });
    if (!cp) { // fallback: widest reachable run nearest the level centre
      const cands = runs.filter(r => r.reach && r.len >= 3).sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - W / 2) + Math.abs(a.y - H / 2) - Math.abs((b.x0 + b.x1) / 2 - W / 2) - Math.abs(b.y - H / 2));
      if (cands[0]) cp = { x: (cands[0].x0 + cands[0].x1) >> 1, y: cands[0].y };
    }
    if (cp) put(cp.x, cp.y, 'c');
  }

  // ---- heart: reachable small/high platform far away from the main route -------------------
  {
    let best = -Infinity, at = null;
    for (const r of runs) {
      if (!r.reach || r.len > 6) continue;
      const x = (r.x0 + r.x1) >> 1, y = r.y;
      if (!reached(x, y) || nearSpawn(x, y) || E[y][x] !== '.') continue;
      let off = Infinity;
      for (const [rx, ry] of route) off = Math.min(off, Math.abs(rx - x) + Math.abs(ry - y) * 1.5);
      const floating = open(x, y + 2) ? 2 : 0;
      const sc = off * 2 + (H - y) * (tall ? 0.1 : 0.8) + floating + (r.len <= 3 ? 1 : 0);
      if (sc > best) { best = sc; at = { x, y }; }
    }
    if (at) put(at.x, at.y, 'm');
  }

  // ---- ground enemies ------------------------------------------------------------------------
  const enemies = [];
  const clearOfEnemies = (x, y, gap) => enemies.every(e => Math.abs(e.x - x) >= gap || Math.abs(e.y - y) > 2);
  const clearOfCp = (x, y) => !cp || Math.abs(cp.x - x) >= 3 || Math.abs(cp.y - y) > 2;
  const order = (a, b) => tall ? (a.y - b.y || a.x - b.x) : (a.x - b.x || a.y - b.y);
  const buildSlots = (minLen, dense) => {
    const slots = [];
    for (const r of runs) {
      if (!r.reach || r.len < minLen) continue;
      let cap = r.len >= 18 ? 4 : r.len >= 13 ? 3 : r.len >= 8 ? 2 : 1;
      if (dense) cap = Math.max(cap, Math.floor(r.len / 4));
      cap = Math.min(cap, Math.floor(r.len / 3));
      const xs = [];
      if (cap === 1) xs.push(r.x0 + (r.len >= 3 ? 1 + Math.floor(rnd() * (r.len - 2)) : 0));
      else if (cap === 2 && rnd() < 0.5) { const m = (r.x0 + r.x1) >> 1; xs.push(m - 2, m + 1); }
      else for (let i = 0; i < cap; i++) xs.push(Math.floor(r.x0 + (r.len / cap) * (i + 0.5)));
      for (const x of xs) {
        if (x < r.x0 || x > r.x1 || !enemyZoneOk(x, r.y) || E[r.y][x] !== '.' || !clearOfCp(x, r.y)) continue;
        if (slots.some(s => Math.abs(s.x - x) < 3 && Math.abs(s.y - r.y) <= 2)) continue;
        slots.push({ x, y: r.y, run: r });
      }
    }
    return slots.sort(order);
  };
  let slots = buildSlots(5, false);
  if (slots.length < cfg.ground) slots = buildSlots(4, false);
  if (slots.length < cfg.ground) slots = buildSlots(3, false);
  if (slots.length < cfg.ground) slots = buildSlots(3, true);
  if (slots.length < cfg.ground) slots = buildSlots(2, true);
  const chosen = spread(slots, cfg.ground);
  const types = chosen.map(() => 'g');
  const assign = (ch, n, ok) => {
    const idx = chosen.map((s, i) => i).filter(i => types[i] === 'g' && ok(chosen[i], i));
    for (const i of spread(idx, n)) types[i] = ch;
  };
  assign('k', cfg.k, s => s.run.len >= 8);
  assign('s', cfg.s, (s, i) => s.run.len >= 6 && i >= chosen.length * 0.4 && [1, 2, 3].every(d => open(s.x, s.y - d)));
  assign('j', cfg.j, (s, i) => s.run.len >= 5 && i >= chosen.length * 0.3);
  chosen.forEach((s, i) => { if (put(s.x, s.y, types[i])) enemies.push({ x: s.x, y: s.y, ch: types[i] }); });

  // ---- gaps between runs on the same row (pits, water, lifts) --------------------------------
  const gaps = [];
  for (let y = 0; y < H; y++) {
    const row = runs.filter(r => r.y === y).sort((a, b) => a.x0 - b.x0);
    for (let i = 0; i + 1 < row.length; i++) {
      const a = row[i], b = row[i + 1], x0 = a.x1 + 1, x1 = b.x0 - 1, w = x1 - x0 + 1;
      if (w < 1 || w > 7 || !(a.reach || b.reach)) continue;
      let ok = true;
      for (let x = x0; x <= x1; x++) if (!open(x, y) || !open(x, y - 1)) ok = false;
      if (ok) gaps.push({ y, x0, x1, w });
    }
  }
  gaps.sort((a, b) => order({ x: a.x0, y: a.y }, { x: b.x0, y: b.y }));

  // ---- flyers: open air 2-3 tiles above ground, preferably over gaps ---------------------------
  const flyerSpot = (x, y) => {
    if (!enemyZoneOk(x, y) || !clearOfEnemies(x, y, 4) || !clearOfCp(x, y)) return false;
    for (let d = -2; d <= 2; d++) if (!empty(x + d, y) || E[y][x + d] !== '.') return false;
    return empty(x, y + 1) && open(x, y - 1);
  };
  let flyers = 0;
  const tryFlyer = (x, groundY) => {
    if (flyers >= cfg.f) return;
    const hs = rnd() < 0.5 ? [2, 3] : [3, 2];
    for (const h of hs) {
      if (flyerSpot(x, groundY - h) && put(x, groundY - h, 'f')) { enemies.push({ x, y: groundY - h, ch: 'f' }); flyers++; return; }
    }
  };
  for (const gp of spread(gaps.filter(q => q.w >= 2), cfg.f * 2)) tryFlyer((gp.x0 + gp.x1) >> 1, gp.y);
  if (flyers < cfg.f) {
    const cands = [];
    for (const r of runs) if (r.reach && r.len >= 4) cands.push({ x: (r.x0 + r.x1) >> 1, y: r.y });
    cands.sort(order);
    for (const c of spread(cands, cands.length)) tryFlyer(c.x, c.y);
  }

  // ---- spikes: only on wide flat runs with lots of head room (can always be jumped over) ------
  {
    const cands = [];
    for (const r of runs) {
      if (!r.reach || r.len < 9) continue;
      for (let x = r.x0 + 3; x <= r.x1 - 3; x++) {
        if (E[r.y][x] !== '.' || !enemyZoneOk(x, r.y) || !clearOfEnemies(x, r.y, 3) || !clearOfCp(x, r.y)) continue;
        let clear = true;
        for (let dx = -2; dx <= 2; dx++) for (let dy = 1; dy <= 3; dy++) if (!empty(x + dx, r.y - dy)) clear = false;
        if (clear) { cands.push({ x, y: r.y }); break; }
      }
    }
    cands.sort(order);
    for (const c of spread(cands, Math.min(cfg.spikes, 3))) put(c.x, c.y, '^');
  }

  // ---- coins -----------------------------------------------------------------------------------
  let coins = 0;
  const coin = (x, y) => { if (coins < COIN_MAX && put(x, y, 'o')) { coins++; return true; } return false; };
  // arcs over gaps
  for (const gp of gaps) {
    if (coins >= cfg.coins || gp.w < 2) continue;
    const n = gp.w + 2;
    for (let i = 0; i < n; i++) {
      const x = gp.x0 - 1 + i, rise = Math.round(2 * Math.sin(Math.PI * (i + 0.5) / n));
      let y = gp.y - 1 - rise;
      while (y < gp.y && !empty(x, y)) y++;
      if (y < gp.y) coin(x, y);
    }
  }
  // on top of floating platforms
  for (const r of runs) {
    if (coins >= cfg.coins || !r.reach || r.len > 8 || r.len < 2) continue;
    let thin = 0;
    for (let x = r.x0; x <= r.x1; x++) if (open(x, r.y + 2)) thin++;
    if (thin * 2 < r.len) continue;
    const n = Math.min(r.len, 5), x0 = r.x0 + ((r.len - n) >> 1);
    for (let i = 0; i < n; i++) coin(x0 + i, r.y);
  }
  // rows of 3-5 coins floating 2 tiles above flat ground
  const flat = runs.filter(r => r.reach && r.len >= 5);
  for (let i = flat.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [flat[i], flat[j]] = [flat[j], flat[i]]; }
  const coinRow = (r, n, x0) => {
    for (const h of [2, 1]) {
      let ok = true;
      for (let i = 0; i < n; i++) for (let d = 1; d <= h; d++) if (!empty(x0 + i, r.y - d)) ok = false;
      for (let i = 0; i < n; i++) if (E[r.y - h] && E[r.y - h][x0 + i] !== '.') ok = false;
      if (!ok) continue;
      for (let i = 0; i < n; i++) coin(x0 + i, r.y - h);
      return true;
    }
    return false;
  };
  for (const r of flat) {
    if (coins >= cfg.coins) break;
    const n = Math.min(3 + Math.floor(rnd() * 3), r.len - 2, cfg.coins - coins < 3 ? 3 : 5);
    const rows = r.len >= 16 ? 2 : 1;
    for (let k = 0; k < rows; k++) {
      const seg = r.len / rows, lo = Math.floor(r.x0 + seg * k) + 1, hi = Math.floor(r.x0 + seg * (k + 1)) - n - 1;
      const x0 = hi > lo ? lo + Math.floor(rnd() * (hi - lo + 1)) : lo;
      if (x0 + n - 1 <= r.x1) coinRow(r, n, x0);
    }
  }
  // top-up (cramped levels): short trails at head height / walking height on the remaining runs
  for (const minLen of [3, 2, 1]) for (const h of [1, 0]) {
    for (const r of runs.slice().sort(order)) {
      if (coins >= Math.max(COIN_MIN + 6, cfg.coins - 8)) break;
      if (!r.reach || r.len < minLen) continue;
      let has = false;
      for (let x = r.x0; x <= r.x1; x++) for (let d = 0; d <= 3; d++) if (E[r.y - d] && E[r.y - d][x] === 'o') has = true;
      if (has) continue;
      const n = Math.min(r.len, 3), x0 = r.x0 + ((r.len - n) >> 1);
      for (let i = 0; i < n; i++) if (empty(x0 + i, r.y - h) && reached(x0 + i, r.y)) coin(x0 + i, r.y - h);
    }
  }

  // ---- validate --------------------------------------------------------------------------------
  const errors = [], counts = {};
  if (E.length !== H) errors.push('row count differs from tiles');
  E.forEach((row, y) => {
    if (row.length !== T[y].length || row.length !== W) errors.push(`row ${y}: bad length ${row.length}`);
    row.forEach((ch, x) => {
      if (ch === '.') return;
      counts[ch] = (counts[ch] || 0) + 1;
      if (!ALLOWED.includes(ch)) errors.push(`(${x},${y}) illegal symbol ${ch}`);
      if (T[y][x] !== '.') errors.push(`(${x},${y}) ${ch} on non-empty tile ${T[y][x]}`);
      if ((GROUND.includes(ch) || ch === 'c' || ch === '^') && !solid(x, y + 1)) errors.push(`(${x},${y}) ${ch} without solid ground below`);
      if (ENEMIES.includes(ch) && !enemyZoneOk(x, y)) errors.push(`(${x},${y}) enemy ${ch} inside spawn/goal safe zone`);
    });
  });
  const nEnemies = [...ENEMIES].reduce((n, ch) => n + (counts[ch] || 0), 0);
  const [eMin, eMax] = ENEMY_RANGE[cfg.file];
  const warnings = [];
  if (nEnemies < eMin || nEnemies > eMax) warnings.push(`enemy count ${nEnemies} outside target ${eMin}-${eMax}`);
  if ((counts.o || 0) < COIN_MIN || (counts.o || 0) > COIN_MAX) warnings.push(`coin count ${counts.o || 0} outside target ${COIN_MIN}-${COIN_MAX}`);
  if ((counts.c || 0) !== 1) errors.push(`checkpoints: ${counts.c || 0}`);
  if ((counts.m || 0) !== 1) errors.push(`hearts: ${counts.m || 0}`);
  if ((counts['^'] || 0) > 3) errors.push('too many spikes');
  if (counts.x) errors.push('ghosts are not allowed in world 1');

  const summary = `${cfg.file} "${cfg.name}" ${W}x${H} enemies=${nEnemies} ` +
    [...ALLOWED].filter(ch => ch !== '.' && counts[ch]).map(ch => `${ch}=${counts[ch]}`).join(' ') +
    ` goalReachable=${goalReached}`;
  console.log(summary);
  if (print) {
    for (let y = 0; y < H; y++) console.log(String(y).padStart(3) + ' ' + E[y].map((ch, x) => ch !== '.' ? ch : (T[y][x] === '.' ? ' ' : (T[y][x] === 's' || T[y][x] === 'w' ? '~' : T[y][x] === '#' || T[y][x] === 'b' ? '\u2588' : '=') )).join(''));
  }
  if (warnings.length) console.log('  WARNING: ' + warnings.join('; '));
  if (errors.length) { console.error('  INVALID:\n  ' + errors.join('\n  ')); return { ok: false, summary }; }

  // ---- write back (same pretty format as the originals: one grid row per line) ---------------
  const out = { name: cfg.name, theme: 'grass', tileSize: lvl.tileSize, timeLimit: cfg.timeLimit, legend: Object.assign({}, lvl.legend, ENTITY_LEGEND) };
  for (const k of Object.keys(lvl)) if (!(k in out) && k !== 'entities') out[k] = lvl[k];
  out.entities = E.map(r => r.join(''));
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  return { ok: true, summary };
}

const print = process.argv.includes('--print');
let ok = true;
for (const cfg of LEVELS) ok = populate(cfg, print).ok && ok;
process.exit(ok ? 0 : 1);
