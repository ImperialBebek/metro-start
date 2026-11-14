'use strict';
/* Wallpaper gallery: Featured Pictures from Wikimedia Commons (chosen by the Commons community as some of its finest images),
   grouped like Chrome's backgrounds. Only wide, high-resolution JPEG photos are shown. A picked wallpaper is downloaded once
   and kept in this Chrome profile, so it never changes and works offline. */
const Wallpapers = (() => {
  const CATEGORIES = [
    { id: 'landscapes', label: 'Landscapes', sources: ['Featured pictures of landscapes'] },
    { id: 'seascapes', label: 'Seascapes', sources: ['Featured pictures of coasts', 'Featured pictures of islands'] },
    { id: 'cities', label: 'Cities', sources: ['Featured pictures of cityscapes'] },
    { id: 'night', label: 'Night sky', sources: ['Featured pictures of astronomy'] },
    { id: 'art', label: 'Paintings', sources: ['Featured pictures of paintings'] },
  ];
  const API = 'https://commons.wikimedia.org/w/api.php';
  const CACHE_KEY = 'wallpaperCatalog';
  const CACHE_DAYS = 14;
  const PAGE = 24; // pictures shown per "Show more"

  const stripHtml = s => (new DOMParser().parseFromString(String(s || ''), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
  const niceName = file => file.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ').replace(/\s*\(\d+\)\s*$/, '').trim();

  // Wikimedia only serves a fixed set of preview widths, so ask for one of those
  function fullWidth() {
    const px = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1);
    return px > 2200 ? 3840 : 1920;
  }
  function toItem(page) {
    const ii = page.imageinfo && page.imageinfo[0];
    if (!ii || ii.mime !== 'image/jpeg' || !ii.thumburl) return null;
    const ratio = ii.width / ii.height;
    if (ii.width < 1920 || ratio < 1.3 || ratio > 2.4) return null; // wide, sharp photos only
    const meta = ii.extmetadata || {};
    const want = fullWidth();
    const full = ii.width > want ? ii.thumburl.replace(/\/500px-/, `/${want}px-`)
      : ii.width > 1920 ? ii.thumburl.replace(/\/500px-/, '/1920px-') : ii.url;
    return {
      id: page.title,
      title: stripHtml(meta.ObjectName && meta.ObjectName.value) || niceName(page.title),
      author: stripHtml(meta.Artist && meta.Artist.value),
      license: stripHtml(meta.LicenseShortName && meta.LicenseShortName.value),
      page: ii.descriptionurl,
      thumb: ii.thumburl,
      full,
    };
  }

  async function fetchBatch(source, cont) {
    const p = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*',
      generator: 'categorymembers', gcmtitle: `Category:${source}`, gcmtype: 'file', gcmlimit: '100',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '500',
      iiextmetadatafilter: 'Artist|LicenseShortName|ObjectName',
    });
    if (cont) p.set('gcmcontinue', cont);
    let r;
    try {
      r = await fetch(`${API}?${p}`, { credentials: 'omit' });
    } catch {
      throw new Error('Can’t reach Wikimedia Commons. Check your internet connection.');
    }
    if (!r.ok) throw new Error(`Wikimedia Commons answered with error ${r.status}. Try again later.`);
    const j = await r.json();
    const pages = (j.query && j.query.pages) || [];
    const items = pages.map(toItem).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
    return { items, next: (j.continue && j.continue.gcmcontinue) || null };
  }

  // Per category: everything found so far, plus where each source category left off
  const state = {};
  async function load(catId, { more = false } = {}) {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return { items: [], done: true };
    let s = state[catId];
    if (!s) {
      const cache = (await Store.get(CACHE_KEY, null)) || {};
      const c = cache[catId];
      s = c && Date.now() - c.at < CACHE_DAYS * 86400000
        ? { items: c.items, conts: c.conts, shown: Math.min(PAGE, c.items.length) }
        : { items: [], conts: cat.sources.map(src => ({ src, cont: null, done: false })), shown: 0 };
      state[catId] = s;
    }
    const want = (more ? s.shown : 0) + PAGE;
    let calls = 0;
    while (s.items.length < want && s.conts.some(c => !c.done) && calls < 6) {
      const c = s.conts.find(x => !x.done);
      const batch = await fetchBatch(c.src, c.cont);
      calls++;
      const seen = new Set(s.items.map(i => i.id));
      s.items.push(...batch.items.filter(i => !seen.has(i.id)));
      c.cont = batch.next;
      c.done = !batch.next;
    }
    s.shown = Math.min(want, s.items.length);
    if (calls) {
      const cache = (await Store.get(CACHE_KEY, null)) || {};
      cache[catId] = { at: Date.now(), items: s.items, conts: s.conts };
      Store.set(CACHE_KEY, cache).catch(() => {});
    }
    return { items: s.items.slice(0, s.shown), done: s.shown >= s.items.length && s.conts.every(c => c.done) };
  }

  // Download the full picture once; returns a data URL to keep, or the web address if the download isn't allowed
  async function download(item, readImage) {
    const maxDim = Math.min(3840, Math.max(1920, Math.round(Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1))));
    try {
      const r = await fetch(item.full, { credentials: 'omit' });
      if (!r.ok) throw new Error(String(r.status));
      return await readImage(await r.blob(), maxDim, 'image/jpeg', 0.86);
    } catch (err) {
      console.warn('Saving the wallpaper locally failed; using its web address instead.', err);
      return item.full;
    }
  }

  return { CATEGORIES, load, download };
})();
