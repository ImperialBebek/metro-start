'use strict';
/* Metro motion, ported from metroweb (github.com/ImperialBebek/metroweb, packages/metroweb/src/motion.ts
   and apps/web/src/start/tileFlip.ts). The values are decoded from the Windows Phone 8.1 UIX markup
   (startmenu STYLES.UIX, ANIMATIONS.UIX, ShellControls FlipTile.uix) and the Windows Phone Toolkit;
   see metroweb's docs/design/07-motion.md and 10-start-and-live-tiles.md. */
const Motion = (() => {
  // Silverlight's ExponentialEase sampled into CSS linear(); the same curves are CSS variables in styles.css
  const sampled = (curve, steps = 32) => `linear(${Array.from({ length: steps + 1 }, (_, i) => curve(i / steps).toFixed(4)).join(', ')})`;
  const easeIn = e => t => (Math.exp(e * t) - 1) / (Math.exp(e) - 1);
  const expo = (e, mode) => sampled(mode === 'in' ? easeIn(e) : t => 1 - easeIn(e)(1 - t));
  const EXPO_OUT_2 = expo(2, 'out'), EXPO_OUT_5 = expo(5, 'out'), EXPO_IN_5 = expo(5, 'in');
  const EXPO_OUT_6 = expo(6, 'out'), EXPO_IN_6 = expo(6, 'in');

  let enabled = true;
  const reduced = () => !enabled || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const settle = anims => Promise.all(anims.map(a => a.finished.catch(() => {})));

  // The phone's camera sits 1000 px from a 480 px screen and 8.1 scales it with the screen
  // (about 2.08 x its width); hinges are fractions of the width and px behind it, scaled the same way.
  const camera = w => 1000 * w / 480;

  // START_TURNSTILE_81: NavigateAwayForward and NavigateToBackTile (startmenu STYLES.UIX)
  const START = {
    forwardOut: { from: 0, to: -50, duration: 128, easing: EXPO_IN_5, hinge: { x: -0.1, z: 50 } },
    backwardIn: { from: -50, to: 0, duration: 300, easing: EXPO_OUT_5, hinge: { x: 0.1, z: 100 } },
  };
  // NATIVE_PAGE_TURNSTILE_81: whole-page turns (ANIMATIONS.UIX)
  const PAGE = {
    forwardIn: { from: 80, to: 0, duration: 300, easing: EXPO_OUT_5, hinge: { x: -0.1, z: 100 } },
    backwardOut: { from: 0, to: 80, duration: 128, easing: EXPO_IN_5, hinge: { x: -0.1, z: 100 } },
  };
  // TileFeatherDelay_Y, TileFeatherDelay_GridX and TileClickedNavigateAway: bottom-right first, the tapped tile last
  const FEATHER_Y_MAX = 145, FEATHER_X_MAX = 120, SOURCE_EXTRA_DELAY = 150;

  // TurnstileFeather: every tile swings on one vertical hinge left of the screen, seen through one camera
  // at the screen's centre, so tiles share a vanishing point.
  function feather(el, mode, delay) {
    const { from, to, duration, easing, hinge } = START[mode];
    const r = el.getBoundingClientRect();
    const W = innerWidth, H = innerHeight, k = W / 480;
    const pivotX = W / 2 - W * hinge.x, depth = hinge.z * k;
    const at = a => `perspective(${camera(W)}px) translate3d(${-pivotX}px, 0, ${-depth}px) rotateY(${a}deg) translate3d(${pivotX}px, 0, ${depth}px)`;
    const transformOrigin = `${W / 2 - r.left}px ${H / 2 - r.top}px`;
    const out = mode.endsWith('Out');
    const frames = out
      ? [{ transform: at(from), transformOrigin, opacity: 1 }, { transform: at(to), transformOrigin, opacity: 1, offset: 0.999 }, { transform: at(to), transformOrigin, opacity: 0 }]
      : [{ transform: at(from), transformOrigin, opacity: 0 }, { transform: at(from), transformOrigin, opacity: 1, offset: 0.001 }, { transform: at(to), transformOrigin, opacity: 1 }];
    return el.animate(frames, { duration, easing, delay, fill: out ? 'forwards' : 'both' });
  }
  function featherTargets(container, source) {
    const W = innerWidth, H = innerHeight;
    const list = [...container.children].filter(el => el.classList.contains('tile')).flatMap(el => {
      const r = el.getBoundingClientRect();
      if (r.right <= 0 || r.left >= W || r.bottom <= 0 || r.top >= H) return [];
      const yN = Math.min(Math.max(r.top, 0) / H, 1), xN = Math.min(Math.max(r.left, 0) / W, 1);
      return [{ el, delay: (1 - yN) * FEATHER_Y_MAX + (1 - xN) * FEATHER_X_MAX }];
    });
    if (source) {
      const last = Math.max(0, ...list.filter(t => t.el !== source).map(t => t.delay)) + SOURCE_EXTRA_DELAY;
      list.forEach(t => { if (t.el === source) t.delay = last; });
    }
    return list;
  }

  const away = new WeakMap(); // container -> animations holding tiles away
  function featherOut(container, source) {
    featherReset(container);
    if (reduced()) return Promise.resolve();
    const anims = featherTargets(container, source).map(t => feather(t.el, 'forwardOut', t.delay));
    away.set(container, anims);
    return settle(anims);
  }
  function featherIn(container) {
    const held = away.get(container) || [];
    away.delete(container);
    if (reduced()) { held.forEach(a => a.cancel()); return Promise.resolve(); }
    const anims = featherTargets(container).map(t => feather(t.el, 'backwardIn', t.delay));
    held.forEach(a => a.cancel());
    return settle(anims).then(() => anims.forEach(a => a.cancel()));
  }
  function featherReset(container) {
    (away.get(container) || []).forEach(a => a.cancel());
    away.delete(container);
  }

  // Whole-page native turnstile around CenterPointPercent (-0.1, 0, 100)
  function pageTurn(el, mode) {
    if (reduced()) return Promise.resolve();
    const { from, to, duration, easing, hinge } = PAGE[mode];
    const W = innerWidth, r = el.getBoundingClientRect(), k = W / 480;
    const origin = `${W * hinge.x - r.left}px 50% ${-hinge.z * k}px`;
    const p = `perspective(${camera(W)}px) `;
    const out = mode.endsWith('Out');
    return settle([el.animate([
      { transform: p + `rotateY(${from}deg)`, transformOrigin: origin, opacity: 1 },
      { transform: p + `rotateY(${to}deg)`, transformOrigin: origin, opacity: 1, offset: 0.999 },
      { transform: p + `rotateY(${to}deg)`, transformOrigin: origin, opacity: out ? 0 : 1 },
    ], { duration, easing, fill: out ? 'forwards' : 'none' })]);
  }

  // Iris interpolations (uixrender): Exp eases in, Log out, SCurve is Exp then Log at double speed
  const uExp = w => t => (w ** t - 1) / (w - 1);
  const uLog = w => t => 1 - uExp(w)(1 - t);
  const uS = w => t => (t < 0.5 ? uExp(w)(2 * t) / 2 : 1 - uExp(w)(2 - 2 * t) / 2);
  const lin = t => t;
  const sample = (track, ms) => {
    if (ms <= track[0][0]) return track[0][1];
    for (let i = 1; i < track.length; i++) {
      const [t1, v1, c = lin] = track[i], [t0, v0] = track[i - 1];
      if (ms <= t1) return v0 + (v1 - v0) * c((ms - t0) / (t1 - t0));
    }
    return track[track.length - 1][1];
  };

  // 8.1 ContinuumActiveForwardShow: the new page's title rises and tips into place
  const CONTINUUM_SHOW = {
    duration: 350,
    y: [[0, 200], [100, -40, uLog(60)], [350, 0, uS(7.5)]],
    rotate: [[0, 50], [350, 0, uLog(10)]],
    scale: [[0, 1.5], [350, 1, t => 1 - (1 - t) ** 2]],
    opacity: [[0, 0], [167, 1, uLog(10)]],
  };
  function continuumShow(el, delay = 0) {
    if (reduced()) return Promise.resolve();
    const c = CONTINUUM_SHOW, steps = Math.ceil(c.duration / 8), frames = [];
    for (let i = 0; i <= steps; i++) {
      const ms = (c.duration * i) / steps;
      frames.push({ offset: i / steps, translate: `0px ${sample(c.y, ms).toFixed(2)}px`, rotate: `x ${sample(c.rotate, ms).toFixed(2)}deg`,
        scale: sample(c.scale, ms).toFixed(4), opacity: sample(c.opacity, ms).toFixed(4), transformOrigin: '0% 100%' });
    }
    return settle([el.animate(frames, { duration: c.duration, delay, fill: 'both' })]);
  }

  // Toolkit SwivelTransition (FullScreenIn / FullScreenOut), as metroweb's MessageBox plays it
  function swivel(el, dir) {
    if (reduced()) return Promise.resolve();
    const frames = dir === 'in'
      ? [{ transform: 'perspective(1000px) rotateX(-45deg)', opacity: 0 }, { transform: 'perspective(1000px) rotateX(-45deg)', opacity: 1, offset: 0.01 }, { transform: 'perspective(1000px) rotateX(0deg)', opacity: 1 }]
      : [{ transform: 'perspective(1000px) rotateX(0deg)', opacity: 1 }, { transform: 'perspective(1000px) rotateX(45deg)', opacity: 1, offset: 0.99 }, { transform: 'perspective(1000px) rotateX(45deg)', opacity: 0 }];
    return settle([el.animate(frames, { duration: dir === 'in' ? 350 : 250, easing: dir === 'in' ? EXPO_OUT_6 : EXPO_IN_6, fill: dir === 'in' ? 'none' : 'forwards' })]);
  }

  // Live tile flips decoded from FlipTile.uix (times halved by its TimeScale 0.5); one variant at random
  const TILE_FLIPS = [
    { hide: [[0, 0], [250, 90, uExp(10)]], show: [[0, -90], [250, -90], [750, 0, uLog(150)]], swap: 250 },
    { hide: [[0, 0], [183, 215, uLog(10)]], show: [[0, -180], [183, 35, uLog(10)], [417, -6, uS(10)], [625, 0, uS(10)]], swap: 40 },
    { hide: [[0, 0], [125, -30, uS(10)], [292, 200, uS(10)]], show: [[0, -210], [125, -210], [292, 20, uS(10)], [458, 0, uS(10)]], swap: 209 },
  ];
  function play(el, track, from, to, fill) {
    const steps = Math.max(2, Math.ceil((to - from) / 8));
    const frames = Array.from({ length: steps + 1 }, (_, i) => ({ transform: `perspective(800px) rotateX(${sample(track, from + ((to - from) * i) / steps)}deg)` }));
    return el.animate(frames, { duration: to - from, fill });
  }
  // Calls swap() edge-on, resolves when the incoming face has landed
  async function flipTile(el, swap) {
    const m = TILE_FLIPS[Math.floor(Math.random() * TILE_FLIPS.length)];
    const end = m.show[m.show.length - 1][0];
    const hide = play(el, m.hide, 0, m.swap, 'forwards');
    try { await hide.finished; } catch { return; }
    swap();
    const show = play(el, m.show, m.swap, end, 'none');
    hide.cancel();
    await show.finished.catch(() => {});
  }

  // The dimmed screen behind a dialog: in 200 ms, out 250 ms
  const scrim = (el, dir) => (reduced() ? Promise.resolve() : settle([el.animate(dir === 'in' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
    { duration: dir === 'in' ? 200 : 250, fill: dir === 'in' ? 'none' : 'forwards' })]));

  return {
    EXPO_OUT_2, EXPO_OUT_5, EXPO_IN_5, EXPO_OUT_6, EXPO_IN_6,
    setEnabled: on => { enabled = on; }, reduced,
    featherOut, featherIn, featherReset, pageTurn, continuumShow, swivel, flipTile, scrim,
  };
})();
