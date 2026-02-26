const express = require("express");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const LEVELS_DIRECTORIES = [
  path.join(__dirname, "public", "levels"),
  path.join(__dirname, "levels"),
];

const TICK_RATE = 60;
const DT = 1 / TICK_RATE;
const ROOM_CODE_LENGTH = 5;
const PROFILE_COUNT = 2;
const EDITOR_CHANNEL_PREFIX = "editor:";
const MAX_EDITOR_NAME_LENGTH = 20;
const MAX_PLAYER_NAME_LENGTH = 20;
const MAX_EDITOR_ROWS = 120;
const MAX_EDITOR_COLUMNS = 220;
const DEFAULT_PROFILE_NAMES = ["Alan", "Leaf"];

const ACCEL = 2300;
const AIR_CONTROL = 0.62;
const FRICTION = 11;
const MAX_SPEED = 300;
const GRAVITY = 1800;
const WATER_GRAVITY_MULTIPLIER = 0.22;
const WATER_MOVE_SPEED_MULTIPLIER = 0.78;
const WATER_JUMP_SPEED_MULTIPLIER = 0.35;
const WATER_FALL_SPEED_MULTIPLIER = 0.42;
const MAX_FALL_SPEED = 1150;
const JUMP_SPEED = 860;
const LIFT_TRAVEL_TILES = 3;
const LIFT_SPEED = 100;
const PLATFORM_CONTACT_EPSILON = 5;
const PLATFORM_SIDE_INSET = 4;
const TETHER_JUMP_TAUT_EPSILON = 6;
const TETHER_JUMP_MIN_VERTICAL_GAP_RATIO = 0.25;
const MAX_SHARED_TETHER_MID_AIR_JUMPS = 4;

const DEFAULT_TETHER_LENGTH = 170;
const MIN_TETHER_LENGTH = 75;
const MAX_TETHER_LENGTH = 395;
const TETHER_STIFFNESS = 36;
const TETHER_DAMPING = 4;
const DEFAULT_LEVEL_FILE = "forest-1-1.json";

const DEFAULT_LEVEL = {
  name: "Forest Blocks",
  tileSize: 64,
  spawnTiles: [
    { x: 2, y: 8 },
    { x: 4, y: 8 },
  ],
  goalTile: { x: 32, y: 7, width: 1, height: 1 },
  tiles: [
    "....................................",
    "....................................",
    "....................................",
    "..........h.............v...........",
    "..............................####..",
    "....................#####...........",
    ".............#####..................",
    "......#####.........................",
    ".................####...............",
    "####################################",
    "......................#####.........",
    "#######.......########.......#######",
    "####################################",
    "####################################",
    "####################################",
    "####################################",
  ],
  decor: [
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "...........1...............3........",
    "....................................",
    "...1....2....3........5....6........",
    "....................................",
    "......4........5....................",
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "....................................",
  ],
};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use("/levels", express.static(path.join(__dirname, "levels")));
app.use(express.static(path.join(__dirname, "public")));

// --- Levels API -----------------------------------------------------------

function getExistingLevelsDirectories() {
  return LEVELS_DIRECTORIES.filter((dirPath) => {
    try {
      return fs.statSync(dirPath).isDirectory();
    } catch (_error) {
      return false;
    }
  });
}

function listLevelEntries() {
  const byFilename = new Map();

  for (const dirPath of getExistingLevelsDirectories()) {
    const files = fs.readdirSync(dirPath)
      .filter((file) => file.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      if (byFilename.has(file)) {
        continue;
      }
      byFilename.set(file, path.join(dirPath, file));
    }
  }

  return Array.from(byFilename.entries())
    .sort(([fileA], [fileB]) => fileA.localeCompare(fileB))
    .map(([file, filePath]) => ({ file, filePath }));
}

function resolveLevelFilePath(filename) {
  const rawInput = String(filename || DEFAULT_LEVEL_FILE).trim() || DEFAULT_LEVEL_FILE;
  const directName = path.basename(rawInput);
  const safeName = directName.replace(/[^a-zA-Z0-9_\-\. ]/g, "") || DEFAULT_LEVEL_FILE;
  const normalizedSafeName = safeName.replace(/[^a-zA-Z0-9_\-\.]/g, "");
  const directories = getExistingLevelsDirectories();

  for (const dirPath of directories) {
    const exactPath = path.join(dirPath, safeName);
    try {
      if (fs.statSync(exactPath).isFile()) {
        return { safeName, filePath: exactPath };
      }
    } catch (_error) {
      // Continue searching.
    }
  }

  for (const dirPath of directories) {
    let files = [];
    try {
      files = fs.readdirSync(dirPath).filter((file) => file.endsWith(".json"));
    } catch (_error) {
      continue;
    }

    const matched = files.find((file) => {
      const normalizedFile = file.replace(/[^a-zA-Z0-9_\-\.]/g, "");
      return normalizedFile === normalizedSafeName;
    });

    if (matched) {
      return { safeName: matched, filePath: path.join(dirPath, matched) };
    }
  }

  const fallbackDir = directories[0] || LEVELS_DIRECTORIES[0];
  return { safeName, filePath: path.join(fallbackDir, safeName) };
}

app.get("/api/levels", (_req, res) => {
  try {
    const levels = listLevelEntries().map(({ file, filePath }) => {
      try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        const rows = Array.isArray(parsed.tiles) ? parsed.tiles.length : 0;
        const cols = rows > 0 && typeof parsed.tiles[0] === "string" ? parsed.tiles[0].length : 0;
        return {
          file,
          name:
            parsed.name && typeof parsed.name === "string"
              ? parsed.name.trim()
              : file.replace(/\.json$/, ""),
          rows,
          cols,
        };
      } catch (_err) {
        return { file, name: file.replace(/\.json$/, ""), rows: 0, cols: 0 };
      }
    });

    res.json(levels);
  } catch (_err) {
    res.json([]);
  }
});

// --- Utility --------------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeTetherLength(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_TETHER_LENGTH;
  }
  return clamp(Math.round(numeric), MIN_TETHER_LENGTH, MAX_TETHER_LENGTH);
}

function normalizeTiles(tileRows) {
  const rawRows = Array.isArray(tileRows)
    ? tileRows.map((row) => (typeof row === "string" ? row : ""))
    : [];
  const rowCount = Math.max(rawRows.length, 12);
  const columnCount = Math.max(
    rawRows.reduce((max, row) => Math.max(max, row.length), 0),
    24
  );

  const normalizedRows = [];
  for (let y = 0; y < rowCount; y += 1) {
    const source = rawRows[y] || "";
    let row = source.padEnd(columnCount, ".").slice(0, columnCount);
    row = row
      .replace(/H/g, "h")
      .replace(/V/g, "v")
      .replace(/B/g, "b")
      .replace(/S/g, "s")
      .replace(/W/g, "w");
    row = row.replace(/[^#.bhvsw]/g, ".");
    normalizedRows.push(row);
  }
  return normalizedRows;
}

function normalizeDecorRows(decorRows, rowCount, columnCount) {
  const rawRows = Array.isArray(decorRows)
    ? decorRows.map((row) => (typeof row === "string" ? row : ""))
    : [];

  const normalizedRows = [];
  for (let y = 0; y < rowCount; y += 1) {
    const source = rawRows[y] || "";
    let row = source.padEnd(columnCount, ".").slice(0, columnCount);
    row = row.replace(/[^.1-6]/g, ".");
    normalizedRows.push(row);
  }
  return normalizedRows;
}

function reconcileTileAndDecor(tiles, decorRows) {
  const reconciled = [];
  for (let y = 0; y < tiles.length; y += 1) {
    const tileRow = tiles[y] || "";
    const decorRow = decorRows[y] || ".".repeat(tileRow.length);
    const nextRow = [];
    for (let x = 0; x < tileRow.length; x += 1) {
      if (tileRow[x] !== ".") {
        nextRow.push(".");
        continue;
      }
      const symbol = decorRow[x];
      nextRow.push(/[1-6]/.test(symbol) ? symbol : ".");
    }
    reconciled.push(nextRow.join(""));
  }
  return reconciled;
}

function toSolidRects(tiles, tileSize) {
  const solids = [];
  for (let y = 0; y < tiles.length; y += 1) {
    const row = tiles[y];
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== "#" && row[x] !== "b") {
        continue;
      }
      solids.push({
        x: x * tileSize,
        y: y * tileSize,
        width: tileSize,
        height: tileSize,
      });
    }
  }
  return solids;
}

function toWaterRects(tiles, tileSize) {
  const waters = [];
  for (let y = 0; y < tiles.length; y += 1) {
    const row = tiles[y];
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== "s" && row[x] !== "w") {
        continue;
      }
      waters.push({
        x: x * tileSize,
        y: y * tileSize,
        width: tileSize,
        height: tileSize,
      });
    }
  }
  return waters;
}

function toMovingPlatforms(tiles, tileSize) {
  const movingPlatforms = [];
  const rows = tiles.length;
  const columns = rows > 0 ? tiles[0].length : 0;
  const maxX = Math.max(columns * tileSize - tileSize, 0);
  const maxY = Math.max(rows * tileSize - tileSize, 0);
  const travelDistance = LIFT_TRAVEL_TILES * tileSize;
  let index = 0;

  for (let y = 0; y < rows; y += 1) {
    const row = tiles[y] || "";
    for (let x = 0; x < columns; x += 1) {
      const symbol = row[x];
      const axis = symbol === "h" ? "x" : symbol === "v" ? "y" : null;
      if (!axis) {
        continue;
      }

      const baseX = x * tileSize;
      const baseY = y * tileSize;
      const minX = axis === "x" ? Math.max(0, baseX - travelDistance) : baseX;
      const maxLiftX = axis === "x" ? Math.min(maxX, baseX + travelDistance) : baseX;
      const minY = axis === "y" ? Math.max(0, baseY - travelDistance) : baseY;
      const maxLiftY = axis === "y" ? Math.min(maxY, baseY + travelDistance) : baseY;

      movingPlatforms.push({
        id: `lift-${index}`,
        type: axis === "x" ? "lift-h" : "lift-v",
        axis,
        x: baseX,
        y: baseY,
        width: tileSize,
        height: tileSize,
        minX,
        maxX: maxLiftX,
        minY,
        maxY: maxLiftY,
        direction: 1,
        speed: LIFT_SPEED,
        dx: 0,
        dy: 0,
      });
      index += 1;
    }
  }

  return movingPlatforms;
}

function serializeMovingPlatforms(platforms) {
  const source = Array.isArray(platforms) ? platforms : [];
  return source.map((platform) => ({
    id: platform.id,
    type: platform.type,
    x: Number(platform.x.toFixed(2)),
    y: Number(platform.y.toFixed(2)),
    width: platform.width,
    height: platform.height,
  }));
}

function normalizeSpawnTiles(spawnTiles, columns, rows) {
  const defaultSpawn = [
    { x: 2, y: Math.max(rows - 8, 0) },
    { x: 4, y: Math.max(rows - 8, 0) },
  ];
  const input = Array.isArray(spawnTiles) ? spawnTiles : [];

  return [0, 1].map((index) => {
    const fallback = defaultSpawn[index];
    const source = input[index] || fallback;
    return {
      x: clamp(
        Number.isFinite(Number(source.x))
          ? Math.round(Number(source.x))
          : fallback.x,
        0,
        columns - 1
      ),
      y: clamp(
        Number.isFinite(Number(source.y))
          ? Math.round(Number(source.y))
          : fallback.y,
        0,
        rows - 1
      ),
    };
  });
}

function toSpawnPixels(spawnTiles, tileSize, playerSize) {
  return spawnTiles.map((tile) => ({
    x: tile.x * tileSize + (tileSize - playerSize) * 0.5,
    y: tile.y * tileSize,
  }));
}

function normalizeGoalTile(goalTile, columns, rows) {
  const source = goalTile || {};
  const x = clamp(
    Number.isFinite(Number(source.x)) ? Math.round(Number(source.x)) : columns - 4,
    0,
    columns - 1
  );
  const y = clamp(
    Number.isFinite(Number(source.y))
      ? Math.round(Number(source.y))
      : Math.max(rows - 9, 0),
    0,
    rows - 1
  );
  return { x, y, width: 1, height: 1 };
}

function normalizeEditorName(value) {
  const raw = Array.from(String(value || "")).slice(0, MAX_EDITOR_NAME_LENGTH).join("");
  const compact = raw.trim().replace(/\s+/g, " ");
  return compact || "Player";
}

function normalizePlayerName(value) {
  const raw = Array.from(String(value || "")).slice(0, MAX_PLAYER_NAME_LENGTH).join("");
  return raw.trim().replace(/\s+/g, " ");
}

function getDefaultPlayerName(profile, slot) {
  if (Number.isInteger(profile) && profile >= 0 && profile < DEFAULT_PROFILE_NAMES.length) {
    return DEFAULT_PROFILE_NAMES[profile];
  }
  if (Number.isInteger(slot) && slot >= 0 && slot < DEFAULT_PROFILE_NAMES.length) {
    return DEFAULT_PROFILE_NAMES[slot];
  }
  return "Player";
}

function normalizeEditorLevelPayload(input) {
  const source = input && typeof input === "object" ? input : {};
  const tileSize = clamp(
    Number.isFinite(Number(source.tileSize)) ? Math.round(Number(source.tileSize)) : 64,
    16,
    128
  );

  const baseTiles = Array.isArray(source.tiles)
    ? source.tiles.map((row) => (typeof row === "string" ? row : ""))
    : [];
  let rows = Math.max(baseTiles.length, 8);
  let columns = Math.max(
    baseTiles.reduce((max, row) => Math.max(max, row.length), 0),
    8
  );
  rows = clamp(rows, 8, MAX_EDITOR_ROWS);
  columns = clamp(columns, 8, MAX_EDITOR_COLUMNS);

  const tiles = [];
  for (let y = 0; y < rows; y += 1) {
    const row = (baseTiles[y] || "")
      .padEnd(columns, ".")
      .slice(0, columns)
      .replace(/H/g, "h")
      .replace(/V/g, "v")
      .replace(/B/g, "b")
      .replace(/S/g, "s")
      .replace(/W/g, "w")
      .replace(/[^#.bhvsw]/g, ".");
    tiles.push(row);
  }

  const decorRowsRaw = Array.isArray(source.decor)
    ? source.decor.map((row) => (typeof row === "string" ? row : ""))
    : [];
  const decor = [];
  for (let y = 0; y < rows; y += 1) {
    const row = (decorRowsRaw[y] || "")
      .padEnd(columns, ".")
      .slice(0, columns)
      .replace(/[^.1-6]/g, ".");
    decor.push(row);
  }

  const reconciledDecor = reconcileTileAndDecor(tiles, decor);
  const spawnTiles = normalizeSpawnTiles(source.spawnTiles, columns, rows);
  const goalTile = normalizeGoalTile(source.goalTile, columns, rows);

  return {
    name:
      typeof source.name === "string" && source.name.trim()
        ? source.name.trim()
        : DEFAULT_LEVEL.name,
    tileSize,
    spawnTiles,
    goalTile,
    tiles,
    decor: reconciledDecor,
  };
}

// --- World building -------------------------------------------------------

function buildWorld(levelConfig) {
  const tileSize = Math.max(
    16,
    Number.isFinite(Number(levelConfig.tileSize))
      ? Math.round(Number(levelConfig.tileSize))
      : 64
  );
  const tiles = normalizeTiles(levelConfig.tiles);
  const rows = tiles.length;
  const columns = tiles[0].length;
  const rawDecor = normalizeDecorRows(levelConfig.decor, rows, columns);
  const decor = reconcileTileAndDecor(tiles, rawDecor);
  const playerSize = tileSize;
  const spawnTiles = normalizeSpawnTiles(levelConfig.spawnTiles, columns, rows);
  const spawn = toSpawnPixels(spawnTiles, tileSize, playerSize);
  const goalTile = normalizeGoalTile(levelConfig.goalTile, columns, rows);
  const movingPlatforms = toMovingPlatforms(tiles, tileSize);
  const movingPlatformById = new Map(
    movingPlatforms.map((platform) => [platform.id, platform])
  );

  return {
    name:
      typeof levelConfig.name === "string" && levelConfig.name.trim()
        ? levelConfig.name.trim()
        : "Level 1",
    tileSize,
    rows,
    columns,
    width: columns * tileSize,
    height: rows * tileSize,
    tiles,
    decor,
    playerSize,
    spawnTiles,
    spawn,
    goalTile,
    goal: {
      x: goalTile.x * tileSize,
      y: goalTile.y * tileSize,
      width: goalTile.width * tileSize,
      height: goalTile.height * tileSize,
    },
    platforms: toSolidRects(tiles, tileSize),
    waterZones: toWaterRects(tiles, tileSize),
    movingPlatforms,
    movingPlatformById,
  };
}

function buildWorldPayload(w) {
  return {
    name: w.name,
    width: w.width,
    height: w.height,
    tileSize: w.tileSize,
    rows: w.rows,
    columns: w.columns,
    tiles: w.tiles,
    decor: w.decor,
    spawn: w.spawn,
    goal: w.goal,
    movingPlatforms: serializeMovingPlatforms(w.movingPlatforms),
  };
}

function loadWorldFromFile(filename) {
  const { safeName, filePath } = resolveLevelFilePath(filename);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return buildWorld(parsed);
  } catch (error) {
    console.error(`Failed to load level ${safeName}. Using default.`, error.message);
    return buildWorld(DEFAULT_LEVEL);
  }
}

function loadWorldFromDisk() {
  const { filePath } = resolveLevelFilePath(DEFAULT_LEVEL_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return buildWorld(parsed);
  } catch (error) {
    console.error(`Failed to load default level from ${filePath}. Falling back to default level.`, error.message);
    return buildWorld(DEFAULT_LEVEL);
  }
}

// --- Room / client state --------------------------------------------------

const rooms = new Map();
const editorRooms = new Map();
const clients = new Map();

function createRoom(code, hostId, tetherLength, world) {
  return {
    code,
    hostId,
    status: "waiting",
    winnerAt: 0,
    settings: { tetherLength },
    world,
    worldPayload: buildWorldPayload(world),
    slots: [null, null],
    restartVotes: [false, false],
    sharedTetherMidAirJumpCount: 0,
    players: new Map(),
    spectators: new Set(),
  };
}

function createClientState() {
  return {
    roomCode: null,
    slot: -1,
    profile: null,
    isHost: false,
    editorRoomCode: null,
    editorDisplayName: null,
  };
}

function getEditorChannelName(roomCode) {
  return `${EDITOR_CHANNEL_PREFIX}${roomCode}`;
}

function createEditorRoom(code, hostId, level) {
  return {
    code,
    channel: getEditorChannelName(code),
    hostId,
    level: normalizeEditorLevelPayload(level),
    participants: new Map(),
  };
}

function countRoomClients(room) {
  return room.players.size + room.spectators.size;
}

function getActivePlayerCount(room) {
  return room.slots.filter(Boolean).length;
}

function clearRestartVotes(room) {
  room.restartVotes[0] = false;
  room.restartVotes[1] = false;
}

function getRequiredRestartVotes(room) {
  return getActivePlayerCount(room);
}

function getRestartVoteCount(room) {
  let count = 0;
  for (let i = 0; i < room.slots.length; i += 1) {
    if (room.slots[i] && room.restartVotes[i]) {
      count += 1;
    }
  }
  return count;
}

function createPlayer(socketId, slot, profile, customName, world) {
  const spawn = world.spawn[slot];
  const normalizedProfile = normalizePreferredProfile(profile);
  const resolvedProfile = normalizedProfile !== null ? normalizedProfile : slot % PROFILE_COUNT;
  const providedName = normalizePlayerName(customName);
  const player = {
    id: socketId,
    slot,
    profile: resolvedProfile,
    name: providedName || getDefaultPlayerName(resolvedProfile, slot),
    x: spawn.x,
    y: spawn.y,
    width: world.playerSize,
    height: world.playerSize,
    vx: 0,
    vy: 0,
    onGround: false,
    jumpHeld: false,
    tetherJumpEligible: false,
    supportPlatformId: null,
    skipSemisolidPlatformId: null,
    inWater: false,
    waterExitJumpAvailable: false,
    waterExitSurfaceY: null,
    goalLocked: false,
    goalLockX: 0,
    goalLockY: 0,
    input: { left: false, right: false, jump: false },
  };
  nudgePlayerOutOfSolids(player, world);
  return player;
}

function nudgePlayerOutOfSolids(player, world) {
  if (!player || !world || !Array.isArray(world.platforms) || world.platforms.length === 0) {
    return;
  }
  const step = Math.max(1, Number(world.tileSize) || 64);
  let attempts = Math.max(2, Number(world.rows) || 0);

  while (attempts > 0) {
    let colliding = false;
    for (const platform of world.platforms) {
      if (intersects(player, platform)) {
        colliding = true;
        break;
      }
    }
    if (!colliding) {
      return;
    }
    player.y = Math.max(0, player.y - step);
    attempts -= 1;
  }
}

function resetPlayer(player, world) {
  const spawn = world.spawn[player.slot] || world.spawn[0];
  player.x = spawn.x;
  player.y = spawn.y;
  nudgePlayerOutOfSolids(player, world);
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.jumpHeld = false;
  player.tetherJumpEligible = false;
  player.supportPlatformId = null;
  player.skipSemisolidPlatformId = null;
  player.inWater = false;
  player.waterExitJumpAvailable = false;
  player.waterExitSurfaceY = null;
  player.goalLocked = false;
  player.goalLockX = 0;
  player.goalLockY = 0;
  player.input.left = false;
  player.input.right = false;
  player.input.jump = false;
}

function resetRound(room) {
  clearRestartVotes(room);
  room.sharedTetherMidAirJumpCount = 0;
  for (const socketId of room.slots) {
    if (!socketId) {
      continue;
    }
    const player = room.players.get(socketId);
    if (player) {
      resetPlayer(player, room.world);
    }
  }
  room.status = getActivePlayerCount(room) === 2 ? "playing" : "waiting";
  room.winnerAt = 0;
}

function getPlayables(room) {
  const active = [];
  for (const socketId of room.slots) {
    if (!socketId) {
      continue;
    }
    const player = room.players.get(socketId);
    if (player) {
      active.push(player);
    }
  }
  return active;
}

function updateMatchState(room) {
  if (getActivePlayerCount(room) < 2) {
    room.status = "waiting";
    room.winnerAt = 0;
    clearRestartVotes(room);
    return;
  }
  if (room.status === "waiting") {
    resetRound(room);
  }
}

function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function updateMovingPlatforms(world, dt) {
  const platforms = Array.isArray(world.movingPlatforms) ? world.movingPlatforms : [];
  for (const platform of platforms) {
    platform.dx = 0;
    platform.dy = 0;

    if (platform.axis === "x") {
      if (platform.maxX <= platform.minX) {
        continue;
      }
      let nextX = platform.x + platform.direction * platform.speed * dt;
      if (nextX >= platform.maxX) {
        nextX = platform.maxX;
        platform.direction = -1;
      } else if (nextX <= platform.minX) {
        nextX = platform.minX;
        platform.direction = 1;
      }
      platform.dx = nextX - platform.x;
      platform.x = nextX;
      continue;
    }

    if (platform.maxY <= platform.minY) {
      continue;
    }
    let nextY = platform.y + platform.direction * platform.speed * dt;
    if (nextY >= platform.maxY) {
      nextY = platform.maxY;
      platform.direction = -1;
    } else if (nextY <= platform.minY) {
      nextY = platform.minY;
      platform.direction = 1;
    }
    platform.dy = nextY - platform.y;
    platform.y = nextY;
  }
}

function applyPlatformCarry(player, world) {
  if (!player.supportPlatformId || !world.movingPlatformById) {
    return;
  }
  const platform = world.movingPlatformById.get(player.supportPlatformId);
  if (!platform) {
    player.supportPlatformId = null;
    return;
  }

  const previousX = platform.x - platform.dx;
  const previousY = platform.y - platform.dy;
  const overlapX =
    player.x + player.width > previousX + PLATFORM_SIDE_INSET &&
    player.x < previousX + platform.width - PLATFORM_SIDE_INSET;
  const playerBottom = player.y + player.height;
  const wasOnTop =
    overlapX && Math.abs(playerBottom - previousY) <= PLATFORM_CONTACT_EPSILON;

  if (!wasOnTop) {
    player.supportPlatformId = null;
    return;
  }

  // Treat lifts like air when carry would push into any solid. This avoids
  // crush jitter and sideways ejection; the player simply falls off.
  if (wouldPlatformCarryIntoSolid(player, platform, world)) {
    player.onGround = false;
    player.supportPlatformId = null;
    player.skipSemisolidPlatformId = platform.id;
    pushPlayerBelowOverheadSolids(player, world);
    return;
  }

  player.x += platform.dx;
  player.y += platform.dy;
}

function wouldPlatformCarryIntoSolid(player, platform, world) {
  if (
    !player ||
    !platform ||
    !world ||
    !Array.isArray(world.platforms) ||
    world.platforms.length === 0
  ) {
    return false;
  }

  const carriedRect = {
    x: player.x + platform.dx,
    y: player.y + platform.dy,
    width: player.width,
    height: player.height,
  };

  for (const solid of world.platforms) {
    if (intersects(carriedRect, solid)) {
      return true;
    }
  }
  return false;
}

function pushPlayerBelowOverheadSolids(player, world) {
  if (!player || !world || !Array.isArray(world.platforms) || world.platforms.length === 0) {
    return;
  }

  const left = player.x + PLATFORM_SIDE_INSET;
  const right = player.x + player.width - PLATFORM_SIDE_INSET;
  const playerBottom = player.y + player.height;
  let targetY = player.y;

  for (const solid of world.platforms) {
    const solidLeft = solid.x;
    const solidRight = solid.x + solid.width;
    if (right <= solidLeft || left >= solidRight) {
      continue;
    }

    const solidTop = solid.y;
    const solidBottom = solid.y + solid.height;
    const intersectsVertically =
      player.y < solidBottom - PLATFORM_CONTACT_EPSILON &&
      playerBottom > solidTop + PLATFORM_CONTACT_EPSILON;
    if (!intersectsVertically) {
      continue;
    }

    // Only push down when the player is under/inside the solid, not when above it.
    if (playerBottom <= solidBottom + PLATFORM_CONTACT_EPSILON) {
      targetY = Math.max(targetY, solidBottom - PLATFORM_CONTACT_EPSILON);
    }
  }

  if (targetY > player.y) {
    player.y = targetY;
    if (player.vy < 0) {
      player.vy = 0;
    }
  }
}

function resolveSolidAxisCollisions(player, axis, platforms) {
  for (const platform of platforms) {
    if (!intersects(player, platform)) {
      continue;
    }

    if (axis === "x") {
      if (player.vx > 0) {
        player.x = platform.x - player.width;
      } else if (player.vx < 0) {
        player.x = platform.x + platform.width;
      } else {
        const overlapLeft = player.x + player.width - platform.x;
        const overlapRight = platform.x + platform.width - player.x;
        const overlapTop = player.y + player.height - platform.y;
        const overlapBottom = platform.y + platform.height - player.y;
        const minHorizontalOverlap = Math.min(overlapLeft, overlapRight);
        const minVerticalOverlap = Math.min(overlapTop, overlapBottom);

        // If this overlap is mostly vertical (for example crush/pinch states),
        // do not shove sideways on the X pass. Let Y resolution handle it.
        if (minVerticalOverlap < minHorizontalOverlap) {
          continue;
        }
        player.x =
          overlapLeft < overlapRight
            ? platform.x - player.width
            : platform.x + platform.width;
      }
      player.vx = 0;
      continue;
    }

    if (player.vy > 0) {
      player.y = platform.y - player.height;
      player.vy = 0;
      player.onGround = true;
      player.supportPlatformId = null;
    } else if (player.vy < 0) {
      player.y = platform.y + platform.height;
      player.vy = 0;
    }
  }
}

function resolveSemisolidLanding(
  player,
  platforms,
  previousBottom,
  previousSupportPlatformId,
  skipPlatformId = null
) {
  if (player.vy < 0) {
    return;
  }

  let landedPlatform = null;
  let landedTop = Number.POSITIVE_INFINITY;
  const playerBottom = player.y + player.height;

  for (const platform of platforms) {
    if (skipPlatformId && platform.id === skipPlatformId) {
      continue;
    }
    const previousPlatformTop = platform.y - platform.dy;
    const wasStandingOnPlatform = previousSupportPlatformId === platform.id;
    const wasAbove = wasStandingOnPlatform || previousBottom <= previousPlatformTop + PLATFORM_CONTACT_EPSILON;
    if (!wasAbove) {
      continue;
    }

    if (playerBottom < platform.y - PLATFORM_CONTACT_EPSILON) {
      continue;
    }

    const overlapX =
      player.x + player.width > platform.x + PLATFORM_SIDE_INSET &&
      player.x < platform.x + platform.width - PLATFORM_SIDE_INSET;
    if (!overlapX) {
      continue;
    }

    if (platform.y < landedTop) {
      landedTop = platform.y;
      landedPlatform = platform;
    }
  }

  if (!landedPlatform) {
    return;
  }

  player.y = landedTop - player.height;
  player.vy = 0;
  player.onGround = true;
  player.supportPlatformId = landedPlatform.id;
}

function resolvePenetration(player, platforms) {
  for (let pass = 0; pass < 2; pass += 1) {
    let adjusted = false;

    for (const platform of platforms) {
      if (!intersects(player, platform)) {
        continue;
      }

      const overlapLeft = player.x + player.width - platform.x;
      const overlapRight = platform.x + platform.width - player.x;
      const overlapTop = player.y + player.height - platform.y;
      const overlapBottom = platform.y + platform.height - player.y;

      const moveX = overlapLeft < overlapRight ? -overlapLeft : overlapRight;
      const moveY = overlapTop < overlapBottom ? -overlapTop : overlapBottom;

      if (Math.abs(moveX) < Math.abs(moveY)) {
        player.x += moveX;
        player.vx = 0;
      } else {
        player.y += moveY;
        if (moveY < 0) {
          player.onGround = true;
          player.supportPlatformId = typeof platform.id === "string" ? platform.id : null;
        }
        player.vy = 0;
      }
      adjusted = true;
    }

    if (!adjusted) {
      break;
    }
  }
}

function keepInBounds(player, world) {
  player.x = clamp(player.x, 0, world.width - player.width);
  if (player.y < 0) {
    player.y = 0;
    player.vy = 0;
  }
  if (player.y > world.height + 260) {
    resetPlayer(player, world);
  }
}

function isPlayerInWater(player, world) {
  if (!player || !world || !Array.isArray(world.waterZones) || world.waterZones.length === 0) {
    return false;
  }
  for (const zone of world.waterZones) {
    if (intersects(player, zone)) {
      return true;
    }
  }
  return false;
}

function getWaterSurfaceTopAtPlayer(player, world) {
  if (!player || !world || !Array.isArray(world.waterZones) || world.waterZones.length === 0) {
    return null;
  }

  const left = player.x + PLATFORM_SIDE_INSET;
  const right = player.x + player.width - PLATFORM_SIDE_INSET;
  let topY = Number.POSITIVE_INFINITY;

  for (const zone of world.waterZones) {
    const zoneLeft = zone.x;
    const zoneRight = zone.x + zone.width;
    if (right <= zoneLeft || left >= zoneRight) {
      continue;
    }
    if (zone.y < topY) {
      topY = zone.y;
    }
  }

  return Number.isFinite(topY) ? topY : null;
}

function isWithinWaterExitJumpHeight(player, world) {
  if (
    !player ||
    !world ||
    !Number.isFinite(player.waterExitSurfaceY)
  ) {
    return false;
  }

  const maxHeight = (Number(world.tileSize) || player.height || 64) * 0.5;
  const playerBottom = player.y + player.height;
  const distanceAboveWater = player.waterExitSurfaceY - playerBottom;
  return (
    distanceAboveWater >= -PLATFORM_CONTACT_EPSILON &&
    distanceAboveWater <= maxHeight + PLATFORM_CONTACT_EPSILON
  );
}

function refreshPlayerWaterState(player, world) {
  if (!player) {
    return;
  }
  const wasInWater = Boolean(player.inWater);
  const inWater = isPlayerInWater(player, world);
  const waterSurfaceTop = getWaterSurfaceTopAtPlayer(player, world);
  player.inWater = inWater;

  if (inWater) {
    player.waterExitJumpAvailable = false;
    player.waterExitSurfaceY = waterSurfaceTop;
    return;
  }

  if (wasInWater && !inWater && !player.onGround) {
    player.waterExitSurfaceY = Number.isFinite(player.waterExitSurfaceY)
      ? player.waterExitSurfaceY
      : waterSurfaceTop;
    player.waterExitJumpAvailable = isWithinWaterExitJumpHeight(player, world);
    if (!player.waterExitJumpAvailable) {
      player.waterExitSurfaceY = null;
    }
    return;
  }

  if (player.waterExitJumpAvailable && !isWithinWaterExitJumpHeight(player, world)) {
    player.waterExitJumpAvailable = false;
    player.waterExitSurfaceY = null;
  }

  if (player.onGround) {
    player.waterExitJumpAvailable = false;
    player.waterExitSurfaceY = null;
  }
}

function isTetherJumpEligible(player, otherPlayer, tetherLength) {
  if (!player || !otherPlayer || player.goalLocked || player.onGround) {
    return false;
  }

  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;
  const otherCenterX = otherPlayer.x + otherPlayer.width / 2;
  const otherCenterY = otherPlayer.y + otherPlayer.height / 2;
  const distance = Math.hypot(otherCenterX - centerX, otherCenterY - centerY);
  if (!Number.isFinite(distance)) {
    return false;
  }

  const tetherIsTaut = distance >= tetherLength - TETHER_JUMP_TAUT_EPSILON;
  const minVerticalGap = Math.max(10, tetherLength * TETHER_JUMP_MIN_VERTICAL_GAP_RATIO);
  const isBelowOtherPlayer = centerY > otherCenterY + minVerticalGap;
  return tetherIsTaut && isBelowOtherPlayer;
}

function updatePlayer(player, dt, world, room) {
  if (player.goalLocked) {
    player.x = player.goalLockX;
    player.y = player.goalLockY;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.supportPlatformId = null;
    player.inWater = false;
    player.waterExitJumpAvailable = false;
    player.waterExitSurfaceY = null;
    return;
  }

  applyPlatformCarry(player, world);
  refreshPlayerWaterState(player, world);

  const waterMoveSpeedMultiplier = player.inWater ? WATER_MOVE_SPEED_MULTIPLIER : 1;
  const moveAccel = (player.onGround ? ACCEL : ACCEL * AIR_CONTROL) * waterMoveSpeedMultiplier;
  const movingLeft = player.input.left && !player.input.right;
  const movingRight = player.input.right && !player.input.left;

  if (movingLeft) {
    player.vx -= moveAccel * dt;
  } else if (movingRight) {
    player.vx += moveAccel * dt;
  } else if (player.onGround) {
    player.vx *= Math.max(0, 1 - FRICTION * dt);
  }

  const effectiveGravity = player.inWater ? GRAVITY * WATER_GRAVITY_MULTIPLIER : GRAVITY;
  const maxHorizontalSpeed = MAX_SPEED * waterMoveSpeedMultiplier;
  const maxFallSpeed = player.inWater ? MAX_FALL_SPEED * WATER_FALL_SPEED_MULTIPLIER : MAX_FALL_SPEED;
  player.vx = clamp(player.vx, -maxHorizontalSpeed, maxHorizontalSpeed);
  player.vy = clamp(player.vy + effectiveGravity * dt, -MAX_FALL_SPEED, maxFallSpeed);

  const hasSharedMidAirJumpsLeft =
    !room || room.sharedTetherMidAirJumpCount < MAX_SHARED_TETHER_MID_AIR_JUMPS;
  const canTetherJump = player.tetherJumpEligible && player.vy >= 0 && hasSharedMidAirJumpsLeft;
  const canWaterJump = player.inWater;
  const canWaterExitJump =
    !player.onGround &&
    !player.inWater &&
    Boolean(player.waterExitJumpAvailable) &&
    isWithinWaterExitJumpHeight(player, world);
  if (
    player.input.jump &&
    !player.jumpHeld &&
    (player.onGround || canTetherJump || canWaterJump || canWaterExitJump)
  ) {
    const usedTetherMidAirJump =
      !player.onGround && !canWaterJump && !canWaterExitJump && canTetherJump;
    const jumpSpeed = canWaterJump ? JUMP_SPEED * WATER_JUMP_SPEED_MULTIPLIER : JUMP_SPEED;
    player.vy = -jumpSpeed;
    player.onGround = false;
    player.supportPlatformId = null;
    if (canWaterExitJump) {
      player.waterExitJumpAvailable = false;
      player.waterExitSurfaceY = null;
    }
    if (usedTetherMidAirJump && room) {
      room.sharedTetherMidAirJumpCount += 1;
    }
  }
  player.jumpHeld = player.input.jump;

  const solids = world.platforms;
  const semisolidPlatforms = world.movingPlatforms;
  player.x += player.vx * dt;
  resolveSolidAxisCollisions(player, "x", solids);

  const previousBottom = player.y + player.height;
  const previousSupportPlatformId = player.supportPlatformId;
  player.y += player.vy * dt;
  player.onGround = false;
  player.supportPlatformId = null;
  resolveSolidAxisCollisions(player, "y", solids);
  resolveSemisolidLanding(
    player,
    semisolidPlatforms,
    previousBottom,
    previousSupportPlatformId,
    player.skipSemisolidPlatformId
  );

  keepInBounds(player, world);
  refreshPlayerWaterState(player, world);
}

function applyTether(room, p1, p2, dt) {
  const world = room.world;
  const p1Locked = Boolean(p1.goalLocked);
  const p2Locked = Boolean(p2.goalLocked);
  if (p1Locked && p2Locked) {
    return;
  }

  const p1PreviousBottom = p1.y + p1.height;
  const p2PreviousBottom = p2.y + p2.height;
  const p1PreviousSupportPlatformId = p1.supportPlatformId;
  const p2PreviousSupportPlatformId = p2.supportPlatformId;

  const tetherLength = room.settings.tetherLength;
  const c1x = p1.x + p1.width / 2;
  const c1y = p1.y + p1.height / 2;
  const c2x = p2.x + p2.width / 2;
  const c2y = p2.y + p2.height / 2;

  const dx = c2x - c1x;
  const dy = c2y - c1y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0.001 || dist <= tetherLength) {
    return;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const stretch = dist - tetherLength;
  const relativeVelocity = (p2.vx - p1.vx) * nx + (p2.vy - p1.vy) * ny;
  const force = stretch * TETHER_STIFFNESS + relativeVelocity * TETHER_DAMPING;
  const impulse = force * dt;

  if (p1Locked) {
    p2.vx -= nx * impulse;
    p2.vy -= ny * impulse;
  } else if (p2Locked) {
    p1.vx += nx * impulse;
    p1.vy += ny * impulse;
  } else {
    p1.vx += nx * impulse;
    p1.vy += ny * impulse;
    p2.vx -= nx * impulse;
    p2.vy -= ny * impulse;
  }

  if (p1Locked) {
    p2.x -= nx * stretch;
    p2.y -= ny * stretch;
  } else if (p2Locked) {
    p1.x += nx * stretch;
    p1.y += ny * stretch;
  } else {
    const correction = stretch * 0.5;
    p1.x += nx * correction;
    p1.y += ny * correction;
    p2.x -= nx * correction;
    p2.y -= ny * correction;
  }

  keepInBounds(p1, world);
  keepInBounds(p2, world);
  resolvePenetration(p1, world.platforms);
  resolvePenetration(p2, world.platforms);

  if (!p1.goalLocked) {
    resolveSemisolidLanding(
      p1,
      world.movingPlatforms,
      p1PreviousBottom,
      p1PreviousSupportPlatformId,
      p1.skipSemisolidPlatformId
    );
  }
  if (!p2.goalLocked) {
    resolveSemisolidLanding(
      p2,
      world.movingPlatforms,
      p2PreviousBottom,
      p2PreviousSupportPlatformId,
      p2.skipSemisolidPlatformId
    );
  }

  if (p1.goalLocked) {
    p1.x = p1.goalLockX;
    p1.y = p1.goalLockY;
    p1.vx = 0;
    p1.vy = 0;
    p1.supportPlatformId = null;
    p1.inWater = false;
    p1.waterExitJumpAvailable = false;
    p1.waterExitSurfaceY = null;
  }
  if (p2.goalLocked) {
    p2.x = p2.goalLockX;
    p2.y = p2.goalLockY;
    p2.vx = 0;
    p2.vy = 0;
    p2.supportPlatformId = null;
    p2.inWater = false;
    p2.waterExitJumpAvailable = false;
    p2.waterExitSurfaceY = null;
  }

  if (!p1.goalLocked) {
    refreshPlayerWaterState(p1, world);
  }
  if (!p2.goalLocked) {
    refreshPlayerWaterState(p2, world);
  }
}

function isInsideGoal(player, goal) {
  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;
  return (
    centerX >= goal.x &&
    centerX <= goal.x + goal.width &&
    centerY >= goal.y &&
    centerY <= goal.y + goal.height
  );
}

function lockPlayerAtGoal(player) {
  player.goalLocked = true;
  player.goalLockX = player.x;
  player.goalLockY = player.y;
  player.vx = 0;
  player.vy = 0;
  player.input.left = false;
  player.input.right = false;
  player.input.jump = false;
}

function serializePlayer(player) {
  return {
    id: player.id,
    slot: player.slot,
    profile: player.profile,
    name: player.name,
    x: Number(player.x.toFixed(2)),
    y: Number(player.y.toFixed(2)),
    vx: Number(player.vx.toFixed(2)),
    vy: Number(player.vy.toFixed(2)),
    width: player.width,
    height: player.height,
    goalLocked: Boolean(player.goalLocked),
  };
}

function getStatePayload(room) {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    status: room.status,
    winnerAt: room.winnerAt,
    players: getPlayables(room).map(serializePlayer),
    spectators: room.spectators.size,
    settings: { tetherLength: room.settings.tetherLength },
    restartVotes: {
      voted: getRestartVoteCount(room),
      required: getRequiredRestartVotes(room),
    },
    movingPlatforms: serializeMovingPlatforms(room.world.movingPlatforms),
    serverTime: Date.now(),
  };
}

function emitRoomState(room) {
  io.to(room.code).emit("state", getStatePayload(room));
}

function normalizeRoomCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

function generateUniqueRoomCode(isUsed) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 3000; attempt += 1) {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!isUsed(code)) {
      return code;
    }
  }
  throw new Error("Unable to generate unique room code");
}

function generateRoomCode() {
  return generateUniqueRoomCode((code) => rooms.has(code));
}

function generateEditorRoomCode() {
  return generateUniqueRoomCode((code) => editorRooms.has(code));
}

function normalizePreferredProfile(value) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < PROFILE_COUNT) {
    return numeric;
  }
  return null;
}

function getUsedProfiles(room) {
  const usedProfiles = new Set();
  for (const player of room.players.values()) {
    const profile = Number(player.profile);
    if (Number.isInteger(profile) && profile >= 0 && profile < PROFILE_COUNT) {
      usedProfiles.add(profile);
    }
  }
  return usedProfiles;
}

function resolvePreferredProfile(room, preferredProfileInput) {
  const preferredProfile = normalizePreferredProfile(preferredProfileInput);
  const usedProfiles = getUsedProfiles(room);

  if (preferredProfile !== null && !usedProfiles.has(preferredProfile)) {
    return preferredProfile;
  }

  for (let profileIndex = 0; profileIndex < PROFILE_COUNT; profileIndex += 1) {
    if (!usedProfiles.has(profileIndex)) {
      return profileIndex;
    }
  }

  return preferredProfile !== null ? preferredProfile : 0;
}

function resolveHost(room) {
  if (room.hostId && (room.players.has(room.hostId) || room.spectators.has(room.hostId))) {
    return;
  }

  for (const socketId of room.slots) {
    if (socketId) {
      room.hostId = socketId;
      const info = clients.get(socketId);
      if (info) {
        info.isHost = true;
      }
      return;
    }
  }

  for (const spectatorId of room.spectators) {
    room.hostId = spectatorId;
    const info = clients.get(spectatorId);
    if (info) {
      info.isHost = true;
    }
    return;
  }

  room.hostId = null;
}

// --- Editor rooms ---------------------------------------------------------

function listEditorParticipants(room) {
  const participants = [];
  for (const participant of room.participants.values()) {
    participants.push({
      id: participant.id,
      name: participant.displayName,
      isHost: room.hostId === participant.id,
    });
  }
  participants.sort((a, b) => a.name.localeCompare(b.name));
  return participants;
}

function emitEditorRoomState(room) {
  io.to(room.channel).emit("editor-room-state", {
    roomCode: room.code,
    hostId: room.hostId,
    participants: listEditorParticipants(room),
  });
}

function getNextEditorDisplayName(room, requestedName) {
  const baseName = normalizeEditorName(requestedName);
  const usedNames = new Set(
    Array.from(room.participants.values(), (participant) => participant.displayName)
  );

  if (!usedNames.has(baseName)) {
    return baseName;
  }

  let suffix = 2;
  while (usedNames.has(`${baseName} ${suffix}`)) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
}

function clearClientEditorState(socketId) {
  const info = clients.get(socketId);
  if (!info) {
    return;
  }
  info.editorRoomCode = null;
  info.editorDisplayName = null;
}

function leaveEditorRoom(socket) {
  const info = clients.get(socket.id);
  if (!info || !info.editorRoomCode) {
    clearClientEditorState(socket.id);
    return;
  }

  const room = editorRooms.get(info.editorRoomCode);
  const previousCode = info.editorRoomCode;
  const channel = getEditorChannelName(previousCode);

  clearClientEditorState(socket.id);
  socket.leave(channel);

  if (!room) {
    return;
  }

  room.participants.delete(socket.id);
  socket.to(channel).emit("editor-cursor-remove", { id: socket.id });

  if (room.hostId === socket.id) {
    const [nextHost] = room.participants.keys();
    room.hostId = nextHost || null;
  }

  if (room.participants.size === 0) {
    editorRooms.delete(previousCode);
    return;
  }

  emitEditorRoomState(room);
}

function assignSocketToEditorRoom(socket, room, requestedName) {
  const info = clients.get(socket.id) || createClientState();
  const displayName = getNextEditorDisplayName(room, requestedName);

  room.participants.set(socket.id, {
    id: socket.id,
    displayName,
  });

  info.editorRoomCode = room.code;
  info.editorDisplayName = displayName;
  clients.set(socket.id, info);

  socket.join(room.channel);
  emitEditorRoomState(room);

  return displayName;
}

function buildEditorJoinPayload(socket, room) {
  const info = clients.get(socket.id);
  return {
    ok: true,
    roomCode: room.code,
    isHost: room.hostId === socket.id,
    selfName: info && info.editorDisplayName ? info.editorDisplayName : normalizeEditorName("Player"),
    participants: listEditorParticipants(room),
    level: room.level,
  };
}

// --- Game room management -------------------------------------------------

function clearClientRoomState(socketId) {
  const info = clients.get(socketId);
  if (!info) {
    return;
  }
  info.roomCode = null;
  info.slot = -1;
  info.profile = null;
  info.isHost = false;
}

function leaveCurrentRoom(socket) {
  const info = clients.get(socket.id);
  if (!info || !info.roomCode) {
    clearClientRoomState(socket.id);
    return;
  }

  const room = rooms.get(info.roomCode);
  const oldRoomCode = info.roomCode;

  if (!room) {
    clearClientRoomState(socket.id);
    socket.leave(oldRoomCode);
    return;
  }

  if (info.slot >= 0 && room.slots[info.slot] === socket.id) {
    room.slots[info.slot] = null;
    room.restartVotes[info.slot] = false;
  }

  room.players.delete(socket.id);
  room.spectators.delete(socket.id);

  if (room.hostId === socket.id) {
    room.hostId = null;
  }

  clearClientRoomState(socket.id);
  socket.leave(oldRoomCode);

  if (countRoomClients(room) === 0) {
    rooms.delete(oldRoomCode);
    return;
  }

  resolveHost(room);
  updateMatchState(room);
  emitRoomState(room);
}

function assignSocketToRoom(socket, room, preferredProfileInput, customNameInput) {
  const slot = room.slots.indexOf(null);

  if (slot !== -1) {
    const profile = resolvePreferredProfile(room, preferredProfileInput);
    room.slots[slot] = socket.id;
    room.restartVotes[slot] = false;
    room.spectators.delete(socket.id);
    room.players.set(
      socket.id,
      createPlayer(socket.id, slot, profile, customNameInput, room.world)
    );
  } else {
    room.players.delete(socket.id);
    room.spectators.add(socket.id);
  }

  const info = clients.get(socket.id) || createClientState();
  info.roomCode = room.code;
  info.slot = slot;
  info.profile =
    slot !== -1 && room.players.has(socket.id)
      ? room.players.get(socket.id).profile
      : null;
  info.isHost = room.hostId === socket.id;
  clients.set(socket.id, info);

  socket.join(room.code);
  updateMatchState(room);
  emitRoomState(room);

  return info;
}

function buildJoinPayload(socket, room, info) {
  return {
    ok: true,
    id: socket.id,
    slot: info.slot,
    profile: info.profile,
    roomCode: room.code,
    isHost: info.isHost,
    world: {
      ...room.worldPayload,
      movingPlatforms: serializeMovingPlatforms(room.world.movingPlatforms),
    },
    settings: { tetherLength: room.settings.tetherLength },
  };
}

// --- Socket.IO connections ------------------------------------------------

io.on("connection", (socket) => {
  clients.set(socket.id, createClientState());

  socket.emit("welcome", {
    id: socket.id,
    limits: {
      minTetherLength: MIN_TETHER_LENGTH,
      maxTetherLength: MAX_TETHER_LENGTH,
      defaultTetherLength: DEFAULT_TETHER_LENGTH,
    },
  });

  socket.on("create-room", (payload, reply) => {
    try {
      leaveCurrentRoom(socket);
      const roomCode = generateRoomCode();
      const tetherLength = sanitizeTetherLength(payload && payload.tetherLength);
      const levelFile = payload && typeof payload.levelFile === "string" ? payload.levelFile : DEFAULT_LEVEL_FILE;
      const world = loadWorldFromFile(levelFile);
      const room = createRoom(roomCode, socket.id, tetherLength, world);
      rooms.set(roomCode, room);

      const info = assignSocketToRoom(
        socket,
        room,
        payload && (payload.preferredProfile ?? payload.preferredSlot),
        payload && payload.customName
      );
      const result = buildJoinPayload(socket, room, info);

      if (typeof reply === "function") {
        reply(result);
      } else {
        socket.emit("room-joined", result);
      }
    } catch (_error) {
      const failure = { ok: false, error: "Could not create room." };
      if (typeof reply === "function") {
        reply(failure);
      }
    }
  });

  socket.on("join-room", (payload, reply) => {
    const roomCode = normalizeRoomCode(payload && payload.code);
    const room = rooms.get(roomCode);
    if (!room) {
      const failure = { ok: false, error: "Room code not found." };
      if (typeof reply === "function") {
        reply(failure);
      }
      return;
    }

    leaveCurrentRoom(socket);
    const info = assignSocketToRoom(
      socket,
      room,
      payload && (payload.preferredProfile ?? payload.preferredSlot),
      payload && payload.customName
    );
    const result = buildJoinPayload(socket, room, info);

    if (typeof reply === "function") {
      reply(result);
    } else {
      socket.emit("room-joined", result);
    }
  });

  socket.on("leave-room", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("editor-create-room", (payload, reply) => {
    try {
      leaveEditorRoom(socket);
      const roomCode = generateEditorRoomCode();
      const initialLevel = normalizeEditorLevelPayload(payload && payload.level);
      const room = createEditorRoom(roomCode, socket.id, initialLevel);
      editorRooms.set(roomCode, room);

      assignSocketToEditorRoom(socket, room, payload && payload.name);
      const result = buildEditorJoinPayload(socket, room);
      if (typeof reply === "function") {
        reply(result);
      } else {
        socket.emit("editor-room-joined", result);
      }
    } catch (_error) {
      const failure = { ok: false, error: "Could not create editor room." };
      if (typeof reply === "function") {
        reply(failure);
      }
    }
  });

  socket.on("editor-join-room", (payload, reply) => {
    const roomCode = normalizeRoomCode(payload && payload.code);
    const room = editorRooms.get(roomCode);
    if (!room) {
      const failure = { ok: false, error: "Editor room code not found." };
      if (typeof reply === "function") {
        reply(failure);
      }
      return;
    }

    leaveEditorRoom(socket);
    assignSocketToEditorRoom(socket, room, payload && payload.name);
    const result = buildEditorJoinPayload(socket, room);
    if (typeof reply === "function") {
      reply(result);
    } else {
      socket.emit("editor-room-joined", result);
    }
  });

  socket.on("editor-leave-room", () => {
    leaveEditorRoom(socket);
  });

  socket.on("editor-level-update", (payload) => {
    const info = clients.get(socket.id);
    if (!info || !info.editorRoomCode) {
      return;
    }

    const room = editorRooms.get(info.editorRoomCode);
    if (!room) {
      return;
    }

    room.level = normalizeEditorLevelPayload(payload && payload.level);
    socket.to(room.channel).emit("editor-level-update", {
      level: room.level,
      by: socket.id,
      updatedAt: Date.now(),
    });
  });

  socket.on("editor-cursor-update", (payload) => {
    const info = clients.get(socket.id);
    if (!info || !info.editorRoomCode) {
      return;
    }

    const room = editorRooms.get(info.editorRoomCode);
    if (!room) {
      return;
    }

    const x = Number(payload && payload.x);
    const y = Number(payload && payload.y);
    const visible = Boolean(payload && payload.visible);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    socket.to(room.channel).emit("editor-cursor-update", {
      id: socket.id,
      name: info.editorDisplayName || normalizeEditorName("Player"),
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
      visible,
    });
  });

  socket.on("input", (nextInput) => {
    const info = clients.get(socket.id);
    if (!info || !info.roomCode || info.slot < 0) {
      return;
    }

    const room = rooms.get(info.roomCode);
    if (!room || room.status === "won") {
      return;
    }

    const player = room.players.get(socket.id);
    if (!player) {
      return;
    }

    player.input.left = Boolean(nextInput && nextInput.left);
    player.input.right = Boolean(nextInput && nextInput.right);
    player.input.jump = Boolean(nextInput && nextInput.jump);
  });

  socket.on("restart", () => {
    const info = clients.get(socket.id);
    if (!info || !info.roomCode || info.slot < 0) {
      return;
    }

    const room = rooms.get(info.roomCode);
    if (!room) {
      return;
    }

    room.restartVotes[info.slot] = true;
    const required = getRequiredRestartVotes(room);
    if (required >= 2 && getRestartVoteCount(room) >= required) {
      resetRound(room);
    }
    emitRoomState(room);
  });

  socket.on("set-settings", (nextSettings) => {
    const info = clients.get(socket.id);
    if (!info || !info.roomCode) {
      return;
    }

    const room = rooms.get(info.roomCode);
    if (!room || room.hostId !== socket.id) {
      return;
    }

    const tetherLength = sanitizeTetherLength(nextSettings && nextSettings.tetherLength);
    room.settings.tetherLength = tetherLength;
    io.to(room.code).emit("settings", { tetherLength });
    emitRoomState(room);
  });

  socket.on("disconnect", () => {
    leaveEditorRoom(socket);
    leaveCurrentRoom(socket);
    clients.delete(socket.id);
  });
});

// --- Game loop ------------------------------------------------------------

setInterval(() => {
  for (const room of rooms.values()) {
    const world = room.world;
    updateMovingPlatforms(world, DT);
    updateMatchState(room);

    if (room.status === "playing") {
      const playables = getPlayables(room);
      const bothAirborneBeforeUpdate =
        playables.length === 2 && !playables[0].onGround && !playables[1].onGround;
      if (!bothAirborneBeforeUpdate) {
        room.sharedTetherMidAirJumpCount = 0;
      }
      for (const player of playables) {
        player.tetherJumpEligible = false;
      }
      if (playables.length === 2) {
        const [p1, p2] = playables;
        const tetherLength = room.settings.tetherLength;
        p1.tetherJumpEligible = isTetherJumpEligible(p1, p2, tetherLength);
        p2.tetherJumpEligible = isTetherJumpEligible(p2, p1, tetherLength);
      }

      for (const player of playables) {
        updatePlayer(player, DT, world, room);
      }
      const bothAirborneAfterUpdate =
        playables.length === 2 && !playables[0].onGround && !playables[1].onGround;
      if (!bothAirborneAfterUpdate) {
        room.sharedTetherMidAirJumpCount = 0;
      }

      if (playables.length === 2) {
        applyTether(room, playables[0], playables[1], DT);

        if (!playables[0].goalLocked && isInsideGoal(playables[0], world.goal)) {
          lockPlayerAtGoal(playables[0]);
        }
        if (!playables[1].goalLocked && isInsideGoal(playables[1], world.goal)) {
          lockPlayerAtGoal(playables[1]);
        }

        if (playables[0].goalLocked && playables[1].goalLocked) {
          room.status = "won";
          room.winnerAt = Date.now();
        }
      }

      for (const player of playables) {
        player.skipSemisolidPlatformId = null;
      }
    }

    emitRoomState(room);
  }
}, 1000 / TICK_RATE);

// --- Startup --------------------------------------------------------------

function getNetworkUrls() {
  const urls = [`http://localhost:${PORT}`];
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        urls.push(`http://${net.address}:${PORT}`);
      }
    }
  }

  return [...new Set(urls)];
}

server.listen(PORT, HOST, () => {
  const urls = getNetworkUrls();
  loadWorldFromDisk();
  console.log("Server running.");
  for (const url of urls) {
    console.log(`Open: ${url}`);
  }
});
