const assert = require("node:assert/strict");
const { test } = require("node:test");

const Game = require("../game-logic");

const TILE = 64;
const NOW = 1_000_000;
const DT = 1 / 60;

// Four rows: two rows of air, the row the players stand in, and solid ground.
function makeWorld(standingRowEntities) {
  const columns = standingRowEntities.length;
  const tiles = [".".repeat(columns), ".".repeat(columns), ".".repeat(columns), "#".repeat(columns)];
  const entities = [".".repeat(columns), ".".repeat(columns), standingRowEntities, ".".repeat(columns)];
  return {
    tileSize: TILE,
    tiles,
    rows: tiles.length,
    columns,
    width: columns * TILE,
    height: tiles.length * TILE,
    timeLimit: 100,
    entities: Game.normalizeEntityRows(entities, tiles),
  };
}

function makePlayer(x, y, overrides = {}) {
  return {
    id: "p1", x, y, width: TILE, height: TILE, vx: 0, vy: 0, onGround: true, goalLocked: false,
    invulnUntil: 0, stompCombo: 0, fell: false, supportPlatformId: null,
    input: { left: false, right: false, jump: false },
    ...overrides,
  };
}

function makeRoom(standingRowEntities) {
  const world = makeWorld(standingRowEntities);
  const fx = [];
  const resets = [];
  const room = { world, status: "playing", game: Game.createGameState(world) };
  const hooks = {
    emitFx: (payload) => fx.push(payload.t),
    resetPlayer: (player) => {
      player.x = 0;
      player.y = 0;
      resets.push(player.id);
    },
  };
  return { room, world, fx, resets, hooks };
}

test("entity rows drop unknown symbols and anything placed on a solid tile", () => {
  assert.deepEqual(Game.normalizeEntityRows(["oZo", "g"], ["..#", "..."]), ["o..", "g.."]);
});

test("collecting coins adds score, and the fiftieth coin grants an extra life", () => {
  const { room, fx, hooks } = makeRoom("..o.......");
  room.game.coins = 49;
  Game.step(room, [makePlayer(2 * TILE, 2 * TILE)], DT, NOW, hooks);
  assert.equal(room.game.coins, 50);
  assert.equal(room.game.score, 50);
  assert.equal(room.game.lives, Game.START_LIVES + 1);
  assert.equal(room.game.takenStr, "1");
  assert.deepEqual(fx, ["coin", "heart"]);
});

test("landing on a walker from above defeats it and bounces the player", () => {
  const { room, fx, hooks } = makeRoom("....g.....");
  const player = makePlayer(4 * TILE - 8, 94, { vy: 300, onGround: false });
  Game.step(room, [player], DT, NOW, hooks);
  assert.equal(room.game.enemies[0].alive, false);
  assert.equal(room.game.score, 100);
  assert.equal(room.game.lives, Game.START_LIVES);
  assert.ok(player.vy < 0);
  assert.deepEqual(fx, ["stomp"]);
  assert.equal(Game.serializeGame(room).enemies.length, 0);
});

test("walking into a walker costs one life and then protects the player for a while", () => {
  const { room, fx, hooks } = makeRoom("....g.....");
  const player = makePlayer(4 * TILE - 32, 2 * TILE);
  Game.step(room, [player], DT, NOW, hooks);
  Game.step(room, [player], DT, NOW + 16, hooks);
  assert.equal(room.game.lives, Game.START_LIVES - 1);
  assert.equal(room.game.enemies[0].alive, true);
  assert.equal(player.invulnUntil, NOW + Game.INVULN_MS);
  assert.deepEqual(fx, ["hurt"]);
});

test("a spiky enemy hurts even when it is landed on", () => {
  const { room, fx, hooks } = makeRoom("....s.....");
  Game.step(room, [makePlayer(4 * TILE - 8, 94, { vy: 300, onGround: false })], DT, NOW, hooks);
  assert.equal(room.game.enemies[0].alive, true);
  assert.equal(room.game.lives, Game.START_LIVES - 1);
  assert.deepEqual(fx, ["hurt"]);
});

test("a fall costs a life and returns the team to the checkpoint it reached", () => {
  const { room, fx, resets, hooks } = makeRoom(".c........");
  const player = makePlayer(TILE, 2 * TILE);
  Game.step(room, [player], DT, NOW, hooks);
  assert.equal(room.game.cpStr, "1");
  player.fell = true;
  Game.step(room, [player], DT, NOW + 16, hooks);
  assert.equal(room.game.lives, Game.START_LIVES - 1);
  assert.deepEqual(resets, ["p1"]);
  assert.deepEqual([player.x, player.y], [TILE, 2 * TILE]);
  assert.deepEqual(fx, ["checkpoint", "die"]);
});

test("the last life ends the game and the next attempt continues from the checkpoint", () => {
  const { room, world, fx, hooks } = makeRoom(".c..o.....");
  const player = makePlayer(TILE, 2 * TILE);
  Game.step(room, [player], DT, NOW, hooks);
  room.game.lives = 1;
  room.game.score = 900;
  player.fell = true;
  Game.step(room, [player], DT, NOW + 16, hooks);
  assert.equal(room.status, "gameover");
  assert.equal(room.game.lives, 0);
  assert.deepEqual(fx, ["checkpoint", "die", "gameover"]);

  const next = Game.createGameState(world, null, room.game);
  assert.equal(next.lives, Game.START_LIVES);
  assert.equal(next.score, 0);
  assert.equal(next.cpStr, "1");
  assert.equal(next.takenStr, "0");
  player.x = 0;
  Game.moveToCheckpoint(next, [player], NOW + 5000);
  assert.deepEqual([player.x, player.y], [TILE, 2 * TILE]);
  assert.equal(Game.createGameState(world).cpStr, "0");
});
