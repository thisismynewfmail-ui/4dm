// localStorage-backed world store. Worlds keep a seed, a journal of block
// edits, container contents and the player's state including hyper-layer.

const WORLDS_KEY = '4dmc:worlds';
const SETTINGS_KEY = '4dmc:settings';
const worldKey = (id) => `4dmc:world:${id}`;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) { console.warn('save read failed', key, e); return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.error('save write failed', key, e); return false; }
}

export function listWorlds() {
  const w = readJSON(WORLDS_KEY, []);
  return Array.isArray(w) ? w.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)) : [];
}

export function createWorld({ name, seed, mode, wDepth }) {
  const worlds = listWorlds();
  const id = 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const meta = {
    id,
    name: (name || 'New World').slice(0, 40),
    seed: String(seed == null ? '' : seed),
    mode: mode || 'survival',
    wDepth: wDepth || 7,
    created: Date.now(),
    lastPlayed: Date.now(),
    playtime: 0,
    version: 1,
  };
  worlds.push(meta);
  writeJSON(WORLDS_KEY, worlds);
  writeJSON(worldKey(id), { edits: '', containers: [], facings: [], player: null, time: 6000, discovered: [] });
  return meta;
}

export function updateMeta(id, patch) {
  const worlds = listWorlds();
  const i = worlds.findIndex((w) => w.id === id);
  if (i < 0) return null;
  Object.assign(worlds[i], patch);
  writeJSON(WORLDS_KEY, worlds);
  return worlds[i];
}

export function deleteWorld(id) {
  const worlds = listWorlds().filter((w) => w.id !== id);
  writeJSON(WORLDS_KEY, worlds);
  try { localStorage.removeItem(worldKey(id)); } catch (e) { /* ignore */ }
}

export function duplicateWorld(id) {
  const meta = listWorlds().find((w) => w.id === id);
  if (!meta) return null;
  const copy = createWorld({ name: meta.name + ' (copy)', seed: meta.seed, mode: meta.mode, wDepth: meta.wDepth });
  const data = loadWorldData(id);
  saveWorldData(copy.id, data);
  return copy;
}

export function loadWorldData(id) {
  return readJSON(worldKey(id), { edits: '', containers: [], facings: [], player: null, time: 6000, discovered: [] });
}

export function saveWorldData(id, data) { return writeJSON(worldKey(id), data); }

export function getMeta(id) { return listWorlds().find((w) => w.id === id) || null; }

// --- settings --------------------------------------------------------------
export const DEFAULT_SETTINGS = {
  fov: 75,
  renderDistance: 4,
  mouseSensitivity: 0.0022,
  phaseScrollStep: 1,
  invertY: false,
  volume: 0.6,
  particles: true,
  showFps: false,
  hyperTape: true,
  smoothLighting: true,
  viewBob: true,
  autoSaveSeconds: 60,
  keys: {
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
    jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft',
    phase: 'KeyF', inventory: 'KeyE', drop: 'KeyQ', codex: 'KeyC',
    interact: 'KeyR', debug: 'F3', perspective: 'F5', screenshotHide: 'F1',
  },
};

export function loadSettings() {
  const s = readJSON(SETTINGS_KEY, null);
  if (!s) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const merged = Object.assign({}, DEFAULT_SETTINGS, s);
  merged.keys = Object.assign({}, DEFAULT_SETTINGS.keys, s.keys || {});
  return merged;
}
export function saveSettings(s) { writeJSON(SETTINGS_KEY, s); }

export function storageUsage() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('4dmc:')) total += (localStorage.getItem(k) || '').length;
    }
  } catch (e) { /* ignore */ }
  return total;
}
