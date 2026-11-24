'use strict';
/* Metro motion for a large screen, ported from metro-launcher (github.com/ImperialBebek/metro-launcher,
   MainActivity.kt and Motion.kt), the Metro TV home screen. Every curve is Silverlight's ExponentialEase,
   the same one metroweb decodes from Windows Phone 8.1 (packages/metroweb/src/motion.ts). */
const Motion = (() => {
  // ExponentialEase sampled into CSS linear(): out for arrivals, in for exits (metro-launcher's Expo)
  const easeIn = e => t => (Math.exp(e * t) - 1) / (Math.exp(e) - 1);
  const expo = (out, e = 6) => {
    const f = out ? t => 1 - easeIn(e)(1 - t) : easeIn(e);
    return `linear(${Array.from({ length: 33 }, (_, i) => +f(i / 32).toFixed(4)).join(', ')})`;
  };
  const OUT_6 = expo(true), IN_6 = expo(false), OUT_5 = expo(true, 5);

  let enabled = true;
  const reduced = () => !enabled || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const settle = anims => Promise.all(anims.map(a => a.finished.catch(() => {})));
  const visible = r => r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;

  // playEntrance: tiles sweep in from the right as a wave, left columns first, 560 ms;
  // delay = screen x / screen width x 220 ms + row x 30 ms, shift = 0.6 of a tile cell
  function waveIn(container) {
    if (reduced()) return Promise.resolve();
    const tiles = [...container.children].filter(el => el.classList.contains('tile'));
    if (!tiles.length) return Promise.resolve();
    const top = container.getBoundingClientRect().top;
    const cell = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--unit')) || 70;
    const step = cell + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 10);
    const anims = tiles.flatMap(el => {
      const r = el.getBoundingClientRect();
      if (!visible(r)) return [];
      const row = Math.max(0, Math.round((r.top - top) / step));
      const delay = (Math.max(0, r.left) / innerWidth) * 220 + row * 30;
      return [el.animate([{ opacity: 0, translate: `${cell * 0.6}px 0` }, { opacity: 1, translate: '0 0' }],
        { duration: 560, delay, easing: OUT_6, fill: 'backwards' })];
    });
    return settle(anims);
  }

  // launch: the tile grows to fill the screen in its colour, its icon gliding to the centre, 420 ms ExponentialEase(5)
  const zooms = new Set();
  function zoomFrom(el) {
    if (reduced()) return Promise.resolve();
    const r = el.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    const fill = document.createElement('div');
    fill.className = 'launch-fill';
    fill.style.background = getComputedStyle(el).backgroundColor;
    document.body.append(fill);
    zooms.add(fill);
    const anims = [fill.animate([
      { transform: `translate(${r.left}px, ${r.top}px) scale(${r.width / W}, ${r.height / H})` },
      { transform: 'none' },
    ], { duration: 420, easing: OUT_5, fill: 'forwards' })];
    const icon = el.querySelector('.site-icon, .tile-face, .folder-preview');
    if (icon) {
      const ir = icon.getBoundingClientRect();
      const mark = icon.cloneNode(true);
      mark.className += ' launch-mark';
      Object.assign(mark.style, { width: ir.width + 'px', height: ir.height + 'px' });
      document.body.append(mark);
      zooms.add(mark);
      const to = `translate(${(W - ir.width) / 2}px, ${(H - ir.height) / 2}px) scale(1.6)`;
      anims.push(mark.animate([{ transform: `translate(${ir.left}px, ${ir.top}px)` }, { transform: to }],
        { duration: 420, easing: OUT_5, fill: 'forwards' }));
    }
    return settle(anims);
  }
  // fadeZooms: once the app is up, the launch layer fades away (60 ms delay, 260 ms)
  function clearZooms(animate = true) {
    for (const v of zooms) {
      zooms.delete(v);
      if (!animate || reduced()) { v.remove(); continue; }
      v.animate([{ opacity: 1 }, { opacity: 0 }], { delay: 60, duration: 260, fill: 'forwards' }).finished.then(() => v.remove(), () => v.remove());
    }
  }

  // attachOverlay / closeOverlay: a panel fades in sliding 5% of the screen from the right in 340 ms; a sheet over a
  // scrim slides 8% while the scrim fades in 200 ms; leaving, it fades sliding 3% right in 160 ms (ExponentialEase in)
  function panelIn(el, { distance = 0.05 } = {}) {
    if (reduced()) return Promise.resolve();
    return settle([el.animate([{ opacity: 0, translate: `${innerWidth * distance}px 0` }, { opacity: 1, translate: '0 0' }],
      { duration: 340, easing: OUT_6 })]);
  }
  function panelOut(el) {
    if (reduced()) return Promise.resolve();
    return settle([el.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${innerWidth * 0.03}px 0` }],
      { duration: 160, easing: IN_6, fill: 'forwards' })]);
  }
  const fade = (el, dir) => (reduced() ? Promise.resolve() : settle([el.animate(dir === 'in' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
    { duration: dir === 'in' ? 200 : 160, easing: dir === 'in' ? 'linear' : IN_6, fill: dir === 'in' ? 'none' : 'forwards' })]));

  // flip: the tile tips away on its horizontal axis (220 ms, in), swaps faces edge-on, and lands (420 ms, out);
  // metro-launcher's camera sits 8000 dp away, about 3.3 screen heights
  async function flipTile(el, swap) {
    const p = `perspective(${innerHeight * 3.3}px) `;
    const hide = el.animate([{ transform: p + 'rotateX(0deg)' }, { transform: p + 'rotateX(90deg)' }], { duration: 220, easing: IN_6, fill: 'forwards' });
    try { await hide.finished; } catch { return; }
    swap();
    const show = el.animate([{ transform: p + 'rotateX(-90deg)' }, { transform: p + 'rotateX(0deg)' }], { duration: 420, easing: OUT_6 });
    hide.cancel();
    await show.finished.catch(() => {});
  }

  return { OUT_6, IN_6, OUT_5, setEnabled: on => { enabled = on; }, reduced, waveIn, zoomFrom, clearZooms, panelIn, panelOut, fade, flipTile };
})();
