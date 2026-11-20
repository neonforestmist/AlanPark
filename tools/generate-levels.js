#!/usr/bin/env node
'use strict';
// Deterministic level generator: composes levels from hand-designed chunk templates,
// validates them (incl. a conservative reachability check) and writes public/levels/world-*.json.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'levels');
const H = 16, GY = 13, WY = 12; // GY = top row of the ground, WY = row players walk on
const SOLID = '#b', GROUND_ENT = 'gksjpc^', ENEMIES = 'gkfsjxp';

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Builder {
  constructor(cfg) {
    this.cfg = cfg; this.r = mulberry(cfg.seed); this.W = 0;
    this.t = []; this.e = []; this.d = [];
    for (let y = 0; y < H; y++) { this.t.push([]); this.e.push([]); this.d.push([]); }
  }
  ri(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  ge() { const s = this.cfg.ground; return s[Math.floor(this.r() * s.length)]; }
  add(n, solid = true) {
    const x0 = this.W;
    for (let i = 0; i < n; i++) for (let y = 0; y < H; y++) {
      this.t[y].push(solid && y >= GY ? '#' : '.'); this.e[y].push('.'); this.d[y].push('.');
    }
    this.W += n;
    return x0;
  }
  inb(x, y) { return x >= 0 && x < this.W && y >= 0 && y < H; }
  T(x, y, ch) { if (this.inb(x, y)) { this.t[y][x] = ch; this.e[y][x] = '.'; } }
  solid(x, y) { return this.inb(x, y) && SOLID.includes(this.t[y][x]); }
  free(x, y) { return this.inb(x, y) && this.t[y][x] === '.' && this.e[y][x] === '.'; }
  E(x, y, ch) {
    if (!this.free(x, y)) return false;
    if (GROUND_ENT.includes(ch) && !this.solid(x, y + 1)) return false;
    if ((ENEMIES + '^').includes(ch) && x < 15) return false;
    this.e[y][x] = ch;
    return true;
  }
  count(set) { let n = 0; for (const row of this.e) for (const ch of row) if (ch !== '.' && set.includes(ch)) n++; return n; }
}

// Every chunk starts and ends on flat base ground so chunks compose safely.
const CH = {
  S(b) { b.add(12); },
  F(b) { // flat run with an enemy pack
    const n = b.ri(9, 11), x = b.add(n), k = b.ri(2, 3);
    for (let i = 0; i < 4; i++) b.E(x + 3 + i, 10, 'o');
  },
  T(b) { // brick staircase
    const x = b.add(11);
    [1, 2, 3, 3, 2, 1].forEach((h, i) => { for (let k = 0; k < h; k++) b.T(x + 2 + i, WY - k, 'b'); });
    for (const [dx, y] of [[4, 9], [5, 9], [4, 8], [5, 8]]) b.E(x + dx, y, 'o');
  },
  G(b) { // gap with a coin arc
    b.add(3);
    const w = b.ri(2, 3), g = b.add(w, false);
    b.add(3);
    b.E(g - 1, 10, 'o'); b.E(g + w, 10, 'o');
    for (let i = 0; i < w; i++) b.E(g + i, 9, 'o');
  },
  P(b) { // floating brick platforms
    const x = b.add(13);
    for (let i = 2; i <= 5; i++) { b.T(x + i, 10, 'b'); b.E(x + i, 9, 'o'); }
    for (let i = 7; i <= 10; i++) { b.T(x + i, 8, 'b'); b.E(x + i, 7, 'o'); }
  },
  H(b) { // pit crossed by a 2-wide horizontal lift (gaps stay <= 3 even if the lift is parked)
    b.add(3);
    const p = b.add(8, false);
    b.T(p + 3, GY, 'h'); b.T(p + 4, GY, 'h');
    b.add(3);
    for (let i = 1; i <= 6; i++) b.E(p + i, 10, 'o');
  },
  V(b) { // pit with a vertical lift in the middle
    b.add(3);
    const p = b.add(7, false);
    b.T(p + 3, GY, 'v');
    b.add(3);
    for (const [dx, y] of [[1, 10], [2, 9], [3, 8], [4, 9], [5, 10]]) b.E(p + dx, y, 'o');
  },
  W(b) { // water pools separated by small islands
    b.add(2);
    const segs = b.ri(2, 3);
    for (let s = 0; s < segs; s++) {
      const p = b.add(3, false);
      for (let i = 0; i < 3; i++) {
        b.T(p + i, GY, 's'); b.T(p + i, GY + 1, 'w'); b.T(p + i, GY + 2, '#');
        b.E(p + i, i === 1 ? 10 : 11, 'o');
      }
      if (s < segs - 1) b.add(2);
    }
    b.add(2);
  },
  K(b) { // spike corridor (max 2 spikes in a row, 2 safe tiles between)
    const x = b.add(13);
    for (const i of [2, 6, 10]) { b.E(x + i, WY, '^'); b.E(x + i, 9, 'o'); b.E(x + i + 1, 9, 'o'); }
  },
  Y(b) { // flyer gauntlet over gaps
    b.add(3);
    for (let s = 0; s < 2; s++) {
      const g = b.add(2, false);
      b.E(g, WY - 2, 'f');
      const p = b.add(4);
      b.E(p + 1, 10, 'o'); b.E(p + 2, 10, 'o');
    }
  },
  O(b, heart) { // tower climb (steps of 2)
    const x = b.add(15);
    for (const [i, h] of [[2, 2], [3, 2], [4, 4], [5, 4], [6, 6], [7, 6], [8, 6], [9, 4], [10, 4], [11, 2], [12, 2]]) {
      for (let k = 0; k < h; k++) b.T(x + i, WY - k, 'b');
    }
    for (const [dx, y] of [[2, 10], [3, 10], [4, 8], [5, 8], [6, 6], [8, 6], [9, 8], [10, 8], [11, 10], [12, 10]]) b.E(x + dx, y, 'o');
    b.E(x + 7, 6, heart ? 'm' : 'o');
  },
  M(b) { CH.O(b, true); },
  C(b) { const x = b.add(9); b.E(x + 4, WY, 'c'); },
  X(b) { // haunted hall: low ceiling, spikes and a ghost
    const x = b.add(14);
    for (let i = 1; i <= 12; i++) b.T(x + i, 6, 'b');
    for (const i of [2, 12]) { b.E(x + i, WY, '^'); b.E(x + i, 9, 'o'); b.E(x + i, 10, 'o'); }
    b.E(x + 7, 8, 'x');
  },
  E(b) { // final staircase, then the flag on flat ground
    const x = b.add(18);
    [1, 2, 3, 4, 4].forEach((h, i) => { for (let k = 0; k < h; k++) b.T(x + 2 + i, WY - k, 'b'); });
    for (let i = 0; i < 4; i++) b.E(x + 2 + i, WY - 1 - i - 1, 'o');
    return x + 13;
  },
};

function sprinkle(b) {
  const cfg = b.cfg;
  const W = b.W, endX = W - 18, FR = WY - 2; // FR: flyer row = standing row - 2
  const okGround = (x) => {
    for (let dx = -2; dx <= 2; dx++) if (b.t[GY][x + dx] !== '#') return false; // >= 2 solid columns to any gap
    for (let dx = -1; dx <= 1; dx++) for (let y = 9; y <= WY; y++) if (b.t[y][x + dx] !== '.') return false;
    for (let dx = -3; dx <= 3; dx++) if ('^c'.includes(b.e[WY][x + dx])) return false;
    return true;
  };
  const hazardNear = (x) => {
    for (let dx = -3; dx <= 3; dx++) for (let y = 0; y < H; y++) if (b.inb(x + dx, y) && 'spx^'.includes(b.e[y][x + dx])) return true;
    return false;
  };
  const slots = [];
  let last = -99;
  for (let x = 15; x < endX; x++) if (x - last >= 5 && okGround(x)) { slots.push(x); last = x; }
  while (slots.length > cfg.enemies) slots.splice(Math.floor(b.r() * slots.length), 1);
  for (const x of slots) {
    let ch = b.ge();
    if ('sp'.includes(ch) && hazardNear(x)) ch = cfg.ground.includes('g') ? 'g' : 'k';
    b.e[WY][x] = ch;
  }
  const fMax = Math.min(10, Math.floor(b.count('gksjpx') * 3 / 7)); // flyers <= 30% of all enemies
  let f = b.count('f');
  for (let x = W - 1; x >= 0 && f > fMax; x--) if (b.e[FR][x] === 'f') { b.e[FR][x] = '.'; f--; }
  const okFly = (x) => {
    if (b.e[FR][x] !== '.') return false;
    let surf = false;
    for (let dx = -3; dx <= 3; dx++) {
      for (let y = FR; y <= WY; y++) if (b.t[y][x + dx] !== '.') return false;
      const g = b.t[GY][x + dx];
      if (g === 'h' || g === 'v') return false;
      if (g === '#') surf = true;
      if ('^c'.includes(b.e[WY][x + dx])) return false;
    }
    for (let dx = -4; dx <= 4; dx++) {
      if (b.e[FR][x + dx] === 'f') return false;
      if (Math.abs(dx) <= 3 && ENEMIES.includes(b.e[WY][x + dx])) return false;
    }
    return surf;
  };
  for (const gapOnly of [true, false]) {
    const cand = [];
    for (let x = 16; x < endX; x++) if (!gapOnly || b.t[GY][x] !== '#') cand.push(x);
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(b.r() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    for (const x of cand) { if (f >= fMax) break; if (okFly(x)) { b.e[FR][x] = 'f'; f++; } }
  }
  let tries = 0;
  while (b.count('o') < cfg.coins && tries++ < 6000) {
    const x = b.ri(7, b.W - 14), y = b.ri(9, 10);
    let ok = true;
    for (let i = 0; i < 3 && ok; i++) {
      if (b.t[GY][x + i] !== '#') ok = false;
      for (let yy = y; yy <= WY; yy++) if (b.t[yy][x + i] !== '.') ok = false;
      if (b.e[y][x + i] !== '.') ok = false;
    }
    if (ok) for (let i = 0; i < 3; i++) b.e[y][x + i] = 'o';
  }
  for (let x = 1; x < b.W - 1; x++) {
    if (b.t[GY][x] === '#' && b.t[WY][x] === '.' && b.e[WY][x] === '.' && b.r() < 0.2) {
      b.d[WY][x] = cfg.decor[Math.floor(b.r() * cfg.decor.length)];
    }
  }
}

function build(cfg) {
  const b = new Builder(cfg);
  let goalX = 0;
  for (const ch of cfg.seq) { const r = CH[ch](b); if (ch === 'E') goalX = r; }
  sprinkle(b);
  return {
    name: cfg.name, theme: cfg.theme, tileSize: 64, timeLimit: cfg.time,
    spawnTiles: [{ x: 2, y: WY }, { x: 4, y: WY }],
    goalTile: { x: goalX, y: WY, width: 1, height: 1 },
    tiles: b.t.map((r) => r.join('')), decor: b.d.map((r) => r.join('')), entities: b.e.map((r) => r.join('')),
  };
}

function validate(L) {
  const errs = [], t = L.tiles, e = L.entities, d = L.decor, W = t[0].length;
  const stats = { enemies: {}, coins: 0, total: 0, W, H: t.length };
  if (t.length !== H || e.length !== H || d.length !== H) errs.push('row count must be ' + H);
  if (W < 110 || W > 200) errs.push('width ' + W + ' outside 110-200');
  for (const [nm, g, allowed] of [['tiles', t, '.#bhvsw'], ['decor', d, '.123456'], ['entities', e, '.omc^gkfsjxp']]) {
    g.forEach((row, y) => {
      if (row.length !== W) errs.push(`${nm} row ${y} length ${row.length} != ${W}`);
      for (const ch of row) if (!allowed.includes(ch)) errs.push(`${nm} row ${y} bad symbol '${ch}'`);
    });
  }
  if (errs.length) return { errs, stats };
  const solid = (x, y) => y >= 0 && y < H && x >= 0 && x < W && SOLID.includes(t[y][x]);
  let checkpoints = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const en = e[y][x];
    if (d[y][x] !== '.' && t[y][x] !== '.') errs.push(`decor on non-empty tile at ${x},${y}`);
    if (en === '.') continue;
    if (t[y][x] !== '.') errs.push(`entity '${en}' on non-empty tile at ${x},${y}`);
    if (GROUND_ENT.includes(en) && !solid(x, y + 1)) errs.push(`'${en}' at ${x},${y} is not on solid ground`);
    if (ENEMIES.includes(en)) {
      stats.enemies[en] = (stats.enemies[en] || 0) + 1; stats.total++;
      if (x <= 14) errs.push(`enemy '${en}' within 10 columns of spawn at ${x},${y}`);
      for (let dx = 1; dx <= 4; dx++) if (ENEMIES.includes(e[y][x + dx])) errs.push(`enemies closer than 4 columns apart at ${x},${y}`);
    }
    if (en === '^' && x <= 14) errs.push(`spikes within 10 columns of spawn at ${x},${y}`);
    if ('spx^'.includes(en)) {
      for (let dx = 1; dx <= 3; dx++) for (let yy = 0; yy < H; yy++) if (x + dx < W && 'spx^'.includes(e[yy][x + dx])) errs.push(`non-stompable hazards within 3 columns at ${x},${y}`);
    }
    if (en === 'f') { // rule 1: exactly at standing row - 2, no solid in its patrol range
      let surf = false;
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W || y + 3 >= H) continue;
        if (t[y][xx] !== '.' || t[y + 1][xx] !== '.' || t[y + 2][xx] !== '.') errs.push(`flyer at ${x},${y}: solid tile in/under patrol range at column ${xx}`);
        if (SOLID.includes(t[y + 3][xx])) surf = true;
      }
      if (!surf) errs.push(`flyer at ${x},${y} is not at standing row - 2`);
    }
    if (en === 'o') stats.coins++;
    if (en === 'c') checkpoints++;
    if (en === '^' && e[y][x + 1] === '^' && e[y][x + 2] === '^') errs.push(`3+ spikes in a row at ${x},${y}`);
  }
  for (const s of L.spawnTiles.concat([L.goalTile])) {
    if (t[s.y][s.x] !== '.' || !solid(s.x, s.y + 1)) errs.push(`spawn/goal ${s.x},${s.y} not on empty tile above solid ground`);
  }
  for (const x of [0, 1, 2, 3, 4, 5, W - 6, W - 5, W - 4, W - 3, W - 2, W - 1]) {
    for (let y = 0; y < H; y++) if (t[y][x] !== (y >= GY ? '#' : '.')) errs.push(`column ${x} is not flat solid ground`);
  }
  let run = 0;
  for (let x = 0; x < W; x++) {
    run = t[GY][x] === '.' ? run + 1 : 0;
    if (run > 4) { errs.push(`gap wider than 4 on the ground line at x=${x}`); break; }
  }
  if (stats.total < MIN_ENEMIES || stats.total > 60) errs.push(`enemy count ${stats.total} outside ${MIN_ENEMIES}-60`);
  if ((stats.enemies.f || 0) > 0.3 * stats.total) errs.push(`flyers ${stats.enemies.f} exceed 30% of ${stats.total} enemies`);
  if ((stats.enemies.x || 0) > 2) errs.push('more than 2 ghosts');
  if (stats.coins < 40 || stats.coins > 100) errs.push(`coin count ${stats.coins} outside 40-100`);
  if (checkpoints < 1 || checkpoints > 2) errs.push(`checkpoint count ${checkpoints} outside 1-2`);
  // Conservative reachability: standable = empty tile with headroom, on solid/lift, no spikes.
  const stand = (x, y) => x >= 0 && x < W && y >= 1 && y < H - 1 && t[y][x] === '.' && t[y - 1][x] === '.' &&
    '#bhv'.includes(t[y + 1][x]) && e[y][x] !== '^';
  const seen = new Set(), q = [[L.spawnTiles[0].x, L.spawnTiles[0].y]];
  seen.add(q[0].join());
  while (q.length) {
    const [x, y] = q.pop();
    for (let dx = -4; dx <= 4; dx++) for (let y2 = y - 3; y2 < H - 1; y2++) {
      const up = y - y2, ax = Math.abs(dx);
      if ((up === 3 && ax > 2) || (up > 0 && up < 3 && ax > 3)) continue;
      const k = (x + dx) + ',' + y2;
      if (!seen.has(k) && stand(x + dx, y2)) { seen.add(k); q.push([x + dx, y2]); }
    }
  }
  if (!seen.has(L.goalTile.x + ',' + L.goalTile.y)) errs.push('goal is not reachable with jumps <= 3 up / gaps <= 3');
  if (!seen.has(L.spawnTiles[1].x + ',' + L.spawnTiles[1].y)) errs.push('second spawn not connected');
  return { errs, stats };
}

const MIN_ENEMIES = 15; // strict spacing rules cap what fits; see summary
const DEC = { desert: '6614', cave: '662', snow: '3364', castle: '66', night: '32514' };
const LEVELS = [
  // file, name, theme, chunk sequence, ground enemy pool, flyer ratio, enemies, coins, time
  ['world-2-1', '2-1 Dune Dash', 'desert', 'SFTGFPCWFGTFE', 'ggggkk', 0.25, 24, 60, 300],
  ['world-2-2', '2-2 Scorpion Steps', 'desert', 'SFGPFYCTWFHFE', 'gggkkk', 0.3, 24, 62, 300],
  ['world-2-3', '2-3 Oasis Run', 'desert', 'STFWGOCPYFHGFE', 'ggkkk', 0.3, 24, 66, 310],
  ['world-3-1', '3-1 Crystal Hollow', 'cave', 'SFKGTPCFWKOFE', 'ggkksj', 0.2, 24, 64, 320],
  ['world-3-2', '3-2 Stalactite Shuffle', 'cave', 'SKFHPGCYKTVFE', 'gkkssjj', 0.2, 24, 66, 320],
  ['world-3-3', '3-3 Deep Dark Drop', 'cave', 'SFOKGHCPKWYMFE', 'gkssjj', 0.25, 24, 70, 330],
  ['world-4-1', '4-1 Frostbite Ferry', 'snow', 'SFHTVCPFGWHFE', 'ggkksjp', 0.25, 24, 66, 340],
  ['world-4-2', '4-2 Avalanche Alley', 'snow', 'SPHFVYCKHTGVFE', 'gkksjpp', 0.25, 24, 70, 340],
  ['world-4-3', '4-3 Glacier Gauntlet', 'snow', 'SFVOHKCYHPVWMFE', 'gkssjjpp', 0.3, 24, 74, 350],
  ['world-5-1', '5-1 Dungeon Doors', 'castle', 'SKFXTFCGPKHFE', 'gkssjpp', 0.2, 24, 68, 360],
  ['world-5-2', '5-2 Spike Keep', 'castle', 'SXKOFGCVKYXFKE', 'kkssjjpp', 0.25, 24, 72, 360],
  ['world-5-3', '5-3 Phantom Fortress', 'castle', 'SKXHFOCKVYCXMFE', 'kssjjpp', 0.25, 24, 80, 380],
  ['world-6-1', '6-1 Midnight Marathon', 'night', 'SFKHCXOYVCXKMFE', 'gkkssjjpp', 0.3, 24, 90, 400],
];

let failed = false;
const lines = ['file            | name                      | theme  | size   | enemies (by type)                         | coins'];
LEVELS.forEach(([file, name, theme, seq, ground, fly, enemies, coins, time], i) => {
  const L = build({ seed: 1000 + i * 7919, name, theme, seq, ground, fly, enemies, coins, time, decor: DEC[theme] });
  const { errs, stats } = validate(L);
  if (errs.length) {
    failed = true;
    console.error(`INVALID ${file}:\n  - ` + errs.slice(0, 12).join('\n  - '));
    return;
  }
  fs.writeFileSync(path.join(OUT, file + '.json'), JSON.stringify(L, null, 1) + '\n');
  const by = Object.keys(stats.enemies).sort().map((k) => k + ':' + stats.enemies[k]).join(' ');
  lines.push(`${(file + '.json').padEnd(15)} | ${name.padEnd(25)} | ${theme.padEnd(6)} | ${(stats.W + 'x' + stats.H).padEnd(6)} | ${(stats.total + ' (' + by + ')').padEnd(41)} | ${stats.coins}`);
});
console.log(lines.join('\n'));
if (failed) { console.error('Level validation FAILED'); process.exit(1); }
console.log('All ' + LEVELS.length + ' levels generated and validated.');
