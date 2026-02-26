const socket = io();

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const openMenuBtn = document.getElementById("open-menu-btn");
const resetRoundBtn = document.getElementById("reset-round-btn");
const resetVoteBannerEl = document.getElementById("reset-vote-banner");
const levelCompleteBannerEl = document.getElementById("level-complete-banner");
const waitingPlayerBannerEl = document.getElementById("waiting-player-banner");
const menuOverlay = document.getElementById("menu-overlay");
const menuLogo = document.getElementById("menu-logo");

const menuMainScreen = document.getElementById("menu-main-screen");
const menuPauseScreen = document.getElementById("menu-pause-screen");
const menuLevelSelectScreen = document.getElementById("menu-level-select-screen");
const menuHostScreen = document.getElementById("menu-host-screen");
const menuJoinScreen = document.getElementById("menu-join-screen");
const menuProfileScreen = document.getElementById("menu-profile-screen");

const levelListEl = document.getElementById("level-list");
const menuLevelBackBtn = document.getElementById("menu-level-back-btn");
const hostSelectedLevelEl = document.getElementById("host-selected-level");

const menuStartBtn = document.getElementById("menu-start-btn");
const menuJoinBtn = document.getElementById("menu-join-btn");
const menuSettingsBtn = document.getElementById("menu-settings-btn");
const menuEditorBanner = document.getElementById("menu-editor-banner");
const menuPauseResumeBtn = document.getElementById("menu-pause-resume-btn");
const menuPauseRestartBtn = document.getElementById("menu-pause-restart-btn");
const menuPauseQuitBtn = document.getElementById("menu-pause-quit-btn");

const menuCreateRoomBtn = document.getElementById("menu-create-room-btn");
const menuCopyCodeBtn = document.getElementById("menu-copy-code-btn");
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

const input = { left: false, right: false, jump: false };

let mySlot = null;
let myId = null;
let roomCode = null;
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
let createRoomAfterLevelPick = false;
let hasExplicitLevelSelection = false;
let tetherLimits = {
  min: 75,
  max: 395,
  defaultValue: 170,
};

let state = {
  roomCode: null,
  hostId: null,
  status: "waiting",
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
      : file.replace(/\.json$/i, "");

  return {
    file,
    name,
    rows: Math.max(0, Number(entry.rows) || 0),
    cols: Math.max(0, Number(entry.cols) || 0),
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

  if (!hasExplicitLevelSelection) {
    hostSelectedLevelEl.textContent = "";
    hostSelectedLevelEl.classList.add("hidden");
    return;
  }

  const selected = getSelectedLevelEntry();
  const levelName = selected ? selected.name : selectedLevelFile.replace(/\.json$/i, "");
  hostSelectedLevelEl.textContent = `Selected Level: ${levelName}`;
  hostSelectedLevelEl.classList.remove("hidden");
}

function handleLevelPicked(level) {
  if (!level || !level.file) {
    return;
  }

  const shouldCreateRoom = createRoomAfterLevelPick;
  createRoomAfterLevelPick = false;

  selectedLevelFile = level.file;
  hasExplicitLevelSelection = true;
  updateSelectedLevelLabel();
  if (Array.isArray(cachedLevels)) {
    renderLevelList(cachedLevels);
  }

  showMenuScreen("host");
  if (shouldCreateRoom) {
    requestCreateRoom();
    return;
  }

  setMessage(hostStatusMsg, `Selected level: ${level.name}.`);
}

function renderLevelList(levels) {
  if (!levelListEl) {
    return;
  }

  levelListEl.textContent = "";

  if (!Array.isArray(levels) || levels.length === 0) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "level-list-empty";
    emptyEl.textContent = "No level JSON files were found.";
    levelListEl.appendChild(emptyEl);
    return;
  }

  for (const level of levels) {
    const levelButton = document.createElement("button");
    levelButton.type = "button";
    levelButton.className = "level-list-item";
    if (level.file === selectedLevelFile) {
      levelButton.classList.add("active");
    }

    const nameEl = document.createElement("span");
    nameEl.className = "level-list-name";
    nameEl.textContent = level.name;

    const metaEl = document.createElement("span");
    metaEl.className = "level-list-meta";
    metaEl.textContent = level.file;

    levelButton.append(nameEl, metaEl);
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

function openLevelSelectForRoomCreate() {
  createRoomAfterLevelPick = true;
  showMenuScreen("levelSelect");
  void loadLevels();
}

function clearPendingMenuAction() {
  pendingMenuAction = false;
  if (pendingMenuTimer) {
    clearTimeout(pendingMenuTimer);
    pendingMenuTimer = null;
  }
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

function updateHostCodeUi() {
  if (!hostRoomCodeEl) {
    return;
  }
  if (roomCode && isHost) {
    hostRoomCodeEl.textContent = `Room Code: ${roomCode}`;
    hostRoomCodeEl.classList.remove("hidden");
    if (menuCreateRoomBtn) menuCreateRoomBtn.classList.add("hidden");
    if (menuCopyCodeBtn) menuCopyCodeBtn.classList.remove("hidden");
    if (menuPlayBtn) menuPlayBtn.classList.remove("hidden");
  } else {
    hostRoomCodeEl.classList.add("hidden");
    hostRoomCodeEl.textContent = "";
    if (menuCreateRoomBtn) menuCreateRoomBtn.classList.remove("hidden");
    if (menuCopyCodeBtn) menuCopyCodeBtn.classList.add("hidden");
    if (menuPlayBtn) menuPlayBtn.classList.add("hidden");
  }
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
  };

  for (const [name, element] of Object.entries(map)) {
    if (!element) {
      continue;
    }
    element.classList.toggle("hidden", name !== screen);
  }

  if (menuLogo) {
    menuLogo.classList.toggle("hidden", screen !== "main");
  }
  if (menuEditorBanner) {
    menuEditorBanner.classList.toggle("hidden", screen !== "main");
  }
  if (menuOverlay) {
    menuOverlay.classList.toggle("pause-mode", screen === "pause");
  }
}

function getDefaultMenuScreen() {
  return roomCode ? "pause" : "main";
}

function clearInputAndSync() {
  let changed = false;
  for (const key of Object.keys(input)) {
    if (input[key]) {
      input[key] = false;
      changed = true;
    }
  }
  if (changed && roomCode && mySlot !== null && mySlot !== -1) {
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
  if (!roomCode) {
    return;
  }
  menuOpen = false;
  menuOverlay.classList.remove("open");
  document.body.classList.remove("menu-open");
}

function clearLocalRoomState() {
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
    winnerAt: 0,
    players: [],
    spectators: 0,
    restartVotes: { voted: 0, required: 0 },
    movingPlatforms: [],
    serverTime: Date.now(),
  };
  facingByPlayerId.clear();
  updateResetVoteBanner();
  updateLevelCompleteBanner();
  updateWaitingPlayerBanner();
}

function leaveRoomToMainMenu() {
  if (roomCode) {
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
  clearPendingMenuAction();
  myId = payload.id || myId;
  mySlot = payload.slot;
  if (payload.profile !== undefined && payload.profile !== null) {
    myProfile = normalizeProfileIndex(payload.profile);
  }
  roomCode = payload.roomCode || null;
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

  if (isHost) {
    setMessage(hostStatusMsg, "Room created. Share code and wait for a partner.");
  } else {
    setMessage(joinStatusMsg, `Joined room ${roomCode}.`);
  }

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
    state.status === "waiting" &&
    (state.players || []).length < 2;
  waitingPlayerBannerEl.classList.toggle("hidden", !showBanner);
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
  if (menuOpen || !roomCode || mySlot === null || mySlot === -1) {
    return;
  }
  socket.emit("input", input);
}

function requestCreateRoom() {
  if (pendingMenuAction) {
    return;
  }

  if (!socket.connected) {
    setMessage(hostStatusMsg, "Not connected to server. Refresh and try again.", true);
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
  setMessage(hostStatusMsg, "Creating room...");
  pendingMenuTimer = setTimeout(() => {
    clearPendingMenuAction();
    setMessage(
      hostStatusMsg,
      "No response from server. Restart server and try again.",
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
    setMessage(joinStatusMsg, "Not connected to server. Refresh and try again.", true);
    return;
  }

  const code = normalizeRoomCode(joinCodeInput.value);
  joinCodeInput.value = code;
  if (!code) {
    setMessage(joinStatusMsg, "Enter a valid room code.", true);
    return;
  }

  pendingMenuAction = true;
  setMessage(joinStatusMsg, "Joining room...");
  pendingMenuTimer = setTimeout(() => {
    clearPendingMenuAction();
    setMessage(
      joinStatusMsg,
      "No response from server. Check code and restart server if needed.",
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
      closeMenu();
    }
  );
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
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
    createRoomAfterLevelPick = false;
    if (!(roomCode && isHost)) {
      hasExplicitLevelSelection = false;
    }
    showMenuScreen("host");
    updateSelectedLevelLabel();
    void loadLevels();
    updateHostCodeUi();
    if (roomCode && isHost) {
      setMessage(hostStatusMsg, "Room already active. You can adjust tether here.");
    } else {
      setMessage(hostStatusMsg, "Create a room to get a code.");
    }
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

if (menuPauseResumeBtn) {
  menuPauseResumeBtn.addEventListener("click", () => {
    closeMenu();
  });
}

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
  menuCreateRoomBtn.addEventListener("click", () => {
    if (roomCode && isHost) {
      requestCreateRoom();
      return;
    }
    openLevelSelectForRoomCreate();
  });
}

if (menuCopyCodeBtn) {
  menuCopyCodeBtn.addEventListener("click", async () => {
    if (!roomCode) {
      setMessage(hostStatusMsg, "No room code to copy.", true);
      return;
    }
    const copied = await copyTextToClipboard(roomCode);
    if (copied) {
      setMessage(hostStatusMsg, "Code copied to clipboard!");
      return;
    }
    setMessage(hostStatusMsg, "Failed to copy code.", true);
  });
}

if (menuPlayBtn) {
  menuPlayBtn.addEventListener("click", () => {
    if (!roomCode) {
      setMessage(hostStatusMsg, "Create a room first.", true);
      return;
    }
    closeMenu();
  });
}

if (menuLevelBackBtn) {
  menuLevelBackBtn.addEventListener("click", () => {
    createRoomAfterLevelPick = false;
    showMenuScreen("host");
  });
}

if (menuHostBackBtn) {
  menuHostBackBtn.addEventListener("click", () => {
    createRoomAfterLevelPick = false;
    showMenuScreen(roomCode ? "pause" : "main");
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
  applyRoomJoined(payload);
});

socket.on("state", (nextState = {}) => {
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
  if (statusEl) {
    statusEl.classList.remove("hidden");
  }
  statusEl.textContent = "Disconnected from server.";
  clearLocalRoomState();
  updateHostCodeUi();
  openMenu("main");
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
  sky.addColorStop(0, "#7fc8f8");
  sky.addColorStop(0.65, "#8fd2b8");
  sky.addColorStop(1, "#5a8f5a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const bg = assets.background;
  if (!bg.loaded) {
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

  const textY = player.y - 8;
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
      const blockAsset = symbol === "b" ? assets.block2 : assets.block;
      if (blockAsset.loaded) {
        ctx.drawImage(blockAsset.image, drawX, drawY, tileSize, tileSize);
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
  ctx.translate(-camera.x, -camera.y + worldRenderOffsetY);
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
  for (const player of players) {
    drawPlayerSprite(player, now);
  }

  drawWaterTiles();

  ctx.restore();

  const topBarHeight = 44;
  const textY = Math.round(topBarHeight * 0.58);
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, window.innerWidth, topBarHeight);
  ctx.fillStyle = "#ffffff";
  ctx.font = "14px 'Press Start 2P'";
  ctx.textAlign = "left";
  ctx.fillText(`Players: ${players.length}/2`, 18, textY);
  
  const tetherText = `Tether: ${getCurrentTetherLength()}px`;
  if (roomCode && isHost) {
    const minusText = "-";
    const plusText = "+";
    const gap = 16;
    const minusWidth = ctx.measureText(minusText).width;
    const tetherWidth = ctx.measureText(tetherText).width;
    const plusWidth = ctx.measureText(plusText).width;
    const totalWidth = minusWidth + gap + tetherWidth + gap + plusWidth;
    const startX = Math.round(window.innerWidth * 0.5 - totalWidth * 0.5);
    const minusX = startX;
    const tetherX = minusX + minusWidth + gap;
    const plusX = tetherX + tetherWidth + gap;

    ctx.textAlign = "left";
    ctx.fillStyle = "#f5f5f5";
    ctx.fillText(minusText, minusX, textY);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(tetherText, tetherX, textY);
    ctx.fillStyle = "#f5f5f5";
    ctx.fillText(plusText, plusX, textY);

    const hitTop = 6;
    const hitBottom = topBarHeight - 6;
    tetherAdjustHitboxes.minus = {
      x: minusX - 6,
      y: hitTop,
      width: minusWidth + 12,
      height: hitBottom - hitTop,
    };
    tetherAdjustHitboxes.plus = {
      x: plusX - 6,
      y: hitTop,
      width: plusWidth + 12,
      height: hitBottom - hitTop,
    };
  } else {
    tetherAdjustHitboxes.minus = null;
    tetherAdjustHitboxes.plus = null;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(tetherText, window.innerWidth / 2, textY);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`Room Code: ${roomCode || "-----"}`, window.innerWidth - 18, textY);
  ctx.textAlign = "left";
}

function frame() {
  drawWorld();
  requestAnimationFrame(frame);
}

updateSelectedLevelLabel();
void loadLevels();
openMenu("main");
frame();
