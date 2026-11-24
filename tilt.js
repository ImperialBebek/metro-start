// SPDX-License-Identifier: MS-PL
// A port of TiltEffect from the Windows Phone Toolkit, Copyright (c) Microsoft Corporation, by way of
// metroweb's useTilt.ts (github.com/ImperialBebek/metroweb). Because it is derived from Ms-PL source, this
// file is distributed under the Microsoft Public License, not the MIT License that covers the rest of
// Metro Start. The licence text is in THIRD-PARTY-NOTICES.md.
'use strict';
const Tilt = (() => {
  const MAX_ANGLE = 0.3; // radians
  const MAX_DEPRESSION = 25; // px
  const RETURN_DELAY = 200; // ms
  const RETURN_DURATION = 100; // ms
  const TAP_SLOP = 12; // px of movement before a press stops tilting

  // The element tips toward the pointer and sinks in, more the nearer the press is to its centre
  function transform(el, cx, cy) {
    const r = el.getBoundingClientRect();
    const nx = Math.min(Math.max((cx - r.left) / r.width, 0), 1);
    const ny = Math.min(Math.max((cy - r.top) / r.height, 0), 1);
    const xm = Math.abs(nx - 0.5), ym = Math.abs(ny - 0.5);
    const xd = -Math.sign(nx - 0.5), yd = Math.sign(ny - 0.5);
    const m = xm + ym;
    const xc = m > 0 ? xm / m : 0;
    const angle = (m * MAX_ANGLE * 180) / Math.PI;
    const depression = (1 - m) * MAX_DEPRESSION;
    // PlaneProjection rotations are negated in CSS
    const ry = -(angle * xc * xd), rx = -(angle * (1 - xc) * yd);
    return `perspective(1000px) translateZ(${-depression}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  // Tilts any element matching `selector` inside `container` while it's pressed; `enabled()` is checked per press
  function bind(container, selector, enabled = () => true) {
    let press = null;
    const returning = new WeakMap();
    const release = (el, delay) => {
      if (!el.style.transform) return;
      const from = el.style.transform;
      el.style.transform = '';
      returning.set(el, el.animate([{ transform: from }, { transform: 'none' }], { delay, duration: RETURN_DURATION, fill: 'backwards' }));
    };
    container.addEventListener('pointerdown', e => {
      const el = e.button === 0 && e.target.closest(selector);
      if (!el || !container.contains(el) || !enabled()) return;
      const r = returning.get(el);
      if (r) r.cancel();
      press = { el, id: e.pointerId, x: e.clientX, y: e.clientY };
      el.style.transform = transform(el, e.clientX, e.clientY);
    });
    container.addEventListener('pointermove', e => {
      if (!press || press.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) { release(press.el, 0); press = null; return; }
      press.el.style.transform = transform(press.el, e.clientX, e.clientY);
    });
    const end = delay => e => {
      if (!press || (e.pointerId !== undefined && press.id !== e.pointerId)) return;
      release(press.el, delay);
      press = null;
    };
    window.addEventListener('pointerup', end(RETURN_DELAY));
    window.addEventListener('pointercancel', end(0));
    container.addEventListener('dragstart', end(0));
    return { cancel: () => { if (press) { release(press.el, 0); press = null; } } };
  }

  return { bind };
})();
