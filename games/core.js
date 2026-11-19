'use strict';
/* Offline games. Each game registers itself here and gets an `api` from the app:
   api.stage (element to draw in), api.load()/api.save(state) for progress, api.stats()/api.setStats(obj),
   api.status([[label, value]…]), api.tools([elements]), api.banner({title, text, actions}), api.clearBanner(),
   api.confirm(text, label, run), api.onKey(fn), api.toast(text). Everything runs locally. */
const Games = (() => {
  const LIST = {};

  function register(id, def) { LIST[id] = def; }
  function mount(id, api) { return LIST[id] ? LIST[id].mount(api) : null; }

  // ---- shared helpers
  const fmtTime = secs => {
    const s = Math.max(0, Math.floor(secs || 0));
    const hrs = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return hrs ? `${hrs}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };
  const shuffle = (a, rnd = Math.random) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  // Small seeded random generator, so a daily puzzle is the same all day
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hashString = s => {
    let x = 2166136261;
    for (const ch of s) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
    return x >>> 0;
  };
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // A clock that only counts while the page is visible and running() is true
  function clock(running, add) {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (!document.hidden && running()) add(dt);
    }, 250);
    return () => clearInterval(id);
  }

  // Segmented control (same look as the rest of Metro Start)
  function seg(options, value, onPick, label) {
    const wrap = h('div', { class: 'seg seg-sm', role: 'group', 'aria-label': label || null });
    const mark = v => wrap.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(v))));
    for (const [v, text] of options) {
      wrap.append(h('button', { type: 'button', dataset: { value: String(v) }, onclick: () => onPick(v, mark) }, text));
    }
    mark(value);
    wrap.mark = mark;
    return wrap;
  }
  // A canvas that keeps a fixed logical size (lw x lh) and scales to fit the game area, sharp on high-DPI screens
  function canvas(stage, lw, lh) {
    const cv = h('canvas', { class: 'arcade-canvas' });
    const wrap = h('div', { class: 'arcade-wrap' }, cv);
    stage.append(wrap);
    const ctx = cv.getContext('2d');
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const k = Math.max(0.2, Math.min(r.width / lw, r.height / lh));
      const dpr = window.devicePixelRatio || 1;
      cv.style.width = `${Math.floor(lw * k)}px`;
      cv.style.height = `${Math.floor(lh * k)}px`;
      cv.width = Math.round(lw * k * dpr);
      cv.height = Math.round(lh * k * dpr);
      ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
      out.k = k;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    const out = { cv, ctx, wrap, k: 1, fit, destroy: () => ro.disconnect() };
    fit();
    return out;
  }
  // requestAnimationFrame loop; step(dt) gets seconds (capped so a slow frame can't teleport things)
  function loop(step) {
    let last = performance.now();
    let id = requestAnimationFrame(function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  }
  const font = (weight, px) => `${weight} ${px}px ${getComputedStyle(document.documentElement).getPropertyValue('--font') || 'sans-serif'}`;

  const button = (text, run, extra = {}) => h('button', { type: 'button', class: 'btn btn-sm', onclick: run, ...extra }, text);

  // Glyphs shown on the game tiles
  const GLYPHS = {
    catnap: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.6 18.6c0-4.2 2.4-7.4 7.4-7.4s7.4 3.2 7.4 7.4c0 1-.9 1.6-2 1.6H6.6c-1.1 0-2-.6-2-1.6z"/><path d="M5.4 10.6 5 3.8l4.6 3.6M18.6 10.6l.4-6.8-4.6 3.6"/><circle cx="12" cy="11" r="6"/><path d="M8.6 11.4q1.4 1.3 2.7 0M12.7 11.4q1.4 1.3 2.7 0" stroke="#000" stroke-opacity=".55" stroke-width="1" fill="none" stroke-linecap="round"/><text x="19.2" y="6.4" font-size="4.4" font-family="sans-serif" font-weight="700">z</text><text x="21.4" y="3.6" font-size="3.2" font-family="sans-serif" font-weight="700">z</text></svg>',
    pairs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="5" width="8.5" height="12" rx="1" transform="rotate(-8 6.75 11)" fill="currentColor" fill-opacity=".25"/><rect x="13" y="5" width="8.5" height="12" rx="1" transform="rotate(8 17.25 11)"/><g fill="currentColor" stroke="none" transform="translate(17.3 11.6) rotate(8)"><ellipse cx="0" cy="1.2" rx="1.7" ry="1.4"/><circle cx="-1.9" cy="-.8" r=".75"/><circle cx="-.65" cy="-1.9" r=".75"/><circle cx=".65" cy="-1.9" r=".75"/><circle cx="1.9" cy="-.8" r=".75"/></g></svg>',
    words: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="8" width="6.2" height="6.2" fill="currentColor" fill-opacity=".35"/><rect x="8.9" y="8" width="6.2" height="6.2"/><rect x="16.3" y="8" width="6.2" height="6.2" fill="currentColor" fill-opacity=".15"/><text x="4.6" y="12.9" font-size="4.6" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif" font-weight="700">W</text><text x="12" y="12.9" font-size="4.6" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif" font-weight="700">O</text><text x="19.4" y="12.9" font-size="4.6" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif" font-weight="700">R</text></svg>',
    snake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M4 19h6v-6H6V7h10v6"/><rect x="18.2" y="16.2" width="2.6" height="2.6" fill="currentColor" stroke="none"/></svg>',
    blocks: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="13" width="5.6" height="5.6"/><rect x="9.2" y="13" width="5.6" height="5.6"/><rect x="15.4" y="13" width="5.6" height="5.6" fill-opacity=".5"/><rect x="9.2" y="6.8" width="5.6" height="5.6"/><rect x="15.4" y="19.2" width="5.6" height="2.3" fill-opacity=".5"/></svg>',
    bricks: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="3" width="6.2" height="3"/><rect x="8.9" y="3" width="6.2" height="3" fill-opacity=".6"/><rect x="15.8" y="3" width="6.2" height="3"/><rect x="2" y="6.7" width="6.2" height="3" fill-opacity=".6"/><rect x="15.8" y="6.7" width="6.2" height="3" fill-opacity=".6"/><circle cx="12" cy="14" r="1.6"/><rect x="7.5" y="19" width="9" height="2"/></svg>',
    minesweeper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12.5" r="5.5" fill="currentColor" fill-opacity=".25"/><path d="M12 3.5v3M12 18.5v3M3 12.5h3M18 12.5h3M5.6 6.1l2.1 2.1M16.3 16.8l2.1 2.1M5.6 18.9l2.1-2.1M16.3 8.2l2.1-2.1"/><circle cx="10" cy="10.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
    sudoku: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke-width="1.1"/><text x="6" y="7.6" font-size="4.6" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">5</text><text x="18" y="19.6" font-size="4.6" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">3</text><text x="12" y="13.6" font-size="4.6" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">8</text></svg>',
    solitaire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="3.5" y="5" width="11" height="15" rx="1.5" transform="rotate(-10 9 12.5)"/><rect x="9.5" y="4" width="11" height="15" rx="1.5" fill="currentColor" fill-opacity=".15"/><path d="M15 9.2c-.9-1.4-3-.7-2.7 1 .3 1.4 2.7 3 2.7 3s2.4-1.6 2.7-3c.3-1.7-1.8-2.4-2.7-1z" fill="currentColor" stroke="none"/></svg>',
  };

  return { LIST, register, mount, fmtTime, shuffle, seeded, hashString, today, clock, seg, button, canvas, loop, font, GLYPHS };
})();
