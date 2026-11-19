'use strict';
/* Metro Start — a Windows 8–style tile Start screen for Chrome's new tab page. */

// ---------------------------------------------------------------- constants
const PALETTE = ['#2d89ef', '#2b5797', '#00aba9', '#1e7145', '#00a300', '#99b433', '#e3a21a', '#ffc40d',
  '#da532c', '#ee1111', '#b91d47', '#ff0097', '#9f00a7', '#7e3878', '#603cba', '#1d1d1d'];
const BACKGROUNDS = ['#1f0068', '#2b0d4f', '#001e4e', '#004050', '#00451f', '#4e0038', '#5a1e00', '#2d2d2d', '#000000'];
const SIZES = { small: [1, 1], medium: [2, 2], wide: [4, 2], large: [4, 4] };
const SIZE_NAMES = { small: 'Small', medium: 'Medium', wide: 'Wide', large: 'Large' };
const UNIT_PX = { compact: 60, normal: 70, large: 86 };
const MAX_ROWS = 6;
const SIZE_GLYPHS = {
  small: '<rect x="7" y="7" width="6" height="6"/>',
  medium: '<rect x="4" y="4" width="12" height="12"/>',
  wide: '<rect x="1.5" y="6" width="17" height="8.5"/>',
  large: '<rect x="2" y="2" width="16" height="16"/>',
};
const DEFAULT_SETTINGS = {
  userName: '',
  showTitle: true,
  bg: { color: '#1f0068', image: '', dim: 25, credit: null },
  tileScale: 'normal',
  font: 'rounded',
  animations: true,
  flipOpen: false,
  parallax: true,
  flipDefaultOff: false,
  gamesAdded: false,
  gamesAdded2: false,
  gamesAdded3: false,
  widgetPos: 'left',
  clock24: false,
  showWeather: true,
  showNews: true,
  newsTopic: 'top',
  newsFeed: '',
  showStocks: true,
  stocks: ['^GSPC', '^DJI', '^IXIC'],
  units: 'f',
  location: { mode: 'auto' },
};

// ---------------------------------------------------------------- helpers
const $ = sel => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hasChrome = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const SPECIAL_SCHEME = /^(chrome|chrome-extension|edge|about|file):/i;
function normalizeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^(https?|ftp|mailto):/i.test(u) || SPECIAL_SCHEME.test(u)) return u;
  return 'https://' + u.replace(/^\/+/, '');
}
function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function prettyName(url) {
  const host = hostOf(url);
  if (!host) return url;
  const parts = host.split('.');
  const main = parts.length > 2 && parts[parts.length - 2].length <= 3 ? parts[parts.length - 3] : parts[parts.length - 2] || parts[0];
  return main.charAt(0).toUpperCase() + main.slice(1);
}
function faviconSrc(url) {
  const host = hostOf(url);
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : '';
}
function localFavicon(url) {
  if (!hasChrome) return '';
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', url);
  u.searchParams.set('size', '64');
  return u.toString();
}

function openUrl(url, newTab = false) {
  if (SPECIAL_SCHEME.test(url) && hasChrome && chrome.tabs) {
    if (newTab) chrome.tabs.create({ url, active: false });
    else chrome.tabs.update({ url });
    return;
  }
  if (newTab) window.open(url, '_blank', 'noopener');
  else location.href = url;
}

function webSearch(q) {
  if (hasChrome && chrome.search && chrome.search.query) chrome.search.query({ text: q, disposition: 'CURRENT_TAB' });
  else location.href = 'https://www.google.com/search?q=' + encodeURIComponent(q);
}

function readImage(file, maxDim, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(type, quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t a picture Chrome can read.')); };
    img.src = url;
  });
}

function pickFile(input) {
  return new Promise(resolve => {
    input.value = '';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

// ---------------------------------------------------------------- state
let tiles = [];
let settings = structuredClone(DEFAULT_SETTINGS);
let openFolderId = null;
let searchQuery = '';
let drag = null;

function link(title, url, color, size = 'medium') {
  return { id: uid(), type: 'link', title, url, color, size, icon: { mode: 'favicon' } };
}
function defaultTiles() {
  return [
    link('Google', 'https://www.google.com', '#2d89ef', 'wide'),
    link('YouTube', 'https://www.youtube.com', '#ee1111'),
    link('Gmail', 'https://mail.google.com', '#b91d47'),
    link('Maps', 'https://maps.google.com', '#1e7145', 'small'),
    link('Drive', 'https://drive.google.com', '#e3a21a', 'small'),
    link('Calendar', 'https://calendar.google.com', '#2b5797', 'small'),
    link('Photos', 'https://photos.google.com', '#da532c', 'small'),
    {
      id: uid(), type: 'folder', title: 'Social', color: '#603cba', size: 'medium', children: [
        link('Reddit', 'https://www.reddit.com', '#da532c'),
        link('LinkedIn', 'https://www.linkedin.com', '#2b5797'),
        link('Facebook', 'https://www.facebook.com', '#2d89ef'),
        link('X', 'https://x.com', '#1d1d1d'),
      ],
    },
    link('Wikipedia', 'https://www.wikipedia.org', '#1d1d1d'),
    link('Amazon', 'https://www.amazon.com', '#e3a21a', 'wide'),
    link('Netflix', 'https://www.netflix.com', '#b91d47'),
    link('News', 'https://news.google.com', '#00aba9'),
    gamesFolder(),
  ];
}
const GAME_ORDER = ['solitaire', 'minesweeper', 'sudoku', 'catnap', '2048', 'words', 'pairs', 'snake', 'blocks', 'bricks'];
const NEW_IN_1_9 = ['words', 'snake', 'blocks', 'bricks'];
const NEW_IN_1_12 = ['catnap', 'pairs'];
const gameTile = (game, size = 'medium') => ({ id: uid(), type: 'game', game, title: Games.LIST[game].title, color: Games.LIST[game].color, size });
// Just the games from a list of tiles, with any folders that hold games (other tiles in them are dropped)
function gamesOnly(list) {
  const out = [];
  for (const t of list) {
    if (t.type === 'game') out.push(t);
    else if (t.type === 'folder') {
      const kids = gamesOnly(t.children);
      if (kids.length) out.push({ ...t, children: kids });
    }
  }
  return out;
}
// Brings the Games folder back, or fills in any games missing from it
function restoreGames() {
  const have = new Set(everyTile().filter(x => x.tile.type === 'game').map(x => x.tile.game));
  const missing = GAME_ORDER.filter(g => !have.has(g));
  const folder = everyTile().map(x => x.tile).find(t => t.type === 'folder' && t.children.some(c => c.type === 'game'));
  if (!folder) {
    tiles.push(gamesFolder());
    commit();
    toast('Added the Games folder');
  } else if (missing.length) {
    missing.forEach(g => folder.children.push(gameTile(g)));
    commit();
    toast(`Added ${missing.length} game${missing.length === 1 ? '' : 's'} to “${folder.title}”`);
  } else {
    toast(`All the games are already in “${folder.title}”`);
  }
}
function gamesFolder() {
  return { id: uid(), type: 'folder', title: 'Games', color: '#00a300', size: 'medium', children: GAME_ORDER.map(g => gameTile(g)) };
}

const MAX_DEPTH = 12; // nesting limit, only to protect against broken backups
function sanitizeTile(t, depth = 0) {
  if (!t || typeof t !== 'object') return null;
  const base = {
    id: typeof t.id === 'string' && t.id ? t.id : uid(),
    title: String(t.title || '').slice(0, 80),
    color: /^#[0-9a-f]{3,8}$/i.test(t.color) ? t.color : PALETTE[0],
    size: SIZES[t.size] ? t.size : 'medium',
  };
  if (t.type === 'folder') {
    if (depth >= MAX_DEPTH) return null;
    const children = (Array.isArray(t.children) ? t.children : []).map(c => sanitizeTile(c, depth + 1)).filter(Boolean);
    return { ...base, type: 'folder', title: base.title || 'Folder', children };
  }
  if (t.type === 'game') {
    const g = Games.LIST[t.game];
    return g ? { ...base, type: 'game', game: t.game, title: base.title || g.title } : null;
  }
  const url = normalizeUrl(t.url);
  if (!url) return null;
  const mode = ['favicon', 'letter', 'image'].includes(t.icon && t.icon.mode) ? t.icon.mode : 'favicon';
  const icon = { mode };
  if (mode === 'image') {
    icon.src = String(t.icon.src || '');
    icon.fill = !!t.icon.fill;
    if (!icon.src) icon.mode = 'favicon';
  }
  if (t.icon && typeof t.icon.siteIcon === 'string' && /^(https?:|data:image\/)/.test(t.icon.siteIcon)) icon.siteIcon = t.icon.siteIcon;
  return { ...base, type: 'link', url, title: base.title || hostOf(url) || url, icon };
}
const sanitizeTiles = list => (Array.isArray(list) ? list : []).map(t => sanitizeTile(t, 0)).filter(Boolean);

function mergeSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...s,
    bg: { ...DEFAULT_SETTINGS.bg, ...(s.bg || {}) },
    location: { ...DEFAULT_SETTINGS.location, ...(s.location || {}) },
  };
}

async function load() {
  const stored = await Store.get('tiles', null);
  tiles = Array.isArray(stored) ? sanitizeTiles(stored) : defaultTiles();
  settings = mergeSettings(await Store.get('settings', null));
}

async function saveTiles() {
  try { await Store.set('tiles', tiles); } catch (e) { toast('Couldn’t save your tiles: ' + e.message); }
}
async function saveSettings() {
  try { await Store.set('settings', settings); } catch (e) { toast('Couldn’t save settings: ' + e.message); }
}
const saveSettingsSoon = debounce(saveSettings, 400);

// Finds a tile at any depth: { tile, list it sits in, parent folder (null on Start) }
function findTile(id, list = tiles, parent = null) {
  for (const t of list) {
    if (t.id === id) return { tile: t, list, parent };
    if (t.type === 'folder') {
      const found = findTile(id, t.children, t);
      if (found) return found;
    }
  }
  return null;
}
function findFolder(id) {
  const f = id && findTile(id);
  return f && f.tile.type === 'folder' ? f.tile : null;
}
// Folders from Start down to (not including) the tile
function pathTo(id) {
  const path = [];
  let f = findTile(id);
  while (f && f.parent) { path.unshift(f.parent); f = findTile(f.parent.id); }
  return path;
}
// Is `id` the folder itself or somewhere inside it?
function isInside(folder, id) {
  return folder.id === id || folder.children.some(c => c.type === 'folder' && isInside(c, id));
}
// Every tile at any depth, with its folder path
function everyTile(list = tiles, path = [], out = []) {
  for (const t of list) {
    out.push({ tile: t, path });
    if (t.type === 'folder') everyTile(t.children, [...path, t], out);
  }
  return out;
}
const allLinksDeep = () => everyTile().map(x => x.tile).filter(t => t.type === 'link');

function commit() {
  saveTiles();
  renderGrid();
  if (openFolderId) renderFolder();
}

function moveTile(id, toFolderId, refId = null, after = false) {
  const src = findTile(id);
  if (!src) return;
  const destFolder = toFolderId ? findFolder(toFolderId) : null;
  const dest = toFolderId ? destFolder && destFolder.children : tiles;
  if (!dest) return;
  // a folder can't go inside itself or one of its own subfolders
  if (src.tile.type === 'folder' && destFolder && isInside(src.tile, destFolder.id)) {
    toast('A folder can’t go inside itself.');
    return;
  }
  src.list.splice(src.list.indexOf(src.tile), 1);
  let idx = refId ? dest.findIndex(x => x.id === refId) : -1;
  if (idx < 0) idx = dest.length;
  else if (after) idx++;
  dest.splice(idx, 0, src.tile);
  commit();
}

function deleteTile(id) {
  const f = findTile(id);
  if (!f) return;
  const snapshot = JSON.stringify(tiles);
  f.list.splice(f.list.indexOf(f.tile), 1);
  if (openFolderId && f.tile.type === 'folder' && isInside(f.tile, openFolderId)) closeFolder();
  commit();
  toast(`Deleted “${f.tile.title}”`, { label: 'Undo', run: () => { tiles = JSON.parse(snapshot); commit(); } });
}

// ---------------------------------------------------------------- DOM refs
const grid = $('#grid');
const scroller = $('#grid-scroller');
const searchInput = $('#search');
const infoBar = $('#info-bar');
const weatherWidget = $('#weather-widget');
const folderOverlay = $('#folder-overlay');
const folderGrid = $('#folder-grid');
const folderTitle = $('#folder-title');
const ctx = $('#ctx');
const settingsPanel = $('#settings');
const settingsScrim = $('#settings-scrim');

function openOverlay(el) {
  el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
}
function closeOverlay(el) {
  el.classList.remove('open');
  el.hidden = true;
}

// ---------------------------------------------------------------- tiles
function tileIcon(t) {
  const icon = t.icon || { mode: 'favicon' };
  const letter = () => h('span', { class: 'tile-letter' }, (t.title || hostOf(t.url) || '?').trim().charAt(0).toUpperCase());
  if (icon.mode === 'letter') return letter();
  // site icons: the one saved at import, then Google's icon service, then Chrome's own cache, then a letter
  const sources = (icon.mode === 'image' ? [icon.src] : [icon.siteIcon, faviconSrc(t.url), localFavicon(t.url)]).filter(Boolean);
  if (!sources.length) return letter();
  const img = h('img', {
    class: 'tile-icon' + (icon.mode === 'image' && icon.fill ? ' fill' : ''),
    src: sources[0], alt: '', draggable: 'false', loading: 'lazy', referrerpolicy: 'no-referrer',
  });
  let next = 1;
  img.addEventListener('error', () => {
    if (next < sources.length) img.src = sources[next++];
    else img.replaceWith(letter());
  });
  return img;
}

const FOLDER_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>';
function folderPreview(f) {
  const max = { small: 4, medium: 4, wide: 8, large: 9 }[f.size] || 4;
  const wrap = h('div', { class: 'folder-preview' });
  const kids = f.children.slice(0, max);
  for (const c of kids) {
    wrap.append(h('div', { class: 'mini' + (c.type === 'folder' ? ' mini-folder' : ''), style: { background: c.color } },
      c.type === 'folder' ? h('span', { class: 'mini-glyph', html: FOLDER_GLYPH })
        : c.type === 'game' ? (c.game === '2048' ? h('span', { class: 'mini-2048' }, '2048') : h('span', { class: 'mini-glyph', html: Games.GLYPHS[c.game] || '' }))
          : tileIcon(c)));
  }
  if (!kids.length) wrap.append(h('div', { class: 'folder-empty' }, f.size === 'small' ? '' : 'Empty'));
  return wrap;
}

function gameFace(t) {
  if (t.game === '2048') return h('div', { class: 'tile-face' }, h('span', { class: 'tile-2048' }, '2048'));
  return h('div', { class: 'tile-face' }, h('span', { class: 'game-glyph', html: Games.GLYPHS[t.game] || '' }));
}
// The address shown under a site's name: no "https://", no "www.", no trailing slash
function displayUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return url;
    const path = (u.pathname + u.search).replace(/\/+$/, '');
    return u.hostname.replace(/^www\./, '') + (path === '/' ? '' : path);
  } catch { return url; }
}
function tileEl(t, { draggable = true, preview = false } = {}) {
  const isFolder = t.type === 'folder';
  const isGame = t.type === 'game';
  const isButton = (isFolder || isGame) && !preview;
  const [cols, rows] = SIZES[t.size] || SIZES.medium;
  const fill = !isFolder && t.icon && t.icon.mode === 'image' && t.icon.fill;
  const el = h(isFolder || isGame || preview ? 'div' : 'a', {
    class: `tile size-${t.size}` + (isFolder ? ' folder' : '') + (isGame ? ' game' : '') + (fill ? ' has-fill' : ''),
    style: { background: t.color, ...(preview ? {} : { gridColumn: `span ${cols}`, gridRow: `span ${rows}` }) },
    dataset: preview ? {} : { id: t.id },
    draggable: draggable && !preview ? 'true' : 'false',
    href: isFolder || isGame || preview ? null : t.url,
    tabindex: isButton ? '0' : null,
    role: isButton ? 'button' : null,
    title: preview ? null : isFolder ? `${t.title} (${t.children.length})` : isGame ? `Play ${t.title}` : `${t.title}\n${t.url}`,
  });
  if (isFolder) el.append(folderPreview(t), h('span', { class: 'tile-count' }, String(t.children.length), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));
  else if (isGame) el.append(gameFace(t));
  else if (!fill && t.size !== 'small') {
    el.classList.add('site');
    el.append(h('div', { class: 'site-head' },
      h('div', { class: 'site-icon' }, tileIcon(t)),
      h('div', { class: 'site-text' },
        h('span', { class: 'site-name' }, t.title),
        h('span', { class: 'site-url' }, displayUrl(t.url)))));
    return el;
  }
  else el.append(h('div', { class: 'tile-face' }, tileIcon(t)));
  if (t.size !== 'small') {
    el.append(isFolder
      ? h('span', { class: 'tile-label' }, h('span', { class: 'label-glyph', html: FOLDER_GLYPH }), h('span', { class: 'label-text' }, t.title))
      : h('span', { class: 'tile-label' }, t.title));
  }
  return el;
}

// ---- layout: tiles keep their order. They flow left to right, top to bottom inside groups that are
// GROUP_COLS units wide (like Windows 8), and groups continue to the right. A tile only moves forward to find
// room, never back into an earlier gap, so what comes first in the list always comes first on screen.
const GROUP_COLS = 4;
function packTiles(list, groupCols, rows) {
  const used = new Set();
  const free = (c, r, w, hh) => {
    for (let x = c; x < c + w; x++) for (let y = r; y < r + hh; y++) if (used.has(`${x},${y}`)) return false;
    return true;
  };
  const perGroup = groupCols * rows;
  let cursor = 0;
  return list.map(t => {
    let [w, hh] = SIZES[t.size] || SIZES.medium;
    w = Math.min(w, groupCols);
    hh = Math.min(hh, rows);
    for (let i = cursor; ; i++) {
      const g = Math.floor(i / perGroup);
      const r = Math.floor((i % perGroup) / groupCols);
      const c = i % groupCols;
      if (c + w > groupCols || r + hh > rows) continue;
      const x = g * groupCols + c;
      // keep the tile inside its group (rows is finite for Start, effectively unlimited in a folder)
      if (!free(x, g * rows + r, w, hh)) continue;
      for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < hh; dy++) used.add(`${x + dx},${g * rows + r + dy}`);
      cursor = i + 1;
      return { group: g, col: c, row: r, w, h: hh };
    }
  });
}
// Start screen: groups side by side, with a little extra space between them
function placeOnStart(els, list, rows) {
  const spots = packTiles(list, GROUP_COLS, rows);
  const groups = spots.reduce((n, p) => Math.max(n, p.group + 1), 1);
  const cols = [];
  for (let g = 0; g < groups; g++) cols.push(`repeat(${GROUP_COLS}, var(--unit))`, g < groups - 1 ? 'calc(var(--unit) * .3)' : '');
  grid.style.gridTemplateColumns = cols.filter(Boolean).join(' ');
  els.forEach((el, i) => {
    const p = spots[i];
    el.style.gridColumn = `${p.group * (GROUP_COLS + 1) + p.col + 1} / span ${p.w}`;
    el.style.gridRow = `${p.row + 1} / span ${p.h}`;
  });
}
// A folder: one group as wide as the folder band, as many rows as needed
function placeInFolder(els, list) {
  const unit = UNIT_PX[settings.tileScale] || 70;
  const gap = Math.round(unit / 7);
  const cols = Math.max(GROUP_COLS, Math.floor((folderGrid.clientWidth - 8 + gap) / (unit + gap)));
  const spots = packTiles(list, cols, 100000);
  folderGrid.style.gridTemplateColumns = `repeat(${cols}, var(--unit))`;
  els.forEach((el, i) => {
    el.style.gridColumn = `${spots[i].col + 1} / span ${spots[i].w}`;
    el.style.gridRow = `${spots[i].row + 1} / span ${spots[i].h}`;
  });
}
let startRows = 6;

function searchResults(q) {
  return everyTile().map(x => x.tile).filter(t => `${t.title} ${t.url || ''}`.toLowerCase().includes(q));
}

function renderGrid({ animate = false } = {}) {
  requestAnimationFrame(() => updateParallax());
  const q = searchQuery.trim().toLowerCase();
  const list = q ? searchResults(q) : tiles;
  const els = list.map(t => tileEl(t, { draggable: !q }));
  placeOnStart(els, list, startRows);
  grid.replaceChildren(...els);
  const hint = $('#empty-hint');
  hint.hidden = list.length > 0;
  hint.textContent = q
    ? `No tiles match “${searchQuery.trim()}”. Press Enter to search the web.`
    : 'Your Start screen is empty. Select + to add a tile or import your bookmarks.';
  if (animate && settings.animations) entrance(grid);
}

function entrance(container) {
  const left = container.getBoundingClientRect().left;
  for (const el of container.children) {
    const dx = el.getBoundingClientRect().left - left;
    el.style.animationDelay = Math.min(dx * 0.35, 650) + 'ms';
    el.classList.add('enter');
    el.addEventListener('animationend', () => { el.classList.remove('enter'); el.style.animationDelay = ''; }, { once: true });
  }
}

function layoutGrid() {
  const unit = UNIT_PX[settings.tileScale] || 70;
  const gap = Math.round(unit / 7);
  const root = document.documentElement.style;
  root.setProperty('--unit', unit + 'px');
  root.setProperty('--gap', gap + 'px');
  const avail = scroller.clientHeight - 40; // grid's vertical padding
  let rows = Math.floor((avail + gap) / (unit + gap));
  rows = Math.min(MAX_ROWS, Math.max(4, rows - (rows % 2)));
  grid.style.gridTemplateRows = `repeat(${rows}, var(--unit))`;
  if (rows !== startRows) { startRows = rows; renderGrid(); }
}



// ---- flip on open: the tile turns over like a card, shows what's opening, then opens it
function flipThen(el, t, done) {
  if (!settings.flipOpen || !settings.animations || matchMedia('(prefers-reduced-motion: reduce)').matches || el.closest('.preview-stage')) { done(); return; }
  if (el.classList.contains('flipping')) return;
  el.style.transform = '';
  el.classList.add('flipping', 'flip-out');
  const back = t.type === 'folder' ? `${t.children.length} item${t.children.length === 1 ? '' : 's'}`
    : t.type === 'game' ? 'Play' : hostOf(t.url) || t.title;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; done(); setTimeout(() => resetFlip(el), 700); };
  el.addEventListener('animationend', () => {
    el.classList.remove('flip-out');
    el.append(h('div', { class: 'tile-back' }, h('span', { class: 'tile-back-text' }, back)));
    el.classList.add('flipped', 'flip-in');
    el.addEventListener('animationend', finish, { once: true });
  }, { once: true });
  setTimeout(finish, 900); // in case an animation event never arrives
}
function resetFlip(el) {
  el.classList.remove('flipping', 'flip-out', 'flip-in', 'flipped');
  el.querySelectorAll('.tile-back').forEach(b => b.remove());
}
// coming back with the browser's Back button can restore a half-flipped page
window.addEventListener('pageshow', () => document.querySelectorAll('.tile.flipping').forEach(resetFlip));

// ---- shared tile interactions (main grid + folder grid)
function bindTileEvents(container, getFolderId) {
  container.addEventListener('click', e => {
    const el = e.target.closest('.tile');
    if (!el) return;
    const f = findTile(el.dataset.id);
    if (!f) return;
    const t = f.tile;
    if (t.type === 'folder') { e.preventDefault(); flipThen(el, t, () => openFolder(t.id)); return; }
    if (t.type === 'game') { e.preventDefault(); flipThen(el, t, () => openGame(t.game)); return; }
    const newTab = e.ctrlKey || e.metaKey || e.shiftKey;
    if (newTab) {
      // the browser opens ordinary links in a new tab by itself
      if (SPECIAL_SCHEME.test(t.url)) { e.preventDefault(); openUrl(t.url, true); }
      return;
    }
    e.preventDefault();
    flipThen(el, t, () => openUrl(t.url, false));
  });
  container.addEventListener('auxclick', e => {
    const el = e.target.closest('.tile');
    const f = el && findTile(el.dataset.id);
    if (e.button === 1 && f && f.tile.type === 'link' && SPECIAL_SCHEME.test(f.tile.url)) { e.preventDefault(); openUrl(f.tile.url, true); }
  });
  container.addEventListener('keydown', e => {
    const el = e.target.closest('.tile[role="button"]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
  });
  container.addEventListener('contextmenu', e => tileMenu(e, getFolderId()));

  // the Windows 8 "press" tilt: the tile leans away from where you press it
  container.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !settings.animations) return;
    const el = e.target.closest('.tile');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * 16}deg) rotateX(${-y * 16}deg) scale(.97)`;
    const reset = () => {
      el.style.transform = '';
      window.removeEventListener('pointerup', reset);
      window.removeEventListener('pointercancel', reset);
      el.removeEventListener('dragstart', reset);
    };
    window.addEventListener('pointerup', reset);
    window.addEventListener('pointercancel', reset);
    el.addEventListener('dragstart', reset);
  });

  // drag and drop: reorder, or drop a link onto the middle of a folder to file it
  container.addEventListener('dragstart', e => {
    const el = e.target.closest && e.target.closest('.tile');
    if (!el || searchQuery) { e.preventDefault(); return; }
    drag = { id: el.dataset.id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.dataset.id);
    requestAnimationFrame(() => el.classList.add('dragging'));
    hideMenu();
  });
  container.addEventListener('dragover', e => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    const el = e.target.closest('.tile');
    if (!el || el.dataset.id === drag.id) return;
    el.classList.add('drop-' + dropMode(el, e));
  });
  container.addEventListener('drop', e => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    const id = drag.id;
    const el = e.target.closest('.tile');
    clearDropMarks();
    if (!el) { moveTile(id, getFolderId()); return; }
    if (el.dataset.id === id) return;
    const mode = dropMode(el, e);
    if (mode === 'into') moveTile(id, el.dataset.id);
    else moveTile(id, getFolderId(), el.dataset.id, mode === 'after');
  });
}

// dragend fires on the original element, which may already be re-rendered away, so listen globally
document.addEventListener('dragend', () => {
  document.querySelectorAll('.dragging').forEach(x => x.classList.remove('dragging'));
  folderOverlay.classList.remove('drop-out');
  clearDropMarks();
  drag = null;
});

function dropMode(el, e) {
  const target = findTile(el.dataset.id);
  const dragged = findTile(drag.id);
  const r = el.getBoundingClientRect();
  const rx = (e.clientX - r.left) / r.width;
  const canNest = target && dragged && target.tile.type === 'folder' &&
    (dragged.tile.type !== 'folder' || !isInside(dragged.tile, target.tile.id));
  if (canNest && rx > 0.22 && rx < 0.78) return 'into';
  return rx < 0.5 ? 'before' : 'after';
}
function clearDropMarks() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
}

// ---------------------------------------------------------------- context menu
function showMenu(x, y, items) {
  ctx.replaceChildren(...items.map(it => {
    if (it === '-') return h('div', { class: 'ctx-sep' });
    if (it.header) return h('div', { class: 'ctx-header' }, it.header);
    if (it.sizes) {
      return h('div', { class: 'ctx-sizes' },
        h('span', { class: 'ctx-sizes-label' }, 'Size'),
        Object.keys(SIZES).map(s => h('button', {
          type: 'button', class: 'ctx-size' + (s === it.current ? ' on' : ''), title: SIZE_NAMES[s], 'aria-label': SIZE_NAMES[s],
          html: `<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">${SIZE_GLYPHS[s]}</svg>`,
          onclick: () => { hideMenu(); it.onPick(s); },
        })));
    }
    return h('button', {
      type: 'button', role: 'menuitem', class: 'ctx-item' + (it.danger ? ' danger' : ''),
      onclick: () => { hideMenu(); it.action(); },
    }, it.label);
  }));
  ctx.style.left = '0px';
  ctx.style.top = '0px';
  ctx.hidden = false;
  const r = ctx.getBoundingClientRect();
  ctx.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  ctx.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  const first = ctx.querySelector('.ctx-item');
  if (first) first.focus({ preventScroll: true });
}
function hideMenu() { ctx.hidden = true; }

function addMenu(x, y, parentId = null) {
  showMenu(x, y, [
    { label: 'Add a tile', action: () => openEditor({ type: 'link', parentId }) },
    { label: 'Add a folder', action: () => openEditor({ type: 'folder', parentId }) },
    { label: 'Add a game…', action: () => setTimeout(() => gameMenu(x, y, parentId), 0) },
    ...(parentId ? [] : [{ label: 'Import bookmarks…', action: openBookmarkImport }]),
    '-',
    { label: 'Personalize…', action: openSettings },
  ]);
}

function gameMenu(x, y, parentId) {
  showMenu(x, y, [{ label: 'All games (Games folder)', action: restoreGames }, '-', { header: 'Add one game' }, ...Object.entries(Games.LIST).map(([id, g]) => ({
    label: g.title,
    action: () => {
      const t = gameTile(id);
      const parent = findFolder(parentId);
      (parent ? parent.children : tiles).push(t);
      commit();
      toast(`Added ${g.title}`);
    },
  }))]);
}

function tileMenu(e, folderId) {
  e.preventDefault();
  const el = e.target.closest('.tile');
  const x = e.clientX || (el ? el.getBoundingClientRect().left + 20 : 40);
  const y = e.clientY || (el ? el.getBoundingClientRect().top + 20 : 40);
  if (!el) { addMenu(x, y, folderId); return; }
  const f = findTile(el.dataset.id);
  if (!f) return;
  const t = f.tile;
  const items = [];
  if (t.type === 'folder') items.push({ label: 'Open', action: () => openFolder(t.id) });
  else if (t.type === 'game') items.push({ label: 'Play', action: () => openGame(t.game) });
  else items.push({ label: 'Open in new tab', action: () => openUrl(t.url, true) });
  items.push({ label: 'Edit…', action: () => openEditor({ tile: t }) });
  items.push({ sizes: true, current: t.size, onPick: s => { t.size = s; commit(); } });
  const up = f.parent ? findTile(f.parent.id).parent : null;
  if (f.parent) items.push({ label: up ? `Move up to “${up.title}”` : 'Move out of folder', action: () => moveTile(t.id, up ? up.id : null) });
  // every folder it could go into: not where it already is (or the "move up" one), and for a folder, not itself or its own subfolders
  const targets = everyTile().filter(x => x.tile.type === 'folder' && x.tile !== f.parent && x.tile !== up &&
    !(t.type === 'folder' && isInside(t, x.tile.id)));
  const moveItems = targets.map(x => ({
    label: [...x.path.map(p => p.title), x.tile.title].join(' › '),
    action: () => moveTile(t.id, x.tile.id),
  }));
  if (f.parent && pathTo(f.parent.id).length) moveItems.unshift({ label: 'Start', action: () => moveTile(t.id, null) });
  if (moveItems.length) items.push('-', { header: 'Move to folder' }, ...moveItems);
  items.push('-', { label: t.type === 'folder' ? 'Delete folder' : 'Delete', danger: true, action: () => deleteTile(t.id) });
  showMenu(x, y, items);
}

// ---------------------------------------------------------------- folders
function openFolder(id) {
  hideMenu();
  openFolderId = id;
  renderFolder({ animate: true });
  openOverlay(folderOverlay);
}
function renderFolder({ animate = false } = {}) {
  const f = findFolder(openFolderId);
  if (!f) { closeFolder(); return; }
  const path = pathTo(f.id);
  const crumbs = $('#folder-crumbs');
  crumbs.hidden = !path.length;
  crumbs.replaceChildren(...[{ id: null, title: 'Start' }, ...path].flatMap(p => [
    h('button', { type: 'button', class: 'crumb', onclick: () => (p.id ? openFolder(p.id) : closeFolder()) }, p.title),
    h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '›'),
  ]));
  const parent = path[path.length - 1];
  $('#folder-out-tip').textContent = `Drag a tile outside this band to move it ${parent ? `to “${parent.title}”` : 'back to Start'}.`;
  if (document.activeElement !== folderTitle) folderTitle.value = f.title;
  $('#folder-band').style.setProperty('--folder-color', f.color);
  const els = f.children.map(t => tileEl(t));
  folderGrid.replaceChildren(...els);
  placeInFolder(els, f.children);
  $('#folder-empty').hidden = f.children.length > 0;
  if (animate && settings.animations) entrance(folderGrid);
}
function closeFolder() {
  openFolderId = null;
  closeOverlay(folderOverlay);
}

// Esc and the overlay backdrop go up one level; Done closes
function folderBack() {
  const parent = openFolderId && findTile(openFolderId) && findTile(openFolderId).parent;
  if (parent) openFolder(parent.id);
  else closeFolder();
}

folderTitle.addEventListener('change', () => {
  const f = findFolder(openFolderId);
  if (!f) return;
  f.title = folderTitle.value.trim() || 'Folder';
  folderTitle.value = f.title;
  commit();
});
folderTitle.addEventListener('keydown', e => { if (e.key === 'Enter') folderTitle.blur(); });
$('#folder-close').addEventListener('click', closeFolder);
$('#folder-add').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  addMenu(r.left, r.bottom + 6, openFolderId);
});
folderOverlay.addEventListener('click', e => { if (e.target === folderOverlay) folderBack(); });
// dragging a tile onto the dimmed area outside the band moves it back to Start
folderOverlay.addEventListener('dragover', e => {
  if (drag && e.target === folderOverlay) { e.preventDefault(); folderOverlay.classList.add('drop-out'); }
});
folderOverlay.addEventListener('dragleave', e => { if (e.target === folderOverlay) folderOverlay.classList.remove('drop-out'); });
folderOverlay.addEventListener('drop', e => {
  folderOverlay.classList.remove('drop-out');
  if (drag && e.target === folderOverlay) {
    e.preventDefault();
    const f = findTile(drag.id);
    const open = findTile(openFolderId);
    const parent = open && open.parent;
    moveTile(drag.id, parent ? parent.id : null);
    if (f) toast(`Moved “${f.tile.title}” to ${parent ? `“${parent.title}”` : 'Start'}`);
  }
});

// ---------------------------------------------------------------- editor
const ed = {
  overlay: $('#editor-overlay'), form: $('#editor'), heading: $('#ed-heading'),
  typeField: $('#ed-type-field'), type: $('#ed-type'), title: $('#ed-title'),
  urlField: $('#ed-url-field'), url: $('#ed-url'), size: $('#ed-size'), colors: $('#ed-colors'),
  iconField: $('#ed-icon-field'), iconMode: $('#ed-icon-mode'), imageRow: $('#ed-image-row'),
  imageUrl: $('#ed-image-url'), imageUpload: $('#ed-image-upload'), imageFile: $('#ed-image-file'),
  imageFill: $('#ed-image-fill'), preview: $('#ed-preview'), cancel: $('#ed-cancel'), colorCustom: null,
};
let editing = null;

function setSeg(segEl, value) {
  segEl.querySelectorAll('button[data-value]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(value))));
}
function onSeg(segEl, fn) {
  segEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    setSeg(segEl, b.dataset.value);
    fn(b.dataset.value);
  });
}

function buildSwatches(container, colors, onPick) {
  container.replaceChildren(...colors.map(c => h('button', {
    type: 'button', class: 'swatch', style: { background: c }, dataset: { color: c }, title: c, 'aria-label': `Color ${c}`,
    onclick: () => onPick(c),
  })));
  const custom = h('input', { type: 'color', title: 'Pick any color', 'aria-label': 'Pick any color' });
  custom.addEventListener('input', () => onPick(custom.value));
  container.append(custom);
  return custom;
}
function markSwatch(container, color) {
  container.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', String(s.dataset.color.toLowerCase() === String(color).toLowerCase())));
}

function openEditor({ tile = null, type = 'link', parentId = null } = {}) {
  hideMenu();
  const draft = tile ? structuredClone(tile) : {
    type, title: '', size: 'medium', color: PALETTE[Math.floor(Math.random() * (PALETTE.length - 1))],
    ...(type === 'folder' ? { children: [] } : { url: '', icon: { mode: 'favicon' } }),
  };
  if (!draft.icon) draft.icon = { mode: 'favicon' };
  if (!draft.children) draft.children = [];
  const found = tile && findTile(tile.id);
  editing = { draft, id: tile ? tile.id : null, parentId: found && found.parent ? found.parent.id : parentId };

  ed.heading.textContent = tile ? (tile.type === 'folder' ? 'Edit folder' : tile.type === 'game' ? 'Edit game tile' : 'Edit tile') : (type === 'folder' ? 'New folder' : 'Add a tile');
  ed.typeField.hidden = !!tile;
  ed.title.value = draft.title || '';
  ed.url.value = draft.url || '';
  ed.url.classList.remove('invalid');
  const src = draft.icon.mode === 'image' ? String(draft.icon.src || '') : '';
  ed.imageUrl.value = src.startsWith('data:') ? '' : src;
  ed.imageUrl.placeholder = src.startsWith('data:') ? 'Using your uploaded picture' : 'Paste a picture URL, or upload one';
  ed.imageFill.checked = !!draft.icon.fill;
  syncEditor();
  openOverlay(ed.overlay);
  setTimeout(() => (draft.type === 'link' && !tile ? ed.url : ed.title).focus(), 50);
}

function syncEditor() {
  const d = editing.draft;
  setSeg(ed.type, d.type);
  setSeg(ed.size, d.size);
  ed.urlField.hidden = d.type !== 'link';
  ed.iconField.hidden = d.type !== 'link';
  setSeg(ed.iconMode, d.icon.mode);
  ed.imageRow.hidden = d.icon.mode !== 'image';
  markSwatch(ed.colors, d.color);
  if (/^#[0-9a-f]{6}$/i.test(d.color)) ed.colorCustom.value = d.color;
  renderPreview();
}

function renderPreview() {
  const d = editing.draft;
  const url = normalizeUrl(ed.url.value);
  const shown = {
    ...d,
    url: url || 'https://example.com',
    title: ed.title.value.trim() || (d.type === 'folder' ? 'Folder' : d.type === 'game' ? Games.LIST[d.game].title : url ? prettyName(url) : 'New tile'),
  };
  ed.preview.replaceChildren(tileEl(shown, { preview: true }));
}
const renderPreviewSoon = debounce(renderPreview, 250);

function closeEditor() {
  closeOverlay(ed.overlay);
  editing = null;
}

ed.colorCustom = buildSwatches(ed.colors, PALETTE, c => { editing.draft.color = c; markSwatch(ed.colors, c); renderPreview(); });
onSeg(ed.type, v => {
  editing.draft.type = v;
  ed.heading.textContent = v === 'folder' ? 'New folder' : 'Add a tile';
  syncEditor();
  (v === 'link' ? ed.url : ed.title).focus();
});
onSeg(ed.size, v => { editing.draft.size = v; renderPreview(); });
onSeg(ed.iconMode, v => { editing.draft.icon.mode = v; syncEditor(); });
ed.title.addEventListener('input', renderPreview);
ed.url.addEventListener('input', () => { ed.url.classList.remove('invalid'); renderPreviewSoon(); });
ed.imageUrl.addEventListener('input', () => {
  const d = editing.draft;
  d.icon.src = normalizeUrl(ed.imageUrl.value);
  d.icon.mode = 'image';
  renderPreviewSoon();
});
ed.imageFill.addEventListener('change', () => { editing.draft.icon.fill = ed.imageFill.checked; renderPreview(); });
ed.imageUpload.addEventListener('click', async () => {
  const file = await pickFile(ed.imageFile);
  if (!file || !editing) return;
  try {
    editing.draft.icon.src = await readImage(file, 320);
    editing.draft.icon.mode = 'image';
    ed.imageUrl.value = '';
    ed.imageUrl.placeholder = 'Using your uploaded picture';
    syncEditor();
  } catch (err) { toast(err.message); }
});
ed.cancel.addEventListener('click', closeEditor);
ed.overlay.addEventListener('click', e => { if (e.target === ed.overlay) closeEditor(); });

ed.form.addEventListener('submit', e => {
  e.preventDefault();
  const d = editing.draft;
  d.title = ed.title.value.trim();
  if (d.type === 'link') {
    d.url = normalizeUrl(ed.url.value);
    if (!d.url || (!hostOf(d.url) && !SPECIAL_SCHEME.test(d.url))) {
      ed.url.classList.add('invalid');
      ed.url.focus();
      toast('Enter a web address, like youtube.com');
      return;
    }
    d.title = d.title || prettyName(d.url);
    if (d.icon.mode === 'image' && !d.icon.src) d.icon.mode = 'favicon';
    if (d.icon.mode !== 'image') { delete d.icon.src; delete d.icon.fill; }
    delete d.children;
    delete d.live;
  } else if (d.type === 'game') {
    d.title = d.title || Games.LIST[d.game].title;
    delete d.url;
    delete d.icon;
    delete d.children;
  } else {
    d.title = d.title || 'Folder';
    delete d.url;
    delete d.icon;
  }

  const { id: editId, parentId } = editing;
  const original = editId && findTile(editId);
  if (d.icon && original && hostOf(original.tile.url) !== hostOf(d.url)) delete d.icon.siteIcon;
  saveEditedTile(d, editId, parentId);
});

function saveEditedTile(d, editId, parentId) {
  let newFolderId = null;
  if (editId) {
    const f = findTile(editId);
    if (f) { d.id = editId; f.list[f.list.indexOf(f.tile)] = d; }
  } else {
    d.id = uid();
    const parent = findFolder(parentId);
    (parent ? parent.children : tiles).push(d);
    if (d.type === 'folder') newFolderId = d.id;
  }
  closeEditor();
  commit();
  if (newFolderId) openFolder(newFolderId);
  else if (!openFolderId) requestAnimationFrame(() => {
    const el = grid.querySelector(`[data-id="${CSS.escape(d.id)}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  });
}

// ---------------------------------------------------------------- clock & weather
const timeEl = $('#time');
const dateEl = $('#date');
let lastMinute = -1;

function tickClock(force = false) {
  const now = new Date();
  if (!force && now.getMinutes() === lastMinute) return;
  lastMinute = now.getMinutes();
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: settings.clock24 ? '2-digit' : 'numeric',
    minute: '2-digit',
    hourCycle: settings.clock24 ? 'h23' : 'h12',
  }).formatToParts(now);
  const time = parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim();
  const period = (parts.find(p => p.type === 'dayPeriod') || {}).value || '';
  timeEl.replaceChildren(time, period ? h('span', { class: 'ampm' }, period) : '');
  dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

let weatherTimer = null;
async function refreshWeather(force = false) {
  clearTimeout(weatherTimer);
  if (!settings.showWeather || settings.widgetPos === 'hidden') return;
  weatherWidget.classList.add('loading');
  try {
    const w = await Weather.get(settings, { force });
    const d = Weather.describe(w.code, w.isDay);
    $('#w-icon').innerHTML = Weather.icon(d.icon);
    $('#w-temp').textContent = `${w.temp}°`;
    $('#w-desc').textContent = d.text;
    $('#w-range').textContent = `High ${w.hi}°, low ${w.lo}°`;
    $('#w-place').textContent = w.place || '';
    weatherWidget.dataset.place = w.place || '';
    weatherWidget.title = w.place ? `Weather for ${w.place}` : 'Weather';
  } catch (err) {
    console.warn('Weather failed', err);
    $('#w-icon').innerHTML = Weather.icon('cloud');
    $('#w-temp').textContent = '--°';
    $('#w-desc').textContent = 'Weather unavailable';
    $('#w-range').textContent = (err && err.message) || '';
    $('#w-place').textContent = 'Select to try again';
    weatherWidget.title = 'Try again';
    weatherWidget.dataset.place = '';
  } finally {
    weatherWidget.classList.remove('loading');
    weatherTimer = setTimeout(() => refreshWeather(), 30 * 60 * 1000);
  }
}

weatherWidget.addEventListener('click', () => {
  const place = weatherWidget.dataset.place;
  if (place) webSearch(`weather ${place}`);
  else if ($('#w-desc').textContent === 'Weather unavailable') refreshWeather(true);
  else openSettings();
});

// ---------------------------------------------------------------- settings
const set = {
  name: $('#set-name'), title: $('#set-title'), bgSwatches: $('#set-bg-swatches'), bgUpload: $('#set-bg-upload'),
  bgFile: $('#set-bg-file'), bgClear: $('#set-bg-clear'), bgUrl: $('#set-bg-url'), dim: $('#set-dim'), dimVal: $('#set-dim-val'),
  scale: $('#set-scale'), anim: $('#set-anim'), flip: $('#set-flip'), parallax: $('#set-parallax'), font: $('#set-font'), pos: $('#set-pos'), clock: $('#set-clock'), weather: $('#set-weather'),
  units: $('#set-units'), news: $('#set-news'), newsTopic: $('#set-news-topic'), newsFeed: $('#set-news-feed'),
  stocks: $('#set-stocks'), stockSymbols: $('#set-stock-symbols'), locCurrent: $('#set-loc-current'), locAuto: $('#set-loc-auto'), city: $('#set-city'),
  cityResults: $('#set-city-results'), exportBtn: $('#set-export'), importBtn: $('#set-import'),
  importFile: $('#set-import-file'), reset: $('#set-reset'), bgCustom: null,
};

function applySettings() {
  const s = settings;
  document.documentElement.style.setProperty('--bg', s.bg.color);
  $('#bg').style.backgroundImage = s.bg.image ? `url("${s.bg.image.replace(/["\\]/g, '\\$&')}")` : 'none';
  const credit = $('#bg-credit');
  const cr = s.bg.image && s.bg.credit;
  credit.hidden = !cr;
  if (cr) {
    credit.textContent = [cr.title, cr.author && `by ${cr.author}`, cr.license].filter(Boolean).join(' · ');
    credit.href = cr.page || 'https://commons.wikimedia.org/';
    credit.title = 'See this picture on Wikimedia Commons';
  }
  $('#bg-dim').style.opacity = s.bg.image ? s.bg.dim / 100 : 0;
  $('#start-title').hidden = !s.showTitle;
  $('#user').hidden = !s.userName.trim();
  $('#user-name').textContent = s.userName.trim();
  $('#avatar').textContent = s.userName.trim().charAt(0).toUpperCase();
  infoBar.dataset.pos = s.widgetPos;
  infoBar.hidden = s.widgetPos === 'hidden';
  weatherWidget.hidden = !s.showWeather;
  renderWidgets();
  document.body.classList.toggle('no-anim', !s.animations);
  applyFont(s.font);
  layoutGrid();
  updateParallax();
  tickClock(true);
}

// Nunito is loaded from Google Fonts only when the Rounded font is chosen; offline it falls back to the system font
function applyFont(font) {
  const rounded = font !== 'metro';
  document.documentElement.classList.toggle('font-rounded', rounded);
  if (rounded && !document.getElementById('font-nunito')) {
    document.head.append(
      h('link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }),
      h('link', { id: 'font-nunito', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;600;700&display=swap' }));
    // grid rows and entrance positions depend on text metrics, so re-measure once the font arrives
    document.fonts.ready.then(() => layoutGrid());
  }
}

function syncSettingsUI() {
  const s = settings;
  set.name.value = s.userName;
  set.title.checked = s.showTitle;
  markSwatch(set.bgSwatches, s.bg.image ? '' : s.bg.color);
  if (/^#[0-9a-f]{6}$/i.test(s.bg.color)) set.bgCustom.value = s.bg.color;
  set.bgUrl.value = s.bg.image.startsWith('data:') ? '' : s.bg.image;
  set.bgUrl.placeholder = s.bg.image.startsWith('data:') ? 'Using your uploaded picture' : 'https://…/wallpaper.jpg';
  set.bgClear.hidden = !s.bg.image;
  set.dim.value = s.bg.dim;
  set.dimVal.textContent = s.bg.dim + '%';
  setSeg(set.scale, s.tileScale);
  set.anim.checked = s.animations;
  set.flip.checked = s.flipOpen;
  set.parallax.checked = s.parallax;
  try { $('#set-version').textContent = `Metro Start ${chrome.runtime.getManifest().version}`; } catch { $('#set-version').textContent = 'Metro Start (preview)'; }
  setSeg(set.font, s.font);
  setSeg(set.pos, s.widgetPos);
  setSeg(set.clock, s.clock24 ? '24' : '12');
  set.weather.checked = s.showWeather;
  setSeg(set.units, s.units);
  set.news.checked = s.showNews;
  set.newsTopic.value = s.newsTopic;
  set.newsFeed.hidden = s.newsTopic !== 'custom';
  if (document.activeElement !== set.newsFeed) set.newsFeed.value = s.newsFeed;
  set.stocks.checked = s.showStocks;
  if (document.activeElement !== set.stockSymbols) set.stockSymbols.value = s.stocks.join(', ');
  set.locCurrent.textContent = s.location.mode === 'manual' && s.location.name
    ? `Showing weather for ${s.location.name}.`
    : 'Showing weather for your current location.';
}

function updateSetting(mutator, { weather = false } = {}) {
  mutator(settings);
  applySettings();
  syncSettingsUI();
  saveSettings();
  if (weather) refreshWeather(true);
}

function openSettings() {
  hideMenu();
  syncSettingsUI();
  settingsScrim.hidden = false;
  settingsPanel.classList.add('open');
  setTimeout(() => $('#set-close').focus(), 60);
}
function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsScrim.hidden = true;
}

set.bgCustom = buildSwatches(set.bgSwatches, BACKGROUNDS, c => updateSetting(s => { s.bg.color = c; s.bg.image = ''; s.bg.credit = null; }));
set.name.addEventListener('input', () => { settings.userName = set.name.value; applySettings(); saveSettingsSoon(); });
set.title.addEventListener('change', () => updateSetting(s => { s.showTitle = set.title.checked; }));
set.bgUpload.addEventListener('click', async () => {
  const file = await pickFile(set.bgFile);
  if (!file) return;
  try {
    const data = await readImage(file, 2560, 'image/jpeg', 0.86);
    updateSetting(s => { s.bg.image = data; s.bg.credit = null; });
  } catch (err) { toast(err.message); }
});
set.bgClear.addEventListener('click', () => updateSetting(s => { s.bg.image = ''; s.bg.credit = null; }));
set.bgUrl.addEventListener('change', () => {
  const v = set.bgUrl.value.trim();
  if (v) updateSetting(s => { s.bg.image = normalizeUrl(v); s.bg.credit = null; });
});
set.dim.addEventListener('input', () => {
  settings.bg.dim = Number(set.dim.value);
  set.dimVal.textContent = settings.bg.dim + '%';
  applySettings();
  saveSettingsSoon();
});
onSeg(set.scale, v => updateSetting(s => { s.tileScale = v; }));
onSeg(set.font, v => updateSetting(s => { s.font = v; }));
set.anim.addEventListener('change', () => updateSetting(s => { s.animations = set.anim.checked; }));
set.flip.addEventListener('change', () => updateSetting(s => { s.flipOpen = set.flip.checked; }));
set.parallax.addEventListener('change', () => updateSetting(s => { s.parallax = set.parallax.checked; }));
onSeg(set.pos, v => { updateSetting(s => { s.widgetPos = v; }, { weather: v !== 'hidden' }); refreshWidgets(); });
onSeg(set.clock, v => updateSetting(s => { s.clock24 = v === '24'; }));
set.weather.addEventListener('change', () => updateSetting(s => { s.showWeather = set.weather.checked; }, { weather: set.weather.checked }));
onSeg(set.units, v => updateSetting(s => { s.units = v; }, { weather: true }));
set.locAuto.addEventListener('click', () => updateSetting(s => { s.location = { mode: 'auto' }; }, { weather: true }));

const searchCities = debounce(async q => {
  if (q.length < 2) { set.cityResults.replaceChildren(); return; }
  try {
    const results = await Weather.searchCity(q);
    if (set.city.value.trim() !== q) return;
    set.cityResults.replaceChildren(...(results.length ? results.map(r => h('li', {},
      h('button', {
        type: 'button',
        onclick: () => {
          set.city.value = '';
          set.cityResults.replaceChildren();
          updateSetting(s => { s.location = { mode: 'manual', name: r.name, lat: r.lat, lon: r.lon }; }, { weather: true });
        },
      }, r.name, h('small', {}, r.region)))) : [h('li', { class: 'muted' }, 'No cities found with that name.')]));
  } catch {
    set.cityResults.replaceChildren(h('li', { class: 'muted' }, 'City search needs an internet connection.'));
  }
}, 350);
set.city.addEventListener('input', () => searchCities(set.city.value.trim()));

set.exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'metro-start', version: 1, tiles, settings, games: gameData }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `metro-start-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
set.importBtn.addEventListener('click', async () => {
  const file = await pickFile(set.importFile);
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tiles)) throw new Error('missing tiles');
    tiles = sanitizeTiles(data.tiles);
    if (data.settings) settings = mergeSettings(data.settings);
    if (data.games && typeof data.games === 'object') {
      gameData = { saves: data.games.saves || {}, stats: data.games.stats || {} };
      flushGameData();
    }
    await Promise.all([saveTiles(), saveSettings()]);
    applySettings();
    syncSettingsUI();
    renderGrid({ animate: true });
    refreshWeather(true);
    toast(`Imported ${tiles.length} tiles`);
  } catch {
    toast('That file isn’t a Metro Start backup.');
  }
});
set.reset.addEventListener('click', async () => {
  if (!confirm('Reset all tiles, folders and settings to the defaults?')) return;
  tiles = defaultTiles();
  settings = structuredClone(DEFAULT_SETTINGS);
  await Promise.all([saveTiles(), saveSettings()]);
  applySettings();
  syncSettingsUI();
  renderGrid({ animate: true });
  refreshWeather(true);
  refreshWidgets(true);
});
$('#set-close').addEventListener('click', closeSettings);
$('#set-bookmarks').addEventListener('click', openBookmarkImport);
$('#set-restore-games').addEventListener('click', () => { closeSettings(); restoreGames(); });
settingsScrim.addEventListener('click', closeSettings);


// ---------------------------------------------------------------- bookmark import
const bm = {
  overlay: $('#bm-overlay'), tree: $('#bm-tree'), size: $('#bm-size'), keepFolders: $('#bm-folders'),
  skipDupes: $('#bm-dupes'), icons: $('#bm-icons'), replace: $('#bm-replace'), keepGames: $('#bm-keep-games'), widen: $('#bm-widen'), go: $('#bm-import'), cancel: $('#bm-cancel'), all: $('#bm-all'), none: $('#bm-none'),
};
let bmState = null; // { roots, selected: Set<id>, open: Set<id>, size }

const IMPORTABLE = /^(https?|ftp|file|chrome):/i;
const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3l5 5-5 5"/></svg>';
const FOLDER_ICON = '<svg class="bm-ficon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h7l2 2h9v11H3z"/></svg>';

function urlKey(u) {
  try {
    const x = new URL(normalizeUrl(u));
    return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase();
  } catch { return String(u).toLowerCase(); }
}
function colorFor(str) {
  let hsh = 0;
  for (const ch of String(str)) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hsh % (PALETTE.length - 1)]; // skip the near-black last swatch
}
function bmLeaves(node) {
  if (node.url) return IMPORTABLE.test(node.url) ? [node] : [];
  return (node.children || []).flatMap(bmLeaves);
}

async function openBookmarkImport() {
  hideMenu();
  closeSettings();
  if (!hasChrome || !chrome.permissions) {
    toast('Bookmark import works once Metro Start is installed as an extension.');
    return;
  }
  // must be called straight from the click so Chrome can show its permission prompt
  let granted = false;
  try { granted = await chrome.permissions.request({ permissions: ['bookmarks'] }); } catch { granted = false; }
  if (!granted || !chrome.bookmarks) {
    toast('Allow Metro Start to read your bookmarks to import them.');
    return;
  }
  const [root] = await chrome.bookmarks.getTree();
  const roots = (root.children || []).filter(r => bmLeaves(r).length);
  const bar = roots.find(r => r.id === '1') || roots[0];
  bmState = { roots, selected: new Set(), open: new Set(), size: 'medium' };
  if (bar) {
    bmState.open.add(bar.id);
    for (const l of bmLeaves(bar)) bmState.selected.add(l.id);
  }
  setSeg(bm.size, bmState.size);
  bm.replace.checked = false; // never carried over from a previous import
  bm.keepGames.checked = true;
  renderBmTree();
  openOverlay(bm.overlay);
  setTimeout(() => bm.go.focus(), 60);
}
function closeBookmarkImport() {
  closeOverlay(bm.overlay);
  bmState = null;
}

function renderBmTree() {
  const top = bm.tree.scrollTop;
  const nodes = bmState.roots.map(n => bmNode(n)).filter(Boolean);
  bm.tree.replaceChildren(...(nodes.length ? nodes : [h('li', { class: 'bm-empty' }, 'Chrome has no bookmarks to import.')]));
  bm.tree.scrollTop = top;
  const n = bmState.selected.size;
  bm.go.disabled = n === 0;
  const replace = bm.replace.checked;
  const keep = bm.keepGames.checked;
  bm.go.textContent = n === 0 ? 'Add tiles' : replace ? `Erase Start${keep ? ' (except games)' : ''} and add ${n} tile${n === 1 ? '' : 's'}` : `Add ${n} tile${n === 1 ? '' : 's'}`;
  bm.keepGames.disabled = !replace;
  bm.go.classList.toggle('danger-fill', replace);
  bm.skipDupes.disabled = replace;
}

function bmNode(n) {
  const sel = bmState.selected;
  if (n.url) {
    if (!IMPORTABLE.test(n.url)) return null;
    const cb = h('input', { type: 'checkbox' });
    cb.checked = sel.has(n.id);
    cb.addEventListener('change', () => { cb.checked ? sel.add(n.id) : sel.delete(n.id); renderBmTree(); });
    return h('li', { class: 'bm-link' }, h('label', { title: n.url },
      cb,
      h('img', { class: 'bm-fav', src: faviconSrc(n.url), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => { e.target.style.visibility = 'hidden'; } }),
      h('span', { class: 'bm-title' }, (n.title || '').trim() || prettyName(n.url)),
      h('span', { class: 'bm-meta' }, hostOf(n.url))));
  }
  const leaves = bmLeaves(n);
  if (!leaves.length) return null;
  const picked = leaves.filter(l => sel.has(l.id)).length;
  const open = bmState.open.has(n.id);
  const cb = h('input', { type: 'checkbox', 'aria-label': `Select everything in ${n.title || 'folder'}` });
  cb.checked = picked === leaves.length;
  cb.indeterminate = picked > 0 && picked < leaves.length;
  cb.addEventListener('change', () => {
    for (const l of leaves) cb.checked ? sel.add(l.id) : sel.delete(l.id);
    renderBmTree();
  });
  const li = h('li', { class: 'bm-folder' }, h('div', { class: 'bm-row' },
    h('button', {
      type: 'button', class: 'bm-toggle', 'aria-expanded': String(open), 'aria-label': open ? 'Collapse folder' : 'Expand folder', html: CHEVRON,
      onclick: () => { open ? bmState.open.delete(n.id) : bmState.open.add(n.id); renderBmTree(); },
    }),
    h('label', {},
      cb,
      h('span', { html: FOLDER_ICON, style: { display: 'grid' } }),
      h('span', { class: 'bm-title' }, n.title || 'Untitled folder'),
      h('span', { class: 'bm-meta' }, `${picked} of ${leaves.length}`))));
  if (open) li.append(h('ul', {}, ...(n.children || []).map(c => bmNode(c)).filter(Boolean)));
  return li;
}


// ---- icons for imported bookmarks
function loadImage(src, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, timeout);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('failed')); };
    img.src = src;
  });
}
function imageToDataUrl(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || 64;
  c.height = img.naturalHeight || 64;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

// The icon Chrome saved for a bookmark. Chrome answers with a grey globe when it has none, so compare against that.
async function chromeSavedIcon(url, globe) {
  if (!hasChrome) return null;
  const img = await loadImage(localFavicon(url), 4000);
  const data = imageToDataUrl(img);
  return data === globe ? null : { src: data, size: img.naturalWidth };
}

// The icon a site declares in its page: prefers the large phone home-screen icon, then the biggest listed one
async function websiteIcon(pageUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  let res, html;
  try {
    res = await fetch(pageUrl, { signal: ctrl.signal, credentials: 'omit' });
    html = /html/i.test(res.headers.get('content-type') || '') ? (await res.text()).slice(0, 400000) : '';
  } finally {
    clearTimeout(timer);
  }
  const base = res.url || pageUrl;
  const origin = new URL(base).origin;
  const candidates = [];
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const l of doc.querySelectorAll('link[rel][href]')) {
      const rel = l.getAttribute('rel').toLowerCase();
      if (!/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel)) continue;
      let href;
      try { href = new URL(l.getAttribute('href'), base).href; } catch { continue; }
      const sizes = (l.getAttribute('sizes') || '').toLowerCase();
      const svg = /svg/i.test(l.getAttribute('type') || '') || /\.svg(\?|$)/i.test(href);
      const listed = Math.max(0, ...(sizes.match(/\d+/g) || []).map(Number));
      const score = sizes.includes('any') || svg ? 512 : listed || (rel.includes('apple') ? 180 : 32);
      candidates.push({ href, score, svg });
    }
  }
  if (!candidates.some(c => c.score >= 120)) candidates.push({ href: origin + '/apple-touch-icon.png', score: 120 });
  candidates.push({ href: origin + '/favicon.ico', score: 16 });
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    try {
      const img = await loadImage(c.href, 5000);
      const size = c.svg ? 512 : img.naturalWidth;
      if (size >= 16) return { src: c.href, size };
    } catch { /* try the next candidate */ }
  }
  return null;
}

// Run tasks a few at a time
async function inBatches(items, limit, task) {
  let i = 0;
  const worker = async () => { while (i < items.length) await task(items[i++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function selectedBookmarks() {
  const out = [];
  const walk = nodes => nodes.forEach(n => {
    if (n.children) walk(n.children);
    else if (n.url && bmState.selected.has(n.id) && IMPORTABLE.test(n.url)) out.push(n);
  });
  walk(bmState.roots);
  return out;
}

function setImportBusy(busy, text = '') {
  bmState.busy = busy;
  bm.go.disabled = busy || !bmState.selected.size;
  if (busy) bm.go.textContent = text;
  bm.cancel.textContent = busy ? 'Skip icons' : 'Cancel';
  [bm.all, bm.none, bm.keepFolders, bm.skipDupes, bm.icons, bm.replace, bm.keepGames, bm.widen].forEach(x => { x.disabled = busy; });
  bm.tree.style.pointerEvents = busy ? 'none' : '';
  bm.tree.style.opacity = busy ? '.6' : '';
}

// Started straight from the click, so Chrome can show its permission prompt
function startBookmarkImport() {
  if (!bmState || bmState.busy || !bmState.selected.size) return;
  const state = bmState;
  const replace = bm.replace.checked;
  const existing = new Set(replace ? [] : allLinkKeys());
  const picks = selectedBookmarks().filter(n => !(bm.skipDupes.checked && existing.has(urlKey(n.url))));
  const web = bm.icons.checked && hasChrome && chrome.permissions && picks.length;
  const origins = web ? [...new Set(picks.map(n => {
    try { const u = new URL(n.url); return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.hostname}/*` : null; } catch { return null; }
  }).filter(Boolean))] : [];
  const ask = origins.length ? chrome.permissions.request({ origins }).catch(() => false) : Promise.resolve(false);

  ask.then(async allowed => {
    const giveBack = () => { if (allowed) { try { chrome.permissions.remove({ origins }).catch(() => {}); } catch { /* nothing to give back */ } } };
    if (bmState !== state) { giveBack(); return; }
    const icons = new Map();
    if (hasChrome && picks.length) {
      let done = 0;
      setImportBusy(true, `Getting icons… 0 of ${picks.length}`);
      let globe = '';
      try { globe = imageToDataUrl(await loadImage(localFavicon('https://no-icon.metro-start.invalid/'), 3000)); } catch { /* no comparison available */ }
      await inBatches(picks, 6, async n => {
        if (bmState !== state || state.skipIcons) return;
        let best = null;
        if (allowed) { try { best = await websiteIcon(n.url); } catch { /* site unreachable */ } }
        if (!best || best.size < 48) {
          try {
            const saved = globe ? await chromeSavedIcon(n.url, globe) : null;
            if (saved && (!best || saved.size > best.size)) best = saved;
          } catch { /* no saved icon */ }
        }
        if (best) icons.set(n.id, best.src);
        done++;
        if (bmState === state && !state.skipIcons) bm.go.textContent = `Getting icons… ${done} of ${picks.length}`;
      });
    }
    giveBack(); // the site access was only needed for the icons
    if (bmState !== state) return;
    setImportBusy(false);
    importSelectedBookmarks(icons);
  });
}

function allLinkKeys() {
  return allLinksDeep().map(t => urlKey(t.url));
}

// Does a name need more than the two lines a medium tile has room for?
let measureCtx = null;
function nameTooLong(title) {
  const unit = UNIT_PX[settings.tileScale] || 70;
  const gap = Math.round(unit / 7);
  const textWidth = (unit * 2 + gap) - 20 - Math.round(unit * 0.5) - 8; // tile minus padding, icon and spacing
  measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
  measureCtx.font = `700 14px ${getComputedStyle(document.documentElement).getPropertyValue('--font') || 'sans-serif'}`;
  // words wrap, so two lines hold a bit less than twice the width
  return measureCtx.measureText(title).width > textWidth * 1.75;
}
function importSelectedBookmarks(icons = new Map()) {
  if (!bmState || !bmState.selected.size) return;
  const keepFolders = bm.keepFolders.checked;
  const replace = bm.replace.checked;
  const skipDupes = replace || bm.skipDupes.checked; // when replacing, only repeats within the import are skipped
  const size = bmState.size;
  const snapshot = JSON.stringify(tiles);
  if (replace) {
    // keep games (and the folders that hold them) unless asked to erase them too
    tiles = bm.keepGames.checked ? gamesOnly(tiles) : [];
    if (openFolderId) closeFolder();
  }
  const existing = new Set(allLinkKeys());
  let added = 0;
  let skipped = 0;

  // A tile folder for a bookmark folder, made only when something is actually imported into it.
  // Reuses a folder with the same name in the same place instead of making a twin.
  const lazyFolder = (bmFolder, parentList) => {
    let f = null;
    return () => {
      if (f) return f.children;
      const list = parentList();
      const title = (bmFolder.title || 'Bookmarks').slice(0, 80);
      f = list.find(t => t.type === 'folder' && t.title.toLowerCase() === title.toLowerCase());
      if (!f) {
        f = { id: uid(), type: 'folder', title, color: colorFor(title), size: 'medium', children: [] };
        list.push(f);
      }
      return f.children;
    };
  };

  // links directly in "Bookmarks bar" / "Other bookmarks" go on Start;
  // bookmark folders become tile folders, nested the same way they are in Chrome
  const walk = (nodes, listFor) => {
    for (const n of nodes) {
      if (n.children) { walk(n.children, keepFolders ? lazyFolder(n, listFor) : listFor); continue; }
      if (!n.url || !bmState.selected.has(n.id) || !IMPORTABLE.test(n.url)) continue;
      const key = urlKey(n.url);
      if (skipDupes && existing.has(key)) { skipped++; continue; }
      existing.add(key);
      const t = link(((n.title || '').trim() || prettyName(n.url)).slice(0, 80), n.url, colorFor(hostOf(n.url) || n.url), size);
      if (icons.has(n.id)) t.icon.siteIcon = icons.get(n.id);
      if (bm.widen.checked && size === 'medium' && nameTooLong(t.title)) t.size = 'wide';
      listFor().push(t);
      added++;
    }
  };
  for (const r of bmState.roots) walk(r.children || [], () => tiles);

  closeBookmarkImport();
  commit();
  if (settings.animations) entrance(grid);
  const plural = n => `${n} tile${n === 1 ? '' : 's'}`;
  const msg = replace
    ? `Replaced Start with ${plural(added)}` + (skipped ? `, skipped ${skipped} repeated` : '')
    : added
      ? `Added ${plural(added)}` + (skipped ? `, skipped ${skipped} already on Start` : '')
      : 'Those sites are already on Start';
  toast(msg, added || replace ? { label: 'Undo', run: () => { tiles = JSON.parse(snapshot); commit(); } } : undefined);
  if (added) scroller.scrollTo({ left: replace ? 0 : scroller.scrollWidth, behavior: 'smooth' });
}

onSeg(bm.size, v => { if (bmState) bmState.size = v; });
bm.replace.addEventListener('change', () => { if (bmState) renderBmTree(); });
bm.keepGames.addEventListener('change', () => { if (bmState) renderBmTree(); });
bm.all.addEventListener('click', () => { bmState.roots.flatMap(bmLeaves).forEach(l => bmState.selected.add(l.id)); renderBmTree(); });
bm.none.addEventListener('click', () => { bmState.selected.clear(); renderBmTree(); });
bm.cancel.addEventListener('click', () => { if (bmState && bmState.busy) bmState.skipIcons = true; else closeBookmarkImport(); });
bm.go.addEventListener('click', startBookmarkImport);
bm.overlay.addEventListener('click', e => { if (e.target === bm.overlay) closeBookmarkImport(); });



// ---------------------------------------------------------------- wallpaper gallery
const wp = { overlay: $('#wp-overlay'), tabs: $('#wp-tabs'), grid: $('#wp-grid'), note: $('#wp-note'), more: $('#wp-more') };
let wpCat = Wallpapers.CATEGORIES[0].id;
let wpBusy = false;

function openGallery() {
  closeSettings();
  wp.tabs.replaceChildren(...Wallpapers.CATEGORIES.map(c => h('button', {
    type: 'button', role: 'tab', dataset: { value: c.id }, 'aria-pressed': String(c.id === wpCat),
    onclick: () => { wpCat = c.id; setSeg(wp.tabs, c.id); showCategory(); },
  }, c.label)));
  openOverlay(wp.overlay);
  showCategory();
}
function closeGallery() { closeOverlay(wp.overlay); }

async function showCategory(more = false) {
  const cat = wpCat;
  if (!more) { wp.grid.replaceChildren(...Array.from({ length: 12 }, () => h('div', { class: 'wp-item loading' }))); wp.more.hidden = true; }
  wp.note.textContent = '';
  wp.more.disabled = true;
  try {
    const { items, done } = await Wallpapers.load(cat, { more });
    if (cat !== wpCat) return; // another tab was picked meanwhile
    const current = settings.bg.credit && settings.bg.credit.id;
    wp.grid.replaceChildren(...items.map(it => h('button', {
      type: 'button', role: 'listitem', class: 'wp-item' + (it.id === current ? ' current' : ''),
      title: [it.title, it.author && `by ${it.author}`].filter(Boolean).join(' '),
      onclick: e => pickWallpaper(it, e.currentTarget),
    },
      h('img', { src: it.thumb, alt: it.title, loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => { e.target.closest('.wp-item').hidden = true; } }),
      h('span', { class: 'wp-cap' }, it.title))));
    if (!items.length) wp.note.textContent = 'No pictures in this category right now.';
    wp.more.hidden = done;
    wp.more.disabled = false;
  } catch (err) {
    if (cat !== wpCat) return;
    wp.grid.replaceChildren();
    wp.note.replaceChildren(err.message + ' ', h('button', { type: 'button', class: 'widget-btn', onclick: () => showCategory(more) }, 'Try again'));
  }
}

async function pickWallpaper(item, el) {
  if (wpBusy) return;
  wpBusy = true;
  el.classList.add('saving');
  wp.grid.querySelectorAll('.wp-item.current').forEach(x => x.classList.remove('current'));
  try {
    const image = await Wallpapers.download(item, readImage);
    updateSetting(s => {
      s.bg.image = image;
      s.bg.credit = { id: item.id, title: item.title, author: item.author, license: item.license, page: item.page };
      if (s.bg.dim < 15) s.bg.dim = 25; // keep tiles readable on a busy photo
    });
    el.classList.add('current');
    toast(`Wallpaper set: ${item.title}`);
  } catch (err) {
    toast('Couldn’t set that wallpaper. Try again.');
  } finally {
    el.classList.remove('saving');
    wpBusy = false;
  }
}

$('#set-bg-gallery').addEventListener('click', openGallery);
$('#wp-close').addEventListener('click', closeGallery);
wp.more.addEventListener('click', () => showCategory(true));
wp.overlay.addEventListener('click', e => { if (e.target === wp.overlay) closeGallery(); });

// ---------------------------------------------------------------- news and markets widgets
let widgetCache = { news: null, stocks: null }; // { key, at, data, error }
const WIDGET_TTL = { news: 20 * 60e3, stocks: 5 * 60e3 };
const WIDGET_RETRY = 3 * 60e3;
const newsWidget = $('#news-widget');
const stocksWidget = $('#stocks-widget');

const widgetKey = kind => (kind === 'news' ? Widgets.newsUrl(settings) : settings.stocks.join(','));
const widgetOn = kind => settings.widgetPos !== 'hidden' &&
  (kind === 'news' ? settings.showNews && !!Widgets.newsUrl(settings) : settings.showStocks && settings.stocks.length > 0);

// Chrome only shows its permission prompt straight from a click, so callers run this inside one
function askWidgetAccess(kind, then) {
  const origins = Widgets.origins(kind, settings);
  if (!origins.length || !hasChrome || !chrome.permissions) { then(true); return; }
  chrome.permissions.request({ origins }).then(then, () => then(false));
}
async function hasWidgetAccess(kind) {
  const origins = Widgets.origins(kind, settings);
  if (!origins.length || !hasChrome || !chrome.permissions) return true;
  try { return await chrome.permissions.contains({ origins }); } catch { return false; }
}

const fmtPrice = n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function widgetMessage(list, text, action) {
  list.replaceChildren(h('li', { class: 'widget-note' }, text, action ? ' ' : '',
    action && h('button', { type: 'button', class: 'widget-btn', onclick: action.run }, action.label)));
}

function renderWidget(kind) {
  const el = kind === 'news' ? newsWidget : stocksWidget;
  const list = kind === 'news' ? $('#news-list') : $('#stock-list');
  el.hidden = !widgetOn(kind);
  if (el.hidden) return;
  if (kind === 'news') $('#news-sub').textContent = Widgets.NEWS_TOPICS[settings.newsTopic] || '';
  const c = widgetCache[kind] && widgetCache[kind].key === widgetKey(kind) ? widgetCache[kind] : null;
  if (el.dataset.needsAccess === '1') {
    widgetMessage(list, kind === 'news' ? 'Show the latest headlines here.' : 'Show market prices here.', {
      label: 'Turn on', run: () => askWidgetAccess(kind, ok => {
        if (!ok) { toast('Chrome needs your OK for this widget to read its site.'); return; }
        el.dataset.needsAccess = '';
        refreshWidget(kind, true);
      }),
    });
    return;
  }
  if (!c || !c.data) {
    if (c && c.error) widgetMessage(list, c.error, { label: 'Try again', run: () => refreshWidget(kind, true) });
    else widgetMessage(list, 'Loading…');
    return;
  }
  if (kind === 'news') {
    list.replaceChildren(...c.data.slice(0, 3).map(n => h('li', {},
      h('a', { href: n.link, title: n.source ? `${n.title} (${n.source})` : n.title }, n.title,
        n.source ? h('span', { class: 'news-src' }, n.source) : null))));
  } else {
    list.replaceChildren(...c.data.map(q => {
      const link = `https://finance.yahoo.com/quote/${encodeURIComponent(q.symbol)}`;
      if (q.failed) return h('li', {}, h('span', { class: 'stock-name' }, q.name), h('span', { class: 'stock-price' }, '—'), h('span', { class: 'stock-chg' }, ''));
      const dir = q.change > 0 ? 'up' : q.change < 0 ? 'down' : '';
      const sign = q.change > 0 ? '+' : q.change < 0 ? '−' : '';
      return h('li', { title: `${q.name}: ${fmtPrice(q.price)} ${q.currency}` },
        h('a', { class: 'stock-name', href: link, style: { color: 'inherit', textDecoration: 'none' } }, q.name),
        h('span', { class: 'stock-price' }, fmtPrice(q.price)),
        h('span', { class: `stock-chg ${dir}` }, `${sign}${Math.abs(q.pct).toFixed(2)}%`));
    }));
  }
  $(kind === 'news' ? '#news-sub' : '#stocks-sub').title = c.error ? `Last update failed: ${c.error}` : `Updated ${new Date(c.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
function renderWidgets() { renderWidget('news'); renderWidget('stocks'); }

const widgetBusy = new Set();
async function refreshWidget(kind, force = false) {
  if (!widgetOn(kind) || widgetBusy.has(kind)) { renderWidget(kind); return; }
  const key = widgetKey(kind);
  const prev = widgetCache[kind] && widgetCache[kind].key === key ? widgetCache[kind] : null;
  if (!force && prev && Date.now() - prev.at < (prev.error ? WIDGET_RETRY : WIDGET_TTL[kind])) { renderWidget(kind); return; }
  const el = kind === 'news' ? newsWidget : stocksWidget;
  if (!(await hasWidgetAccess(kind))) { el.dataset.needsAccess = '1'; renderWidget(kind); return; }
  el.dataset.needsAccess = '';
  widgetBusy.add(kind);
  try {
    const data = kind === 'news' ? await Widgets.fetchNews(key) : await Widgets.fetchQuotes(settings.stocks);
    widgetCache[kind] = { key, at: Date.now(), data };
  } catch (err) {
    widgetCache[kind] = { key, at: Date.now(), data: prev ? prev.data : null, error: (err && err.message) || 'Couldn’t update.' };
  } finally {
    widgetBusy.delete(kind);
  }
  Store.set('widgetCache', widgetCache).catch(() => {});
  renderWidget(kind);
}
function refreshWidgets(force = false) { refreshWidget('news', force); refreshWidget('stocks', force); }

// settings: turning a widget on asks Chrome for access in the same click
Object.entries(Widgets.NEWS_TOPICS).forEach(([value, label]) => set.newsTopic.append(h('option', { value }, label)));
set.news.addEventListener('change', () => {
  const on = set.news.checked;
  const apply = () => updateSetting(s => { s.showNews = on; }) || refreshWidget('news');
  if (on) askWidgetAccess('news', ok => { if (!ok) toast('Chrome needs your OK for the News widget to read Google News.'); apply(); });
  else apply();
});
set.newsTopic.addEventListener('change', () => {
  const topic = set.newsTopic.value;
  updateSetting(s => { s.newsTopic = topic; });
  if (topic === 'custom') { set.newsFeed.focus(); return; }
  askWidgetAccess('news', () => refreshWidget('news', true));
});
set.newsFeed.addEventListener('change', () => {
  const v = set.newsFeed.value.trim();
  updateSetting(s => { s.newsFeed = v ? normalizeUrl(v) : ''; });
  askWidgetAccess('news', () => refreshWidget('news', true));
});
set.stocks.addEventListener('change', () => {
  const on = set.stocks.checked;
  const apply = () => updateSetting(s => { s.showStocks = on; }) || refreshWidget('stocks');
  if (on) askWidgetAccess('stocks', ok => { if (!ok) toast('Chrome needs your OK for the Markets widget to read Yahoo Finance.'); apply(); });
  else apply();
});
set.stockSymbols.addEventListener('change', () => {
  const list = Widgets.parseSymbols(set.stockSymbols.value);
  set.stockSymbols.value = list.join(', ');
  updateSetting(s => { s.stocks = list; });
  refreshWidget('stocks', true);
});


// ---------------------------------------------------------------- games
// Progress and best scores live in one storage entry: { saves: {game: state}, stats: {game: {...}} }
let gameData = { saves: {}, stats: {} };
let gameSession = null;
const gameOverlay = $('#game-overlay');
const gameBanner = $('#game-banner');
const saveGameData = debounce(() => Store.set('games', gameData).catch(() => toast('Couldn’t save game progress.')), 400);
const flushGameData = () => Store.set('games', gameData).catch(() => {});

function openGame(id) {
  const def = Games.LIST[id];
  if (!def) return;
  if (gameSession) closeGame();
  hideMenu();
  $('#game-title').textContent = def.title;
  gameOverlay.style.setProperty('--game-color', def.color);
  const stage = $('#game-stage');
  stage.replaceChildren();
  $('#game-tools').replaceChildren();
  $('#game-status').replaceChildren();
  gameBanner.hidden = true;
  gameOverlay.hidden = false;
  const keys = [];
  const api = {
    stage,
    load: () => (gameData.saves[id] ? structuredClone(gameData.saves[id]) : null),
    save: st => { gameData.saves[id] = structuredClone(st); saveGameData(); },
    stats: () => gameData.stats[id] || {},
    setStats: obj => { gameData.stats[id] = { ...(gameData.stats[id] || {}), ...obj }; saveGameData(); },
    status: items => $('#game-status').replaceChildren(...items.map(([label, value]) =>
      h('div', { class: 'gs-item' }, h('span', { class: 'gs-label' }, label), h('span', { class: 'gs-value' }, value)))),
    tools: nodes => $('#game-tools').replaceChildren(...nodes),
    banner: ({ title, text, actions = [] }) => {
      gameBanner.replaceChildren(h('div', { class: 'band-inner game-banner-inner' },
        h('h3', {}, title), text ? h('p', {}, text) : null,
        h('div', { class: 'actions' }, actions.map(a => h('button', { type: 'button', class: 'btn' + (a.primary ? ' primary' : ''), onclick: a.run }, a.label)))));
      gameBanner.hidden = false;
      const first = gameBanner.querySelector('.btn.primary') || gameBanner.querySelector('.btn');
      if (first) first.focus({ preventScroll: true });
    },
    clearBanner: () => { gameBanner.hidden = true; },
    bannerOpen: () => !gameBanner.hidden,
    confirm: (text, label, run) => api.banner({ title: text, actions: [{ label, primary: true, run: () => { api.clearBanner(); run(); } }, { label: 'Cancel', run: () => api.clearBanner() }] }),
    onKey: fn => keys.push(fn),
    toast,
  };
  let instance = null;
  try {
    instance = Games.mount(id, api);
  } catch (err) {
    // a damaged save shouldn't lock you out of a game: start it fresh
    console.warn('Game failed to load; starting fresh.', err);
    delete gameData.saves[id];
    stage.replaceChildren();
    instance = Games.mount(id, api);
  }
  gameSession = { id, instance, keys };
  stage.focus({ preventScroll: true });
}
function closeGame() {
  if (!gameSession) return;
  try { gameSession.instance && gameSession.instance.destroy(); } catch (err) { console.warn(err); }
  gameSession = null;
  flushGameData();
  gameOverlay.hidden = true;
  $('#game-stage').replaceChildren();
}
$('#game-back').addEventListener('click', closeGame);
// after clicking a toolbar button, hand the keyboard back to the game (so Enter or Space doesn't press the button again)
$('#game-tools').addEventListener('click', () => setTimeout(() => { if (gameSession && gameBanner.hidden) $('#game-stage').focus({ preventScroll: true }); }, 0));
gameBanner.addEventListener('click', e => { if (e.target.closest('.btn')) setTimeout(() => { if (gameSession && gameBanner.hidden) $('#game-stage').focus({ preventScroll: true }); }, 0); });
document.addEventListener('keydown', e => {
  if (!gameSession || e.key === 'Escape') return;
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  gameSession.keys.forEach(fn => fn(e));
});
window.addEventListener('pagehide', () => { if (gameSession) { try { gameSession.instance.destroy(); } catch { /* closing anyway */ } } flushGameData(); });

// ---------------------------------------------------------------- search
function clearSearch() {
  searchInput.value = '';
  searchQuery = '';
  $('#search-hint').hidden = true;
  renderGrid();
}
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  $('#search-hint').hidden = !searchQuery.trim();
  renderGrid();
  scroller.scrollLeft = 0;
});
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.stopPropagation(); clearSearch(); searchInput.blur(); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  const first = grid.querySelector('.tile');
  const f = first && findTile(first.dataset.id);
  if (f && !e.shiftKey) {
    if (f.tile.type === 'folder') openFolder(f.tile.id);
    else openUrl(f.tile.url, e.ctrlKey || e.metaKey);
    return;
  }
  if (!/\s/.test(q) && /^[^.]+\.[a-z]{2,}(\S*)$/i.test(q)) { openUrl(normalizeUrl(q)); return; }
  webSearch(q);
});

// ---------------------------------------------------------------- global events
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (gameSession) {
      if (!gameBanner.hidden) gameBanner.hidden = true; // Esc only dismisses a message, never changes the game
      else closeGame();
      return;
    }
    if (!ctx.hidden) hideMenu();
    else if (!ed.overlay.hidden) closeEditor();
    else if (!bm.overlay.hidden) closeBookmarkImport();
    else if (!wp.overlay.hidden) closeGallery();
    else if (openFolderId) folderBack();
    else if (settingsPanel.classList.contains('open')) closeSettings();
    else if (searchInput.value) clearSearch();
    return;
  }
  // Like Windows 8: just start typing on Start to search
  if (gameSession) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (!ed.overlay.hidden || !bm.overlay.hidden || !wp.overlay.hidden || openFolderId || settingsPanel.classList.contains('open') || !ctx.hidden) return;
  if (e.key === ' ') return;
  searchInput.focus();
});
document.addEventListener('pointerdown', e => { if (!ctx.hidden && !ctx.contains(e.target)) hideMenu(); });
window.addEventListener('blur', hideMenu);

scroller.addEventListener('wheel', e => {
  if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  if (scroller.scrollWidth <= scroller.clientWidth) return;
  scroller.scrollLeft += e.deltaY;
  e.preventDefault();
}, { passive: false });

$('#btn-add').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  addMenu(r.right - 210, r.bottom + 6);
});
$('#btn-settings').addEventListener('click', openSettings);

bindTileEvents(grid, () => null);
bindTileEvents(folderGrid, () => openFolderId);
scroller.addEventListener('contextmenu', e => { if (!e.target.closest('.tile')) tileMenu(e, null); });

new ResizeObserver(debounce(() => { layoutGrid(); updateParallax(); }, 60)).observe(scroller);
window.addEventListener('resize', debounce(() => { if (openFolderId) renderFolder(); }, 120));

// ---- Windows 8 parallax: as the tiles scroll sideways, the wallpaper follows at a fraction of the speed
let parallaxQueued = false;
function parallaxOn() {
  return settings.parallax && settings.animations && !!settings.bg.image &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches && scroller.scrollWidth > scroller.clientWidth + 4;
}
function updateParallax() {
  const bgEl = document.getElementById('bg');
  if (!parallaxOn()) {
    bgEl.classList.remove('parallax');
    bgEl.style.transform = '';
    return;
  }
  // the picture gets up to 15% extra width; scrolling end to end slides across all of it
  const extra = Math.round(Math.min(window.innerWidth * 0.15, 260));
  const max = scroller.scrollWidth - scroller.clientWidth;
  const t = Math.min(1, Math.max(0, scroller.scrollLeft / max));
  bgEl.style.setProperty('--px-extra', `${extra}px`);
  bgEl.classList.add('parallax');
  bgEl.style.transform = `translate3d(${-Math.round(t * extra)}px, 0, 0)`;
}
scroller.addEventListener('scroll', () => {
  if (parallaxQueued) return;
  parallaxQueued = true;
  requestAnimationFrame(() => { parallaxQueued = false; updateParallax(); });
}, { passive: true });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', updateParallax);
setInterval(() => tickClock(), 1000);

// keep several open new-tab pages in sync
Store.onChange(changes => {
  if (changes.tiles && JSON.stringify(changes.tiles.newValue) !== JSON.stringify(tiles)) {
    tiles = sanitizeTiles(changes.tiles.newValue);
    renderGrid();
    if (openFolderId) renderFolder();
  }
  if (changes.games && !gameSession && changes.games.newValue) {
    gameData = { saves: changes.games.newValue.saves || {}, stats: changes.games.newValue.stats || {} };
  }
  if (changes.settings && JSON.stringify(changes.settings.newValue) !== JSON.stringify(settings)) {
    settings = mergeSettings(changes.settings.newValue);
    applySettings();
    refreshWidgets();
    if (settingsPanel.classList.contains('open')) syncSettingsUI();
  }
});

// ---------------------------------------------------------------- toast
let toastTimer = null;
function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(h('span', {}, msg));
  if (action) t.append(h('button', { type: 'button', onclick: () => { action.run(); t.classList.remove('show'); } }, action.label));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
}

// ---------------------------------------------------------------- start
(async function init() {
  await load();
  const storedGames = await Store.get('games', null);
  if (storedGames && typeof storedGames === 'object') gameData = { saves: storedGames.saves || {}, stats: storedGames.stats || {} };
  // 1.8.0 turned the flip on for everyone; from 1.8.1 it's off unless you switch it on (done once, so your choice sticks)
  if (!settings.flipDefaultOff) {
    settings.flipOpen = false;
    settings.flipDefaultOff = true;
    saveSettings();
  }
  if (!settings.gamesAdded) {
    if (!everyTile().some(x => x.tile.type === 'game')) tiles.push(gamesFolder());
    settings.gamesAdded = true;
    settings.gamesAdded2 = true;
    settings.gamesAdded3 = true;
    saveTiles();
    saveSettings();
  }
  // 1.9: put the new games into the Games folder you already have (only once, and only if that folder still exists)
  if (!settings.gamesAdded2) {
    const have = new Set(everyTile().filter(x => x.tile.type === 'game').map(x => x.tile.game));
    const folder = everyTile().map(x => x.tile).find(t => t.type === 'folder' && t.children.some(c => c.type === 'game'));
    if (folder) NEW_IN_1_9.filter(g => !have.has(g)).forEach(g => folder.children.push(gameTile(g)));
    settings.gamesAdded2 = true;
    saveTiles();
    saveSettings();
  }
  // 1.12: the same for Cat Nap and Pairs
  if (!settings.gamesAdded3) {
    const have = new Set(everyTile().filter(x => x.tile.type === 'game').map(x => x.tile.game));
    const folder = everyTile().map(x => x.tile).find(t => t.type === 'folder' && t.children.some(c => c.type === 'game'));
    if (folder) NEW_IN_1_12.filter(g => !have.has(g)).forEach(g => folder.children.push(gameTile(g)));
    settings.gamesAdded3 = true;
    saveTiles();
    saveSettings();
  }
  applySettings();
  renderGrid();
  document.body.classList.add('ready');
  if (settings.animations) requestAnimationFrame(() => entrance(grid));
  refreshWeather();
  widgetCache = (await Store.get('widgetCache', null)) || { news: null, stocks: null };
  refreshWidgets();
  setInterval(() => refreshWidgets(), 60e3); // only refetches what's stale
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshWidgets(); });
  if (hasChromeStorage) chrome.storage.local.remove('liveCache').catch(() => {}); // leftover from the live-tiles version
  if (!(await Store.get('tiles', null))) saveTiles();
})();
