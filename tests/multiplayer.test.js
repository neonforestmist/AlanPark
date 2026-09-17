const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { io } = require("socket.io-client");

let baseUrl = process.env.TEST_URL;
let server;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function event(socket, name, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timed out waiting for ${name}`));
    }, timeout);
    function listener(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(payload);
    }
    socket.on(name, listener);
  });
}

before(async () => {
  if (baseUrl) return;
  server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 5000);
    server.once("error", reject);
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${output}`));
    });
    server.stderr.on("data", (chunk) => { output += chunk; });
    server.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/Open: (http:\/\/localhost:\d+)/);
      if (match) {
        baseUrl = match[1];
        clearTimeout(timer);
        resolve();
      }
    });
  });
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = once(server, "exit");
  server.kill();
  await exited;
});

async function connect(t) {
  const socket = io(baseUrl, {
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000,
    autoConnect: false,
  });
  t.after(() => socket.disconnect());
  const connected = event(socket, "connect");
  socket.connect();
  await connected;
  return socket;
}

async function request(socket, name, payload) {
  return socket.timeout(5000).emitWithAck(name, payload);
}

async function pair(t, levelFile = "forest-1-1.json") {
  const host = await connect(t);
  const room = await request(host, "create-room", {
    levelFile, tetherLength: 170, preferredProfile: 0, customName: "Test Alan",
  });
  assert.equal(room.ok, true);
  const guest = await connect(t);
  const joined = await request(guest, "join-room", {
    code: room.roomCode, preferredProfile: 0, customName: "Test Leaf",
  });
  assert.equal(joined.ok, true, joined.error);
  return { host, guest, room, joined };
}

test("serves all three levels, the game, the editor and their critical assets", async () => {
  const response = await fetch(`${baseUrl}/api/levels`);
  assert.equal(response.status, 200);
  const levels = await response.json();
  assert.deepEqual(levels.map((level) => level.file), [
    "forest-1-1.json", "forest-1-2.json", "forest-1-3.json",
  ]);
  for (const url of ["/", "/editor.html", "/socket.io/socket.io.js", "/game.js",
    "/editor.js", "/assets/title.png", "/assets/players/player1/idle.png",
    ...levels.map((level) => `/levels/${level.file}`)]) {
    assert.equal((await fetch(`${baseUrl}${url}`)).status, 200, url);
  }
});

for (let number = 1; number <= 3; number += 1) {
  test(`two players can host and join Forest 1-${number}`, async (t) => {
    const { host, room, joined } = await pair(t, `forest-1-${number}.json`);
    assert.equal(room.world.name, `Forest 1-${number}`);
    assert.equal(joined.world.name, room.world.name);
    assert.notEqual(room.profile, joined.profile);
    const state = await event(host, "state", (state) => state.status === "playing");
    assert.equal(state.players.length, 2);
    assert.deepEqual(state.players.map((player) => player.name), ["Test Alan", "Test Leaf"]);
  });
}

test("movement, jumping, host settings and restart voting work over WebSockets", async (t) => {
  const { host, guest } = await pair(t);
  const initial = await event(host, "state", (state) =>
    state.status === "playing" && state.players.length === 2 &&
    state.players.every((player) => player.vy === 0));
  const startX = initial.players[0].x;
  const startY = initial.players[0].y;
  host.emit("input", { right: true, jump: true });
  guest.emit("input", { right: true, jump: true });
  const moving = await event(host, "state", (state) =>
    state.players[0].x > startX + 20 && state.players[0].y < startY - 20);
  assert.equal(moving.status, "playing");
  host.emit("input", {});
  guest.emit("input", {});

  host.emit("set-settings", { tetherLength: 250 });
  await event(guest, "state", (state) => state.settings.tetherLength === 250);
  guest.emit("set-settings", { tetherLength: 100 });
  assert.equal((await event(host, "state")).settings.tetherLength, 250);

  host.emit("restart");
  await event(host, "state", (state) => state.restartVotes.voted === 1);
  guest.emit("restart");
  const restarted = await event(host, "state", (state) => state.restartVotes.voted === 0);
  assert.equal(restarted.players[0].x, startX);
  assert.equal(restarted.status, "playing");
});

test("invalid codes fail, a third player spectates, and leaving transfers host", async (t) => {
  const { host, guest, room } = await pair(t);
  const spectator = await connect(t);
  const invalid = await request(spectator, "join-room", { code: "00000" });
  assert.equal(invalid.ok, false);
  const joined = await request(spectator, "join-room", { code: room.roomCode });
  assert.equal(joined.slot, -1);
  spectator.emit("set-settings", { tetherLength: 395 });
  spectator.emit("restart");
  const state = await event(host, "state");
  assert.equal(state.settings.tetherLength, 170);
  assert.equal(state.restartVotes.voted, 0);
  host.emit("leave-room");
  const remaining = await event(guest, "state", (state) => state.hostId === guest.id);
  assert.equal(remaining.status, "waiting");
  assert.equal(remaining.players.length, 1);
});

test("a brief transport loss pauses the match and recovers the same player and world", async (t) => {
  const { host, guest, room } = await pair(t);
  const originalId = host.id;
  await event(host, "state", (state) => state.status === "playing");
  const paused = event(guest, "state", (state) => state.status === "reconnecting");
  host.io.engine.close();
  const frozen = await paused;
  await wait(200);
  const stillFrozen = await event(guest, "state");
  assert.deepEqual(stillFrozen.players, frozen.players);
  assert.deepEqual(stillFrozen.movingPlatforms, frozen.movingPlatforms);

  const restored = event(host, "room-joined");
  host.connect();
  const resumed = await restored;
  assert.equal(host.recovered, true);
  assert.equal(host.id, originalId);
  assert.equal(resumed.roomCode, room.roomCode);
  assert.equal(resumed.world.name, room.world.name);
  assert.equal(resumed.slot, room.slot);
  await event(guest, "state", (state) => state.status === "playing");
});

test("editor collaboration syncs edits and restores the latest level after reconnect", async (t) => {
  const host = await connect(t);
  const guest = await connect(t);
  const room = await request(host, "editor-create-room", { name: "Builder", level: { name: "Original" } });
  assert.equal(room.ok, true);
  const joined = await request(guest, "editor-join-room", { code: room.roomCode, name: "Builder" });
  assert.equal(joined.ok, true, joined.error);
  assert.equal(joined.participants.length, 2);
  assert.notEqual(joined.selfName, room.selfName);

  const changed = event(guest, "editor-level-update");
  host.emit("editor-level-update", { level: { ...room.level, name: "Updated forest" } });
  assert.equal((await changed).level.name, "Updated forest");
  const cursor = event(guest, "editor-cursor-update");
  host.emit("editor-cursor-update", { x: 3, y: 4, visible: true });
  assert.equal((await cursor).id, host.id);

  guest.io.engine.close();
  await wait(100);
  host.emit("editor-level-update", { level: { ...room.level, name: "Latest forest" } });
  const recovered = event(guest, "editor-room-joined");
  guest.connect();
  const latest = await recovered;
  assert.equal(guest.recovered, true);
  assert.equal(latest.roomCode, room.roomCode);
  assert.equal(latest.level.name, "Latest forest");
});
