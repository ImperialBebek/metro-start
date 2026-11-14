'use strict';
/* Blocks: falling-block puzzle. ← → move, ↑ or X rotate, Z rotate back, ↓ soft drop, Space hard drop, C hold, P pause. */
Games.register('blocks', {
  title: 'Blocks',
  color: '#da532c',
  mount(api) {
    const COLS = 10;
    const ROWS = 20;
    const C = 30;
    const SIDE = 170;
    const view = Games.canvas(api.stage, COLS * C + SIDE, ROWS * C);
    const { ctx } = view;
    const SHAPES = {
      I: { color: '#00aba9', cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
      O: { color: '#ffc40d', cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
      T: { color: '#9f00a7', cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
      S: { color: '#00a300', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
      Z: { color: '#ee1111', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
      J: { color: '#2d89ef', cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
      L: { color: '#e3a21a', cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    };
    const SIZE = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };
    let g;

    function rotateCells(type, rot) {
      let cells = SHAPES[type].cells.map(c => c.slice());
      if (type === 'O') return cells;
      const n = SIZE[type];
      for (let r = 0; r < ((rot % 4) + 4) % 4; r++) cells = cells.map(([x, y]) => [n - 1 - y, x]);
      return cells;
    }
    function bag() { return Games.shuffle(Object.keys(SHAPES)); }
    function nextType() {
      if (g.queue.length < 7) g.queue.push(...bag());
      return g.queue.shift();
    }
    function spawn(type) {
      const p = { type, rot: 0, x: 3, y: type === 'I' ? -1 : 0 };
      if (collides(p)) { over(); return null; }
      return p;
    }
    function cellsOf(p) { return rotateCells(p.type, p.rot).map(([x, y]) => [x + p.x, y + p.y]); }
    function collides(p) {
      return cellsOf(p).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && g.grid[y][x]));
    }
    function reset() {
      g = {
        grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
        queue: [...bag(), ...bag()], hold: null, canHold: true,
        score: 0, lines: 0, level: 1, fall: 0, lockTimer: 0, lockMoves: 0, state: 'playing', flash: [], flashT: 0,
      };
      g.cur = spawn(nextType());
      status();
    }
    const interval = () => Math.max(0.05, 0.8 * Math.pow(0.85, g.level - 1));

    function tryMove(dx, dy, drot = 0) {
      if (!g.cur || g.state !== 'playing') return false;
      const kicks = drot ? [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]] : [[0, 0]];
      for (const [kx, ky] of kicks) {
        const p = { ...g.cur, x: g.cur.x + dx + kx, y: g.cur.y + dy + ky, rot: g.cur.rot + drot };
        if (!collides(p)) {
          g.cur = p;
          if (g.lockTimer > 0 && g.lockMoves < 15) { g.lockTimer = 0; g.lockMoves++; }
          return true;
        }
      }
      return false;
    }
    function grounded() { return collides({ ...g.cur, y: g.cur.y + 1 }); }
    function lock() {
      cellsOf(g.cur).forEach(([x, y]) => { if (y >= 0) g.grid[y][x] = SHAPES[g.cur.type].color; });
      if (cellsOf(g.cur).some(([, y]) => y < 0)) { over(); return; }
      const full = [];
      g.grid.forEach((row, y) => { if (row.every(Boolean)) full.push(y); });
      if (full.length) {
        g.score += [0, 100, 300, 500, 800][full.length] * g.level;
        g.lines += full.length;
        g.level = 1 + Math.floor(g.lines / 10);
        g.flash = full;
        g.flashT = 0.18;
      }
      g.canHold = true;
      g.lockTimer = 0;
      g.lockMoves = 0;
      if (!full.length) g.cur = spawn(nextType());
      else g.cur = null; // the new piece arrives after the cleared lines flash
      status();
    }
    function clearFlashed() {
      g.grid = g.grid.filter((_, y) => !g.flash.includes(y));
      while (g.grid.length < ROWS) g.grid.unshift(Array(COLS).fill(null));
      g.flash = [];
      g.cur = spawn(nextType());
    }
    function hardDrop() {
      if (!g.cur || g.state !== 'playing') return;
      let d = 0;
      while (tryMove(0, 1)) d++;
      g.score += d * 2;
      lock();
    }
    function hold() {
      if (!g.cur || !g.canHold || g.state !== 'playing') return;
      const t = g.cur.type;
      g.cur = g.hold ? spawn(g.hold) : spawn(nextType());
      g.hold = t;
      g.canHold = false;
    }
    function over() {
      g.state = 'over';
      g.cur = null;
      const s = api.stats();
      const best = Math.max(s.best || 0, g.score);
      api.setStats({ best, bestLines: Math.max(s.bestLines || 0, g.lines), played: (s.played || 0) + 1 });
      status();
      api.banner({
        title: 'Game over',
        text: `Score ${g.score.toLocaleString()}, ${g.lines} line${g.lines === 1 ? '' : 's'}.` + (g.score > 0 && g.score >= best ? ' That’s your best.' : ` Best: ${best.toLocaleString()}.`),
        actions: [{ label: 'Play again', primary: true, run: () => { api.clearBanner(); reset(); } }],
      });
    }
    function status() {
      api.status([['Score', g.score.toLocaleString()], ['Lines', String(g.lines)], ['Level', String(g.level)]]);
    }

    // ---- drawing
    function block(x, y, color, alpha = 1) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, C - 2, C - 2);
      ctx.globalAlpha = 1;
    }
    function mini(type, ox, oy, size) {
      if (!type) return;
      const cells = rotateCells(type, 0);
      const minX = Math.min(...cells.map(c => c[0]));
      const maxX = Math.max(...cells.map(c => c[0]));
      const minY = Math.min(...cells.map(c => c[1]));
      const maxY = Math.max(...cells.map(c => c[1]));
      const offX = ox + (4 - (maxX - minX + 1)) * size / 2;
      const offY = oy + (2 - (maxY - minY + 1)) * size / 2;
      ctx.fillStyle = SHAPES[type].color;
      cells.forEach(([x, y]) => ctx.fillRect(offX + (x - minX) * size + 1, offY + (y - minY) * size + 1, size - 2, size - 2));
    }
    function draw() {
      const BW = COLS * C;
      ctx.clearRect(0, 0, BW + SIDE, ROWS * C);
      ctx.fillStyle = 'rgba(0,0,0,.32)';
      ctx.fillRect(0, 0, BW, ROWS * C);
      ctx.strokeStyle = 'rgba(255,255,255,.05)';
      ctx.lineWidth = 1;
      for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * C + 0.5, 0); ctx.lineTo(x * C + 0.5, ROWS * C); ctx.stroke(); }
      g.grid.forEach((row, y) => row.forEach((color, x) => {
        if (color) block(x * C, y * C, g.flash.includes(y) ? '#ffffff' : color);
      }));
      if (g.cur) {
        // ghost: where the piece would land
        const ghost = { ...g.cur };
        while (!collides({ ...ghost, y: ghost.y + 1 })) ghost.y++;
        ctx.strokeStyle = SHAPES[g.cur.type].color;
        ctx.lineWidth = 2;
        cellsOf(ghost).forEach(([x, y]) => { if (y >= 0) { block(x * C, y * C, SHAPES[g.cur.type].color, 0.18); ctx.strokeRect(x * C + 2, y * C + 2, C - 4, C - 4); } });
        cellsOf(g.cur).forEach(([x, y]) => { if (y >= 0) block(x * C, y * C, SHAPES[g.cur.type].color); });
      }
      // side panel
      const sx = BW + 20;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.font = Games.font(300, 18);
      ctx.fillText('Next', sx, 30);
      g.queue.slice(0, 3).forEach((t, i) => mini(t, sx, 44 + i * 58, i ? 18 : 24));
      ctx.fillStyle = '#fff';
      ctx.fillText('Hold', sx, 250);
      ctx.globalAlpha = g.canHold ? 1 : 0.4;
      mini(g.hold, sx, 264, 22);
      ctx.globalAlpha = 1;
      ctx.font = Games.font(400, 12);
      ctx.fillStyle = 'rgba(255,255,255,.65)';
      ['← → move', '↑ or X rotate', 'Z rotate back', '↓ soft drop', 'Space drop', 'C hold', 'P pause'].forEach((t, i) => ctx.fillText(t, sx, 360 + i * 20));
      if (g.state === 'paused') {
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(0, 0, BW, ROWS * C);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = Games.font(300, 28);
        ctx.fillText('Paused', BW / 2, (ROWS * C) / 2);
        ctx.font = Games.font(400, 13);
        ctx.fillText('Press P to carry on', BW / 2, (ROWS * C) / 2 + 26);
      }
    }

    const stop = Games.loop(dt => {
      if (g.state === 'playing' && (document.hidden || api.bannerOpen())) g.state = 'paused';
      if (g.state === 'playing') {
        if (g.flash.length) {
          g.flashT -= dt;
          if (g.flashT <= 0) clearFlashed();
        } else if (g.cur) {
          if (grounded()) {
            g.lockTimer += dt;
            if (g.lockTimer >= 0.5) lock();
          } else {
            g.fall += dt;
            if (g.fall >= interval()) { g.fall = 0; tryMove(0, 1); }
          }
        }
      }
      draw();
    });

    api.onKey(e => {
      if (e.ctrlKey || e.metaKey || e.altKey || api.bannerOpen()) return;
      const k = e.key;
      if (k === 'p' || k === 'P') { e.preventDefault(); g.state = g.state === 'playing' ? 'paused' : g.state === 'paused' ? 'playing' : g.state; return; }
      if (g.state === 'paused' && ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(k)) { e.preventDefault(); g.state = 'playing'; return; }
      if (g.state !== 'playing' || !g.cur) return;
      if (k === 'ArrowLeft') { e.preventDefault(); tryMove(-1, 0); }
      else if (k === 'ArrowRight') { e.preventDefault(); tryMove(1, 0); }
      else if (k === 'ArrowDown') { e.preventDefault(); if (tryMove(0, 1)) { g.score += 1; g.fall = 0; status(); } }
      else if (k === 'ArrowUp' || k === 'x' || k === 'X') { e.preventDefault(); tryMove(0, 0, 1); }
      else if (k === 'z' || k === 'Z') { e.preventDefault(); tryMove(0, 0, -1); }
      else if (k === ' ') { e.preventDefault(); hardDrop(); }
      else if (k === 'c' || k === 'C') { e.preventDefault(); hold(); }
    });
    // touch: tap rotates, swipe left/right moves, swipe down drops
    let start = null;
    view.cv.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    view.cv.addEventListener('pointerup', e => {
      if (!start || g.state !== 'playing') { start = null; return; }
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) { tryMove(0, 0, 1); return; }
      if (Math.abs(dx) > Math.abs(dy)) { const n = Math.max(1, Math.round(Math.abs(dx) / (C * view.k))); for (let i = 0; i < n; i++) tryMove(Math.sign(dx), 0); }
      else if (dy > 0) hardDrop();
    });
    view.cv.style.touchAction = 'none';

    api.tools([
      Games.button('Pause', () => { if (g.state === 'playing') g.state = 'paused'; else if (g.state === 'paused') g.state = 'playing'; }),
      Games.button('New game', () => (g.state !== 'over' && g.score > 0 ? api.confirm('Start a new game? This one will be lost.', 'New game', reset) : (api.clearBanner(), reset()))),
    ]);
    reset();
    return { destroy() { stop(); view.destroy(); } };
  },
});
