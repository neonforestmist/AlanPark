const canvas = document.getElementById("editorCanvas");
const canvasStage = document.getElementById("canvasStage");
const canvasViewport = document.getElementById("canvasViewport");
const canvasWrap = document.querySelector(".canvas-wrap");
const cursorLayer = document.getElementById("cursorLayer");
const ctx = canvas.getContext("2d");
const levelNameInput = document.getElementById("levelNameInput");
const colsInput = document.getElementById("colsInput");
const rowsInput = document.getElementById("rowsInput");
const resizeHorizontalSelect = document.getElementById("resizeHorizontalSelect");
const resizeVerticalSelect = document.getElementById("resizeVerticalSelect");
const goalWidthInput = document.getElementById("goalWidthInput");
const goalHeightInput = document.getElementById("goalHeightInput");
const jsonOutput = document.getElementById("jsonOutput");
const jsonFileInput = document.getElementById("jsonFileInput");
const jsonActionStatus = document.getElementById("jsonActionStatus");

const newGridBtn = document.getElementById("newGridBtn");
const floorBtn = document.getElementById("floorBtn");
const clearBtn = document.getElementById("clearBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const loadTextBtn = document.getElementById("loadTextBtn");
const settingsBtn = document.getElementById("settingsBtn");
const backHomeBtn = document.getElementById("backHomeBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const collabBtn = document.getElementById("collabBtn");
const collabBtnLabel = document.getElementById("collabBtnLabel");
const toolbarRoomBadge = document.getElementById("toolbarRoomBadge");
const toolbarRoomCode = document.getElementById("toolbarRoomCode");
const closeCollabBtn = document.getElementById("closeCollabBtn");
const collabPanel = document.getElementById("collabPanel");
const collabCreateForm = document.getElementById("collabCreateForm");
const collabJoinForm = document.getElementById("collabJoinForm");
const collabNameInput = document.getElementById("collabNameInput");
const collabCodeInput = document.getElementById("collabCodeInput");
const collabCreateBtn = document.getElementById("collabCreateBtn");
const collabJoinBtn = document.getElementById("collabJoinBtn");
const collabLeaveBtn = document.getElementById("collabLeaveBtn");
const collabCopyCodeBtn = document.getElementById("collabCopyCodeBtn");
const collabRoomInfo = document.getElementById("collabRoomInfo");
const collabCreateHelp = document.getElementById("collabCreateHelp");
const collabStatus = document.getElementById("collabStatus");
const collabConnectionBar = document.getElementById("collabConnectionBar");
const collabConnectionLabel = document.getElementById("collabConnectionLabel");
const collabLobby = document.getElementById("collabLobby");
const collabActiveSection = document.getElementById("collabActiveSection");
const collabRoomCodeValue = document.getElementById("collabRoomCodeValue");
const participantsBtn = document.getElementById("participantsBtn");
const participantsCountLabel = document.getElementById("participantsCountLabel");
const participantsPanel = document.getElementById("participantsPanel");
const closeParticipantsBtn = document.getElementById("closeParticipantsBtn");
const participantsList = document.getElementById("participantsList");
const previewToggleBtn = document.getElementById("previewToggleBtn");
const previewToggleIcon = document.getElementById("previewToggleIcon");
const previewToggleLabel = document.getElementById("previewToggleLabel");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeToggleIcon = document.getElementById("themeToggleIcon");
const themeToggleLabel = document.getElementById("themeToggleLabel");
const toolGroup = document.querySelector(".tool-group");
const toolButtons = [...document.querySelectorAll(".tool")];

const socket = typeof window.io === "function" ? window.io() : null;

const PREVIEW_TILE = 30;
const THEME_STORAGE_KEY = "tile_editor_theme";
const LIGHT_THEME = "light";
const DARK_THEME = "dark";
const DEFAULT_LEVEL_NAME = "Forest Blocks";
const ROOM_CODE_LENGTH = 5;
const MAX_NAME_LENGTH = 20;
const COLLAB_SYNC_DEBOUNCE_MS = 45;
const COLLAB_ACTION_TIMEOUT_MS = 8000;
const CURSOR_SEND_INTERVAL_MS = 40;
const DEFAULT_PROFILE_NAMES = ["Alan", "Leaf"];
const REMOTE_CURSOR_COLORS = [
  "#2f89ff",
  "#ff6b6b",
  "#2fbf71",
  "#c15eff",
  "#ffaa33",
  "#00a7a7",
  "#9d7bf7",
  "#f26bcd",
];
const PREVIEW_ACCEL = 2300;
const PREVIEW_AIR_CONTROL = 0.62;
const PREVIEW_FRICTION = 11;
const PREVIEW_MAX_SPEED = 300;
const PREVIEW_GRAVITY = 1800;
const PREVIEW_WATER_GRAVITY_MULTIPLIER = 0.22;
const PREVIEW_WATER_MOVE_SPEED_MULTIPLIER = 0.78;
const PREVIEW_WATER_JUMP_SPEED_MULTIPLIER = 0.35;
const PREVIEW_WATER_FALL_SPEED_MULTIPLIER = 0.42;
const PREVIEW_MAX_FALL_SPEED = 1150;
const PREVIEW_JUMP_SPEED = 860;
const PREVIEW_LIFT_TRAVEL_TILES = 3;
const PREVIEW_LIFT_SPEED = 100;
const PREVIEW_PLATFORM_CONTACT_EPSILON = 5;
const PREVIEW_PLATFORM_SIDE_INSET = 4;
const PREVIEW_WALK_FRAME_MS = 120;
const WATER_TILE_ALPHA = 0.80;
const MAX_EDITOR_DISPLAY_SCALE = 2.2;

const blockImage = new Image();
blockImage.src = "assets/block.png";
const block2Image = new Image();
block2Image.src = "assets/block-2.png";
const liftHImage = new Image();
liftHImage.src = "assets/lift-h.png";
const liftVImage = new Image();
liftVImage.src = "assets/lift-v.png";
const waterShallowImage = new Image();
waterShallowImage.src = "assets/water-shallow.png";
const waterBodyImage = new Image();
waterBodyImage.src = "assets/water-body.png";
const goalImage = new Image();
goalImage.src = "assets/goal.png";
const decorImages = [1, 2, 3, 4, 5, 6].map((index) => {
  const image = new Image();
  image.src = `assets/decor/decor-${index}.png`;
  return image;
});
const previewPlayerIdleImage = new Image();
previewPlayerIdleImage.src = "assets/players/player1/idle.png";
const previewPlayerJumpImage = new Image();
previewPlayerJumpImage.src = "assets/players/player1/jump.png";
const previewPlayerWalkImages = [1, 2, 3].map((frameIndex) => {
  const image = new Image();
  image.src = `assets/players/player1/walk_${frameIndex}.png`;
  return image;
});

let tool = "block";
let isPointerDown = false;

let level = createLevel(64, 36, 16);
let suppressCollabBroadcast = false;
let queuedLevelSyncTimer = null;
let lastCursorSentAt = 0;
let hasUnsavedChanges = false;
const remoteCursorElements = new Map();

const collabState = {
  roomCode: null,
  selfId: null,
  selfName: null,
  participants: [],
  pendingAction: null,
  pendingRequestId: null,
  requestCounter: 0,
  pendingTimer: null,
};

const previewState = {
  enabled: false,
  world: null,
  player: null,
  input: { left: false, right: false, jump: false },
  rafId: null,
  lastFrameAt: 0,
  facing: 1,
  goalReached: false,
};

function createEmptyTiles(rows, columns) {
  return Array.from({ length: rows }, () => ".".repeat(columns));
}

function createEmptyDecor(rows, columns) {
  return Array.from({ length: rows }, () => ".".repeat(columns));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function trimToCodePoints(value, maxLength) {
  return Array.from(String(value || "")).slice(0, maxLength).join("");
}

function sanitizeName(value) {
  const trimmed = trimToCodePoints(value, MAX_NAME_LENGTH).trim().replace(/\s+/g, " ");
  return trimmed || "Player";
}

function getStoredEditorName() {
  try {
    const rawName = window.localStorage.getItem("customPlayerName") || "";
    if (String(rawName).trim()) {
      return sanitizeName(rawName);
    }
  } catch (_error) {
    // Ignore storage failures.
  }

  try {
    const preferredProfile = Number(window.localStorage.getItem("preferredProfile"));
    if (Number.isInteger(preferredProfile) && preferredProfile >= 0 && preferredProfile < DEFAULT_PROFILE_NAMES.length) {
      return DEFAULT_PROFILE_NAMES[preferredProfile];
    }
  } catch (_error) {
    // Ignore storage failures.
  }

  return DEFAULT_PROFILE_NAMES[0];
}

function normalizeRoomCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

function createLevel(tileSize, columns, rows) {
  const defaultSpawnY = Math.max(rows - 8, 0);
  return {
    name: DEFAULT_LEVEL_NAME,
    tileSize,
    spawnTiles: [
      { x: 2, y: defaultSpawnY },
      { x: 4, y: defaultSpawnY },
    ],
    goalTile: {
      x: Math.max(columns - 4, 0),
      y: Math.max(rows - 9, 0),
      width: 1,
      height: 1,
    },
    tiles: createEmptyTiles(rows, columns),
    decor: createEmptyDecor(rows, columns),
  };
}

function normalizeResizeDirection(value, axis) {
  const raw = String(value || "").toLowerCase();
  if (axis === "horizontal") {
    return raw === "left" ? "left" : "right";
  }
  return raw === "up" ? "up" : "down";
}

function resizeLevelPreservingContent(
  sourceLevel,
  tileSize,
  columns,
  rows,
  horizontalDirection = "right",
  verticalDirection = "down"
) {
  const sourceTiles = Array.isArray(sourceLevel.tiles) ? sourceLevel.tiles : [];
  const sourceDecor = Array.isArray(sourceLevel.decor) ? sourceLevel.decor : [];
  const sourceRows = sourceTiles.length;
  const sourceColumns = sourceRows > 0 ? sourceTiles[0].length : 0;
  const horizontalMode = normalizeResizeDirection(horizontalDirection, "horizontal");
  const verticalMode = normalizeResizeDirection(verticalDirection, "vertical");

  const tiles = createEmptyTiles(rows, columns);
  const decor = createEmptyDecor(rows, columns);
  const offsetX = horizontalMode === "left" ? columns - sourceColumns : 0;
  const offsetY = verticalMode === "up" ? rows - sourceRows : 0;

  for (let y = 0; y < sourceRows; y += 1) {
    const targetY = y + offsetY;
    if (targetY < 0 || targetY >= rows) {
      continue;
    }
    const tileRow = typeof sourceTiles[y] === "string" ? sourceTiles[y] : "";
    const decorRow = typeof sourceDecor[y] === "string" ? sourceDecor[y] : "";
    for (let x = 0; x < sourceColumns; x += 1) {
      const targetX = x + offsetX;
      if (targetX < 0 || targetX >= columns) {
        continue;
      }
      const tileSymbol = tileRow[x] || ".";
      const decorSymbol = decorRow[x] || ".";
      tiles[targetY] = setRowChar(tiles[targetY], targetX, tileSymbol);
      decor[targetY] = setRowChar(decor[targetY], targetX, decorSymbol);
    }
  }

  const defaultSpawnY = Math.max(rows - 8, 0);
  const spawnTiles = [0, 1].map((index) => {
    const hasSourceSpawn = Array.isArray(sourceLevel.spawnTiles) && sourceLevel.spawnTiles[index];
    const sourceSpawn = hasSourceSpawn
      ? sourceLevel.spawnTiles[index]
      : { x: 2 + index * 2, y: defaultSpawnY };
    const sourceX = Number.isFinite(Number(sourceSpawn.x))
      ? Math.round(Number(sourceSpawn.x))
      : 0;
    const sourceY = Number.isFinite(Number(sourceSpawn.y))
      ? Math.round(Number(sourceSpawn.y))
      : defaultSpawnY;
    return {
      x: clamp(hasSourceSpawn ? sourceX + offsetX : sourceX, 0, columns - 1),
      y: clamp(hasSourceSpawn ? sourceY + offsetY : sourceY, 0, rows - 1),
    };
  });

  const sourceGoal = sourceLevel.goalTile || {};
  const hasSourceGoal =
    sourceLevel.goalTile && typeof sourceLevel.goalTile === "object";
  const sourceGoalX = Number.isFinite(Number(sourceGoal.x))
    ? Math.round(Number(sourceGoal.x))
    : Math.max(columns - 4, 0);
  const sourceGoalY = Number.isFinite(Number(sourceGoal.y))
    ? Math.round(Number(sourceGoal.y))
    : Math.max(rows - 9, 0);
  const goalTile = {
    x: clamp(hasSourceGoal ? sourceGoalX + offsetX : sourceGoalX, 0, columns - 1),
    y: clamp(hasSourceGoal ? sourceGoalY + offsetY : sourceGoalY, 0, rows - 1),
    width: 1,
    height: 1,
  };

  return {
    ...sourceLevel,
    tileSize,
    spawnTiles,
    goalTile,
    tiles,
    decor: reconcileTileAndDecor(tiles, decor),
  };
}

function normalizeTileRows(rows, columns) {
  const normalized = [];
  for (let y = 0; y < rows.length; y += 1) {
    let row = typeof rows[y] === "string" ? rows[y] : "";
    row = row
      .replace(/H/g, "h")
      .replace(/V/g, "v")
      .replace(/B/g, "b")
      .replace(/S/g, "s")
      .replace(/W/g, "w");
    row = row.replace(/[^#.bhvsw]/g, ".");
    row = row.padEnd(columns, ".").slice(0, columns);
    normalized.push(row);
  }
  return normalized;
}

function normalizeDecorRows(rows, columns) {
  const normalized = [];
  for (let y = 0; y < rows.length; y += 1) {
    let row = typeof rows[y] === "string" ? rows[y] : "";
    row = row.replace(/[^.1-6]/g, ".");
    row = row.padEnd(columns, ".").slice(0, columns);
    normalized.push(row);
  }
  return normalized;
}

function reconcileTileAndDecor(tiles, decor) {
  const rows = tiles.length;
  const columns = rows > 0 ? tiles[0].length : 0;
  const reconciledDecor = [];

  for (let y = 0; y < rows; y += 1) {
    const tileRow = tiles[y] || ".".repeat(columns);
    const decorRow = decor[y] || ".".repeat(columns);
    const nextRow = [];
    for (let x = 0; x < columns; x += 1) {
      if (tileRow[x] !== ".") {
        nextRow.push(".");
      } else {
        nextRow.push(/[1-6]/.test(decorRow[x]) ? decorRow[x] : ".");
      }
    }
    reconciledDecor.push(nextRow.join(""));
  }

  return reconciledDecor;
}

function normalizeLevel(input) {
  const tileSize = Math.max(16, Math.round(Number(input.tileSize) || 64));
  const inputTiles = Array.isArray(input.tiles) ? input.tiles : [];
  const rows = Math.max(inputTiles.length, 8);
  const columns = Math.max(
    inputTiles.reduce(
      (max, row) => Math.max(max, typeof row === "string" ? row.length : 0),
      0
    ),
    8
  );
  const tiles = normalizeTileRows(inputTiles, columns);
  const inputDecor = Array.isArray(input.decor) ? input.decor : [];
  const decor = normalizeDecorRows(inputDecor, columns);
  while (tiles.length < rows) {
    tiles.push(".".repeat(columns));
  }
  while (decor.length < rows) {
    decor.push(".".repeat(columns));
  }
  const reconciledDecor = reconcileTileAndDecor(tiles, decor);

  const defaultSpawnY = Math.max(rows - 8, 0);
  const spawnTiles = [0, 1].map((index) => {
    const source =
      Array.isArray(input.spawnTiles) && input.spawnTiles[index]
        ? input.spawnTiles[index]
        : { x: 2 + index * 2, y: defaultSpawnY };
    return {
      x: clamp(Math.round(Number(source.x) || 0), 0, columns - 1),
      y: clamp(Math.round(Number(source.y) || defaultSpawnY), 0, rows - 1),
    };
  });

  const rawGoal = input.goalTile || {};
  const goalTile = {
    x: clamp(
      Math.round(Number(rawGoal.x) || Math.max(columns - 4, 0)),
      0,
      columns - 1
    ),
    y: clamp(Math.round(Number(rawGoal.y) || Math.max(rows - 9, 0)), 0, rows - 1),
    width: 1,
    height: 1,
  };

  goalTile.width = clamp(goalTile.width, 1, columns - goalTile.x);
  goalTile.height = clamp(goalTile.height, 1, rows - goalTile.y);

  return {
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : DEFAULT_LEVEL_NAME,
    tileSize,
    spawnTiles,
    goalTile,
    tiles,
    decor: reconciledDecor,
  };
}

function updatePreviewToggleUi() {
  if (toolGroup) {
    toolGroup.classList.toggle("preview-disabled", previewState.enabled);
    toolGroup.setAttribute("aria-disabled", previewState.enabled ? "true" : "false");
  }
  for (const button of toolButtons) {
    button.disabled = previewState.enabled;
  }

  if (!previewToggleBtn) {
    return;
  }
  previewToggleBtn.classList.toggle("preview-active", previewState.enabled);
  previewToggleBtn.setAttribute("aria-pressed", previewState.enabled ? "true" : "false");
  if (previewToggleLabel) {
    previewToggleLabel.textContent = previewState.enabled ? "Preview On" : "Preview Off";
  }
  if (previewToggleIcon) {
    previewToggleIcon.textContent = previewState.enabled ? "toggle_on" : "toggle_off";
  }
}

function clearPreviewInputState() {
  previewState.input.left = false;
  previewState.input.right = false;
  previewState.input.jump = false;
}

function getEditorScaleFromWorld(world) {
  if (!world || !Number.isFinite(world.tileSize) || world.tileSize <= 0) {
    return 1;
  }
  return PREVIEW_TILE / world.tileSize;
}

function buildPreviewWorld(levelConfig) {
  const tileSize = Math.max(16, Math.round(Number(levelConfig.tileSize) || 64));
  const tiles = Array.isArray(levelConfig.tiles) ? levelConfig.tiles : [];
  const rows = tiles.length;
  const columns = rows > 0 ? tiles[0].length : 0;

  const solids = [];
  const waterZones = [];
  const movingPlatforms = [];
  const maxX = Math.max(columns * tileSize - tileSize, 0);
  const maxY = Math.max(rows * tileSize - tileSize, 0);
  const travelDistance = PREVIEW_LIFT_TRAVEL_TILES * tileSize;
  let liftIndex = 0;

  for (let y = 0; y < rows; y += 1) {
    const row = tiles[y] || "";
    for (let x = 0; x < columns; x += 1) {
      const symbol = row[x];
      if (symbol === "#" || symbol === "b") {
        solids.push({
          x: x * tileSize,
          y: y * tileSize,
          width: tileSize,
          height: tileSize,
        });
        continue;
      }

      if (symbol === "s" || symbol === "w") {
        waterZones.push({
          x: x * tileSize,
          y: y * tileSize,
          width: tileSize,
          height: tileSize,
        });
        continue;
      }

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
        id: `preview-lift-${liftIndex}`,
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
        speed: PREVIEW_LIFT_SPEED,
        dx: 0,
        dy: 0,
      });
      liftIndex += 1;
    }
  }

  const spawnTiles = Array.isArray(levelConfig.spawnTiles) ? levelConfig.spawnTiles : [];
  const spawnSource = spawnTiles[0] || { x: 2, y: Math.max(rows - 8, 0) };
  const spawnTile = {
    x: clamp(Math.round(Number(spawnSource.x) || 0), 0, Math.max(columns - 1, 0)),
    y: clamp(
      Math.round(Number(spawnSource.y) || Math.max(rows - 8, 0)),
      0,
      Math.max(rows - 1, 1)
    ),
  };
  const playerSize = tileSize;
  const spawn = {
    x: spawnTile.x * tileSize + (tileSize - playerSize) * 0.5,
    y: spawnTile.y * tileSize,
  };
  const spawnRect = {
    x: spawn.x,
    y: spawn.y,
    width: playerSize,
    height: playerSize,
  };
  let spawnAdjustAttempts = Math.max(2, rows);
  while (spawnAdjustAttempts > 0 && solids.some((solid) => isRectIntersecting(spawnRect, solid))) {
    spawnRect.y = Math.max(0, spawnRect.y - tileSize);
    spawnAdjustAttempts -= 1;
  }
  spawn.y = spawnRect.y;

  const rawGoal = levelConfig.goalTile || {};
  const goalX = clamp(Math.round(Number(rawGoal.x) || 0), 0, Math.max(columns - 1, 0));
  const goalY = clamp(Math.round(Number(rawGoal.y) || 0), 0, Math.max(rows - 1, 0));
  const goalWidth = clamp(Math.round(Number(rawGoal.width) || 1), 1, Math.max(columns - goalX, 1));
  const goalHeight = clamp(Math.round(Number(rawGoal.height) || 1), 1, Math.max(rows - goalY, 1));

  return {
    tileSize,
    rows,
    columns,
    width: columns * tileSize,
    height: rows * tileSize,
    solids,
    waterZones,
    movingPlatforms,
    movingPlatformById: new Map(movingPlatforms.map((platform) => [platform.id, platform])),
    spawn,
    playerSize,
    goal: {
      x: goalX * tileSize,
      y: goalY * tileSize,
      width: goalWidth * tileSize,
      height: goalHeight * tileSize,
    },
  };
}

function createPreviewPlayer(world) {
  return {
    x: world.spawn.x,
    y: world.spawn.y,
    width: world.playerSize,
    height: world.playerSize,
    vx: 0,
    vy: 0,
    onGround: false,
    jumpHeld: false,
    supportPlatformId: null,
    inWater: false,
    waterExitJumpAvailable: false,
    waterExitSurfaceY: null,
  };
}

function resetPreviewSimulation() {
  if (!previewState.enabled) {
    return;
  }
  previewState.world = buildPreviewWorld(level);
  previewState.player = createPreviewPlayer(previewState.world);
  previewState.facing = 1;
  previewState.goalReached = false;
  previewState.lastFrameAt = performance.now();
}

function isRectIntersecting(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function isPreviewPlayerInWater(player, world) {
  if (!player || !world || !Array.isArray(world.waterZones) || world.waterZones.length === 0) {
    return false;
  }
  for (const zone of world.waterZones) {
    if (isRectIntersecting(player, zone)) {
      return true;
    }
  }
  return false;
}

function getPreviewWaterSurfaceTopAtPlayer(player, world) {
  if (!player || !world || !Array.isArray(world.waterZones) || world.waterZones.length === 0) {
    return null;
  }

  const left = player.x + PREVIEW_PLATFORM_SIDE_INSET;
  const right = player.x + player.width - PREVIEW_PLATFORM_SIDE_INSET;
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

function isWithinPreviewWaterExitJumpHeight(player, world) {
  if (!player || !world || !Number.isFinite(player.waterExitSurfaceY)) {
    return false;
  }

  const maxHeight = (Number(world.tileSize) || player.height || 64) * 0.5;
  const playerBottom = player.y + player.height;
  const distanceAboveWater = player.waterExitSurfaceY - playerBottom;
  return (
    distanceAboveWater >= -PREVIEW_PLATFORM_CONTACT_EPSILON &&
    distanceAboveWater <= maxHeight + PREVIEW_PLATFORM_CONTACT_EPSILON
  );
}

function refreshPreviewWaterState(player, world) {
  if (!player) {
    return;
  }
  const wasInWater = Boolean(player.inWater);
  const inWater = isPreviewPlayerInWater(player, world);
  const waterSurfaceTop = getPreviewWaterSurfaceTopAtPlayer(player, world);
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
    player.waterExitJumpAvailable = isWithinPreviewWaterExitJumpHeight(player, world);
    if (!player.waterExitJumpAvailable) {
      player.waterExitSurfaceY = null;
    }
    return;
  }

  if (player.waterExitJumpAvailable && !isWithinPreviewWaterExitJumpHeight(player, world)) {
    player.waterExitJumpAvailable = false;
    player.waterExitSurfaceY = null;
  }

  if (player.onGround) {
    player.waterExitJumpAvailable = false;
    player.waterExitSurfaceY = null;
  }
}

function updatePreviewMovingPlatforms(world, dt) {
  for (const platform of world.movingPlatforms) {
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

function applyPreviewPlatformCarry(player, world) {
  if (!player.supportPlatformId) {
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
    player.x + player.width > previousX + PREVIEW_PLATFORM_SIDE_INSET &&
    player.x < previousX + platform.width - PREVIEW_PLATFORM_SIDE_INSET;
  const playerBottom = player.y + player.height;
  const wasOnTop =
    overlapX && Math.abs(playerBottom - previousY) <= PREVIEW_PLATFORM_CONTACT_EPSILON;

  if (!wasOnTop) {
    player.supportPlatformId = null;
    return;
  }

  player.x += platform.dx;
  player.y += platform.dy;
}

function resolvePreviewSolidAxisCollisions(player, axis, solids) {
  for (const solid of solids) {
    if (!isRectIntersecting(player, solid)) {
      continue;
    }

    if (axis === "x") {
      if (player.vx > 0) {
        player.x = solid.x - player.width;
      } else if (player.vx < 0) {
        player.x = solid.x + solid.width;
      } else {
        const overlapLeft = player.x + player.width - solid.x;
        const overlapRight = solid.x + solid.width - player.x;
        player.x = overlapLeft < overlapRight ? solid.x - player.width : solid.x + solid.width;
      }
      player.vx = 0;
      continue;
    }

    if (player.vy > 0) {
      player.y = solid.y - player.height;
      player.vy = 0;
      player.onGround = true;
      player.supportPlatformId = null;
    } else if (player.vy < 0) {
      player.y = solid.y + solid.height;
      player.vy = 0;
    }
  }
}

function resolvePreviewSemisolidLanding(player, movingPlatforms, previousBottom, previousSupportPlatformId) {
  if (player.vy < 0) {
    return;
  }

  let landedPlatform = null;
  let landedTop = Number.POSITIVE_INFINITY;
  const playerBottom = player.y + player.height;

  for (const platform of movingPlatforms) {
    const previousPlatformTop = platform.y - platform.dy;
    const wasStandingOnPlatform = previousSupportPlatformId === platform.id;
    const wasAbove =
      wasStandingOnPlatform || previousBottom <= previousPlatformTop + PREVIEW_PLATFORM_CONTACT_EPSILON;
    if (!wasAbove) {
      continue;
    }

    if (playerBottom < platform.y - PREVIEW_PLATFORM_CONTACT_EPSILON) {
      continue;
    }

    const overlapX =
      player.x + player.width > platform.x + PREVIEW_PLATFORM_SIDE_INSET &&
      player.x < platform.x + platform.width - PREVIEW_PLATFORM_SIDE_INSET;
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

function keepPreviewPlayerInBounds(player, world) {
  player.x = clamp(player.x, 0, Math.max(world.width - player.width, 0));
  if (player.y < 0) {
    player.y = 0;
    player.vy = 0;
  }
  if (player.y > world.height + 260) {
    player.x = world.spawn.x;
    player.y = world.spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.jumpHeld = false;
    player.supportPlatformId = null;
    player.inWater = false;
    player.waterExitJumpAvailable = false;
    player.waterExitSurfaceY = null;
    previewState.goalReached = false;
  }
}

function updatePreviewGoalReached(player, world) {
  const centerX = player.x + player.width * 0.5;
  const centerY = player.y + player.height * 0.5;
  previewState.goalReached =
    centerX >= world.goal.x &&
    centerX <= world.goal.x + world.goal.width &&
    centerY >= world.goal.y &&
    centerY <= world.goal.y + world.goal.height;
}

function updatePreviewPlayer(world, dt) {
  const player = previewState.player;
  if (!player) {
    return;
  }

  applyPreviewPlatformCarry(player, world);
  refreshPreviewWaterState(player, world);

  const previewWaterMoveSpeedMultiplier = player.inWater ? PREVIEW_WATER_MOVE_SPEED_MULTIPLIER : 1;
  const moveAccel =
    (player.onGround ? PREVIEW_ACCEL : PREVIEW_ACCEL * PREVIEW_AIR_CONTROL) *
    previewWaterMoveSpeedMultiplier;
  const movingLeft = previewState.input.left && !previewState.input.right;
  const movingRight = previewState.input.right && !previewState.input.left;

  if (movingLeft) {
    player.vx -= moveAccel * dt;
  } else if (movingRight) {
    player.vx += moveAccel * dt;
  } else if (player.onGround) {
    player.vx *= Math.max(0, 1 - PREVIEW_FRICTION * dt);
  }

  const previewGravity = player.inWater
    ? PREVIEW_GRAVITY * PREVIEW_WATER_GRAVITY_MULTIPLIER
    : PREVIEW_GRAVITY;
  const previewMaxHorizontalSpeed = PREVIEW_MAX_SPEED * previewWaterMoveSpeedMultiplier;
  const previewMaxFallSpeed = player.inWater
    ? PREVIEW_MAX_FALL_SPEED * PREVIEW_WATER_FALL_SPEED_MULTIPLIER
    : PREVIEW_MAX_FALL_SPEED;
  player.vx = clamp(player.vx, -previewMaxHorizontalSpeed, previewMaxHorizontalSpeed);
  player.vy = clamp(player.vy + previewGravity * dt, -PREVIEW_MAX_FALL_SPEED, previewMaxFallSpeed);

  const canWaterExitJump =
    !player.onGround &&
    !player.inWater &&
    Boolean(player.waterExitJumpAvailable) &&
    isWithinPreviewWaterExitJumpHeight(player, world);
  if (previewState.input.jump && !player.jumpHeld && (player.onGround || player.inWater || canWaterExitJump)) {
    const previewJumpSpeed = player.inWater
      ? PREVIEW_JUMP_SPEED * PREVIEW_WATER_JUMP_SPEED_MULTIPLIER
      : PREVIEW_JUMP_SPEED;
    player.vy = -previewJumpSpeed;
    player.onGround = false;
    player.supportPlatformId = null;
    if (canWaterExitJump) {
      player.waterExitJumpAvailable = false;
      player.waterExitSurfaceY = null;
    }
  }
  player.jumpHeld = previewState.input.jump;

  player.x += player.vx * dt;
  resolvePreviewSolidAxisCollisions(player, "x", world.solids);

  const previousBottom = player.y + player.height;
  const previousSupportPlatformId = player.supportPlatformId;
  player.y += player.vy * dt;
  player.onGround = false;
  player.supportPlatformId = null;
  resolvePreviewSolidAxisCollisions(player, "y", world.solids);
  resolvePreviewSemisolidLanding(
    player,
    world.movingPlatforms,
    previousBottom,
    previousSupportPlatformId
  );

  keepPreviewPlayerInBounds(player, world);
  refreshPreviewWaterState(player, world);
  updatePreviewGoalReached(player, world);

  if (player.vx > 8) {
    previewState.facing = 1;
  } else if (player.vx < -8) {
    previewState.facing = -1;
  }
}

function runPreviewFrame(timestamp) {
  if (!previewState.enabled) {
    previewState.rafId = null;
    return;
  }

  if (!previewState.world || !previewState.player) {
    resetPreviewSimulation();
  }
  const world = previewState.world;
  if (!world || !previewState.player) {
    previewState.rafId = window.requestAnimationFrame(runPreviewFrame);
    return;
  }

  const previous = previewState.lastFrameAt || timestamp;
  previewState.lastFrameAt = timestamp;
  const dt = clamp((timestamp - previous) / 1000, 1 / 240, 0.05);

  updatePreviewMovingPlatforms(world, dt);
  updatePreviewPlayer(world, dt);
  renderEditor();
  previewState.rafId = window.requestAnimationFrame(runPreviewFrame);
}

function setPreviewEnabled(nextEnabled) {
  const shouldEnable = Boolean(nextEnabled);
  if (previewState.enabled === shouldEnable) {
    updatePreviewToggleUi();
    return;
  }

  previewState.enabled = shouldEnable;
  if (shouldEnable) {
    isPointerDown = false;
    clearPreviewInputState();
    resetPreviewSimulation();
    renderEditor();
    if (previewState.rafId) {
      window.cancelAnimationFrame(previewState.rafId);
    }
    previewState.rafId = window.requestAnimationFrame(runPreviewFrame);
    setJsonStatus("Preview on: A/D or arrows to move, W/Up/Space to jump, Esc to stop.");
  } else {
    if (previewState.rafId) {
      window.cancelAnimationFrame(previewState.rafId);
    }
    previewState.rafId = null;
    clearPreviewInputState();
    previewState.world = null;
    previewState.player = null;
    previewState.goalReached = false;
    renderEditor();
    setJsonStatus("Preview off. Editing mode restored.");
  }

  updatePreviewToggleUi();
}

function getPreviewWalkFrame(now) {
  return Math.floor(now / PREVIEW_WALK_FRAME_MS) % previewPlayerWalkImages.length;
}

function drawPreviewMovingPlatforms() {
  const world = previewState.world;
  if (!world) {
    return;
  }
  const scale = getEditorScaleFromWorld(world);

  for (const platform of world.movingPlatforms) {
    const drawX = platform.x * scale;
    const drawY = platform.y * scale;
    const drawW = platform.width * scale;
    const drawH = platform.height * scale;
    const image = platform.type === "lift-v" ? liftVImage : liftHImage;
    if (image.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = platform.type === "lift-v" ? "#4f8ee8" : "#3ec28f";
      ctx.fillRect(drawX, drawY, drawW, drawH);
    }
  }
}

function drawPreviewPlayer(now) {
  const world = previewState.world;
  const player = previewState.player;
  if (!world || !player) {
    return;
  }

  const scale = getEditorScaleFromWorld(world);
  const drawX = player.x * scale;
  const drawY = player.y * scale;
  const drawW = player.width * scale;
  const drawH = player.height * scale;
  const inAir = Math.abs(player.vy) > 40;
  const moving = Math.abs(player.vx) > 34;
  const sprite = inAir
    ? previewPlayerJumpImage
    : moving
      ? previewPlayerWalkImages[getPreviewWalkFrame(now)]
      : previewPlayerIdleImage;

  if (sprite.complete && sprite.naturalWidth > 0) {
    ctx.save();
    if (previewState.facing < 0) {
      ctx.translate(drawX + drawW * 0.5, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -drawW * 0.5, drawY, drawW, drawH);
    } else {
      ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
    }
    ctx.restore();
  } else {
    ctx.fillStyle = "#3ddc97";
    ctx.fillRect(drawX, drawY, drawW, drawH);
    ctx.strokeStyle = "#1a7f5a";
    ctx.lineWidth = 2;
    ctx.strokeRect(drawX, drawY, drawW, drawH);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "10px 'Press Start 2P'";
  const name = "Player 1";
  const textX = drawX + drawW * 0.5 - ctx.measureText(name).width * 0.5;
  ctx.fillText(name, textX, drawY - 6);
}

function drawPreviewOverlay() {
  const label = previewState.goalReached
    ? "Preview: Goal reached! (Esc to stop)"
    : "Preview: WASD/Arrows + Space, Esc to stop";
  ctx.font = "10px 'Press Start 2P'";
  const textWidth = Math.ceil(ctx.measureText(label).width);
  const width = Math.min(canvas.width - 14, textWidth + 16);
  ctx.fillStyle = "rgba(8, 18, 30, 0.72)";
  ctx.fillRect(7, 7, width, 20);
  ctx.fillStyle = previewState.goalReached ? "#fff47f" : "#ffffff";
  ctx.fillText(label, 14, 21);
}

function isTextEntryTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function normalizePreviewInputKey(key) {
  if (key === "ArrowLeft" || key === "a" || key === "A") {
    return "left";
  }
  if (key === "ArrowRight" || key === "d" || key === "D") {
    return "right";
  }
  if (key === "ArrowUp" || key === "w" || key === "W" || key === " " || key === "Spacebar") {
    return "jump";
  }
  return null;
}

function handlePreviewKeyDown(event) {
  if (!previewState.enabled) {
    return;
  }
  if (isTextEntryTarget(event.target)) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    setPreviewEnabled(false);
    return;
  }
  const action = normalizePreviewInputKey(event.key);
  if (!action) {
    return;
  }
  previewState.input[action] = true;
  event.preventDefault();
}

function handlePreviewKeyUp(event) {
  if (!previewState.enabled) {
    return;
  }
  const action = normalizePreviewInputKey(event.key);
  if (!action) {
    return;
  }
  previewState.input[action] = false;
  event.preventDefault();
}

function applyTheme(theme) {
  const selectedTheme = theme === DARK_THEME ? DARK_THEME : LIGHT_THEME;
  document.body.dataset.theme = selectedTheme;
  if (themeToggleLabel) {
    themeToggleLabel.textContent = selectedTheme === DARK_THEME ? "Light Mode" : "Dark Mode";
  }
  if (themeToggleIcon) {
    themeToggleIcon.textContent = selectedTheme === DARK_THEME ? "light_mode" : "dark_mode";
  }
  if (themeToggleBtn) {
    themeToggleBtn.setAttribute("aria-pressed", selectedTheme === DARK_THEME ? "true" : "false");
  }
}

function saveTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_error) {
    // Ignore storage failures so editor still works in restricted browser modes.
  }
}

function loadSavedTheme() {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === LIGHT_THEME || savedTheme === DARK_THEME) {
      return savedTheme;
    }
  } catch (_error) {
    // Ignore storage failures.
  }
  return LIGHT_THEME;
}

function setCollabStatus(message, isError = false) {
  if (!collabStatus) {
    return;
  }
  collabStatus.textContent = message;
  collabStatus.classList.toggle("error", Boolean(isError));
}

function setCollabRoomInfo(message) {
  if (!collabRoomInfo) {
    return;
  }
  collabRoomInfo.textContent = message;
}

function isCollabConnected() {
  return Boolean(socket && socket.connected);
}

function updateConnectionBar(connected) {
  if (!collabConnectionBar) {
    return;
  }
  
  if (connected && !collabState.roomCode) {
    collabConnectionBar.style.display = "none";
  } else {
    collabConnectionBar.style.display = "";
  }

  collabConnectionBar.classList.toggle("connected", connected);
  collabConnectionBar.classList.toggle("disconnected", !connected);
  if (collabConnectionLabel) {
    collabConnectionLabel.textContent = connected
      ? `Connected to Room: ${collabState.roomCode}`
      : "Disconnected";
  }
}

function isCurrentUserRoomHost() {
  return collabState.participants.some(
    (participant) => participant.id === collabState.selfId && participant.isHost
  );
}

function updateCreateRoomHelp(connected, hasRoom) {
  if (!collabCreateHelp) {
    return;
  }

  if (!connected) {
    collabCreateHelp.textContent = "Connect to the collaboration server to create a room.";
    return;
  }

  if (hasRoom) {
    const roomCode = collabState.roomCode || "-----";
    collabCreateHelp.textContent = isCurrentUserRoomHost()
      ? `You are hosting room ${roomCode}. Leave Room before creating another room.`
      : `You are in room ${roomCode}. Leave Room before creating a room.`;
    return;
  }

  collabCreateHelp.textContent = "Create a new room, then share its code.";
}

function enterRoomUi(roomCode) {
  if (collabPanel) collabPanel.classList.add("in-room");
  if (collabRoomCodeValue) collabRoomCodeValue.textContent = roomCode || "—";
  // Update toolbar badge
  if (toolbarRoomBadge) {
    toolbarRoomBadge.classList.remove("hidden");
    toolbarRoomBadge.title = roomCode ? `Copy room code ${roomCode}` : "Copy room code";
  }
  if (toolbarRoomCode) {
    toolbarRoomCode.textContent = roomCode || "—";
  }
  if (collabBtnLabel) {
    collabBtnLabel.textContent = "In Room";
  }
  if (collabBtn) {
    collabBtn.classList.add("in-room-active");
  }
  // Auto-open the collab panel so user can see the room code
  showCollabPanel();
}

function exitRoomUi() {
  if (collabPanel) collabPanel.classList.remove("in-room");
  if (collabRoomCodeValue) collabRoomCodeValue.textContent = "—";
  // Update toolbar badge
  if (toolbarRoomBadge) {
    toolbarRoomBadge.classList.add("hidden");
    toolbarRoomBadge.title = "Copy room code";
  }
  if (toolbarRoomCode) {
    toolbarRoomCode.textContent = "—";
  }
  if (collabBtnLabel) {
    collabBtnLabel.textContent = "Collab";
  }
  if (collabBtn) {
    collabBtn.classList.remove("in-room-active");
  }
}

function showCollabPanel() {
  if (!collabPanel) return;
  for (const candidate of managedPanels) {
    if (candidate !== collabPanel) {
      candidate.classList.add("hidden");
    }
  }
  collabPanel.classList.remove("hidden");
}

function refreshCollabControls() {
  const connected = isCollabConnected();
  const hasRoom = Boolean(collabState.roomCode);
  const isPending = Boolean(collabState.pendingAction);

  updateConnectionBar(connected);
  updateCreateRoomHelp(connected, hasRoom);

  if (collabCreateBtn) {
    collabCreateBtn.disabled = !connected || isPending || hasRoom;
    collabCreateBtn.title = hasRoom
      ? "Leave your current room before creating another room."
      : "Create a collaboration room";
  }
  if (collabJoinBtn) {
    collabJoinBtn.disabled = !connected || isPending;
  }
  if (collabLeaveBtn) {
    collabLeaveBtn.disabled = !connected || isPending || !hasRoom;
  }
  if (collabCopyCodeBtn) {
    collabCopyCodeBtn.disabled = isPending || !hasRoom;
  }
  if (collabCodeInput) {
    collabCodeInput.disabled = isPending;
  }
  if (collabNameInput) {
    collabNameInput.disabled = isPending;
  }
}

function resetPendingCollabAction() {
  if (collabState.pendingTimer) {
    window.clearTimeout(collabState.pendingTimer);
  }
  collabState.pendingAction = null;
  collabState.pendingRequestId = null;
  collabState.pendingTimer = null;
  refreshCollabControls();
}

function beginPendingCollabAction(actionKey, startMessage, timeoutMessage) {
  if (!socket) {
    setCollabStatus("Collaboration is unavailable on this page.", true);
    return null;
  }
  if (!socket.connected) {
    setCollabStatus("Not connected to collaboration server. Wait a moment and try again.", true);
    refreshCollabControls();
    return null;
  }
  if (collabState.pendingAction) {
    setCollabStatus("A collaboration action is already in progress.");
    return null;
  }

  const requestId = ++collabState.requestCounter;
  collabState.pendingAction = actionKey;
  collabState.pendingRequestId = requestId;
  collabState.pendingTimer = window.setTimeout(() => {
    if (collabState.pendingRequestId !== requestId) {
      return;
    }
    resetPendingCollabAction();
    setCollabStatus(timeoutMessage || "Collaboration request timed out. Try again.", true);
  }, COLLAB_ACTION_TIMEOUT_MS);

  if (startMessage) {
    setCollabStatus(startMessage);
  }
  refreshCollabControls();
  return requestId;
}

function completePendingCollabAction(requestId) {
  if (collabState.pendingRequestId !== requestId) {
    return false;
  }
  resetPendingCollabAction();
  return true;
}

function persistPreferredName() {
  if (!collabNameInput) {
    return;
  }
  const sanitized = trimToCodePoints(collabNameInput.value, MAX_NAME_LENGTH);
  if (collabNameInput.value !== sanitized) {
    collabNameInput.value = sanitized;
  }
  try {
    window.localStorage.setItem("customPlayerName", sanitizeName(sanitized));
  } catch (_error) {
    // Ignore storage failures.
  }
}

function getCollabDisplayName() {
  if (!collabNameInput) {
    return getStoredEditorName();
  }
  const typed = sanitizeName(collabNameInput.value);
  return typed || getStoredEditorName();
}

function updateParticipantsUi(participants) {
  const nextParticipants = Array.isArray(participants) ? participants : [];
  collabState.participants = nextParticipants;

  if (participantsCountLabel) {
    participantsCountLabel.textContent = `People: ${nextParticipants.length || 1}`;
  }

  if (!participantsList) {
    return;
  }

  participantsList.innerHTML = "";
  if (nextParticipants.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "participants-empty";
    emptyItem.textContent = "No participants yet";
    participantsList.appendChild(emptyItem);
    return;
  }

  for (const participant of nextParticipants) {
    const item = document.createElement("li");
    const nameEl = document.createElement("span");
    nameEl.textContent = participant.name || "Player";
    const tagEl = document.createElement("span");
    tagEl.className = "participant-tag";
    tagEl.textContent = participant.id === collabState.selfId ? "You" : participant.isHost ? "Host" : "Guest";
    item.append(nameEl, tagEl);
    participantsList.appendChild(item);
  }
}

function clearRemoteCursors() {
  for (const element of remoteCursorElements.values()) {
    element.remove();
  }
  remoteCursorElements.clear();
}

function getCursorColorForId(socketId) {
  let hash = 0;
  for (const char of String(socketId || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return REMOTE_CURSOR_COLORS[hash % REMOTE_CURSOR_COLORS.length];
}

function ensureRemoteCursorElement(socketId, displayName) {
  if (!cursorLayer || !socketId) {
    return null;
  }

  if (!remoteCursorElements.has(socketId)) {
    const wrapper = document.createElement("div");
    wrapper.className = "remote-cursor";
    wrapper.dataset.socketId = socketId;

    const dot = document.createElement("span");
    dot.className = "remote-cursor-dot";
    dot.style.backgroundColor = getCursorColorForId(socketId);

    const label = document.createElement("span");
    label.className = "remote-cursor-label";
    label.textContent = displayName || "Player";

    wrapper.append(dot, label);
    cursorLayer.appendChild(wrapper);
    remoteCursorElements.set(socketId, wrapper);
  }

  const existing = remoteCursorElements.get(socketId);
  if (!existing) {
    return null;
  }
  const label = existing.querySelector(".remote-cursor-label");
  if (label && displayName) {
    label.textContent = displayName;
  }
  return existing;
}

function removeRemoteCursor(socketId) {
  const cursorEl = remoteCursorElements.get(socketId);
  if (!cursorEl) {
    return;
  }
  cursorEl.remove();
  remoteCursorElements.delete(socketId);
}

function applyRemoteCursorUpdate(payload) {
  if (!payload || !payload.id || payload.id === collabState.selfId) {
    return;
  }
  if (!collabState.roomCode) {
    removeRemoteCursor(payload.id);
    return;
  }

  if (!payload.visible) {
    removeRemoteCursor(payload.id);
    return;
  }

  const x = Number(payload.x);
  const y = Number(payload.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  const cursorEl = ensureRemoteCursorElement(payload.id, payload.name);
  if (!cursorEl) {
    return;
  }
  const displayPoint = logicalToDisplayPoint(x, y);
  cursorEl.style.left = `${displayPoint.x}px`;
  cursorEl.style.top = `${displayPoint.y}px`;
}

function buildCollabRoomSummary(roomCode, participants) {
  const currentCode = roomCode ? normalizeRoomCode(roomCode) : "";
  if (!currentCode) {
    return "Not in a collaboration room yet.";
  }
  return `Room ${currentCode} live. People: ${participants.length}.`;
}

function applyRoomState(payload) {
  if (!payload) {
    return;
  }
  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  collabState.roomCode = normalizeRoomCode(payload.roomCode);
  if (collabCodeInput && collabState.roomCode) {
    collabCodeInput.value = collabState.roomCode;
  }
  updateParticipantsUi(participants);
  setCollabRoomInfo(buildCollabRoomSummary(collabState.roomCode, participants));

  const allowedIds = new Set(participants.map((participant) => participant.id));
  for (const [cursorId] of remoteCursorElements) {
    if (!allowedIds.has(cursorId)) {
      removeRemoteCursor(cursorId);
    }
  }
  refreshCollabControls();
}

function leaveCollabLocally() {
  resetPendingCollabAction();
  collabState.roomCode = null;
  updateParticipantsUi([]);
  clearRemoteCursors();
  exitRoomUi();
  setCollabRoomInfo("Not in a collaboration room yet.");
  refreshCollabControls();
}

function syncLevelToCollabRoom(force = false) {
  if (!socket || !collabState.roomCode) {
    return;
  }

  if (queuedLevelSyncTimer && !force) {
    return;
  }

  const emitLevel = () => {
    queuedLevelSyncTimer = null;
    socket.emit("editor-level-update", { level });
  };

  if (force) {
    emitLevel();
    return;
  }

  queuedLevelSyncTimer = window.setTimeout(emitLevel, COLLAB_SYNC_DEBOUNCE_MS);
}

function withRemoteLevelApply(nextLevel) {
  suppressCollabBroadcast = true;
  level = normalizeLevel(nextLevel);
  if (previewState.enabled) {
    resetPreviewSimulation();
  }
  renderEditor();
  jsonOutput.value = toExportJson();
  suppressCollabBroadcast = false;
}

function handleLocalLevelMutation(markUnsaved = true) {
  if (markUnsaved) {
    hasUnsavedChanges = true;
  }
  if (previewState.enabled) {
    resetPreviewSimulation();
  }
  renderEditor();
  if (!suppressCollabBroadcast) {
    syncLevelToCollabRoom();
  }
}

function getCanvasLogicalPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { x: 0, y: 0 };
  }
  const logicalX = ((event.clientX - rect.left) * canvas.width) / rect.width;
  const logicalY = ((event.clientY - rect.top) * canvas.height) / rect.height;
  return {
    x: clamp(logicalX, 0, canvas.width),
    y: clamp(logicalY, 0, canvas.height),
  };
}

function logicalToDisplayPoint(logicalX, logicalY) {
  const logicalWidth = Math.max(canvas.width, 1);
  const logicalHeight = Math.max(canvas.height, 1);
  const displayWidth = canvasViewport ? canvasViewport.clientWidth : logicalWidth;
  const displayHeight = canvasViewport ? canvasViewport.clientHeight : logicalHeight;
  return {
    x: clamp((logicalX / logicalWidth) * displayWidth, 0, displayWidth),
    y: clamp((logicalY / logicalHeight) * displayHeight, 0, displayHeight),
  };
}

function getCanvasDisplayScale(logicalWidth, logicalHeight) {
  if (!canvasWrap || logicalWidth <= 0 || logicalHeight <= 0) {
    return 1;
  }

  const wrapRect = canvasWrap.getBoundingClientRect();
  const availableWidth = Math.max(wrapRect.width - 38, 1);
  const availableHeight = Math.max(wrapRect.height - 38, 1);
  const fitScale = Math.min(availableWidth / logicalWidth, availableHeight / logicalHeight);
  return clamp(fitScale, 1, MAX_EDITOR_DISPLAY_SCALE);
}

function sendCursorUpdateFromEvent(event, visible) {
  if (previewState.enabled || !socket || !collabState.roomCode) {
    return;
  }
  const now = Date.now();
  if (visible && now - lastCursorSentAt < CURSOR_SEND_INTERVAL_MS) {
    return;
  }

  const { x, y } = getCanvasLogicalPointFromEvent(event);
  lastCursorSentAt = now;

  socket.emit("editor-cursor-update", {
    x: Number(x.toFixed(1)),
    y: Number(y.toFixed(1)),
    visible: Boolean(visible),
  });
}

function setJsonStatus(message, isError = false) {
  if (!jsonActionStatus) {
    return;
  }
  jsonActionStatus.textContent = message;
  jsonActionStatus.classList.toggle("error", Boolean(isError));
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) {
    return false;
  }

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_error) {
      // Try legacy fallback below.
    }
  }

  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.left = "-9999px";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  helper.setSelectionRange(0, helper.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (_error) {
    copied = false;
  }
  helper.remove();
  return copied;
}

function syncLevelNameFromInput() {
  if (!levelNameInput) {
    return;
  }
  const nextName = levelNameInput.value.trim();
  level.name = nextName || DEFAULT_LEVEL_NAME;
}

function getDownloadFileName() {
  const rawName = (level.name || DEFAULT_LEVEL_NAME).trim().toLowerCase();
  const safeName = rawName.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safeName || "level"}.json`;
}

function applyImportedJson(rawJson, sourceDescription) {
  const parsed = JSON.parse(rawJson);
  level = normalizeLevel(parsed);
  handleLocalLevelMutation(false);
  hasUnsavedChanges = false;
  jsonOutput.value = toExportJson();
  setJsonStatus(`Loaded JSON from ${sourceDescription}.`);
}

function openJsonFilePicker() {
  if (!jsonFileInput) {
    setJsonStatus("File picker is unavailable in this browser.", true);
    return;
  }
  jsonFileInput.value = "";
  jsonFileInput.click();
}

function setTool(nextTool) {
  tool = nextTool;
  for (const button of toolButtons) {
    button.classList.toggle("active", button.dataset.tool === nextTool);
  }
}

function setRowChar(row, x, char) {
  return `${row.slice(0, x)}${char}${row.slice(x + 1)}`;
}

function applyToolToTile(tileX, tileY) {
  if (previewState.enabled) {
    return;
  }
  if (tileX < 0 || tileY < 0 || tileY >= level.tiles.length || tileX >= level.tiles[0].length) {
    return;
  }

  if (tool === "block") {
    level.tiles[tileY] = setRowChar(level.tiles[tileY], tileX, "#");
    level.decor[tileY] = setRowChar(level.decor[tileY], tileX, ".");
  } else if (tool === "block2") {
    level.tiles[tileY] = setRowChar(level.tiles[tileY], tileX, "b");
    level.decor[tileY] = setRowChar(level.decor[tileY], tileX, ".");
  } else if (tool === "lift-h") {
    level.tiles[tileY] = setRowChar(level.tiles[tileY], tileX, "h");
    level.decor[tileY] = setRowChar(level.decor[tileY], tileX, ".");
  } else if (tool === "lift-v") {
    level.tiles[tileY] = setRowChar(level.tiles[tileY], tileX, "v");
    level.decor[tileY] = setRowChar(level.decor[tileY], tileX, ".");
  } else if (tool === "water-shallow") {
    level.tiles[tileY] = setRowChar(level.tiles[tileY], tileX, "s");
    level.decor[tileY] = setRowChar(level.decor[tileY], tileX, ".");
  } else if (tool === "water-body") {
    level.tiles[tileY] = setRowChar(level.tiles[tileY], tileX, "w");
    level.decor[tileY] = setRowChar(level.decor[tileY], tileX, ".");
  } else if (tool === "erase") {
    level.tiles[tileY] = setRowChar(level.tiles[tileY], tileX, ".");
    level.decor[tileY] = setRowChar(level.decor[tileY], tileX, ".");
  } else if (/^decor[1-6]$/.test(tool)) {
    const decorSymbol = tool.slice(-1);
    level.tiles[tileY] = setRowChar(level.tiles[tileY], tileX, ".");
    level.decor[tileY] = setRowChar(level.decor[tileY], tileX, decorSymbol);
  } else if (tool === "spawn1") {
    level.spawnTiles[0] = { x: tileX, y: tileY };
  } else if (tool === "spawn2") {
    level.spawnTiles[1] = { x: tileX, y: tileY };
  } else if (tool === "goal") {
    level.goalTile.x = tileX;
    level.goalTile.y = tileY;
    level.goalTile.width = clamp(
      level.goalTile.width,
      1,
      level.tiles[0].length - level.goalTile.x
    );
    level.goalTile.height = clamp(
      level.goalTile.height,
      1,
      level.tiles.length - level.goalTile.y
    );
  }

  handleLocalLevelMutation();
}

function getTileAtPointer(event) {
  const { x, y } = getCanvasLogicalPointFromEvent(event);
  const tileX = Math.floor(x / PREVIEW_TILE);
  const tileY = Math.floor(y / PREVIEW_TILE);
  return { tileX, tileY };
}

function drawTiles() {
  const rows = level.tiles.length;
  const columns = level.tiles[0].length;

  for (let y = 0; y < rows; y += 1) {
    const row = level.tiles[y];
    for (let x = 0; x < columns; x += 1) {
      const px = x * PREVIEW_TILE;
      const py = y * PREVIEW_TILE;
      const tileSymbol = row[x];
      if (tileSymbol === "#") {
        if (blockImage.complete && blockImage.naturalWidth > 0) {
          ctx.drawImage(blockImage, px, py, PREVIEW_TILE, PREVIEW_TILE);
        } else {
          ctx.fillStyle = "#6e4a35";
          ctx.fillRect(px, py, PREVIEW_TILE, PREVIEW_TILE);
        }
      } else if (tileSymbol === "b") {
        if (block2Image.complete && block2Image.naturalWidth > 0) {
          ctx.drawImage(block2Image, px, py, PREVIEW_TILE, PREVIEW_TILE);
        } else {
          ctx.fillStyle = "#4d6b52";
          ctx.fillRect(px, py, PREVIEW_TILE, PREVIEW_TILE);
        }
      } else if (tileSymbol === "h") {
        if (previewState.enabled) {
          ctx.fillStyle = "#96d5b8";
          ctx.fillRect(px, py, PREVIEW_TILE, PREVIEW_TILE);
        } else if (liftHImage.complete && liftHImage.naturalWidth > 0) {
          ctx.drawImage(liftHImage, px, py, PREVIEW_TILE, PREVIEW_TILE);
        } else {
          ctx.fillStyle = "#3ec28f";
          ctx.fillRect(px, py, PREVIEW_TILE, PREVIEW_TILE);
        }
      } else if (tileSymbol === "v") {
        if (previewState.enabled) {
          ctx.fillStyle = "#96d5b8";
          ctx.fillRect(px, py, PREVIEW_TILE, PREVIEW_TILE);
        } else if (liftVImage.complete && liftVImage.naturalWidth > 0) {
          ctx.drawImage(liftVImage, px, py, PREVIEW_TILE, PREVIEW_TILE);
        } else {
          ctx.fillStyle = "#4f8ee8";
          ctx.fillRect(px, py, PREVIEW_TILE, PREVIEW_TILE);
        }
      } else if (tileSymbol === "s") {
        if (previewState.enabled) {
          continue;
        }
        ctx.save();
        ctx.globalAlpha = WATER_TILE_ALPHA;
        if (waterShallowImage.complete && waterShallowImage.naturalWidth > 0) {
          ctx.drawImage(waterShallowImage, px, py, PREVIEW_TILE, PREVIEW_TILE);
        } else {
          ctx.fillStyle = "#75c9ff";
          ctx.fillRect(px, py, PREVIEW_TILE, PREVIEW_TILE);
        }
        ctx.restore();
      } else if (tileSymbol === "w") {
        if (previewState.enabled) {
          continue;
        }
        ctx.save();
        ctx.globalAlpha = WATER_TILE_ALPHA;
        if (waterBodyImage.complete && waterBodyImage.naturalWidth > 0) {
          ctx.drawImage(waterBodyImage, px, py, PREVIEW_TILE, PREVIEW_TILE);
        } else {
          ctx.fillStyle = "#2a83da";
          ctx.fillRect(px, py, PREVIEW_TILE, PREVIEW_TILE);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = "#96d5b8";
        ctx.fillRect(px, py, PREVIEW_TILE, PREVIEW_TILE);
      }
    }
  }
}

function drawWaterOverlayTiles() {
  const rows = level.tiles.length;
  const columns = level.tiles[0].length;

  for (let y = 0; y < rows; y += 1) {
    const row = level.tiles[y] || "";
    for (let x = 0; x < columns; x += 1) {
      const symbol = row[x];
      if (symbol !== "s" && symbol !== "w") {
        continue;
      }

      const px = x * PREVIEW_TILE;
      const py = y * PREVIEW_TILE;
      const image = symbol === "w" ? waterBodyImage : waterShallowImage;

      ctx.save();
      ctx.globalAlpha = WATER_TILE_ALPHA;
      if (image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, px, py, PREVIEW_TILE, PREVIEW_TILE);
      } else {
        ctx.fillStyle = symbol === "w" ? "#2a83da" : "#75c9ff";
        ctx.fillRect(px, py, PREVIEW_TILE, PREVIEW_TILE);
      }
      ctx.restore();
    }
  }
}

function drawDecorLayer() {
  const rows = level.decor.length;
  const columns = rows > 0 ? level.decor[0].length : 0;

  for (let y = 0; y < rows; y += 1) {
    const row = level.decor[y] || "";
    for (let x = 0; x < columns; x += 1) {
      const symbol = row[x];
      const index = Number(symbol) - 1;
      if (!Number.isInteger(index) || index < 0 || index > 5) {
        continue;
      }
      const image = decorImages[index];
      if (!image || !image.complete || image.naturalWidth <= 0) {
        continue;
      }
      const px = x * PREVIEW_TILE;
      const py = y * PREVIEW_TILE;
      ctx.drawImage(image, px, py, PREVIEW_TILE, PREVIEW_TILE);
    }
  }
}

function drawGoalAndSpawns() {
  const goal = level.goalTile;
  const goalX = goal.x * PREVIEW_TILE;
  const goalY = goal.y * PREVIEW_TILE;
  const goalWidthPx = goal.width * PREVIEW_TILE;
  const goalHeightPx = goal.height * PREVIEW_TILE;

  if (goalImage.complete && goalImage.naturalWidth > 0) {
    for (let y = 0; y < goal.height; y += 1) {
      for (let x = 0; x < goal.width; x += 1) {
        ctx.drawImage(
          goalImage,
          goalX + x * PREVIEW_TILE,
          goalY + y * PREVIEW_TILE,
          PREVIEW_TILE,
          PREVIEW_TILE
        );
      }
    }
  } else {
    ctx.fillStyle = "rgba(255, 245, 120, 0.42)";
    ctx.fillRect(goalX, goalY, goalWidthPx, goalHeightPx);
  }

  // Keep an outline so the selected goal area remains obvious.
  ctx.strokeStyle = "#fff47f";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    goalX + 1,
    goalY + 1,
    goalWidthPx - 2,
    goalHeightPx - 2
  );

  const spawns = level.spawnTiles;
  if (spawns[0]) {
    const s = spawns[0];
    ctx.fillStyle = "#2f89ff";
    ctx.fillRect(s.x * PREVIEW_TILE + 6, s.y * PREVIEW_TILE + 6, PREVIEW_TILE - 12, PREVIEW_TILE - 12);
    ctx.fillStyle = "#ffffff";
    ctx.font = "10px 'Press Start 2P'";
    ctx.fillText("1", s.x * PREVIEW_TILE + PREVIEW_TILE * 0.45, s.y * PREVIEW_TILE + PREVIEW_TILE * 0.67);
  }
  if (spawns[1]) {
    const s = spawns[1];
    ctx.fillStyle = "#f15c5c";
    ctx.fillRect(s.x * PREVIEW_TILE + 6, s.y * PREVIEW_TILE + 6, PREVIEW_TILE - 12, PREVIEW_TILE - 12);
    ctx.fillStyle = "#ffffff";
    ctx.font = "10px 'Press Start 2P'";
    ctx.fillText("2", s.x * PREVIEW_TILE + PREVIEW_TILE * 0.45, s.y * PREVIEW_TILE + PREVIEW_TILE * 0.67);
  }
}

function drawGridLines() {
  const rows = level.tiles.length;
  const columns = level.tiles[0].length;

  ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= columns; x += 1) {
    const px = x * PREVIEW_TILE + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, rows * PREVIEW_TILE);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y += 1) {
    const py = y * PREVIEW_TILE + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(columns * PREVIEW_TILE, py);
    ctx.stroke();
  }
}

function toExportJson() {
  level.decor = reconcileTileAndDecor(level.tiles, level.decor);
  return JSON.stringify(
    {
      name: level.name,
      tileSize: level.tileSize,
      legend: {
        "#": "solid block 1",
        "b": "solid block 2",
        "h": "lift-h (moves left/right 3 tiles)",
        "v": "lift-v (moves up/down 3 tiles)",
        "s": "water-shallow (water tiles)",
        "w": "water-body (water tiles)",
        ".": "empty",
        "1": "grass tuft decor (no collision)",
        "2": "mushroom decor (no collision)",
        "3": "small tree decor (no collision)",
        "4": "shrubs decor (no collision)",
        "5": "flowers decor (no collision)",
        "6": "rock decor (no collision)"
      },
      spawnTiles: level.spawnTiles,
      goalTile: level.goalTile,
      tiles: level.tiles,
      decor: level.decor,
    },
    null,
    2
  );
}

function renderEditor() {
  const rows = level.tiles.length;
  const columns = level.tiles[0].length;
  const logicalWidth = columns * PREVIEW_TILE;
  const logicalHeight = rows * PREVIEW_TILE;
  const displayScale = getCanvasDisplayScale(logicalWidth, logicalHeight);
  const displayWidth = Math.max(1, Math.round(logicalWidth * displayScale));
  const displayHeight = Math.max(1, Math.round(logicalHeight * displayScale));

  canvas.width = logicalWidth;
  canvas.height = logicalHeight;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  if (canvasStage) {
    canvasStage.style.setProperty("--canvas-pixel-width", `${displayWidth}px`);
    canvasStage.style.setProperty("--canvas-pixel-height", `${displayHeight}px`);
  }
  if (canvasViewport) {
    canvasViewport.style.width = `${displayWidth}px`;
    canvasViewport.style.height = `${displayHeight}px`;
  }

  drawTiles();
  drawDecorLayer();
  drawGoalAndSpawns();
  if (previewState.enabled) {
    drawPreviewMovingPlatforms();
    drawPreviewPlayer(Date.now());
    drawWaterOverlayTiles();
    drawPreviewOverlay();
  }
  drawGridLines();

  if (levelNameInput && levelNameInput.value !== level.name) {
    levelNameInput.value = level.name;
  }
  colsInput.value = String(columns);
  rowsInput.value = String(rows);
  goalWidthInput.value = String(level.goalTile.width);
  goalHeightInput.value = String(level.goalTile.height);
}

function updateGoalSizeFromInputs() {
  level.goalTile.width = 1;
  level.goalTile.height = 1;
  handleLocalLevelMutation();
}

newGridBtn.addEventListener("click", () => {
  const tileSize = Math.max(16, Math.round(Number(level.tileSize) || 64));
  const columns = Math.max(8, Math.round(Number(colsInput.value) || 36));
  const rows = Math.max(8, Math.round(Number(rowsInput.value) || 16));
  const horizontalDirection = normalizeResizeDirection(
    resizeHorizontalSelect ? resizeHorizontalSelect.value : "right",
    "horizontal"
  );
  const verticalDirection = normalizeResizeDirection(
    resizeVerticalSelect ? resizeVerticalSelect.value : "down",
    "vertical"
  );
  level = resizeLevelPreservingContent(
    level,
    tileSize,
    columns,
    rows,
    horizontalDirection,
    verticalDirection
  );
  setJsonStatus(
    `Grid resized (${horizontalDirection}/${verticalDirection}).`
  );
  handleLocalLevelMutation();
});

if (floorBtn) {
  floorBtn.addEventListener("click", () => {
    const rows = level.tiles.length;
    const columns = level.tiles[0].length;
    const floorRows = Math.min(4, rows);
    for (let y = rows - floorRows; y < rows; y += 1) {
      level.tiles[y] = "#".repeat(columns);
      level.decor[y] = ".".repeat(columns);
    }
    handleLocalLevelMutation();
  });
}

clearBtn.addEventListener("click", () => {
  const rows = level.tiles.length;
  const columns = level.tiles[0].length;
  level.tiles = createEmptyTiles(rows, columns);
  level.decor = createEmptyDecor(rows, columns);
  handleLocalLevelMutation();
});

exportBtn.addEventListener("click", () => {
  syncLevelNameFromInput();
  const exportedJson = toExportJson();
  jsonOutput.value = exportedJson;

  const fileName = getDownloadFileName();
  const jsonBlob = new Blob([exportedJson], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(jsonBlob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
  hasUnsavedChanges = false;
  setJsonStatus(`Exported ${fileName}`);
});

importBtn.addEventListener("click", () => {
  openJsonFilePicker();
});

if (loadTextBtn) {
  loadTextBtn.addEventListener("click", () => {
    const rawJson = jsonOutput.value.trim();
    if (!rawJson) {
      setJsonStatus("Paste JSON first, or use Load JSON to choose a file.", true);
      return;
    }
    try {
      applyImportedJson(rawJson, "pasted text");
    } catch (error) {
      setJsonStatus(`Load failed: ${error.message}`, true);
      window.alert(`Invalid JSON: ${error.message}`);
    }
  });
}

if (jsonFileInput) {
  jsonFileInput.addEventListener("change", async () => {
    const [file] = jsonFileInput.files || [];
    if (!file) {
      setJsonStatus("No JSON file selected.", true);
      return;
    }
    try {
      const rawJson = await file.text();
      jsonOutput.value = rawJson;
      applyImportedJson(rawJson, `file ${file.name}`);
    } catch (error) {
      setJsonStatus(`Load failed: ${error.message}`, true);
      window.alert(`Invalid JSON file: ${error.message}`);
    }
  });
}

if (levelNameInput) {
  levelNameInput.addEventListener("change", () => {
    const previousName = level.name;
    syncLevelNameFromInput();
    if (level.name !== previousName) {
      hasUnsavedChanges = true;
    }
    syncLevelToCollabRoom();
    setJsonStatus(`Level name set to "${level.name}".`);
  });
}

const managedPanels = [settingsPanel, collabPanel, participantsPanel].filter(Boolean);

function togglePanel(panel) {
  if (!panel) {
    return;
  }
  const shouldShow = panel.classList.contains("hidden");
  if (shouldShow) {
    for (const candidate of managedPanels) {
      if (candidate !== panel) {
        candidate.classList.add("hidden");
      }
    }
    panel.classList.remove("hidden");
    return;
  }
  panel.classList.add("hidden");
}

if (settingsBtn) {
  settingsBtn.addEventListener("click", () => {
    togglePanel(settingsPanel);
  });
}

if (backHomeBtn) {
  backHomeBtn.addEventListener("click", () => {
    if (hasUnsavedChanges) {
      const shouldLeave = window.confirm("You have unsaved changes. Are you sure you want to go back to home?");
      if (!shouldLeave) {
        return;
      }
    }
    window.location.href = "index.html";
  });
}

if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener("click", () => {
    settingsPanel.classList.add("hidden");
  });
}

if (collabBtn) {
  collabBtn.addEventListener("click", () => {
    togglePanel(collabPanel);
  });
}

if (toolbarRoomBadge) {
  toolbarRoomBadge.addEventListener("click", async () => {
    if (!collabState.roomCode) {
      setCollabStatus("Create or join a room first.", true);
      return;
    }
    const copied = await copyTextToClipboard(collabState.roomCode);
    if (copied) {
      setCollabStatus(`Copied room code ${collabState.roomCode}.`);
      return;
    }
    setCollabStatus("Failed to copy room code.", true);
  });
}

if (closeCollabBtn) {
  closeCollabBtn.addEventListener("click", () => {
    collabPanel.classList.add("hidden");
  });
}

if (participantsBtn) {
  participantsBtn.addEventListener("click", () => {
    togglePanel(participantsPanel);
  });
}

if (closeParticipantsBtn) {
  closeParticipantsBtn.addEventListener("click", () => {
    participantsPanel.classList.add("hidden");
  });
}

if (collabCodeInput) {
  collabCodeInput.addEventListener("input", () => {
    collabCodeInput.value = normalizeRoomCode(collabCodeInput.value);
  });
  collabCodeInput.addEventListener("blur", () => {
    collabCodeInput.value = normalizeRoomCode(collabCodeInput.value);
  });
}

if (collabNameInput) {
  collabNameInput.addEventListener("input", () => {
    const trimmed = trimToCodePoints(collabNameInput.value, MAX_NAME_LENGTH);
    if (trimmed !== collabNameInput.value) {
      collabNameInput.value = trimmed;
    }
  });
  collabNameInput.addEventListener("change", persistPreferredName);
}

if (socket) {
  socket.on("connect", () => {
    resetPendingCollabAction();
    collabState.selfId = socket.id;
    setCollabStatus("");
    refreshCollabControls();
  });

  socket.on("disconnect", () => {
    leaveCollabLocally();
    setCollabStatus("Connection lost. Reconnect to continue collaborating.", true);
  });

  socket.on("editor-room-state", (payload = {}) => {
    applyRoomState(payload);
  });

  socket.on("editor-level-update", (payload = {}) => {
    if (!payload.level) {
      return;
    }
    withRemoteLevelApply(payload.level);
    setCollabStatus("Received level update from collaborator.");
  });

  socket.on("editor-cursor-update", (payload = {}) => {
    applyRemoteCursorUpdate(payload);
  });

  socket.on("editor-cursor-remove", (payload = {}) => {
    if (payload && payload.id) {
      removeRemoteCursor(payload.id);
    }
  });

  if (collabCreateForm) {
    collabCreateForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (collabState.roomCode) {
        const roomCode = collabState.roomCode;
        const warning = isCurrentUserRoomHost()
          ? `You are already hosting room ${roomCode}. Leave Room before creating a new one.`
          : `You are already in room ${roomCode}. Leave Room before creating a new one.`;
        setCollabStatus(warning, true);
        refreshCollabControls();
        return;
      }
      syncLevelNameFromInput();
      const requestedName = getCollabDisplayName();
      if (collabNameInput) {
        collabNameInput.value = requestedName;
      }
      persistPreferredName();

      const requestId = beginPendingCollabAction(
        "create-room",
        "Creating room...",
        "Create room request timed out. Try again."
      );
      if (!requestId) {
        return;
      }

      socket.emit("editor-create-room", { name: requestedName, level }, (response = {}) => {
        if (!completePendingCollabAction(requestId)) {
          return;
        }
        if (!response.ok) {
          setCollabStatus(response.error || "Could not create collaboration room.", true);
          return;
        }
        collabState.roomCode = response.roomCode || null;
        collabState.selfName = response.selfName || requestedName;
        if (collabCodeInput) {
          collabCodeInput.value = collabState.roomCode || "";
        }
        if (response.level) {
          withRemoteLevelApply(response.level);
        }
        applyRoomState({
          roomCode: response.roomCode,
          participants: Array.isArray(response.participants) ? response.participants : [],
        });
        enterRoomUi(response.roomCode);
        setCollabStatus(`Room ${response.roomCode} created. Share this code.`);
      });
    });
  }

  if (collabJoinForm) {
    collabJoinForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const roomCode = normalizeRoomCode(collabCodeInput ? collabCodeInput.value : "");
      if (!roomCode) {
        setCollabStatus("Enter a valid room code first.", true);
        return;
      }

      const requestedName = getCollabDisplayName();
      if (collabNameInput) {
        collabNameInput.value = requestedName;
      }
      if (collabCodeInput) {
        collabCodeInput.value = roomCode;
      }
      persistPreferredName();

      const requestId = beginPendingCollabAction(
        "join-room",
        `Joining room ${roomCode}...`,
        "Join room request timed out. Try again."
      );
      if (!requestId) {
        return;
      }

      socket.emit("editor-join-room", { code: roomCode, name: requestedName }, (response = {}) => {
        if (!completePendingCollabAction(requestId)) {
          return;
        }
        if (!response.ok) {
          setCollabStatus(response.error || "Could not join room.", true);
          return;
        }
        collabState.roomCode = response.roomCode || roomCode;
        collabState.selfName = response.selfName || requestedName;
        if (collabCodeInput) {
          collabCodeInput.value = collabState.roomCode || roomCode;
        }
        if (response.level) {
          withRemoteLevelApply(response.level);
        }
        applyRoomState({
          roomCode: response.roomCode,
          participants: Array.isArray(response.participants) ? response.participants : [],
        });
        enterRoomUi(response.roomCode);
        setCollabStatus(`Joined room ${response.roomCode}.`);
      });
    });
  }

  if (collabLeaveBtn) {
    collabLeaveBtn.addEventListener("click", () => {
      if (!collabState.roomCode) {
        setCollabStatus("You are not currently in a collaboration room.");
        return;
      }
      if (!socket.connected) {
        leaveCollabLocally();
        setCollabStatus("Connection lost. Cleared local collaboration state.", true);
        return;
      }
      socket.emit("editor-leave-room");
      leaveCollabLocally();
      setCollabStatus("Left collaboration room.");
    });
  }

  if (collabCopyCodeBtn) {
    collabCopyCodeBtn.addEventListener("click", async () => {
      if (!collabState.roomCode) {
        setCollabStatus("Create or join a room first.", true);
        return;
      }
      const copied = await copyTextToClipboard(collabState.roomCode);
      if (copied) {
        setCollabStatus(`Copied room code ${collabState.roomCode}.`);
        return;
      }
      setCollabStatus("Failed to copy room code.", true);
    });
  }
} else {
  setCollabStatus("Collaboration unavailable: Socket.IO client not loaded.", true);
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const currentTheme = document.body.dataset.theme === DARK_THEME ? DARK_THEME : LIGHT_THEME;
    const nextTheme = currentTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
    applyTheme(nextTheme);
    saveTheme(nextTheme);
  });
}

if (previewToggleBtn) {
  previewToggleBtn.addEventListener("click", () => {
    setPreviewEnabled(!previewState.enabled);
  });
}

window.addEventListener("keydown", handlePreviewKeyDown);
window.addEventListener("keyup", handlePreviewKeyUp);
window.addEventListener("blur", clearPreviewInputState);

for (const button of toolButtons) {
  button.addEventListener("click", () => setTool(button.dataset.tool || "block"));
}

goalWidthInput.addEventListener("input", updateGoalSizeFromInputs);
goalHeightInput.addEventListener("input", updateGoalSizeFromInputs);

canvas.addEventListener("pointerdown", (event) => {
  if (previewState.enabled) {
    isPointerDown = false;
    return;
  }
  isPointerDown = true;
  sendCursorUpdateFromEvent(event, true);
  const { tileX, tileY } = getTileAtPointer(event);
  applyToolToTile(tileX, tileY);
});

canvas.addEventListener("pointermove", (event) => {
  if (previewState.enabled) {
    return;
  }
  sendCursorUpdateFromEvent(event, true);
  if (!isPointerDown) {
    return;
  }
  if (
    tool !== "block" &&
    tool !== "block2" &&
    tool !== "lift-h" &&
    tool !== "lift-v" &&
    tool !== "water-shallow" &&
    tool !== "water-body" &&
    tool !== "erase" &&
    !/^decor[1-6]$/.test(tool)
  ) {
    return;
  }
  const { tileX, tileY } = getTileAtPointer(event);
  applyToolToTile(tileX, tileY);
});

window.addEventListener("pointerup", () => {
  isPointerDown = false;
});

window.addEventListener("resize", () => {
  renderEditor();
});

canvas.addEventListener("pointerleave", (event) => {
  sendCursorUpdateFromEvent(event, false);
});

async function loadExistingLevel() {
  level = createLevel(64, 36, 16);
  hasUnsavedChanges = false;
  setJsonStatus("Started new level.");
  renderEditor();
  jsonOutput.value = toExportJson();
}

loadExistingLevel();
applyTheme(loadSavedTheme());
updatePreviewToggleUi();

if (collabNameInput) {
  collabNameInput.value = trimToCodePoints(getStoredEditorName(), MAX_NAME_LENGTH);
}
updateParticipantsUi([]);
setCollabRoomInfo("Not in a collaboration room yet.");
refreshCollabControls();
