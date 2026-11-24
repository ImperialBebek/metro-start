'use strict';
/* Metro motion for a large screen, ported from metro-launcher (MainActivity.kt and Motion.kt), the Metro TV
   home screen, whose dashboard entrance and app launch follow the Xbox One (2013) dashboard. Every curve is
   Silverlight's ExponentialEase, the same one metroweb decodes from Windows Phone 8.1. */
const Motion = (() => {
  // ExponentialEase sampled into CSS linear(): out for arrivals, in for exits (metro-launcher's Expo)
  const easeIn = e => t => (Math.exp(e * t) - 1) / (Math.exp(e) - 1);
  const expo = (out, e = 6) => {
    const f = out ? t => 1 - easeIn(e)(1 - t) : easeIn(e);
    return `linear(${Array.from({ length: 33 }, (_, i) => +f(i / 32).toFixed(4)).join(', ')})`;
  };
  const OUT_6 = expo(true), IN_6 = expo(false), OUT_4_5 = expo(true, 4.5), IN_3 = expo(false, 3);
  // WP8.1's Log / Exp interpolation at weight 150 (ln 150 = 5.01): Start folders' slides and fades
  const OUT_5 = expo(true, 5), IN_5 = expo(false, 5);

  let enabled = true;
  const reduced = () => !enabled || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const settle = anims => Promise.all(anims.map(a => a.finished.catch(() => {})));
  const near = r => r.left < innerWidth * 1.12 && r.right > -innerWidth * 0.12 && r.bottom > 0 && r.top < innerHeight;
  const cssNum = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  const tilesOf = container => [...container.children].filter(el => el.classList.contains('tile'));
  const centre = r => [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const header = () => document.getElementById('top');
  // the anchor stands in for the launcher's hero tile: the biggest tile on screen, top-left first
  const anchorOf = (tiles, rects) => tiles.reduce((best, el, i) => {
    const r = rects[i], b = best && rects[tiles.indexOf(best)];
    if (!near(r) || r.left < 0) return best;
    return !best || r.width * r.height > b.width * b.height ? el : best;
  }, null);

  // tiles still pushed back by a launch; any entrance or clearZooms(false) brings them forward
  const receded = new Set();
  const cancelRecede = () => { for (const a of receded) a.cancel(); receded.clear(); };

  // playEntrance (Xbox One dashboard): the anchor tile emerges from deep in its slot (scale 0.44, 520 ms); the rest
  // fly out of it in 3D, pulled 34% towards it at scale 0.52 and turned up to 15deg, in a clockwise sweep that starts
  // at half past one, outer columns last: delay = 70 + sweep x 230 + ring x 140 ms. The header follows at 180 ms.
  function flyIn(container, { anchor = null, keepAnchor = false, withHeader = false } = {}) {
    cancelRecede();
    if (reduced()) return Promise.resolve();
    const tiles = tilesOf(container);
    if (!tiles.length) return Promise.resolve();
    const rects = tiles.map(el => el.getBoundingClientRect());
    if (!tiles.includes(anchor)) { anchor = anchorOf(tiles, rects); keepAnchor = false; }
    const W = innerWidth, H = innerHeight;
    const ar = anchor ? rects[tiles.indexOf(anchor)] : null;
    const [ax, ay] = ar ? centre(ar) : [W * 0.36, H * 0.4];
    const halfW = ar ? ar.width / 2 : W * 0.1;
    const step = (cssNum('--unit') || 70) + (cssNum('--gap') || 10);
    const p = `perspective(${H * 3.7}px)`; // metro-launcher's camera, 9000 dp away
    const anims = [];
    tiles.forEach((el, i) => {
      const r = rects[i];
      if (!near(r) || (el === anchor && keepAnchor)) return;
      if (el === anchor) {
        anims.push(el.animate([{ opacity: 0, transform: `${p} scale(0.44)` }, { opacity: 1, transform: `${p} scale(1)` }],
          { duration: 520, easing: OUT_4_5, fill: 'backwards' }));
        return;
      }
      const [cx, cy] = centre(r);
      const dx = cx - ax, dy = cy - ay;
      const fromTwelve = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      const sweep = ((fromTwelve - 40 + 360) % 360) / 360;
      const outer = Math.max(0, Math.abs(dx) - (halfW + step * 1.25));
      const delay = 70 + sweep * 230 + clamp(outer / (step * 2.2), 0, 1.4) * 140;
      const ry = clamp((-dx / W) * 20, -15, 15), rx = clamp((dy / H) * 16, -12, 12);
      anims.push(el.animate([
        { opacity: 0, transform: `${p} translate(${-dx * 0.34}px, ${-dy * 0.34}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(0.52)` },
        { opacity: 1, transform: `${p} translate(0px, 0px) rotateX(0deg) rotateY(0deg) scale(1)` },
      ], { duration: 520, delay, easing: OUT_4_5, fill: 'backwards' }));
    });
    const head = withHeader && header();
    if (head) {
      head.getAnimations().forEach(a => a.cancel());
      anims.push(head.animate([{ opacity: 0, transform: `translateY(${H * 0.018}px) scale(0.92)` }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: 180, easing: OUT_4_5, fill: 'backwards' }));
    }
    return settle(anims);
  }

  // recedeDashboard: every other tile shrinks into depth towards the launched one and fades
  // (scale 0.82, 14% closer, 220 ms ExponentialEase(3) in, up to 60 ms later the farther it is); the header goes in 190 ms
  function recede(container, except) {
    if (reduced()) return;
    const er = except.getBoundingClientRect();
    const [ox, oy] = centre(er);
    for (const el of tilesOf(container)) {
      if (el === except) continue;
      const r = el.getBoundingClientRect();
      if (!near(r)) continue;
      const [cx, cy] = centre(r);
      const dx = cx - ox, dy = cy - oy;
      receded.add(el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate(${-dx * 0.14}px, ${-dy * 0.14}px) scale(0.82)` }],
        { duration: 220, delay: Math.min(60, (Math.hypot(dx, dy) / innerWidth) * 55), easing: IN_3, fill: 'forwards' }));
    }
    const head = container.id === 'grid' && header();
    if (head) receded.add(head.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.92)' }], { duration: 190, easing: IN_3, fill: 'forwards' }));
  }

  // launch: the rest of Start recedes while the tile opens up to the whole screen in its colour (35 ms in, 410 ms
  // ExponentialEase(4.5)); its icon glides to the centre growing to 1.55x and its name fades by 45% of the way
  const zooms = new Set();
  let launched = null;
  function zoomFrom(el) {
    if (reduced()) return Promise.resolve();
    recede(el.parentElement, el);
    const r = el.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    const layer = (cls, node = document.createElement('div')) => { node.classList.add('launch-layer', cls); document.body.append(node); zooms.add(node); return node; };
    const fill = layer('launch-fill');
    fill.style.background = getComputedStyle(el).backgroundColor;
    const timing = { delay: 35, duration: 410, easing: OUT_4_5, fill: 'both' };
    const anims = [fill.animate([{ clipPath: `inset(${r.top}px ${W - r.right}px ${H - r.bottom}px ${r.left}px)` }, { clipPath: 'inset(0px 0px 0px 0px)' }], timing)];
    // copies of the icon and the name, lifted out of the tile; the wrapper keeps the tile's size class for their styles
    const lift = (part, style) => {
      const mark = layer('launch-mark');
      const size = [...el.classList].find(c => c.startsWith('size-'));
      if (size) mark.classList.add(size);
      const copy = part.cloneNode(true);
      Object.assign(copy.style, { position: 'static', inset: 'auto', margin: '0' }, style);
      mark.append(copy);
      return mark;
    };
    const icon = el.querySelector('.site-icon, .tile-face, .folder-preview');
    if (icon) {
      const ir = icon.getBoundingClientRect();
      const mark = lift(icon, { width: '100%', height: '100%' });
      Object.assign(mark.style, { width: ir.width + 'px', height: ir.height + 'px' });
      anims.push(mark.animate([{ transform: `translate(${ir.left}px, ${ir.top}px) scale(1)` },
        { transform: `translate(${(W - ir.width) / 2}px, ${(H - ir.height) / 2}px) scale(1.55)` }], timing));
    }
    const label = el.querySelector('.tile-label');
    if (label) {
      const lr = label.getBoundingClientRect();
      const ls = getComputedStyle(label);
      const name = lift(label, { font: ls.font, color: ls.color, textShadow: ls.textShadow, whiteSpace: 'nowrap', overflow: 'hidden' });
      Object.assign(name.style, { width: lr.width + 'px', transform: `translate(${lr.left}px, ${lr.top}px)` });
      name.animate([{ opacity: 1 }, { opacity: 0 }], { delay: 35, duration: 185, fill: 'forwards' });
    }
    launched = el;
    el.style.visibility = 'hidden';
    return settle(anims);
  }
  // fadeZooms: the launch layer fades in 160 ms and the launched tile is back in its slot;
  // without animation the receded tiles come forward too
  function clearZooms(animate = true) {
    if (launched) { launched.style.visibility = ''; launched = null; }
    if (!animate) cancelRecede();
    for (const v of zooms) {
      zooms.delete(v);
      if (!animate || reduced()) { v.remove(); continue; }
      v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.then(() => v.remove(), () => v.remove());
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

  return { OUT_6, IN_6, OUT_5, IN_5, setEnabled: on => { enabled = on; }, reduced, flyIn, zoomFrom, clearZooms, panelIn, panelOut, flipTile };
})();
