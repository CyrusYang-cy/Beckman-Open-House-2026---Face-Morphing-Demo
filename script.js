(() => {
  "use strict";

  const IMAGE_ROOT = "./images";
  const VALID_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"];
  const BASE_PAGE_TITLE = "Face Morphing Demo";
  const FILM_STRIP_SLOT_COUNT = 9;
  const FILM_STRIP_LABELS = [
    "First",
    "12%",
    "25%",
    "38%",
    "50%",
    "62%",
    "75%",
    "88%",
    "Last"
  ];

  const TRAIT_MORPH_CUES = {
    age: {
      towardFirst: "Younger",
      towardLast: "Older"
    },
    gender: {
      towardFirst: "More feminine",
      towardLast: "More masculine"
    },
    smart: {
      towardFirst: "Less smart",
      towardLast: "More smart"
    },
    dominant: {
      towardFirst: "Less dominant",
      towardLast: "More dominant"
    }
  };

  const DEFAULT_MORPH_CUES = {
    towardFirst: "Heading toward the start of this change",
    towardLast: "Heading toward the end of this change"
  };

  const canvas = document.getElementById("viewer");
  const ctx = canvas.getContext("2d", { alpha: false });
  const viewportWrap = document.querySelector(".viewport-wrap");
  const loadingPanel = document.getElementById("loading");
  const directionCueEl = document.getElementById("direction-cue");
  const filmStripSlots = [...document.querySelectorAll(".film-cell")].map((cell) => ({
    cell,
    img: cell.querySelector(".film-thumb")
  }));
  const currentRaceEl = document.getElementById("current-race");
  const currentTraitEl = document.getElementById("current-trait");

  const RACE_LABEL_MAP = {
    asian: "Asian",
    black: "Black",
    latine: "Latine",
    latinx: "Latine",
    latino: "Latine",
    latina: "Latine",
    white: "White"
  };

  const state = {
    identities: [],
    currentIdentityIndex: 0,
    currentTraitIndex: 0,
    frames: [],
    frameFloat: 0,
    currentIndex: -1,
    activeDirection: 0,
    speedFps: 0,
    maxSpeedFps: 65,
    acceleration: 160,
    cuePersistMs: 260,
    lastDirectionalInputTs: 0,
    lastDirectionalInputDir: 0,
    cueHideTimerId: null,
    rafId: null,
    lastTs: 0,
    keysDown: new Set(),
    devicePixelRatio: Math.max(1, window.devicePixelRatio || 1)
  };

  function updateDocumentTitle(suffix) {
    document.title = suffix ? `${BASE_PAGE_TITLE} — ${suffix}` : BASE_PAGE_TITLE;
  }

  function updateTitleForSelection() {
    const identity = getCurrentIdentity();
    const trait = getCurrentTrait();
    if (identity && trait) {
      updateDocumentTitle(`${formatRaceLabel(identity.name)} / ${formatTraitLabel(trait.name)}`);
      return;
    }
    updateDocumentTitle();
  }

  function toDisplayName(raw) {
    return String(raw).replace(/[_-]+/g, " ").trim() || "Unknown";
  }

  function formatRaceLabel(raw) {
    const key = toDisplayName(raw).toLowerCase().replace(/[\s_]+/g, "");
    if (key && Object.prototype.hasOwnProperty.call(RACE_LABEL_MAP, key)) {
      return RACE_LABEL_MAP[key];
    }
    const pretty = toDisplayName(raw);
    return pretty.replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function formatTraitLabel(raw) {
    const pretty = toDisplayName(raw);
    if (!pretty || pretty.toLowerCase() === "default") {
      return "—";
    }
    return pretty.replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function updateSidebarSelection() {
    const identity = getCurrentIdentity();
    const trait = getCurrentTrait();
    currentRaceEl.textContent = identity ? formatRaceLabel(identity.name) : "—";
    currentTraitEl.textContent = trait ? formatTraitLabel(trait.name) : "—";
  }

  function naturalSort(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }

  function joinPath(base, part) {
    return `${base.replace(/\/+$/, "")}/${String(part).replace(/^\/+/, "")}`;
  }

  function isImageFile(name) {
    const lower = String(name).toLowerCase();
    return VALID_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function normalizeFileName(name) {
    return String(name).trim().replace(/^.*[\\/]/, "");
  }

  function clampFrame(value) {
    if (!state.frames.length) {
      return 0;
    }
    return Math.min(state.frames.length - 1, Math.max(0, value));
  }

  function getMiddleFrameIndex(frameCount) {
    if (!frameCount) {
      return 0;
    }
    // For 1..59 => 30th frame (index 29), 1..119 => 60th frame (index 59).
    return Math.floor((frameCount - 1) / 2);
  }

  function getFilmStripIndices(frameCount) {
    const empty = Array.from({ length: FILM_STRIP_SLOT_COUNT }, () => 0);
    if (frameCount <= 0) {
      return empty;
    }
    const last = frameCount - 1;
    if (last === 0) {
      return empty;
    }
    return Array.from({ length: FILM_STRIP_SLOT_COUNT }, (_, slot) =>
      Math.round((slot / (FILM_STRIP_SLOT_COUNT - 1)) * last)
    );
  }

  function getNearestFilmStripSlot(frameIndex, keyIndices) {
    let bestSlot = 0;
    let bestDist = Infinity;
    for (let slot = 0; slot < keyIndices.length; slot += 1) {
      const dist = Math.abs(keyIndices[slot] - frameIndex);
      if (dist < bestDist || (dist === bestDist && slot < bestSlot)) {
        bestDist = dist;
        bestSlot = slot;
      }
    }
    return bestSlot;
  }

  function wrapIndex(value, count) {
    return ((value % count) + count) % count;
  }

  function getCurrentIdentity() {
    return state.identities[state.currentIdentityIndex] || null;
  }

  function getCurrentTrait() {
    const identity = getCurrentIdentity();
    if (!identity) {
      return null;
    }
    return identity.traits[state.currentTraitIndex] || null;
  }

  function normalizeTraitCueKey(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function classifyTraitForCues(traitName) {
    const k = normalizeTraitCueKey(traitName);
    if (!k) {
      return null;
    }
    const tokens = new Set(k.split(" "));
    if (tokens.has("smart") || /\bsmart\b/.test(k)) {
      return "smart";
    }
    if (tokens.has("dominant") || /\bdominan/.test(k)) {
      return "dominant";
    }
    if (tokens.has("gender") || /\bgender\b/.test(k)) {
      return "gender";
    }
    if (tokens.has("age") || k === "age") {
      return "age";
    }
    return null;
  }

  function getMorphCueTexts() {
    const trait = getCurrentTrait();
    const bucket = classifyTraitForCues(trait?.name);
    return bucket && TRAIT_MORPH_CUES[bucket] ? TRAIT_MORPH_CUES[bucket] : DEFAULT_MORPH_CUES;
  }

  function fillDirectionCueElement(direction, message) {
    directionCueEl.replaceChildren();
    const textSpan = document.createElement("span");
    textSpan.className = "cue-text";
    textSpan.textContent = message;
    const arrow = document.createElement("span");
    arrow.className = "cue-arrow";
    arrow.textContent = direction < 0 ? "\u2190" : "\u2192";
    if (direction < 0) {
      directionCueEl.append(arrow, textSpan);
    } else {
      directionCueEl.append(textSpan, arrow);
    }
  }

  function updateFilmStrip() {
    if (!state.frames.length) {
      for (const { cell, img } of filmStripSlots) {
        img.removeAttribute("src");
        img.removeAttribute("alt");
        cell.classList.remove("film-cell--active");
        cell.removeAttribute("aria-current");
      }
      return;
    }

    const keyIndices = getFilmStripIndices(state.frames.length);

    for (let slot = 0; slot < filmStripSlots.length; slot += 1) {
      const { img } = filmStripSlots[slot];
      const idx = keyIndices[slot];
      const frame = state.frames[idx];
      const label = FILM_STRIP_LABELS[slot] || `Step ${slot + 1}`;
      img.src = frame.src;
      img.alt = `${label} key frame (${idx + 1} of ${state.frames.length})`;
    }
  }

  function updateFilmStripHighlight(frameIndex) {
    if (!state.frames.length || !filmStripSlots.length) {
      return;
    }

    const keyIndices = getFilmStripIndices(state.frames.length);
    const activeSlot = getNearestFilmStripSlot(frameIndex, keyIndices);

    for (let slot = 0; slot < filmStripSlots.length; slot += 1) {
      const { cell } = filmStripSlots[slot];
      const isActive = slot === activeSlot;
      cell.classList.toggle("film-cell--active", isActive);
      if (isActive) {
        cell.setAttribute("aria-current", "true");
      } else {
        cell.removeAttribute("aria-current");
      }
    }
  }

  function clearCueHideTimer() {
    if (state.cueHideTimerId !== null) {
      window.clearTimeout(state.cueHideTimerId);
      state.cueHideTimerId = null;
    }
  }

  function scheduleCueRefresh(delayMs) {
    clearCueHideTimer();
    state.cueHideTimerId = window.setTimeout(() => {
      state.cueHideTimerId = null;
      updateDirectionCue();
    }, Math.max(0, delayMs));
  }

  function updateDirectionCue() {
    const now = performance.now();
    const leftHeld = state.keysDown.has("ArrowLeft");
    const rightHeld = state.keysDown.has("ArrowRight");
    const hasLinger = now - state.lastDirectionalInputTs <= state.cuePersistMs;
    const cueDirection = leftHeld && !rightHeld
      ? -1
      : rightHeld && !leftHeld
        ? 1
        : state.activeDirection !== 0
          ? state.activeDirection
          : hasLinger
            ? state.lastDirectionalInputDir
            : 0;

    const { towardFirst, towardLast } = getMorphCueTexts();

    if (cueDirection < 0) {
      directionCueEl.className = "direction-cue to-left";
      fillDirectionCueElement(-1, towardFirst);
      if (leftHeld || rightHeld || state.activeDirection !== 0) {
        clearCueHideTimer();
      } else {
        scheduleCueRefresh(state.cuePersistMs);
      }
      return;
    }

    if (cueDirection > 0) {
      directionCueEl.className = "direction-cue to-right";
      fillDirectionCueElement(1, towardLast);
      if (leftHeld || rightHeld || state.activeDirection !== 0) {
        clearCueHideTimer();
      } else {
        scheduleCueRefresh(state.cuePersistMs);
      }
      return;
    }

    clearCueHideTimer();
    directionCueEl.className = "direction-cue hidden";
    directionCueEl.replaceChildren();
  }

  async function fetchDirectoryDocument(dirPath) {
    const response = await fetch(`${dirPath.replace(/\/+$/, "")}/`, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const parser = new DOMParser();
    return parser.parseFromString(html, "text/html");
  }

  async function listDirectoryEntries(dirPath) {
    try {
      const doc = await fetchDirectoryDocument(dirPath);
      if (!doc) {
        return { dirs: [], files: [] };
      }

      const dirs = [];
      const files = [];
      const anchors = Array.from(doc.querySelectorAll("a"));

      for (const anchor of anchors) {
        const hrefRaw = anchor.getAttribute("href") || "";
        const href = decodeURIComponent(hrefRaw.split("?")[0].split("#")[0]);
        if (!href || href === "../" || href === "./") {
          continue;
        }

        if (href.endsWith("/")) {
          const dirName = href.replace(/\/+$/, "").replace(/^.*[\\/]/, "").trim();
          if (dirName) {
            dirs.push(dirName);
          }
        } else {
          const fileName = normalizeFileName(href);
          if (fileName) {
            files.push(fileName);
          }
        }
      }

      return {
        dirs: [...new Set(dirs)].sort(naturalSort),
        files: [...new Set(files)].sort(naturalSort)
      };
    } catch {
      return { dirs: [], files: [] };
    }
  }

  async function loadManifestForDir(dirPath) {
    try {
      const response = await fetch(joinPath(dirPath, "manifest.json"), { cache: "no-store" });
      if (!response.ok) {
        return [];
      }

      const manifest = await response.json();
      if (!Array.isArray(manifest)) {
        return [];
      }

      return manifest
        .map((item) => normalizeFileName(item))
        .filter((name) => !!name && isImageFile(name))
        .sort(naturalSort);
    } catch {
      return [];
    }
  }

  async function listImagePathsInDir(dirPath) {
    const manifestNames = await loadManifestForDir(dirPath);
    if (manifestNames.length) {
      return manifestNames.map((name) => joinPath(dirPath, name));
    }

    const entries = await listDirectoryEntries(dirPath);
    const imageNames = entries.files.filter(isImageFile).sort(naturalSort);
    return imageNames.map((name) => joinPath(dirPath, name));
  }

  async function discoverIdentityTraitMap() {
    const rootEntries = await listDirectoryEntries(IMAGE_ROOT);
    const identities = [];

    for (const identityName of rootEntries.dirs) {
      const identityPath = joinPath(IMAGE_ROOT, identityName);
      const identityEntries = await listDirectoryEntries(identityPath);
      const traits = [];

      if (identityEntries.dirs.length) {
        for (const traitName of identityEntries.dirs) {
          const traitPath = joinPath(identityPath, traitName);
          const imagePaths = await listImagePathsInDir(traitPath);
          if (imagePaths.length) {
            traits.push({ name: traitName, path: traitPath, imagePaths, frames: [] });
          }
        }
      } else {
        const imagePaths = await listImagePathsInDir(identityPath);
        if (imagePaths.length) {
          traits.push({ name: "default", path: identityPath, imagePaths, frames: [] });
        }
      }

      if (traits.length) {
        identities.push({ name: identityName, path: identityPath, traits });
      }
    }

    if (identities.length) {
      return identities;
    }

    const rootImages = await listImagePathsInDir(IMAGE_ROOT);
    if (rootImages.length) {
      return [
        {
          name: "images",
          path: IMAGE_ROOT,
          traits: [{ name: "default", path: IMAGE_ROOT, imagePaths: rootImages, frames: [] }]
        }
      ];
    }

    return [];
  }

  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.src = src;
      img.onload = async () => {
        try {
          if (typeof img.decode === "function") {
            await img.decode();
          }
        } catch {
          // Some browsers can reject decode for already-decoded images.
        }
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed loading ${src}`));
    });
  }

  async function preloadAllTraits() {
    const allTraits = state.identities.flatMap((identity) => identity.traits);
    const totalFrames = allTraits.reduce((sum, trait) => sum + trait.imagePaths.length, 0);

    if (!totalFrames) {
      return;
    }

    let loaded = 0;

    for (const trait of allTraits) {
      const frames = [];
      for (const imagePath of trait.imagePaths) {
        try {
          const img = await preloadImage(imagePath);
          frames.push(img);
        } finally {
          loaded += 1;
          const pct = Math.round((loaded / totalFrames) * 100);
          loadingPanel.textContent = `Loading frames... ${pct}%`;
        }
      }
      trait.frames = frames;
    }

    state.identities = state.identities
      .map((identity) => ({
        ...identity,
        traits: identity.traits.filter((trait) => trait.frames.length > 0)
      }))
      .filter((identity) => identity.traits.length > 0);
  }

  function setCanvasSize() {
    const rect = viewportWrap.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));

    canvas.width = Math.max(1, Math.floor(cssWidth * state.devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(cssHeight * state.devicePixelRatio));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(state.devicePixelRatio, state.devicePixelRatio);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  function drawFrame(index, force = false) {
    if (!state.frames.length) {
      return;
    }

    const clamped = Math.round(clampFrame(index));
    if (!force && clamped === state.currentIndex) {
      return;
    }

    const frame = state.frames[clamped];
    const cssWidth = canvas.width / state.devicePixelRatio;
    const cssHeight = canvas.height / state.devicePixelRatio;
    const srcWidth = frame.naturalWidth || frame.width || 1;
    const srcHeight = frame.naturalHeight || frame.height || 1;
    const scale = Math.min(cssWidth / srcWidth, cssHeight / srcHeight);
    const drawWidth = srcWidth * scale;
    const drawHeight = srcHeight * scale;
    const dx = (cssWidth - drawWidth) * 0.5;
    const dy = (cssHeight - drawHeight) * 0.5;

    ctx.fillStyle = "#0b0f1e";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.drawImage(frame, dx, dy, drawWidth, drawHeight);

    state.currentIndex = clamped;

    updateFilmStripHighlight(clamped);
  }

  function setActiveTrait(traitIndex, resetToMiddleFrame = false) {
    const identity = getCurrentIdentity();
    if (!identity || !identity.traits.length) {
      return;
    }

    state.currentTraitIndex = wrapIndex(traitIndex, identity.traits.length);
    const trait = getCurrentTrait();

    state.frames = trait.frames;
    const targetFrame = resetToMiddleFrame ? getMiddleFrameIndex(state.frames.length) : 0;
    state.frameFloat = targetFrame;
    state.currentIndex = -1;
    state.activeDirection = 0;
    state.speedFps = 0;
    state.keysDown.delete("ArrowLeft");
    state.keysDown.delete("ArrowRight");

    updateTitleForSelection();
    updateSidebarSelection();
    updateFilmStrip();
    updateDirectionCue();
    setCanvasSize();
    drawFrame(targetFrame, true);
  }

  function switchTrait(delta) {
    const identity = getCurrentIdentity();
    if (!identity || identity.traits.length < 2) {
      return;
    }

    setActiveTrait(state.currentTraitIndex + delta, true);
  }

  function switchIdentity(delta) {
    if (state.identities.length < 2) {
      return;
    }

    state.currentIdentityIndex = wrapIndex(state.currentIdentityIndex + delta, state.identities.length);
    setActiveTrait(state.currentTraitIndex, true);
  }

  function updateDirectionFromKeys() {
    if (state.keysDown.has("ArrowLeft") && !state.keysDown.has("ArrowRight")) {
      state.activeDirection = -1;
    } else if (state.keysDown.has("ArrowRight") && !state.keysDown.has("ArrowLeft")) {
      state.activeDirection = 1;
    } else {
      state.activeDirection = 0;
    }
    updateDirectionCue();
  }

  function animationStep(ts) {
    if (!state.lastTs) {
      state.lastTs = ts;
    }

    const deltaSec = Math.min(0.05, (ts - state.lastTs) / 1000);
    state.lastTs = ts;

    if (state.activeDirection !== 0) {
      state.speedFps = Math.min(state.maxSpeedFps, state.speedFps + state.acceleration * deltaSec);

      const proposed = state.frameFloat + (state.activeDirection * state.speedFps * deltaSec);
      const clamped = clampFrame(proposed);
      state.frameFloat = clamped;

      const atFirst = clamped <= 0 && state.activeDirection < 0;
      const atLast = clamped >= state.frames.length - 1 && state.activeDirection > 0;
      if (atFirst || atLast) {
        state.speedFps = 0;
        state.activeDirection = 0;
        updateDirectionCue();
      }
    } else {
      state.speedFps = 0;
    }

    drawFrame(Math.round(state.frameFloat));

    if (state.activeDirection !== 0) {
      state.rafId = requestAnimationFrame(animationStep);
    } else {
      state.rafId = null;
      state.lastTs = 0;
    }
  }

  function ensureAnimationRunning() {
    if (state.rafId === null) {
      state.rafId = requestAnimationFrame(animationStep);
    }
  }

  function handleKeyDown(event) {
    const key = event.key;
    const keyLower = key.toLowerCase();

    if (key === " " || event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) {
        switchIdentity(1);
      }
      return;
    }

    if (keyLower === "a" || keyLower === "d") {
      event.preventDefault();
      if (!event.repeat) {
        switchTrait(keyLower === "a" ? -1 : 1);
      }
      return;
    }

    if (key !== "ArrowLeft" && key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    state.lastDirectionalInputTs = performance.now();
    state.lastDirectionalInputDir = key === "ArrowRight" ? 1 : -1;

    const wasDown = state.keysDown.has(key);
    state.keysDown.add(key);
    updateDirectionFromKeys();

    if (!wasDown) {
      state.frameFloat = clampFrame(state.frameFloat + (key === "ArrowRight" ? 1 : -1));
      drawFrame(Math.round(state.frameFloat));
    }

    ensureAnimationRunning();
  }

  function handleKeyUp(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    state.keysDown.delete(event.key);
    updateDirectionFromKeys();

    if (state.activeDirection !== 0) {
      ensureAnimationRunning();
    }
  }

  function handleBlur() {
    state.keysDown.clear();
    state.activeDirection = 0;
    state.speedFps = 0;
    clearCueHideTimer();
    updateDirectionCue();
  }

  function handleResize() {
    state.devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    if (!state.frames.length) {
      return;
    }

    setCanvasSize();
    drawFrame(state.currentIndex >= 0 ? state.currentIndex : 0, true);
  }

  function isDocumentFullscreen() {
    const d = document;
    return !!(d.fullscreenElement || d.webkitFullscreenElement || d.msFullscreenElement);
  }

  function tryRequestFullscreen(event) {
    if (event && event.key === "Escape") {
      return;
    }
    if (isDocumentFullscreen()) {
      return;
    }

    const root = document.documentElement;
    const request =
      root.requestFullscreen ||
      root.webkitRequestFullscreen ||
      root.webkitRequestFullScreen ||
      root.msRequestFullscreen;

    if (!request) {
      return;
    }

    Promise.resolve(request.call(root)).catch(() => {});
  }

  function onFullscreenLayoutChange() {
    window.requestAnimationFrame(() => handleResize());
  }

  async function boot() {
    updateDocumentTitle("Loading…");
    loadingPanel.textContent = "Discovering frames…";

    state.identities = await discoverIdentityTraitMap();

    if (!state.identities.length) {
      loadingPanel.textContent = "No frame images found";
      updateDocumentTitle("No images in /images");
      return;
    }

    const traitCount = state.identities.reduce((sum, identity) => sum + identity.traits.length, 0);
    const frameCount = state.identities
      .flatMap((identity) => identity.traits)
      .reduce((sum, trait) => sum + trait.imagePaths.length, 0);

    loadingPanel.textContent = `Loading ${frameCount} frames…`;

    try {
      await preloadAllTraits();
    } catch (error) {
      loadingPanel.textContent = "Error while loading images";
      updateDocumentTitle("Load error");
      window.console.error(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    if (!state.identities.length) {
      loadingPanel.textContent = "No valid traits found";
      updateDocumentTitle("No valid traits");
      return;
    }

    loadingPanel.style.display = "none";

    state.currentIdentityIndex = 0;
    state.currentTraitIndex = 0;
    setActiveTrait(0);

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });
    window.addEventListener("blur", handleBlur);
    window.addEventListener("resize", handleResize);

    document.addEventListener("fullscreenchange", onFullscreenLayoutChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenLayoutChange);

    window.addEventListener("keydown", tryRequestFullscreen, { capture: true, passive: true });
  }

  boot();
})();
