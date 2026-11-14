'use strict';
/* 2048: slide with the arrow keys, WASD or a swipe; equal tiles merge. */
Games.register('2048', {
  title: '2048',
  color: '#e3a21a',
  mount(api) {
    const N = 4;
    const COLORS = {
      2: '#2b5797', 4: '#2d89ef', 8: '#00aba9', 16: '#1e7145', 32: '#00a300', 64: '#99b433', 128: '#e3a21a',
      256: '#ffc40d', 512: '#da532c', 1024: '#ee1111', 2048: '#b91d47', 4096: '#ff0097', 8192: '#9f00a7',
    };
    const DARK_TEXT = new Set([256]);
    let st = api.load();
    if (!st || !Array.isArray(st.cells) || st.cells.length !== N * N) st = fresh();
    let undo = null;

    function fresh() {
      const s = { cells: Array(N * N).fill(0), score: 0, won: false, over: false };
      addTile(s);
      addTile(s);
      return s;
    }
    function addTile(s) {
      const empty = [];
      s.cells.forEach((v, i) => { if (!v) empty.push(i); });
      if (!empty.length) return -1;
      const i = empty[Math.floor(Math.random() * empty.length)];
      s.cells[i] = Math.random() < 0.9 ? 2 : 4;
      return i;
    }
    // cells of row/column k, ordered from the edge the tiles slide toward
    function line(dir, k) {
      const idx = [];
      for (let j = 0; j < N; j++) {
        if (dir === 'left') idx.push(k * N + j);
        else if (dir === 'right') idx.push(k * N + (N - 1 - j));
        else if (dir === 'up') idx.push(j * N + k);
        else idx.push((N - 1 - j) * N + k);
      }
      return idx;
    }
    function canMove(s) {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const v = s.cells[r * N + c];
          if (!v) return true;
          if (c < N - 1 && v === s.cells[r * N + c + 1]) return true;
          if (r < N - 1 && v === s.cells[(r + 1) * N + c]) return true;
        }
      }
      return false;
    }

    // ---- board
    const board = h('div', { class: 'g2048-board', role: 'grid', 'aria-label': '2048 board' });
    const cellEls = Array.from({ length: N * N }, () => h('div', { class: 'g2048-cell' }));
    board.append(...cellEls);
    api.stage.append(h('div', { class: 'g2048-wrap' }, board,
      h('p', { class: 'game-hint' }, 'Use the arrow keys or swipe. Tiles with the same number merge into one.')));

    function render(merged = new Set(), added = -1) {
      st.cells.forEach((v, i) => {
        const el = cellEls[i];
        el.textContent = v ? String(v) : '';
        el.className = 'g2048-cell' + (v ? ` has d${String(v).length}` : '') + (merged.has(i) ? ' merged' : '') + (i === added ? ' added' : '');
        el.style.background = v ? (COLORS[v] || '#603cba') : '';
        el.style.color = DARK_TEXT.has(v) ? '#1d1d1d' : '';
      });
      const stats = api.stats();
      api.status([['Score', st.score.toLocaleString()], ['Best', Math.max(stats.best || 0, st.score).toLocaleString()]]);
    }

    function newGame() {
      st = fresh();
      undo = null;
      api.clearBanner();
      api.save(st);
      render();
    }

    function move(dir) {
      if (st.over || api.bannerOpen()) return;
      const before = { cells: st.cells.slice(), score: st.score, won: st.won, over: st.over };
      const merged = new Set();
      let gained = 0;
      for (let k = 0; k < N; k++) {
        const idx = line(dir, k);
        const vals = idx.map(i => st.cells[i]).filter(Boolean);
        const out = [];
        for (let i = 0; i < vals.length; i++) {
          if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
            out.push(vals[i] * 2);
            gained += vals[i] * 2;
            merged.add(idx[out.length - 1]);
            i++;
          } else out.push(vals[i]);
        }
        idx.forEach((cell, j) => { st.cells[cell] = out[j] || 0; });
      }
      if (st.cells.every((v, i) => v === before.cells[i])) {
        board.classList.remove('nudge');
        void board.offsetWidth;
        board.classList.add('nudge');
        return;
      }
      undo = before;
      st.score += gained;
      const added = addTile(st);
      const stats = api.stats();
      const top = Math.max(...st.cells);
      api.setStats({ best: Math.max(stats.best || 0, st.score), bestTile: Math.max(stats.bestTile || 0, top) });
      if (!st.won && top >= 2048) {
        st.won = true;
        api.banner({
          title: 'You made 2048',
          text: `Score ${st.score.toLocaleString()}. Keep going for a bigger tile, or start over.`,
          actions: [{ label: 'Keep going', primary: true, run: () => api.clearBanner() }, { label: 'New game', run: newGame }],
        });
      } else if (!canMove(st)) {
        st.over = true;
        api.banner({
          title: 'No more moves',
          text: `Final score ${st.score.toLocaleString()}.`,
          actions: [{ label: 'New game', primary: true, run: newGame }, { label: 'Undo last move', run: doUndo }],
        });
      }
      api.save(st);
      render(merged, added);
    }

    function doUndo() {
      if (!undo) return;
      st = { ...undo, cells: undo.cells.slice() };
      undo = null;
      api.clearBanner();
      api.save(st);
      render();
    }

    api.tools([
      Games.button('Undo', doUndo, { title: 'Undo the last move (Ctrl+Z)' }),
      Games.button('New game', () => (st.score > 0 && !st.over ? api.confirm('Start a new game? This one will be lost.', 'New game', newGame) : newGame())),
    ]);

    const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' };
    api.onKey(e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = KEYS[e.key];
      if (dir) { e.preventDefault(); move(dir); }
    });

    // swipe (mouse or touch)
    let start = null;
    board.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY }; board.setPointerCapture(e.pointerId); });
    board.addEventListener('pointerup', e => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
    board.style.touchAction = 'none';

    api.save(st); // a new game is saved right away, so it's there next time
    render();
    if (st.over) {
      api.banner({ title: 'No more moves', text: `Final score ${st.score.toLocaleString()}.`, actions: [{ label: 'New game', primary: true, run: newGame }] });
    }
    return { destroy() {} };
  },
});
