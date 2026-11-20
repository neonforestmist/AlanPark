"use strict";

// Server-side co-op game rules layered on top of the tether platformer:
// coins, hearts, checkpoints, spikes, enemies, shared lives, score and timer.

const GRAVITY = 1800;
const MAX_FALL_SPEED = 1150;
const START_LIVES = 5;
const COINS_PER_LIFE = 50;
const INVULN_MS = 2000;
const ACTIVE_RANGE = 1500;
const DEFAULT_TIME_LIMIT = 300;
const ENTITY_SYMBOLS = "omc^gkfsjxp";
const THEMES = ["grass", "desert", "cave", "snow", "castle", "night"];

const ENEMY_TYPES = {
  g: { name: "walker", w: 48, h: 44, speed: 70, ledge: true, stomp: true, points: 100 },
  k: { name: "beetle", w: 52, h: 40, speed: 150, ledge: false, stomp: true, points: 200 },
  f: { name: "flyer", w: 48, h: 36, speed: 90, ledge: false, stomp: true, points: 200 },
  s: { name: "spiky", w: 48, h: 44, speed: 55, ledge: true, stomp: false, points: 0 },
  j: { name: "jumper", w: 44, h: 44, speed: 130, ledge: false, stomp: true, points: 300 },
  x: { name: "ghost", w: 48, h: 48, speed: 60, ledge: false, stomp: false, points: 0 },
  p: { name: "popper", w: 44, h: 60, speed: 0, ledge: false, stomp: false, points: 0 },
};

function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function normalizeTheme(value) {
  return THEMES.includes(value) ? value : "grass";
}

function normalizeTimeLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_TIME_LIMIT;
  return Math.min(Math.max(Math.round(numeric), 60), 999);
}

function normalizeEntityRows(entityRows, tiles) {
  const raw = Array.isArray(entityRows) ? entityRows : [];
  return tiles.map((tileRow, y) => {
    const source = typeof raw[y] === "string" ? raw[y] : "";
    let row = "";
    for (let x = 0; x < tileRow.length; x += 1) {
      const symbol = source[x];
      row += symbol && tileRow[x] === "." && ENTITY_SYMBOLS.includes(symbol) ? symbol : ".";
    }
    return row;
  });
}

function refreshFlags(game) {
  game.takenStr = game.pickups.map((pickup) => (pickup.taken ? "1" : "0")).join("");
  game.cpStr = game.checkpoints.map((checkpoint) => (checkpoint.on ? "1" : "0")).join("");
}

function createGameState(world, carry) {
  const ts = world.tileSize;
  const game = {
    score: carry ? carry.score : 0,
    coins: carry ? carry.coins : 0,
    lives: carry ? carry.lives : START_LIVES,
    timeLeft: world.timeLimit || DEFAULT_TIME_LIMIT,
    checkpoint: null,
    pickups: [],
    spikes: [],
    checkpoints: [],
    enemies: [],
    takenStr: "",
    cpStr: "",
  };
  const rows = Array.isArray(world.entities) ? world.entities : [];
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < rows[y].length; x += 1) {
      const symbol = rows[y][x];
      if (symbol === ".") continue;
      const px = x * ts;
      const py = y * ts;
      if (symbol === "o" || symbol === "m") {
        game.pickups.push({
          kind: symbol, x: px + ts * 0.2, y: py + ts * 0.2, width: ts * 0.6, height: ts * 0.6, taken: false,
        });
      } else if (symbol === "^") {
        game.spikes.push({ x: px + 10, y: py + ts * 0.6, width: ts - 20, height: ts * 0.4 });
      } else if (symbol === "c") {
        game.checkpoints.push({ x: px, y: py, width: ts, height: ts, on: false });
      } else if (ENEMY_TYPES[symbol]) {
        const def = ENEMY_TYPES[symbol];
        const ex = px + (ts - def.w) / 2;
        const floats = symbol === "f" || symbol === "x";
        const ey = floats ? py + (ts - def.h) / 2 : py + ts - def.h;
        game.enemies.push({
          id: game.enemies.length, t: symbol, x: ex, y: ey, sx: ex, sy: ey,
          width: def.w, height: def.h, vx: 0, vy: 0, dir: -1,
          alive: true, active: false, onGround: false,
          clock: (x * 0.37) % 3, hop: 0.6 + (x % 5) * 0.2,
        });
      }
    }
  }
  refreshFlags(game);
  return game;
}

function isSolidTile(world, column, row) {
  if (column < 0 || column >= world.columns) return true;
  if (row < 0 || row >= world.rows) return false;
  const symbol = world.tiles[row][column];
  return symbol === "#" || symbol === "b";
}

function solidAt(world, px, py) {
  return isSolidTile(world, Math.floor(px / world.tileSize), Math.floor(py / world.tileSize));
}

function nearestPlayer(enemy, players) {
  let best = null;
  let bestDistance = Infinity;
  const cx = enemy.x + enemy.width / 2;
  const cy = enemy.y + enemy.height / 2;
  for (const player of players) {
    const distance = Math.hypot(player.x + player.width / 2 - cx, player.y + player.height / 2 - cy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = player;
    }
  }
  return best ? { player: best, distance: bestDistance } : null;
}

function popperOffset(enemy) {
  // 0 = fully out of the ground, enemy.height = fully hidden.
  const wave = Math.sin(enemy.clock * 1.7);
  return Math.min(Math.max(0.5 + wave * 0.75, 0), 1) * enemy.height;
}

function enemyHitbox(enemy) {
  if (enemy.t !== "p") return enemy;
  const visible = enemy.sy + enemy.height - enemy.y;
  if (visible < 12) return null;
  return { x: enemy.x + 4, y: enemy.y, width: enemy.width - 8, height: visible };
}

function updateEnemy(enemy, world, players, dt) {
  const def = ENEMY_TYPES[enemy.t];
  const ts = world.tileSize;
  enemy.clock += dt;

  if (enemy.t === "p") {
    enemy.y = enemy.sy + popperOffset(enemy);
    return;
  }

  if (enemy.t === "x") {
    const target = nearestPlayer(enemy, players);
    if (target && target.distance < 620 && target.distance > 4) {
      const tx = target.player.x + target.player.width / 2 - (enemy.x + enemy.width / 2);
      const ty = target.player.y + target.player.height / 2 - (enemy.y + enemy.height / 2);
      enemy.x += (tx / target.distance) * def.speed * dt;
      enemy.y += (ty / target.distance) * def.speed * dt;
      enemy.dir = tx < 0 ? -1 : 1;
    } else {
      enemy.y += Math.sin(enemy.clock * 2) * 12 * dt;
    }
    return;
  }

  if (enemy.t === "f") {
    let nextX = enemy.x + enemy.dir * def.speed * dt;
    const front = enemy.dir > 0 ? nextX + enemy.width : nextX;
    if (Math.abs(nextX - enemy.sx) > ts * 2.5 || solidAt(world, front, enemy.y + enemy.height / 2)) {
      enemy.dir = -enemy.dir;
      nextX = enemy.x;
    }
    enemy.x = nextX;
    enemy.y = enemy.sy + Math.sin(enemy.clock * 3) * 18;
    return;
  }

  enemy.vy = Math.min(enemy.vy + GRAVITY * dt, MAX_FALL_SPEED);
  if (enemy.t === "j") {
    if (enemy.onGround) {
      enemy.vx = 0;
      enemy.hop -= dt;
      if (enemy.hop <= 0) {
        const target = nearestPlayer(enemy, players);
        if (target) {
          enemy.dir = target.player.x + target.player.width / 2 < enemy.x + enemy.width / 2 ? -1 : 1;
        }
        enemy.vy = -640;
        enemy.vx = enemy.dir * def.speed;
        enemy.hop = 1.1 + (enemy.id % 5) * 0.15;
        enemy.onGround = false;
      }
    }
  } else {
    enemy.vx = enemy.dir * def.speed;
  }

  if (enemy.vx !== 0) {
    let nextX = enemy.x + enemy.vx * dt;
    const front = enemy.vx > 0 ? nextX + enemy.width : nextX;
    const blocked = solidAt(world, front, enemy.y + 6) || solidAt(world, front, enemy.y + enemy.height - 6);
    const atLedge = def.ledge && enemy.onGround && !solidAt(world, front, enemy.y + enemy.height + 6);
    if (blocked || atLedge) {
      enemy.dir = -enemy.dir;
      enemy.vx = enemy.t === "j" ? 0 : -enemy.vx;
      nextX = enemy.x;
    }
    enemy.x = nextX;
  }

  let nextY = enemy.y + enemy.vy * dt;
  enemy.onGround = false;
  if (enemy.vy >= 0) {
    const footY = nextY + enemy.height;
    if (solidAt(world, enemy.x + 6, footY) || solidAt(world, enemy.x + enemy.width - 6, footY)) {
      nextY = Math.floor(footY / ts) * ts - enemy.height;
      enemy.vy = 0;
      enemy.onGround = true;
    }
  } else if (solidAt(world, enemy.x + 6, nextY) || solidAt(world, enemy.x + enemy.width - 6, nextY)) {
    nextY = (Math.floor(nextY / ts) + 1) * ts;
    enemy.vy = 0;
  }
  enemy.y = nextY;
  if (enemy.y > world.height + 200) {
    enemy.alive = false;
  }
}

function loseLife(room, player, kind, now, hooks) {
  const game = room.game;
  game.lives -= 1;
  hooks.emitFx({
    t: kind,
    x: Math.round(player.x + player.width / 2),
    y: Math.round(player.y + player.height / 2),
    id: player.id,
  });
  if (game.lives <= 0) {
    game.lives = 0;
    room.status = "gameover";
    room.gameOverAt = now;
    hooks.emitFx({ t: "gameover" });
  }
}

function addCoins(game, amount, hooks, x, y) {
  const before = Math.floor(game.coins / COINS_PER_LIFE);
  game.coins += amount;
  if (Math.floor(game.coins / COINS_PER_LIFE) > before) {
    game.lives += 1;
    hooks.emitFx({ t: "heart", x, y });
  }
}

function respawnTeam(room, players, now, hooks) {
  const checkpoint = room.game.checkpoint;
  for (const player of players) {
    hooks.resetPlayer(player);
    if (checkpoint) {
      player.x = checkpoint.x;
      player.y = checkpoint.y;
    }
    player.invulnUntil = now + INVULN_MS;
    player.stompCombo = 0;
  }
}

function step(room, players, dt, now, hooks) {
  const game = room.game;
  const world = room.world;
  if (!game || players.length === 0) return;

  game.timeLeft -= dt;

  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;
    let near = false;
    for (const player of players) {
      if (Math.abs(player.x - enemy.x) < ACTIVE_RANGE && Math.abs(player.y - enemy.y) < ACTIVE_RANGE) {
        near = true;
        break;
      }
    }
    enemy.active = near;
    if (near) updateEnemy(enemy, world, players, dt);
  }

  let flagsDirty = false;
  for (const player of players) {
    if (room.status !== "playing") break;
    if (player.goalLocked) continue;
    if (player.onGround) player.stompCombo = 0;

    for (const pickup of game.pickups) {
      if (pickup.taken || !intersects(player, pickup)) continue;
      pickup.taken = true;
      flagsDirty = true;
      const fxX = Math.round(pickup.x + pickup.width / 2);
      const fxY = Math.round(pickup.y);
      if (pickup.kind === "m") {
        game.lives += 1;
        game.score += 500;
        hooks.emitFx({ t: "heart", x: fxX, y: fxY });
      } else {
        game.score += 50;
        hooks.emitFx({ t: "coin", x: fxX, y: fxY });
        addCoins(game, 1, hooks, fxX, fxY);
      }
    }

    for (const checkpoint of game.checkpoints) {
      if (checkpoint.on || !intersects(player, checkpoint)) continue;
      checkpoint.on = true;
      game.checkpoint = checkpoint;
      flagsDirty = true;
      hooks.emitFx({ t: "checkpoint", x: checkpoint.x + checkpoint.width / 2, y: checkpoint.y });
    }

    const vulnerable = now >= (player.invulnUntil || 0);
    for (const enemy of game.enemies) {
      if (!enemy.alive || !enemy.active) continue;
      const box = enemyHitbox(enemy);
      if (!box || !intersects(player, box)) continue;
      const def = ENEMY_TYPES[enemy.t];
      const overlapFromTop = player.y + player.height - box.y;
      if (def.stomp && player.vy > 40 && overlapFromTop < Math.max(30, box.height * 0.65)) {
        enemy.alive = false;
        player.stompCombo = Math.min((player.stompCombo || 0) + 1, 4);
        const points = def.points * 2 ** (player.stompCombo - 1);
        game.score += points;
        player.vy = player.input.jump ? -780 : -520;
        player.onGround = false;
        player.supportPlatformId = null;
        hooks.emitFx({
          t: "stomp", e: enemy.t, pts: points,
          x: Math.round(enemy.x + enemy.width / 2), y: Math.round(enemy.y),
        });
      } else if (vulnerable && now >= (player.invulnUntil || 0)) {
        hurtPlayer(room, player, enemy.x + enemy.width / 2, now, hooks);
      }
    }

    if (room.status === "playing" && now >= (player.invulnUntil || 0)) {
      for (const spike of game.spikes) {
        if (!intersects(player, spike)) continue;
        hurtPlayer(room, player, spike.x + spike.width / 2, now, hooks);
        break;
      }
    }
  }
  if (flagsDirty) refreshFlags(game);

  let fell = false;
  for (const player of players) {
    if (player.fell) {
      fell = true;
      player.fell = false;
    }
  }
  if (room.status === "playing" && (fell || game.timeLeft <= 0)) {
    if (game.timeLeft <= 0) game.timeLeft = world.timeLimit || DEFAULT_TIME_LIMIT;
    loseLife(room, players[0], "die", now, hooks);
    if (room.status === "playing") respawnTeam(room, players, now, hooks);
  }
}

function hurtPlayer(room, player, sourceX, now, hooks) {
  player.invulnUntil = now + INVULN_MS;
  const direction = player.x + player.width / 2 < sourceX ? -1 : 1;
  player.vx = direction * 420;
  player.vy = -520;
  player.onGround = false;
  player.supportPlatformId = null;
  loseLife(room, player, "hurt", now, hooks);
}

function awardWinBonus(room, hooks) {
  const game = room.game;
  if (!game) return;
  const bonus = Math.max(0, Math.ceil(game.timeLeft)) * 10;
  game.score += bonus;
  hooks.emitFx({ t: "win", bonus });
}

function serializeGame(room) {
  const game = room.game;
  if (!game) return {};
  const enemies = [];
  for (const enemy of game.enemies) {
    if (!enemy.alive || !enemy.active) continue;
    enemies.push([
      enemy.id, enemy.t, Math.round(enemy.x), Math.round(enemy.y), enemy.dir,
      enemy.t === "p" ? Math.round(enemy.sy + enemy.height) : 0,
    ]);
  }
  return {
    game: {
      score: game.score,
      coins: game.coins,
      lives: game.lives,
      time: Math.max(0, Math.ceil(game.timeLeft)),
      level: room.levelFile || "",
    },
    enemies,
    taken: game.takenStr,
    cps: game.cpStr,
  };
}

module.exports = {
  ENEMY_TYPES,
  START_LIVES,
  INVULN_MS,
  normalizeTheme,
  normalizeTimeLimit,
  normalizeEntityRows,
  createGameState,
  step,
  awardWinBonus,
  serializeGame,
};
