// Vercel routes polling requests independently. Keep each session on one
// connection instead of starting with Socket.IO's default polling transport.
const socket = io({ transports: ["websocket"], timeout: 10000 });

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const connectionStatusEl = document.getElementById("connection-status");
const openMenuBtn = document.getElementById("open-menu-btn");
const resetRoundBtn = document.getElementById("reset-round-btn");
const resetVoteBannerEl = document.getElementById("reset-vote-banner");
const levelCompleteBannerEl = document.getElementById("level-complete-banner");
const waitingPlayerBannerEl = document.getElementById("waiting-player-banner");
const menuOverlay = document.getElementById("menu-overlay");

const menuMainScreen = document.getElementById("menu-main-screen");
const menuPauseScreen = document.getElementById("menu-pause-screen");
const menuLevelSelectScreen = document.getElementById("menu-level-select-screen");
const menuHostScreen = document.getElementById("menu-host-screen");
const menuJoinScreen = document.getElementById("menu-join-screen");
const menuProfileScreen = document.getElementById("menu-profile-screen");
const menuAppScreen = document.getElementById("menu-app-screen");

const levelListEl = document.getElementById("level-list");
const menuLevelBackBtn = document.getElementById("menu-level-back-btn");
const hostSelectedLevelEl = document.getElementById("host-selected-level");

const menuStartBtn = document.getElementById("menu-start-btn");
const menuJoinBtn = document.getElementById("menu-join-btn");
const menuSettingsBtn = document.getElementById("menu-settings-btn");
const menuAppBtn = document.getElementById("menu-app-btn");
const menuAppBackBtn = document.getElementById("menu-app-back-btn");
const menuEditorBanner = document.getElementById("menu-editor-banner");
const menuPauseResumeBtn = document.getElementById("menu-pause-resume-btn");
const menuPauseRoomBtn = document.getElementById("menu-pause-room-btn");
const menuPauseRestartBtn = document.getElementById("menu-pause-restart-btn");
const menuPauseQuitBtn = document.getElementById("menu-pause-quit-btn");

const menuCreateRoomBtn = document.getElementById("menu-create-room-btn");
const menuCopyCodeBtn = document.getElementById("menu-copy-code-btn");
const roomCopyStatusEl = document.getElementById("room-copy-status");
const menuChangeLevelBtn = document.getElementById("menu-change-level-btn");
const menuPlayBtn = document.getElementById("menu-play-btn");
const menuHostBackBtn = document.getElementById("menu-host-back-btn");

const menuJoinSubmitBtn = document.getElementById("menu-join-submit-btn");
const menuJoinBackBtn = document.getElementById("menu-join-back-btn");
const joinCodeInput = document.getElementById("join-code-input");
const joinStatusMsg = document.getElementById("join-status-msg");

const menuProfileSaveBtn = document.getElementById("menu-profile-save-btn");
const menuProfileBackBtn = document.getElementById("menu-profile-back-btn");
const prefSlotButtons = Array.from(document.querySelectorAll(".pref-slot-btn"));
const prefSlotStatus = document.getElementById("pref-slot-status");
const playerPreviewImg = document.getElementById("player-preview-img");

const customNameInput = document.getElementById("custom-name-input");
const tetherLengthInput = document.getElementById("tether-length-input");
const tetherLengthValue = document.getElementById("tether-length-value");
const hostRoomCodeEl = document.getElementById("host-room-code");
const hostStatusMsg = document.getElementById("host-status-msg");
const roomTitleEl = document.getElementById("room-title");
const roomInviteEl = document.getElementById("room-invite");
const roomPlayersEl = document.getElementById("room-players");
const roomReadyStatusEl = document.getElementById("room-ready-status");
const tetherHelpEl = document.getElementById("tether-help");

const input = { left: false, right: false, jump: false };

let mySlot = null;
let myId = null;
let roomCode = null;
let abandonedRoomCode = null;
let isHost = false;
let preferredProfile = 0;
let myProfile = null;
let world = null;
let menuOpen = true;
let currentMenuScreen = "main";
let pendingMenuAction = false;
let pendingMenuTimer = null;
let selectedLevelFile = "forest-1-1.json";
let cachedLevels = null;
let lastRosterSignature = "";
let tetherLimits = {
  min: 75,
  max: 395,
  defaultValue: 170,
};

let state = {
  roomCode: null,
  hostId: null,
  status: "waiting",
  started: false,
  winnerAt: 0,
  players: [],
  spectators: 0,
  settings: { tetherLength: 170 },
  restartVotes: { voted: 0, required: 0 },
  movingPlatforms: [],
  serverTime: 0,
};

const camera = { x: 0, y: 0 };
const facingByPlayerId = new Map();
const tetherAdjustHitboxes = { minus: null, plus: null };

const WALK_FRAME_MS = 120;
const HORIZONTAL_MOVE_THRESHOLD = 34;
const AIR_STATE_THRESHOLD = 40;
const MAX_CUSTOM_NAME_CHARS = 20;
const TETHER_ADJUST_STEP = 5;
const WATER_TILE_ALPHA = 0.80;
const GOAL_SPARKLE_POINTS = [
  { x: 0.22, y: 0.2, phase: 0.0 },
  { x: 0.52, y: 0.16, phase: 0.8 },
  { x: 0.78, y: 0.28, phase: 1.5 },
  { x: 0.3, y: 0.54, phase: 2.1 },
  { x: 0.66, y: 0.6, phase: 2.8 },
  { x: 0.48, y: 0.82, phase: 3.5 },
];

const PLAYER_PROFILES = [
  { name: "Alan", folder: "player1", fill: "#3ddc97", stroke: "#1a7f5a" },
  { name: "Leaf", folder: "player2", fill: "#4ea8de", stroke: "#176087" },
];

const graphemeSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function toGraphemes(value) {
  const text = String(value || "");
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(text), (part) => part.segment);
  }
  return Array.from(text);
}

function sanitizeCustomName(value) {
  return toGraphemes(value).slice(0, MAX_CUSTOM_NAME_CHARS).join("");
}

function getStoredCustomName() {
  const saved = sanitizeCustomName(localStorage.getItem("customPlayerName") || "");
  return saved.trim() ? saved : "";
}

function getCurrentCustomNameForUi() {
  if (customNameInput) {
    const typed = sanitizeCustomName(customNameInput.value || "");
    if (typed.trim()) {
      return typed;
    }
  }
  return getStoredCustomName();
}

function getOpaqueBounds(image) {
  if (!image.width || !image.height) {
    return null;
  }

  const canvasEl = document.createElement("canvas");
  canvasEl.width = image.width;
  canvasEl.height = image.height;
  const c = canvasEl.getContext("2d", { willReadFrequently: true });
  c.drawImage(image, 0, 0);
  const { data, width, height } = c.getImageData(0, 0, image.width, image.height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= 0) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    sx: minX,
    sy: minY,
    sw: maxX - minX + 1,
    sh: maxY - minY + 1,
  };
}

function loadImage(path, options = {}) {
  const image = new Image();
  const asset = { image, loaded: false, path, crop: null };
  const trimTransparent = Boolean(options.trimTransparent);
  image.onload = () => {
    asset.loaded = true;
    if (trimTransparent) {
      asset.crop = getOpaqueBounds(image);
    }
  };
  image.onerror = () => {
    asset.loaded = false;
  };
  image.src = path;
  return asset;
}

function loadPlayerSet(basePath) {
  return {
    idle: loadImage(`${basePath}/idle.png`, { trimTransparent: true }),
    jump: loadImage(`${basePath}/jump.png`, { trimTransparent: true }),
    walk: [
      loadImage(`${basePath}/walk_1.png`, { trimTransparent: true }),
      loadImage(`${basePath}/walk_2.png`, { trimTransparent: true }),
      loadImage(`${basePath}/walk_3.png`, { trimTransparent: true }),
    ],
  };
}

const assets = {
  background: loadImage("assets/forest_background.png"),
  block: loadImage("assets/block.png"),
  block2: loadImage("assets/block-2.png"),
  liftH: loadImage("assets/lift-h.png"),
  liftV: loadImage("assets/lift-v.png"),
  waterShallow: loadImage("assets/water-shallow.png"),
  waterBody: loadImage("assets/water-body.png"),
  goal: loadImage("assets/goal.png"),
  decor: [
    loadImage("assets/decor/decor-1.png"),
    loadImage("assets/decor/decor-2.png"),
    loadImage("assets/decor/decor-3.png"),
    loadImage("assets/decor/decor-4.png"),
    loadImage("assets/decor/decor-5.png"),
    loadImage("assets/decor/decor-6.png"),
  ],
  players: PLAYER_PROFILES.map((profile) =>
    loadPlayerSet(`assets/players/${profile.folder}`)
  ),
};

function resizeCanvas() {
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  const width = Math.floor(window.innerWidth);
  const height = Math.floor(window.innerHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRoomCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

function normalizeProfileIndex(value) {
  const numeric = Number(value);
  if (
    Number.isInteger(numeric) &&
    numeric >= 0 &&
    numeric < PLAYER_PROFILES.length
  ) {
    return numeric;
  }
  return 0;
}

function getProfileName(profileIndex) {
  const profile = PLAYER_PROFILES[normalizeProfileIndex(profileIndex)];
  return profile ? profile.name : "Player 1";
}

function getProfileFolder(profileIndex) {
  const profile = PLAYER_PROFILES[normalizeProfileIndex(profileIndex)];
  return profile ? profile.folder : "player1";
}

function getPlayerProfileIndex(player) {
  if (!player || typeof player !== "object") {
    return 0;
  }

  const profileIndex = Number(player.profile);
  if (
    Number.isInteger(profileIndex) &&
    profileIndex >= 0 &&
    profileIndex < PLAYER_PROFILES.length
  ) {
    return profileIndex;
  }

  const slot = Number(player.slot);
  if (Number.isInteger(slot) && slot >= 0 && slot < PLAYER_PROFILES.length) {
    return slot;
  }

  return 0;
}

function getPlayerById(playerId) {
  if (!playerId) {
    return null;
  }
  return (state.players || []).find((player) => player.id === playerId) || null;
}

function clampTetherLength(value) {
  return clamp(
    Math.round(Number(value) || tetherLimits.defaultValue),
    tetherLimits.min,
    tetherLimits.max
  );
}

function getCurrentTetherLength() {
  return clampTetherLength(state.settings && state.settings.tetherLength);
}

function syncTetherControls(tetherLength) {
  const value = clampTetherLength(tetherLength);
  if (tetherLengthInput) {
    tetherLengthInput.min = String(tetherLimits.min);
    tetherLengthInput.max = String(tetherLimits.max);
    tetherLengthInput.value = String(value);
  }
  if (tetherLengthValue) {
    tetherLengthValue.textContent = `${value} px`;
  }
}

function setMessage(element, message, isError = false) {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.classList.toggle("error", Boolean(isError));
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
      // Fallback below.
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

function normalizeLevelEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const file = String(entry.file || "").trim();
  if (!file || !file.endsWith(".json")) {
    return null;
  }

  const name =
    typeof entry.name === "string" && entry.name.trim()
      ? entry.name.trim()
      : file.replace(/\.json$/i, "").replace(/[-_]+/g, " ");

  return {
    file,
    name: name.replace(/\.json$/i, ""),
    rows: Math.max(0, Number(entry.rows) || 0),
    cols: Math.max(0, Number(entry.cols) || 0),
    theme: typeof entry.theme === "string" ? entry.theme : "grass",
  };
}

function getSelectedLevelEntry() {
  if (!Array.isArray(cachedLevels)) {
    return null;
  }
  return cachedLevels.find((level) => level.file === selectedLevelFile) || null;
}

function updateSelectedLevelLabel() {
  if (!hostSelectedLevelEl) {
    return;
  }

  const selected = getSelectedLevelEntry();
  const levelName = roomCode && world ? world.name : selected?.name || "Forest 1-1";
  setText(hostSelectedLevelEl, levelName);
}

function handleLevelPicked(level) {
  if (!level || !level.file) {
    return;
  }

  if (roomCode) {
    if (!isHost || state.started || pendingMenuAction) return;
    pendingMenuAction = true;
    showMenuScreen("host");
    updateHostCodeUi();
    setMessage(hostStatusMsg, "Changing trail...");
    socket.timeout(5000).emit("set-room-level", { levelFile: level.file }, (error, result) => {
      clearPendingMenuAction();
      if (error || !result?.ok) {
        setMessage(hostStatusMsg, result?.error || "Couldn't change the trail. Please try again.", true);
        return;
      }
      selectedLevelFile = level.file;
      updateSelectedLevelLabel();
      setMessage(hostStatusMsg, "");
    });
    return;
  }

  selectedLevelFile = level.file;
  updateSelectedLevelLabel();
  if (Array.isArray(cachedLevels)) {
    renderLevelList(cachedLevels);
  }

  showMenuScreen("host");
  updateHostCodeUi();
  setMessage(hostStatusMsg, "");
}

function renderLevelList(levels) {
  if (!levelListEl) {
    return;
  }

  levelListEl.textContent = "";

  if (!Array.isArray(levels) || levels.length === 0) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "level-list-empty";
    emptyEl.textContent = "No trails are available yet. Please try again shortly.";
    levelListEl.appendChild(emptyEl);
    return;
  }

  for (const [index, level] of levels.entries()) {
    const levelButton = document.createElement("button");
    levelButton.type = "button";
    levelButton.className = "level-list-item";
    levelButton.setAttribute("aria-label", level.name);
    if (level.file === selectedLevelFile) {
      levelButton.classList.add("active");
    }

    const numberEl = document.createElement("span");
    numberEl.className = "level-list-number";
    numberEl.textContent = String(index + 1).padStart(2, "0");
    numberEl.setAttribute("aria-hidden", "true");
    const detailsEl = document.createElement("span");
    detailsEl.className = "level-list-details";
    const nameEl = document.createElement("span");
    nameEl.className = "level-list-name";
    nameEl.textContent = level.name;

    const metaEl = document.createElement("span");
    metaEl.className = "level-list-meta";
    metaEl.textContent = describeLevel(level);

    const arrowEl = document.createElement("span");
    arrowEl.className = "level-list-arrow";
    arrowEl.textContent = "→";
    arrowEl.setAttribute("aria-hidden", "true");
    detailsEl.append(nameEl, metaEl);
    levelButton.append(numberEl, detailsEl, arrowEl);
    levelButton.addEventListener("click", () => {
      handleLevelPicked(level);
    });
    levelListEl.appendChild(levelButton);
  }
}

async function loadLevels(force = false) {
  if (!force && Array.isArray(cachedLevels)) {
    renderLevelList(cachedLevels);
    updateSelectedLevelLabel();
    return cachedLevels;
  }

  if (levelListEl) {
    levelListEl.textContent = "";
    const loadingEl = document.createElement("p");
    loadingEl.className = "level-list-loading";
    loadingEl.textContent = "Loading levels...";
    levelListEl.appendChild(loadingEl);
  }

  try {
    const response = await fetch("/api/levels", { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Could not load levels (${response.status}).`);
    }

    const payload = await response.json();
    const levels = Array.isArray(payload)
      ? payload.map(normalizeLevelEntry).filter(Boolean)
      : [];

    cachedLevels = levels;
    if (cachedLevels.length === 0) {
      cachedLevels = [
        { file: "forest-1-1.json", name: "Default Level", rows: 0, cols: 0 },
      ];
    }

    if (!cachedLevels.some((level) => level.file === selectedLevelFile)) {
      selectedLevelFile = cachedLevels[0].file;
    }

    renderLevelList(cachedLevels);
    updateSelectedLevelLabel();
    return cachedLevels;
  } catch (error) {
    console.error("Failed to fetch levels.", error);
    cachedLevels = [
      { file: "forest-1-1.json", name: "Default Level", rows: 0, cols: 0 },
    ];
    selectedLevelFile = cachedLevels[0].file;
    renderLevelList(cachedLevels);
    updateSelectedLevelLabel();
    return cachedLevels;
  }
}

function openLevelSelect() {
  showMenuScreen("levelSelect");
  void loadLevels();
}

function clearPendingMenuAction() {
  pendingMenuAction = false;
  if (pendingMenuTimer) {
    clearTimeout(pendingMenuTimer);
    pendingMenuTimer = null;
  }
  updateHostCodeUi();
}

function updatePreferredProfileUi() {
  for (const button of prefSlotButtons) {
    const buttonProfile = normalizeProfileIndex(button.dataset.prefProfile);
    const profileName = getProfileName(buttonProfile);
    const nameEl = button.querySelector(".pref-slot-name");
    if (nameEl) {
      nameEl.textContent = profileName;
    } else {
      button.textContent = profileName;
    }

    const avatarEl = button.querySelector(".pref-slot-avatar");
    if (avatarEl) {
      avatarEl.src = `assets/players/${getProfileFolder(buttonProfile)}/idle.png`;
      avatarEl.alt = `${profileName} Character`;
    }

    button.classList.toggle("active", buttonProfile === preferredProfile);
  }
  if (prefSlotStatus) {
    const customName = getCurrentCustomNameForUi();
    const displayName = customName || getProfileName(preferredProfile);
    prefSlotStatus.textContent = `Name:\n${displayName}`;
  }
  if (playerPreviewImg) {
    const profileName = getProfileName(preferredProfile);
    playerPreviewImg.src = `assets/players/${getProfileFolder(preferredProfile)}/idle.png`;
    playerPreviewImg.alt = `${profileName} Preview`;
  }
}

function loadSavedProfilePreferences() {
  preferredProfile = normalizeProfileIndex(localStorage.getItem("preferredProfile"));
  if (customNameInput) {
    customNameInput.value = sanitizeCustomName(localStorage.getItem("customPlayerName") || "");
  }
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function updateRoomPlayers() {
  const players = state.players || [];
  const signature = JSON.stringify([myId, state.hostId, players.map((player) =>
    [player.id, player.slot, player.profile, player.name, player.connected])]);
  if (signature === lastRosterSignature) return;
  lastRosterSignature = signature;
  roomPlayersEl.replaceChildren();

  for (let slot = 0; slot < 2; slot += 1) {
    const player = players.find((entry) => entry.slot === slot);
    const item = document.createElement("div");
    item.className = `room-player${player ? "" : " empty"}`;
    const details = document.createElement("div");
    const name = document.createElement("span");
    name.className = "room-player-name";
    name.textContent = player ? player.name : "Open spot";
    const role = document.createElement("span");
    role.className = "room-player-role";
    role.textContent = !player ? "Invite a friend" : player.connected === false
      ? "Reconnecting..." : `${player.id === state.hostId ? "Host" : "Partner"}${player.id === myId ? " · You" : ""}`;
    details.append(name, role);
    item.append(details);
    roomPlayersEl.appendChild(item);
  }
}

function updateHostCodeUi() {
  const inRoom = Boolean(roomCode);
  const players = state.players || [];
  const ready = players.length === 2 && players.every((player) => player.connected !== false);
  setText(roomTitleEl, inRoom ? "Room lobby" : "Set up your room");
  if (hostRoomCodeEl.textContent !== (roomCode || "")) {
    menuCopyCodeBtn.classList.remove("copied");
    roomCopyStatusEl.textContent = "";
  }
  setText(hostRoomCodeEl, roomCode || "");
  roomInviteEl.classList.toggle("hidden", !inRoom);
  roomPlayersEl.classList.toggle("hidden", !inRoom);
  menuCreateRoomBtn.classList.toggle("hidden", inRoom);
  menuChangeLevelBtn.classList.toggle("hidden", inRoom && (!isHost || state.started));
  menuPlayBtn.classList.toggle("hidden", !inRoom);
  menuCreateRoomBtn.disabled = pendingMenuAction || !socket.connected;
  menuPlayBtn.disabled = pendingMenuAction || !socket.connected || (!state.started && !isHost);
  menuHostBackBtn.disabled = pendingMenuAction;
  menuChangeLevelBtn.disabled = pendingMenuAction;
  menuJoinSubmitBtn.disabled = pendingMenuAction || !socket.connected;
  menuJoinBackBtn.disabled = pendingMenuAction;
  tetherLengthInput.disabled = inRoom && !isHost;
  setText(menuCreateRoomBtn, pendingMenuAction ? "Creating..." : "Create Room");
  setText(menuJoinSubmitBtn, pendingMenuAction ? "Joining..." : "Join Room");
  setText(menuPlayBtn, state.started ? (mySlot === -1 ? "Watch Game" : "Back to Game")
    : pendingMenuAction ? "Starting..." : isHost ? "Start Together" : "Waiting for Host");
  setText(menuHostBackBtn, inRoom ? "Leave Room" : "Back");
  setText(tetherHelpEl, inRoom && !isHost ? "Your host sets the tether length."
    : "A shorter tether keeps you closer. A longer one gives you room to roam.");
  const message = !inRoom ? "Create a room, then invite your partner."
    : state.started ? `${players.length}/2 players${state.spectators ? ` · ${state.spectators} watching` : ""}`
    : !ready ? "Share your room code. You can start while your friend joins."
    : isHost ? "2/2 players · You're both here. Let's go!" : "2/2 players · Your host will start the adventure.";
  setText(roomReadyStatusEl, message);
  roomReadyStatusEl.classList.toggle("ready", inRoom && ready);
  if (inRoom) updateRoomPlayers();
  updateSelectedLevelLabel();
}

function showMenuScreen(screen) {
  currentMenuScreen = screen;
  const map = {
    main: menuMainScreen,
    pause: menuPauseScreen,
    levelSelect: menuLevelSelectScreen,
    host: menuHostScreen,
    join: menuJoinScreen,
    profile: menuProfileScreen,
    app: menuAppScreen,
  };

  for (const [name, element] of Object.entries(map)) {
    if (!element) {
      continue;
    }
    element.classList.toggle("hidden", name !== screen);
  }

  if (menuOverlay) {
    menuOverlay.classList.toggle("pause-mode", screen === "pause");
    menuOverlay.classList.toggle("home-mode", screen === "main");
  }
}

function getDefaultMenuScreen() {
  return roomCode ? (state.started ? "pause" : "host") : "main";
}

function clearInputAndSync() {
  let changed = false;
  for (const key of Object.keys(input)) {
    if (input[key]) {
      input[key] = false;
      changed = true;
    }
  }
  if (changed && socket.connected && roomCode && mySlot !== null && mySlot !== -1) {
    socket.emit("input", input);
  }
}

function openMenu(screen = getDefaultMenuScreen()) {
  if (!menuOverlay) {
    return;
  }
  if (!menuOpen) {
    clearInputAndSync();
  }
  menuOpen = true;
  menuOverlay.classList.add("open");
  document.body.classList.add("menu-open");
  showMenuScreen(screen);
  syncTetherControls(getCurrentTetherLength());
  updateHostCodeUi();
  updateSelectedLevelLabel();
  updatePreferredProfileUi();
}

function closeMenu() {
  if (!menuOverlay) {
    return;
  }
  if (!roomCode || !state.started) {
    return;
  }
  menuOpen = false;
  menuOverlay.classList.remove("open");
  document.body.classList.remove("menu-open");
}

function clearLocalRoomState() {
  clearInputAndSync();
  roomCode = null;
  world = null;
  mySlot = null;
  myProfile = null;
  isHost = false;
  camera.x = 0;
  camera.y = 0;
  state = {
    ...state,
    roomCode: null,
    hostId: null,
    status: "waiting",
    started: false,
    winnerAt: 0,
    players: [],
    spectators: 0,
    restartVotes: { voted: 0, required: 0 },
    movingPlatforms: [],
    enemies: [],
    game: null,
    taken: "",
    cps: "",
    serverTime: Date.now(),
  };
  facingByPlayerId.clear();
  updateResetVoteBanner();
  updateLevelCompleteBanner();
  updateWaitingPlayerBanner();
}

function leaveRoomToMainMenu() {
  if (roomCode) {
    abandonedRoomCode = roomCode;
    socket.emit("leave-room");
  }
  clearLocalRoomState();
  clearPendingMenuAction();
  updateHostCodeUi();
  updateStatusText();
  updateResetVoteBanner();
  setMessage(hostStatusMsg, "Create a room to get a join code.");
  setMessage(joinStatusMsg, "Enter a code from the host.");
  openMenu("main");
}

function applyRoomJoined(payload) {
  abandonedRoomCode = null;
  showConnectionStatus();
  clearPendingMenuAction();
  myId = payload.id || myId;
  mySlot = payload.slot;
  if (payload.profile !== undefined && payload.profile !== null) {
    myProfile = normalizeProfileIndex(payload.profile);
  }
  roomCode = payload.roomCode || null;
  state.started = Boolean(payload.started);
  isHost = Boolean(payload.isHost);
  world = payload.world || world;
  camera.x = 0;
  camera.y = 0;
  state.movingPlatforms =
    world && Array.isArray(world.movingPlatforms) ? world.movingPlatforms : [];

  if (payload.settings) {
    state.settings = {
      ...state.settings,
      tetherLength: clampTetherLength(payload.settings.tetherLength),
    };
  }

  state.roomCode = roomCode;
  updateHostCodeUi();
  updatePreferredProfileUi();
  syncTetherControls(getCurrentTetherLength());

  setMessage(hostStatusMsg, "");
  if (!state.started) openMenu("host");

  updateStatusText();
  updateResetVoteBanner();
}

function updateStatusText() {
  updateLevelCompleteBanner();
  updateWaitingPlayerBanner();
  if (statusEl) {
    statusEl.classList.remove("hidden");
  }

  if (!roomCode) {
    statusEl.textContent = "Open Menu to start or join.";
    return;
  }

  if (!world) {
    statusEl.textContent = "Joining...";
    return;
  }

  if (mySlot === -1) {
    if (state.players.length < 2) {
      statusEl.textContent = "Spectating. Waiting for two players.";
    } else {
      statusEl.textContent = "Spectating. Match in progress.";
    }
    return;
  }

  if (state.status === "waiting") {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
    return;
  }

  const myPlayer = getPlayerById(myId);
  if (myPlayer) {
    myProfile = getPlayerProfileIndex(myPlayer);
  }
  const serverName =
    myPlayer && typeof myPlayer.name === "string" ? myPlayer.name.trim() : "";
  const customName = getStoredCustomName();
  const displayName =
    serverName || customName || getProfileName(myProfile ?? preferredProfile);
  statusEl.textContent = `Playing as ${displayName}.`;
}

function updateResetVoteBanner() {
  if (!resetVoteBannerEl) {
    return;
  }

  const votes = state.restartVotes || { voted: 0, required: 0 };
  const voted = Math.max(0, Number(votes.voted) || 0);
  const required = Math.max(0, Number(votes.required) || 0);
  const showBanner =
    Boolean(roomCode) &&
    (state.status === "playing" || state.status === "won") &&
    voted > 0 &&
    required > 0;
  const showBelowLevelClear = showBanner && state.status === "won";

  resetVoteBannerEl.classList.toggle("hidden", !showBanner);
  resetVoteBannerEl.classList.toggle("top-banner-below-clear", showBelowLevelClear);
  if (showBanner) {
    resetVoteBannerEl.textContent = `Restart (${voted}/${required})`;
  }
}

function updateLevelCompleteBanner() {
  if (!levelCompleteBannerEl) {
    return;
  }
  const showBanner = Boolean(roomCode) && state.status === "won";
  levelCompleteBannerEl.classList.toggle("hidden", !showBanner);
}

function updateWaitingPlayerBanner() {
  if (!waitingPlayerBannerEl) {
    return;
  }
  const showBanner =
    Boolean(roomCode) &&
    Boolean(world) &&
    ((state.status === "waiting" && (state.players || []).length < 2) ||
      state.status === "reconnecting");
  waitingPlayerBannerEl.classList.toggle("hidden", !showBanner);
  waitingPlayerBannerEl.textContent = state.status === "reconnecting"
    ? "Partner reconnecting... Game paused."
    : "Waiting for player 2";
}

function normalizeKey(key) {
  if (key === "ArrowLeft" || key === "a" || key === "A") {
    return "left";
  }
  if (key === "ArrowRight" || key === "d" || key === "D") {
    return "right";
  }
  if (
    key === "ArrowUp" ||
    key === "w" ||
    key === "W" ||
    key === " " ||
    key === "Spacebar"
  ) {
    return "jump";
  }
  return null;
}

function sendInput() {
  if (!socket.connected || menuOpen || !roomCode || mySlot === null || mySlot === -1) {
    return;
  }
  socket.emit("input", input);
}

function requestCreateRoom() {
  if (pendingMenuAction) {
    return;
  }

  if (!socket.connected) {
    setMessage(hostStatusMsg, "Connecting to the game server. Please try again in a moment.", true);
    return;
  }

  const tetherLength = clampTetherLength(
    tetherLengthInput ? tetherLengthInput.value : getCurrentTetherLength()
  );

  if (roomCode && isHost) {
    state.settings.tetherLength = tetherLength;
    syncTetherControls(tetherLength);
    socket.emit("set-settings", { tetherLength });
    setMessage(hostStatusMsg, "Settings updated.");
    return;
  }

  pendingMenuAction = true;
  updateHostCodeUi();
  setMessage(hostStatusMsg, "Creating room...");
  pendingMenuTimer = setTimeout(() => {
    clearPendingMenuAction();
    setMessage(
      hostStatusMsg,
      "The server did not respond. Please try creating the room again.",
      true
    );
  }, 5000);
  socket.emit(
    "create-room",
    {
      tetherLength,
      preferredProfile,
      customName: getCurrentCustomNameForUi(),
      levelFile: selectedLevelFile,
    },
    (result = {}) => {
      clearPendingMenuAction();
      if (!result.ok) {
        setMessage(hostStatusMsg, result.error || "Could not create room.", true);
        return;
      }
      applyRoomJoined(result);
      showMenuScreen("host");
    }
  );
}

function requestJoinRoom() {
  if (pendingMenuAction || !joinCodeInput) {
    return;
  }

  if (!socket.connected) {
    setMessage(joinStatusMsg, "Connecting to the game server. Please try again in a moment.", true);
    return;
  }

  const code = normalizeRoomCode(joinCodeInput.value);
  joinCodeInput.value = code;
  if (code.length !== 5) {
    joinCodeInput.setAttribute("aria-invalid", "true");
    setMessage(joinStatusMsg, "Room codes have five letters or numbers.", true);
    return;
  }

  pendingMenuAction = true;
  updateHostCodeUi();
  setMessage(joinStatusMsg, "Joining room...");
  pendingMenuTimer = setTimeout(() => {
    clearPendingMenuAction();
    setMessage(
      joinStatusMsg,
      "The server did not respond. Please check the code and try again.",
      true
    );
  }, 5000);
  socket.emit(
    "join-room",
    { code, preferredProfile, customName: getCurrentCustomNameForUi() },
    (result = {}) => {
      clearPendingMenuAction();
      if (!result.ok) {
        setMessage(joinStatusMsg, result.error || "Could not join room.", true);
        return;
      }
      applyRoomJoined(result);
      if (state.started) closeMenu();
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      window.history.replaceState(null, "", url);
    }
  );
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    if (menuOpen && currentMenuScreen === "app") {
      showMenuScreen("main");
      menuAppBtn.focus();
      return;
    }
    if (menuOpen) {
      closeMenu();
    } else {
      openMenu(getDefaultMenuScreen());
    }
    return;
  }

  if (menuOpen && currentMenuScreen === "join" && event.key === "Enter") {
    event.preventDefault();
    requestJoinRoom();
    return;
  }

  const mapped = normalizeKey(event.key);
  if (mapped && !menuOpen) {
    event.preventDefault();
    if (!input[mapped]) {
      input[mapped] = true;
      sendInput();
    }
    return;
  }
});

window.addEventListener("keyup", (event) => {
  const mapped = normalizeKey(event.key);
  if (!mapped || menuOpen) {
    return;
  }
  event.preventDefault();
  if (input[mapped]) {
    input[mapped] = false;
    sendInput();
  }
});

// A keyup can be lost when a tab or window loses focus.
window.addEventListener("blur", clearInputAndSync);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearInputAndSync();
});

setInterval(sendInput, 120);

if (openMenuBtn) {
  openMenuBtn.addEventListener("click", () => {
    openMenu(getDefaultMenuScreen());
  });
}

if (resetRoundBtn) {
  resetRoundBtn.addEventListener("click", () => {
    if (!roomCode || mySlot === null || mySlot === -1) {
      return;
    }
    socket.emit("restart");
  });
}

if (menuStartBtn) {
  menuStartBtn.addEventListener("click", () => {
    loadSavedProfilePreferences();
    showMenuScreen("host");
    requestCreateRoom();
  });
}

if (menuJoinBtn) {
  menuJoinBtn.addEventListener("click", () => {
    showMenuScreen("join");
    setMessage(joinStatusMsg, "Enter a code from the host.");
  });
}

if (menuSettingsBtn) {
  menuSettingsBtn.addEventListener("click", () => {
    loadSavedProfilePreferences();
    updatePreferredProfileUi();
    showMenuScreen("profile");
  });
}

if (menuEditorBanner) {
  menuEditorBanner.addEventListener("click", () => {
    window.location.href = "editor.html";
  });
}

menuAppBtn.addEventListener("click", () => showMenuScreen("app"));
menuAppBackBtn.addEventListener("click", () => {
  showMenuScreen("main");
  menuAppBtn.focus();
});

if (menuPauseResumeBtn) {
  menuPauseResumeBtn.addEventListener("click", () => {
    closeMenu();
  });
}

menuPauseRoomBtn.addEventListener("click", () => openMenu("host"));
menuChangeLevelBtn.addEventListener("click", openLevelSelect);

if (menuPauseRestartBtn) {
  menuPauseRestartBtn.addEventListener("click", () => {
    if (!roomCode || mySlot === null || mySlot === -1) {
      return;
    }
    socket.emit("restart");
    closeMenu();
  });
}

if (menuPauseQuitBtn) {
  menuPauseQuitBtn.addEventListener("click", () => {
    leaveRoomToMainMenu();
  });
}

if (menuCreateRoomBtn) {
  menuCreateRoomBtn.addEventListener("click", requestCreateRoom);
}

if (menuCopyCodeBtn) {
  menuCopyCodeBtn.addEventListener("click", async () => {
    if (!roomCode) return;
    const copiedRoom = roomCode;
    const copied = await copyTextToClipboard(copiedRoom);
    if (roomCode !== copiedRoom) return;
    menuCopyCodeBtn.classList.toggle("copied", copied);
    setMessage(roomCopyStatusEl, copied ? "Copied!" : "Couldn't copy. Select the code to copy it.", !copied);
  });
}

if (menuPlayBtn) {
  menuPlayBtn.addEventListener("click", () => {
    if (!roomCode || pendingMenuAction || !socket.connected) return;
    if (state.started) return closeMenu();
    pendingMenuAction = true;
    updateHostCodeUi();
    socket.timeout(5000).emit("start-game", {}, (error, result) => {
      clearPendingMenuAction();
      if (error || !result?.ok) {
        setMessage(hostStatusMsg, result?.error || "Couldn't start. Please try again.", true);
      }
    });
  });
}

if (menuLevelBackBtn) {
  menuLevelBackBtn.addEventListener("click", () => {
    showMenuScreen(roomCode ? "host" : "main");
  });
}

if (menuHostBackBtn) {
  menuHostBackBtn.addEventListener("click", () => {
    if (roomCode) leaveRoomToMainMenu();
    else openLevelSelect();
  });
}

if (menuJoinSubmitBtn) {
  menuJoinSubmitBtn.addEventListener("click", requestJoinRoom);
}

if (menuJoinBackBtn) {
  menuJoinBackBtn.addEventListener("click", () => {
    showMenuScreen(roomCode ? "pause" : "main");
  });
}

if (menuProfileBackBtn) {
  menuProfileBackBtn.addEventListener("click", () => {
    loadSavedProfilePreferences();
    updatePreferredProfileUi();
    showMenuScreen("main");
  });
}

if (menuProfileSaveBtn) {
  menuProfileSaveBtn.addEventListener("click", () => {
    const name = sanitizeCustomName(customNameInput ? customNameInput.value : "");
    if (customNameInput && customNameInput.value !== name) {
      customNameInput.value = name;
    }
    localStorage.setItem("customPlayerName", name);
    localStorage.setItem("preferredProfile", String(preferredProfile));
    updatePreferredProfileUi();
    showMenuScreen("main");
  });
}

if (joinCodeInput) {
  joinCodeInput.addEventListener("input", () => {
    joinCodeInput.value = normalizeRoomCode(joinCodeInput.value);
    joinCodeInput.removeAttribute("aria-invalid");
  });
}

if (tetherLengthInput) {
  tetherLengthInput.addEventListener("input", () => {
    const tetherLength = clampTetherLength(tetherLengthInput.value);
    syncTetherControls(tetherLength);

    if (roomCode && isHost && socket.connected) {
      state.settings.tetherLength = tetherLength;
      socket.emit("set-settings", { tetherLength });
    }
  });
}

for (const button of prefSlotButtons) {
  button.addEventListener("click", () => {
    preferredProfile = normalizeProfileIndex(button.dataset.prefProfile);
    updatePreferredProfileUi();
  });
}

if (customNameInput) {
  loadSavedProfilePreferences();
  customNameInput.addEventListener("input", () => {
    const sanitized = sanitizeCustomName(customNameInput.value);
    if (customNameInput.value !== sanitized) {
      customNameInput.value = sanitized;
    }
    updatePreferredProfileUi();
  });
}

function showConnectionStatus(message = "") {
  connectionStatusEl.textContent = message;
  connectionStatusEl.classList.toggle("hidden", !message);
}

function resetExpiredSession() {
  clearLocalRoomState();
  updateHostCodeUi();
  openMenu("main");
  showConnectionStatus("Connection restored. Your previous room expired; start or join a room.");
}

socket.on("connect", () => {
  showConnectionStatus();
  if (roomCode && !socket.recovered) resetExpiredSession();
  updateHostCodeUi();
});

socket.on("connect_error", () => {
  showConnectionStatus("Cannot reach the game server. Retrying automatically...");
});

socket.on("session-expired", resetExpiredSession);

socket.on("welcome", (payload = {}) => {
  myId = payload.id || myId;
  if (payload.limits) {
    tetherLimits = {
      min: Number(payload.limits.minTetherLength) || tetherLimits.min,
      max: Number(payload.limits.maxTetherLength) || tetherLimits.max,
      defaultValue:
        Number(payload.limits.defaultTetherLength) || tetherLimits.defaultValue,
    };
  }
  state.settings.tetherLength = clampTetherLength(state.settings.tetherLength);
  syncTetherControls(getCurrentTetherLength());
  updateStatusText();
});

socket.on("room-joined", (payload = {}) => {
  if (!payload.ok) {
    return;
  }
  if (payload.roomCode === abandonedRoomCode) {
    socket.emit("leave-room");
    return;
  }
  applyRoomJoined(payload);
  if (state.started && currentMenuScreen === "host") closeMenu();
});

socket.on("game-started", (payload = {}) => {
  if (payload.roomCode !== roomCode) return;
  state.started = true;
  clearPendingMenuAction();
  closeMenu();
});

socket.on("room-level", (payload = {}) => {
  if (payload.roomCode !== roomCode || !payload.world) return;
  world = payload.world;
  camera.x = 0;
  camera.y = 0;
  state.movingPlatforms = world.movingPlatforms || [];
  updateSelectedLevelLabel();
});

socket.on("state", (nextState = {}) => {
  if (nextState.roomCode === abandonedRoomCode) return;
  state = {
    ...state,
    ...nextState,
    settings: {
      ...state.settings,
      ...(nextState.settings || {}),
    },
    restartVotes: {
      ...state.restartVotes,
      ...(nextState.restartVotes || {}),
    },
  };
  state.settings.tetherLength = clampTetherLength(state.settings.tetherLength);
  state.movingPlatforms = Array.isArray(nextState.movingPlatforms)
    ? nextState.movingPlatforms
    : Array.isArray(state.movingPlatforms)
      ? state.movingPlatforms
      : [];
  if (nextState.roomCode) {
    roomCode = nextState.roomCode;
  }
  if (myId) {
    isHost = Boolean(state.hostId && state.hostId === myId);
    const me = getPlayerById(myId);
    if (me) {
      myProfile = getPlayerProfileIndex(me);
    }
  }

  const activeIds = new Set((state.players || []).map((player) => player.id));
  for (const knownId of facingByPlayerId.keys()) {
    if (!activeIds.has(knownId)) {
      facingByPlayerId.delete(knownId);
    }
  }

  updateHostCodeUi();
  updateStatusText();
  updateResetVoteBanner();
  syncMusic();
  trackLocalJump();
});

socket.on("settings", (nextSettings = {}) => {
  state.settings = {
    ...state.settings,
    ...nextSettings,
  };
  state.settings.tetherLength = clampTetherLength(state.settings.tetherLength);
  syncTetherControls(getCurrentTetherLength());
});

socket.on("disconnect", () => {
  clearPendingMenuAction();
  clearInputAndSync();
  updateHostCodeUi();
  showConnectionStatus("Connection lost. Reconnecting...");
  if (!socket.active) {
    clearLocalRoomState();
    updateHostCodeUi();
    openMenu("main");
    showConnectionStatus("Disconnected. Refresh the page to reconnect.");
  }
});

function isPointInsideRect(x, y, rect) {
  if (!rect) {
    return false;
  }
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function adjustTetherLengthBy(delta) {
  if (!roomCode || !isHost || !socket.connected) {
    return;
  }
  const current = getCurrentTetherLength();
  const next = clampTetherLength(current + delta);
  if (next === current) {
    return;
  }

  state.settings.tetherLength = next;
  syncTetherControls(next);
  socket.emit("set-settings", { tetherLength: next });
}

canvas.addEventListener("pointerdown", (event) => {
  if (menuOpen || !roomCode || !isHost) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (isPointInsideRect(x, y, tetherAdjustHitboxes.minus)) {
    adjustTetherLengthBy(-TETHER_ADJUST_STEP);
  } else if (isPointInsideRect(x, y, tetherAdjustHitboxes.plus)) {
    adjustTetherLengthBy(TETHER_ADJUST_STEP);
  }
});

function getWalkFrame(player, now) {
  let hash = 0;
  for (let i = 0; i < player.id.length; i += 1) {
    hash = (hash << 5) - hash + player.id.charCodeAt(i);
    hash |= 0;
  }
  const phaseOffset = Math.abs(hash) % WALK_FRAME_MS;
  return Math.floor((now + phaseOffset) / WALK_FRAME_MS) % 3;
}

function getSpriteForPlayer(player, now) {
  const profileIndex = getPlayerProfileIndex(player);
  const set = assets.players[profileIndex] || assets.players[0];
  const inAir = Math.abs(player.vy) > AIR_STATE_THRESHOLD;
  const moving = Math.abs(player.vx) > HORIZONTAL_MOVE_THRESHOLD;

  if (inAir) {
    return set.jump;
  }
  if (moving) {
    return set.walk[getWalkFrame(player, now)];
  }
  return set.idle;
}

function drawBackground(width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  const themeInfo = getThemeInfo();
  sky.addColorStop(0, themeInfo.sky[0]);
  sky.addColorStop(0.65, themeInfo.sky[1]);
  sky.addColorStop(1, themeInfo.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const bg = getThemeBackground();
  if (!bg || !bg.loaded) {
    return;
  }

  ctx.imageSmoothingEnabled = false;
  const scale = Math.max(width / bg.image.width, height / bg.image.height);
  const drawWidth = Math.ceil(bg.image.width * scale);
  const drawHeight = Math.ceil(bg.image.height * scale);
  const baseY = Math.round((height - drawHeight) * 0.5 - camera.y * 0.04);
  const shiftX = ((camera.x * 0.16) % drawWidth + drawWidth) % drawWidth;
  const startX = -shiftX - drawWidth;

  ctx.globalAlpha = 0.68;
  for (let x = startX; x < width + drawWidth; x += drawWidth) {
    ctx.drawImage(bg.image, Math.round(x), baseY, drawWidth, drawHeight);
  }
  ctx.globalAlpha = 1;
}

function drawFallbackPlayer(player, style) {
  ctx.fillStyle = style.fill;
  ctx.fillRect(player.x, player.y, player.width, player.height);
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(player.x, player.y, player.width, player.height);
}

function drawPlayerSprite(player, now) {
  const profile = PLAYER_PROFILES[getPlayerProfileIndex(player)] || PLAYER_PROFILES[0];
  const style = profile || {
    fill: "#dddddd",
    stroke: "#8a8a8a",
    name: "Player",
  };
  const sprite = getSpriteForPlayer(player, now);

  const source =
    sprite && sprite.loaded
      ? sprite.crop || {
          sx: 0,
          sy: 0,
          sw: sprite.image.width,
          sh: sprite.image.height,
        }
      : null;
  const spriteAspect =
    source && source.sh > 0 ? source.sw / source.sh : 1;
  const renderBox = Math.min(player.width, player.height);
  let drawWidth = renderBox;
  let drawHeight = renderBox;
  if (spriteAspect > 1) {
    drawHeight = renderBox / spriteAspect;
  } else if (spriteAspect > 0) {
    drawWidth = renderBox * spriteAspect;
  }
  drawWidth = Math.max(1, Math.round(drawWidth));
  drawHeight = Math.max(1, Math.round(drawHeight));
  const drawX = player.x + player.width * 0.5 - drawWidth * 0.5;
  const drawY = player.y + player.height - drawHeight;

  const previousFacing = facingByPlayerId.get(player.id) || 1;
  let facing = previousFacing;
  if (player.vx > 8) {
    facing = 1;
  } else if (player.vx < -8) {
    facing = -1;
  }
  facingByPlayerId.set(player.id, facing);

  if (sprite && sprite.loaded) {
    ctx.save();
    if (facing < 0) {
      ctx.translate(drawX + drawWidth * 0.5, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(
        sprite.image,
        source.sx,
        source.sy,
        source.sw,
        source.sh,
        -drawWidth * 0.5,
        drawY,
        drawWidth,
        drawHeight
      );
    } else {
      ctx.drawImage(
        sprite.image,
        source.sx,
        source.sy,
        source.sw,
        source.sh,
        drawX,
        drawY,
        drawWidth,
        drawHeight
      );
    }
    ctx.restore();
  } else {
    drawFallbackPlayer(player, style);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "10px 'Press Start 2P'";

  const serverName = typeof player.name === "string" ? player.name.trim() : "";
  const localFallback = player.id === myId ? getStoredCustomName() : "";
  const displayName = serverName || localFallback || style.name;

  // Lift the second label when both players stand close enough for the names to overlap.
  const other = (state.players || []).find((entry) => entry.id !== player.id);
  const labelsCollide =
    other && player.slot > other.slot && Math.abs(other.x - player.x) < 120 && Math.abs(other.y - player.y) < 24;
  const textY = player.y - 8 - (labelsCollide ? 16 : 0);
  if (state.hostId === player.id) {
    const hostTag = "(Host) ";
    const hostTagWidth = ctx.measureText(hostTag).width;
    const nameWidth = ctx.measureText(displayName).width;
    const startX = player.x + player.width / 2 - (hostTagWidth + nameWidth) / 2;
    ctx.fillStyle = "#f1c40f";
    ctx.fillText(hostTag, startX, textY);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(displayName, startX + hostTagWidth, textY);
    return;
  }

  ctx.fillStyle = "#ffffff";
  const nameWidth = ctx.measureText(displayName).width;
  const startX = player.x + player.width / 2 - nameWidth / 2;
  ctx.fillText(displayName, startX, textY);
}

function getVisibleTileRange() {
  const tileSize = Number(world.tileSize) || 64;
  const rows = Array.isArray(world.tiles) ? world.tiles.length : 0;
  const columns = rows > 0 ? world.tiles[0].length : 0;
  return {
    tileSize,
    startColumn: Math.max(Math.floor(camera.x / tileSize) - 1, 0),
    startRow: Math.max(Math.floor(camera.y / tileSize) - 1, 0),
    endColumn: Math.min(
      Math.ceil((camera.x + window.innerWidth) / tileSize) + 1,
      columns - 1
    ),
    endRow: Math.min(
      Math.ceil((camera.y + window.innerHeight) / tileSize) + 1,
      rows - 1
    ),
  };
}

function drawSolidTiles() {
  const { tileSize, startColumn, startRow, endColumn, endRow } =
    getVisibleTileRange();
  const tiles = Array.isArray(world.tiles) ? world.tiles : [];

  for (let y = startRow; y <= endRow; y += 1) {
    const row = tiles[y] || "";
    for (let x = startColumn; x <= endColumn; x += 1) {
      const symbol = row[x];
      if (symbol !== "#" && symbol !== "b") {
        continue;
      }

      const drawX = x * tileSize;
      const drawY = y * tileSize;
      const blockAsset = getThemedBlock(symbol);
      if (blockAsset.loaded) {
        ctx.drawImage(blockAsset.image, drawX, drawY, tileSize, tileSize);
        if (blockAsset.tint) {
          ctx.fillStyle = blockAsset.tint;
          ctx.fillRect(drawX, drawY, tileSize, tileSize);
        }
      } else {
        ctx.fillStyle = symbol === "b" ? "#4d6b52" : "#5c4033";
        ctx.fillRect(drawX, drawY, tileSize, tileSize);
      }
    }
  }
}

function drawWaterTiles() {
  const { tileSize, startColumn, startRow, endColumn, endRow } =
    getVisibleTileRange();
  const tiles = Array.isArray(world.tiles) ? world.tiles : [];

  for (let y = startRow; y <= endRow; y += 1) {
    const row = tiles[y] || "";
    for (let x = startColumn; x <= endColumn; x += 1) {
      const symbol = row[x];
      if (symbol !== "s" && symbol !== "w") {
        continue;
      }

      const drawX = x * tileSize;
      const drawY = y * tileSize;
      const waterAsset = symbol === "w" ? assets.waterBody : assets.waterShallow;
      ctx.save();
      ctx.globalAlpha = WATER_TILE_ALPHA;
      if (waterAsset.loaded) {
        ctx.drawImage(waterAsset.image, drawX, drawY, tileSize, tileSize);
      } else {
        ctx.fillStyle = symbol === "w" ? "#2a83da" : "#75c9ff";
        ctx.fillRect(drawX, drawY, tileSize, tileSize);
      }
      ctx.restore();
    }
  }
}

function getMovingPlatformsForRender() {
  if (Array.isArray(state.movingPlatforms) && state.movingPlatforms.length > 0) {
    return state.movingPlatforms;
  }
  if (world && Array.isArray(world.movingPlatforms) && world.movingPlatforms.length > 0) {
    return world.movingPlatforms;
  }
  return [];
}

function drawMovingPlatforms() {
  const platforms = getMovingPlatformsForRender();
  if (platforms.length === 0) {
    return;
  }

  for (const platform of platforms) {
    const type = String(platform.type || "");
    const x = Number(platform.x);
    const y = Number(platform.y);
    const width = Number(platform.width) || Number(world.tileSize) || 64;
    const height = Number(platform.height) || Number(world.tileSize) || 64;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    const asset = type === "lift-v" ? assets.liftV : assets.liftH;
    if (asset && asset.loaded) {
      ctx.drawImage(asset.image, x, y, width, height);
    } else {
      ctx.fillStyle = type === "lift-v" ? "#4f8ee8" : "#3ec28f";
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    }
  }
}

function drawDecorTiles() {
  const { tileSize, startColumn, startRow, endColumn, endRow } =
    getVisibleTileRange();
  const decorRows = Array.isArray(world.decor) ? world.decor : [];

  for (let y = startRow; y <= endRow; y += 1) {
    const row = decorRows[y] || "";
    for (let x = startColumn; x <= endColumn; x += 1) {
      const symbol = row[x];
      const decorIndex = Number(symbol) - 1;
      if (!Number.isInteger(decorIndex) || decorIndex < 0 || decorIndex > 5) {
        continue;
      }

      const decorAsset = assets.decor[decorIndex];
      if (!decorAsset || !decorAsset.loaded) {
        continue;
      }

      ctx.drawImage(
        decorAsset.image,
        x * tileSize,
        y * tileSize,
        tileSize,
        tileSize
      );
    }
  }
}

function drawGoalSparkles(now) {
  if (!world || !world.goal) {
    return;
  }

  const goal = world.goal;
  const unit = Math.max(1, Math.round((goal.width + goal.height) * 0.03));
  const baseSize = Math.max(8, unit * 2);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const point of GOAL_SPARKLE_POINTS) {
    const phase = now * 0.004 + point.phase;
    const flicker = 0.5 + Math.sin(phase) * 0.5;
    const x = goal.x + goal.width * point.x;
    const y = goal.y + goal.height * point.y;
    const pulse = 0.72 + flicker * 0.45;
    const size = Math.max(7, Math.round(baseSize * pulse));
    ctx.font = `${size}px 'Press Start 2P'`;

    ctx.globalAlpha = 0.08 + flicker * 0.82;
    ctx.fillStyle = flicker > 0.5 ? "#ffffff" : "#bfe9ff";
    ctx.fillText("+", x, y);
  }

  ctx.restore();
}

function drawWorld() {
  if (!world) {
    return;
  }

  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;
  const worldScale = world.width > 0 && world.width < viewWidth ? viewWidth / world.width : 1;
  const viewWorldWidth = viewWidth / worldScale;
  const viewWorldHeight = viewHeight / worldScale;
  drawBackground(viewWidth, viewHeight);

  const players = state.players || [];
  let targetX = world.spawn[0].x;
  let targetY = world.spawn[0].y;

  if (players.length > 0) {
    targetX =
      players.reduce((sum, player) => sum + player.x + player.width / 2, 0) /
      players.length;
    targetY =
      players.reduce((sum, player) => sum + player.y + player.height / 2, 0) /
      players.length;
  }

  const maxCamX = Math.max(world.width - viewWorldWidth, 0);
  const maxCamY = Math.max(world.height - viewWorldHeight, 0);
  const desiredCamX = clamp(targetX - viewWorldWidth * 0.5, 0, maxCamX);
  const desiredCamY = clamp(targetY - viewWorldHeight * 0.5, 0, maxCamY);
  if (maxCamX <= 0.01) {
    camera.x = 0;
  } else {
    camera.x += (desiredCamX - camera.x) * 0.12;
    camera.x = clamp(camera.x, 0, maxCamX);
  }
  if (maxCamY <= 0.01) {
    camera.y = 0;
  } else {
    camera.y += (desiredCamY - camera.y) * 0.12;
    camera.y = clamp(camera.y, 0, maxCamY);
  }

  // Keep the world floor pinned to the bottom of the viewport when
  // the level is shorter than the visible world height.
  const worldRenderOffsetY = Math.max(viewWorldHeight - world.height, 0);

  ctx.save();
  ctx.scale(worldScale, worldScale);
  const shake = !reduceMotion && Date.now() < shakeUntil ? 10 : 0;
  ctx.translate(
    -camera.x + (Math.random() - 0.5) * shake,
    -camera.y + worldRenderOffsetY + (Math.random() - 0.5) * shake
  );
  ctx.imageSmoothingEnabled = false;

  drawSolidTiles();
  drawDecorTiles();
  drawMovingPlatforms();

  if (assets.goal.loaded) {
    ctx.drawImage(
      assets.goal.image,
      world.goal.x,
      world.goal.y,
      world.goal.width,
      world.goal.height
    );
  } else {
    const pulse = 0.5 + Math.sin(Date.now() * 0.008) * 0.25;
    ctx.fillStyle = `rgba(255, 240, 90, ${0.45 + pulse * 0.35})`;
    ctx.fillRect(world.goal.x, world.goal.y, world.goal.width, world.goal.height);
    ctx.strokeStyle = "#fff49a";
    ctx.lineWidth = 3;
    ctx.strokeRect(world.goal.x, world.goal.y, world.goal.width, world.goal.height);
  }
  drawGoalSparkles(Date.now());

  if (players.length === 2) {
    const [p1, p2] = players;
    ctx.strokeStyle = "#f4f9ff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p1.x + p1.width / 2, p1.y + p1.height / 2);
    ctx.lineTo(p2.x + p2.width / 2, p2.y + p2.height / 2);
    ctx.stroke();
  }

  const now = Date.now();
  drawStaticEntities(now);
  drawEnemies(now);
  for (const player of players) {
    // Flicker while invulnerable after taking a hit, without ever vanishing.
    ctx.globalAlpha = player.inv && Math.floor(now / 80) % 2 === 0 ? 0.35 : 1;
    drawPlayerSprite(player, now);
    ctx.globalAlpha = 1;
  }
  drawEffects(now);

  drawWaterTiles();

  ctx.restore();

  drawHud();
  drawOverlays();
}

// --- Themes, entities, HUD and effects ------------------------------------

const THEME_INFO = {
  grass: { sky: ["#7fc8f8", "#8fd2b8", "#5a8f5a"], tint: null, blurb: "Find your way through the forest" },
  desert: { sky: ["#fbd38d", "#f6ad55", "#c0803a"], tint: "rgba(236, 170, 70, 0.42)", blurb: "Cross the scorching dunes" },
  cave: { sky: ["#1f1b2e", "#2c2540", "#141021"], tint: "rgba(60, 50, 110, 0.5)", blurb: "Delve into the crystal caves" },
  snow: { sky: ["#bfe3ff", "#e3f3ff", "#ffffff"], tint: "rgba(215, 235, 255, 0.55)", blurb: "Slide across the frozen peaks" },
  castle: { sky: ["#3b1d24", "#5a2328", "#1c0f14"], tint: "rgba(90, 90, 100, 0.55)", blurb: "Storm the haunted castle" },
  night: { sky: ["#0b1033", "#1b2a6b", "#32205e"], tint: "rgba(40, 50, 130, 0.45)", blurb: "Race beneath the stars" },
};
const ENEMY_SPRITE_NAMES = { g: "walker", k: "beetle", f: "flyer", s: "spiky", j: "jumper", x: "ghost", p: "popper" };
const ENEMY_SIZES = { g: [48, 44], k: [52, 40], f: [48, 36], s: [48, 44], j: [44, 44], x: [48, 48], p: [44, 60] };
const ENEMY_FALLBACK_COLORS = { g: "#a8672d", k: "#2f7fd1", f: "#8e5bd6", s: "#d64545", j: "#3fae54", x: "#f4f6ff", p: "#d6336c" };
const HUD_BAR_HEIGHT = 56;
const PIXEL_FONT = "'Press Start 2P', monospace";

const enemySprites = {};
for (const [symbol, name] of Object.entries(ENEMY_SPRITE_NAMES)) {
  enemySprites[symbol] = [
    loadImage(`assets/enemies/${name}_1.png`),
    loadImage(`assets/enemies/${name}_2.png`),
  ];
}
const itemSprites = {
  coin: [1, 2, 3, 4].map((frameNumber) => loadImage(`assets/items/coin_${frameNumber}.png`)),
  heart: loadImage("assets/items/heart.png"),
  spikes: loadImage("assets/items/spikes.png"),
  checkpoint: loadImage("assets/items/checkpoint.png"),
  checkpointOn: loadImage("assets/items/checkpoint_on.png"),
};
const themeAssetCache = {};
const effects = [];
let lastMusicKey = "";
let lastLocalVy = 0;
let lastWinBonus = 0;
let introWorldName = "";
let introStart = 0;
let shakeUntil = 0;
const reduceMotion =
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function getThemeName() {
  return world && THEME_INFO[world.theme] ? world.theme : "grass";
}

function getThemeInfo() {
  return THEME_INFO[getThemeName()];
}

function getThemeAssets(theme) {
  if (!themeAssetCache[theme]) {
    themeAssetCache[theme] = {
      block: loadImage(`assets/themes/${theme}/block.png`),
      block2: loadImage(`assets/themes/${theme}/block2.png`),
      bg: loadImage(`assets/themes/${theme}/bg.png`),
    };
  }
  return themeAssetCache[theme];
}

// Falls back to the forest block with a theme tint until themed art loads.
function getThemedBlock(symbol) {
  const theme = getThemeName();
  const base = symbol === "b" ? assets.block2 : assets.block;
  base.tint = null;
  if (theme === "grass") return base;
  const themed = getThemeAssets(theme);
  const asset = symbol === "b" ? themed.block2 : themed.block;
  if (asset.loaded) return asset;
  base.tint = THEME_INFO[theme].tint;
  return base;
}

function getThemeBackground() {
  const theme = getThemeName();
  if (theme === "grass") return assets.background;
  const bg = getThemeAssets(theme).bg;
  return bg.loaded ? bg : null;
}

function describeLevel(level) {
  const info = THEME_INFO[level.theme] || THEME_INFO.grass;
  return level.rows > level.cols ? "Climb toward the summit" : info.blurb;
}

// Pickup/checkpoint order must match the server's row-major scan so the
// `taken`/`cps` flag strings line up by index.
function getStaticEntities() {
  if (!world) return null;
  if (world.staticEntities) return world.staticEntities;
  const ts = Number(world.tileSize) || 64;
  const result = { pickups: [], spikes: [], checkpoints: [] };
  const rows = Array.isArray(world.entities) ? world.entities : [];
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y] || "";
    for (let x = 0; x < row.length; x += 1) {
      const symbol = row[x];
      if (symbol === "o" || symbol === "m") result.pickups.push({ kind: symbol, x: x * ts, y: y * ts });
      else if (symbol === "^") result.spikes.push({ x: x * ts, y: y * ts });
      else if (symbol === "c") result.checkpoints.push({ x: x * ts, y: y * ts });
    }
  }
  world.staticEntities = result;
  return result;
}

function drawSpriteOrFallback(asset, x, y, size, fallback) {
  if (asset && asset.loaded) {
    ctx.drawImage(asset.image, x, y, size, size);
    return;
  }
  fallback();
}

function drawStaticEntities(now) {
  const ents = getStaticEntities();
  if (!ents) return;
  const ts = Number(world.tileSize) || 64;
  const minX = camera.x - ts * 2;
  const maxX = camera.x + window.innerWidth + ts * 2;
  const taken = typeof state.taken === "string" ? state.taken : "";
  const cps = typeof state.cps === "string" ? state.cps : "";

  for (const spike of ents.spikes) {
    if (spike.x < minX || spike.x > maxX) continue;
    drawSpriteOrFallback(itemSprites.spikes, spike.x, spike.y, ts, () => {
      ctx.fillStyle = "#d9dee8";
      for (let i = 0; i < 4; i += 1) {
        const sx = spike.x + (i * ts) / 4;
        ctx.beginPath();
        ctx.moveTo(sx, spike.y + ts);
        ctx.lineTo(sx + ts / 8, spike.y + ts * 0.55);
        ctx.lineTo(sx + ts / 4, spike.y + ts);
        ctx.closePath();
        ctx.fill();
      }
    });
  }

  ents.checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.x < minX || checkpoint.x > maxX) return;
    const on = cps[index] === "1";
    drawSpriteOrFallback(on ? itemSprites.checkpointOn : itemSprites.checkpoint, checkpoint.x, checkpoint.y, ts, () => {
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(checkpoint.x + ts * 0.45, checkpoint.y + ts * 0.1, ts * 0.08, ts * 0.9);
      ctx.fillStyle = on ? "#3ddc97" : "#9aa3b2";
      ctx.beginPath();
      ctx.moveTo(checkpoint.x + ts * 0.53, checkpoint.y + ts * 0.12);
      ctx.lineTo(checkpoint.x + ts * 0.95, checkpoint.y + ts * 0.28);
      ctx.lineTo(checkpoint.x + ts * 0.53, checkpoint.y + ts * 0.46);
      ctx.closePath();
      ctx.fill();
    });
  });

  ents.pickups.forEach((pickup, index) => {
    if (taken[index] === "1" || pickup.x < minX || pickup.x > maxX) return;
    const bob = Math.sin(now * 0.005 + pickup.x * 0.01) * 4;
    const size = ts * 0.6;
    const px = pickup.x + ts * 0.2;
    const py = pickup.y + ts * 0.2 + bob;
    if (pickup.kind === "m") {
      drawSpriteOrFallback(itemSprites.heart, px, py, size, () => {
        ctx.fillStyle = "#ff4d6d";
        ctx.fillRect(px + size * 0.1, py + size * 0.2, size * 0.8, size * 0.4);
        ctx.fillRect(px + size * 0.3, py + size * 0.6, size * 0.4, size * 0.25);
      });
      return;
    }
    const frameIndex = Math.floor(now / 110) % 4;
    const frame = itemSprites.coin[frameIndex].loaded ? itemSprites.coin[frameIndex] : itemSprites.coin[0];
    drawSpriteOrFallback(frame, px, py, size, () => {
      const squash = [1, 0.65, 0.2, 0.65][frameIndex];
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(px + (size * (1 - squash)) / 2, py, size * squash, size);
      ctx.fillStyle = "#b8860b";
      ctx.fillRect(px + (size * (1 - squash * 0.4)) / 2, py + size * 0.2, size * squash * 0.4, size * 0.6);
    });
  });
}

function drawFallbackEnemy(type, x, y, w, h, dir, now) {
  const stepFrame = Math.floor(now / 220) % 2;
  ctx.fillStyle = ENEMY_FALLBACK_COLORS[type] || "#888888";
  ctx.fillRect(x, y + 6, w, h - 14);
  ctx.fillRect(x + 6, y, w - 12, 8);
  if (type === "s") {
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect(x + 4 + i * (w / 4), y - 8, 6, 10);
    }
  }
  if (type === "f") {
    ctx.fillStyle = "#d9c8ff";
    ctx.fillRect(x - 10, y + 4 + stepFrame * 6, 12, 8);
    ctx.fillRect(x + w - 2, y + 4 + stepFrame * 6, 12, 8);
  }
  if (type !== "f" && type !== "x" && type !== "p") {
    ctx.fillStyle = "#3b2314";
    ctx.fillRect(x + 4 + stepFrame * 4, y + h - 8, 14, 8);
    ctx.fillRect(x + w - 18 - stepFrame * 4, y + h - 8, 14, 8);
  }
  const eyeX = dir > 0 ? x + w * 0.5 : x + w * 0.12;
  const pupil = dir > 0 ? 4 : 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(eyeX, y + 12, 8, 10);
  ctx.fillRect(eyeX + 12, y + 12, 8, 10);
  ctx.fillStyle = "#111111";
  ctx.fillRect(eyeX + pupil, y + 16, 4, 6);
  ctx.fillRect(eyeX + 12 + pupil, y + 16, 4, 6);
}

function drawEnemies(now) {
  const list = Array.isArray(state.enemies) ? state.enemies : [];
  for (const entry of list) {
    if (!Array.isArray(entry)) continue;
    const [, type, x, y, dir, groundY] = entry;
    const size = ENEMY_SIZES[type];
    if (!size) continue;
    const frames = enemySprites[type];
    const frame = frames[Math.floor(now / 220) % 2];
    const sprite = frame.loaded ? frame : frames[0];
    ctx.save();
    if (type === "p") {
      // Poppers hide inside the ground: clip everything below the ground line.
      ctx.beginPath();
      ctx.rect(x - 20, y - 90, size[0] + 40, groundY - (y - 90));
      ctx.clip();
    }
    if (type === "x") ctx.globalAlpha = 0.85;
    if (sprite.loaded) {
      const drawSize = Math.max(size[0], size[1]) + 8;
      const drawX = x + size[0] / 2 - drawSize / 2;
      const drawY = y + size[1] - drawSize;
      if (dir > 0) {
        ctx.translate(drawX + drawSize / 2, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(sprite.image, -drawSize / 2, drawY, drawSize, drawSize);
      } else {
        ctx.drawImage(sprite.image, drawX, drawY, drawSize, drawSize);
      }
    } else {
      drawFallbackEnemy(type, x, y, size[0], size[1], dir, now);
    }
    ctx.restore();
  }
}

function playSfx(name) {
  try {
    if (window.GameAudio) window.GameAudio.sfx(name);
  } catch (_error) {
    // Audio is optional.
  }
}

function pushTextEffect(text, x, y, color, life = 800) {
  effects.push({ kind: "text", text, x, y, color, life, start: Date.now() });
}

function handleFx(payload = {}) {
  const type = payload.t;
  if (["coin", "stomp", "hurt", "die", "checkpoint", "heart", "win", "gameover"].includes(type)) {
    playSfx(type);
  }
  const x = Number(payload.x) || 0;
  const y = Number(payload.y) || 0;
  if (type === "stomp") {
    pushTextEffect(String(payload.pts || 100), x, y, "#ffffff");
    effects.push({ kind: "puff", x, y: y + 20, life: 300, start: Date.now() });
  } else if (type === "coin") {
    pushTextEffect("+50", x, y, "#ffd23f", 600);
  } else if (type === "heart") {
    pushTextEffect("1UP", x, y, "#7dff9b", 1200);
  } else if (type === "checkpoint") {
    pushTextEffect("CHECKPOINT!", x, y, "#7dd3ff", 1400);
  } else if (type === "hurt" || type === "die") {
    shakeUntil = Date.now() + 260;
    pushTextEffect(type === "hurt" ? "OUCH!" : "-1 LIFE", x, y, "#ff6b6b", 1000);
  } else if (type === "win") {
    lastWinBonus = Number(payload.bonus) || 0;
  }
  if (effects.length > 60) effects.splice(0, effects.length - 60);
}

socket.on("fx", handleFx);

function drawEffects(now) {
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const effect = effects[i];
    const progress = (now - effect.start) / effect.life;
    if (progress >= 1) {
      effects.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = 1 - progress * progress;
    if (effect.kind === "text") {
      const textY = effect.y - progress * 48;
      ctx.font = `14px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#1b1b2f";
      ctx.strokeText(effect.text, effect.x, textY);
      ctx.fillStyle = effect.color;
      ctx.fillText(effect.text, effect.x, textY);
    } else {
      const radius = 10 + progress * 26;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(effect.x - radius, effect.y - 4, 8, 8);
      ctx.fillRect(effect.x + radius - 8, effect.y - 4, 8, 8);
      ctx.fillRect(effect.x - 4, effect.y - radius, 8, 8);
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function getWorldLabel() {
  const name = world && world.name ? String(world.name) : "";
  const match = name.match(/\d+-\d+/);
  return match ? match[0] : name.split(" ")[0] || "1-1";
}

function drawHud() {
  const width = window.innerWidth;
  const scale = clamp(width / 960, 0.5, 1);
  ctx.fillStyle = "rgba(12, 14, 34, 0.86)";
  ctx.fillRect(0, 0, width, HUD_BAR_HEIGHT);
  ctx.fillStyle = "#ffd23f";
  ctx.fillRect(0, HUD_BAR_HEIGHT - 4, width, 4);

  const game = state.game || {};
  const columns = [
    ["SCORE", String(game.score || 0).padStart(6, "0")],
    ["COINS", `x${String(game.coins || 0).padStart(2, "0")}`],
    ["WORLD", getWorldLabel()],
    ["TIME", String(game.time || 0).padStart(3, "0")],
    ["LIVES", `x${game.lives || 0}`],
  ];
  ctx.textAlign = "center";
  columns.forEach(([label, value], index) => {
    const x = (width * (index + 0.5)) / columns.length;
    ctx.font = `${Math.round(10 * scale)}px ${PIXEL_FONT}`;
    ctx.fillStyle = "#ffd23f";
    ctx.fillText(label, x, 20);
    ctx.font = `${Math.round(16 * scale)}px ${PIXEL_FONT}`;
    ctx.fillStyle = label === "TIME" && (game.time || 0) <= 30 ? "#ff6b6b" : "#ffffff";
    ctx.fillText(value, x, 43);
  });
  ctx.textAlign = "left";
}

function drawOutlinedText(text, x, y, color) {
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#1b1b2f";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawOverlays() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = clamp(width / 960, 0.5, 1);
  ctx.textAlign = "center";
  if (state.status === "playing") {
    // Title card when a new level begins.
    if (world.name !== introWorldName) {
      introWorldName = world.name;
      introStart = Date.now();
    }
    const elapsed = Date.now() - introStart;
    if (elapsed < 2600) {
      const top = Math.round(height * 0.26);
      ctx.globalAlpha = elapsed > 2000 ? 1 - (elapsed - 2000) / 600 : 1;
      ctx.fillStyle = "rgba(10, 12, 30, 0.6)";
      ctx.fillRect(0, top, width, Math.round(120 * scale));
      ctx.font = `${Math.round(28 * scale)}px ${PIXEL_FONT}`;
      drawOutlinedText(`WORLD ${getWorldLabel()}`, width / 2, top + Math.round(56 * scale), "#ffd23f");
      ctx.font = `${Math.round(14 * scale)}px ${PIXEL_FONT}`;
      const title = String(world.name).replace(/^\d+-\d+\s*/, "").toUpperCase();
      drawOutlinedText(title, width / 2, top + Math.round(92 * scale), "#ffffff");
      ctx.globalAlpha = 1;
    }
  }
  if (state.status === "gameover") {
    ctx.fillStyle = "rgba(10, 6, 20, 0.72)";
    ctx.fillRect(0, HUD_BAR_HEIGHT, width, height - HUD_BAR_HEIGHT);
    ctx.font = `${Math.round(40 * scale)}px ${PIXEL_FONT}`;
    drawOutlinedText("GAME OVER", width / 2, height / 2 - 10, "#ff6b6b");
    ctx.font = `${Math.round(12 * scale)}px ${PIXEL_FONT}`;
    drawOutlinedText(
      String(state.cps || "").includes("1") ? "Continuing from the checkpoint..." : "Restarting the level...",
      width / 2,
      height / 2 + 34,
      "#ffffff"
    );
  } else if (state.status === "won") {
    ctx.font = `${Math.round(14 * scale)}px ${PIXEL_FONT}`;
    if (lastWinBonus > 0) {
      drawOutlinedText(`TIME BONUS +${lastWinBonus}`, width / 2, height / 2 - 24, "#ffd23f");
    }
    drawOutlinedText(
      isHost ? "PRESS ENTER OR TAP FOR THE NEXT LEVEL" : "WAITING FOR THE HOST TO CONTINUE...",
      width / 2,
      height / 2 + 12,
      "#ffffff"
    );
  }
  ctx.textAlign = "left";
}

function requestNextLevel() {
  if (!roomCode || !isHost || state.status !== "won" || !socket.connected) return;
  socket.emit("next-level", {}, () => {});
}

function syncMusic() {
  if (!window.GameAudio) return;
  let key = "menu";
  if (roomCode && state.started && world) {
    key = state.status === "won" ? "win" : state.status === "gameover" ? "gameover" : getThemeName();
  }
  if (key === lastMusicKey) return;
  lastMusicKey = key;
  try {
    window.GameAudio.playMusic(key);
  } catch (_error) {
    // Audio is optional.
  }
}

function trackLocalJump() {
  const me = getPlayerById(myId);
  if (!me) return;
  if (state.status === "playing" && input.jump && lastLocalVy > -300 && me.vy < -700) {
    playSfx("jump");
  }
  lastLocalVy = me.vy;
}

window.addEventListener("keydown", (event) => {
  if (menuOpen || !roomCode) return;
  if (event.key === "Enter") {
    requestNextLevel();
  } else if ((event.key === "r" || event.key === "R") && mySlot !== null && mySlot !== -1) {
    socket.emit("restart");
  }
});

canvas.addEventListener("pointerdown", () => {
  if (!menuOpen) requestNextLevel();
});
if (levelCompleteBannerEl) {
  levelCompleteBannerEl.addEventListener("click", requestNextLevel);
}

function frame() {
  drawWorld();
  requestAnimationFrame(frame);
}

updateSelectedLevelLabel();
void loadLevels();
openMenu("main");
syncMusic();
const invitedCode = normalizeRoomCode(new URLSearchParams(window.location.search).get("room"));
if (invitedCode.length === 5) {
  joinCodeInput.value = invitedCode;
  showMenuScreen("join");
  setMessage(joinStatusMsg, "You've been invited! Join when you're ready.");
}
frame();
