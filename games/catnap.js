'use strict';
/* Cat Nap: put one sleeping cat on every cushion. Each row and column also gets exactly one cat, and cats need
   their own space: no two can touch, not even corner to corner.
   Click a square to cross it out, click again for a cat, again to clear. Right-click puts a cat straight down.
   Drag across squares to cross out several at once. A cat in the wrong place costs a heart. */
Games.register('catnap', {
  title: 'Cat Nap',
  color: '#ff0097',
  mount(api) {
    const LEVELS = { easy: { n: 6, label: 'Easy' }, medium: { n: 8, label: 'Medium' }, hard: { n: 10, label: 'Hard' }, daily: { n: 8, label: 'Daily' } };
    const CUSHIONS = ['#f6b8c8', '#b9dcf5', '#c9e7a7', '#fde68a', '#d6c4f2', '#a8e3dc', '#f8c09a', '#e2d3c6', '#c3cfe8', '#f2b4e4'];
    const CAT = '<svg viewBox="0 0 40 40" aria-hidden="true">'
      + '<path d="M8 31c0-8 4-14 12-14s12 6 12 14c0 2-2 3-4 3H12c-2 0-4-1-4-3z" fill="#3b3346"/>'
      + '<path d="M9 16 8 5l8 6M31 16l1-11-8 6" fill="#3b3346"/>'
      + '<circle cx="20" cy="18" r="10" fill="#3b3346"/>'
      + '<path d="M10.5 7.5l1 5 3-2.6zM29.5 7.5l-1 5-3-2.6z" fill="#f4a4b8"/>'
      + '<path d="M14.2 18.2q2.3 2.2 4.6 0M21.2 18.2q2.3 2.2 4.6 0" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
      + '<path d="M18.6 21.2h2.8L20 22.8z" fill="#f4a4b8"/>'
      + '<path d="M8.5 20.5l5 .8M8.8 23.4l4.8-.6M31.5 20.5l-5 .8M31.2 23.4l-4.8-.6" stroke="#fff" stroke-opacity=".7" stroke-width=".9" stroke-linecap="round"/>'
      + '<path d="M30 30c4 0 6 2 4 4" stroke="#3b3346" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
    const HEART = '♥︎';

    let st = api.load();
    if (!valid(st)) st = fresh('easy');
    if (st.level === 'daily' && st.date !== Games.today() && !st.over) st = fresh('daily');
    let cells = [];
    let flash = -1;

    function valid(s) {
      return s && LEVELS[s.level] && Array.isArray(s.regions) && s.regions.length === s.n * s.n &&
        Array.isArray(s.marks) && s.marks.length === s.n * s.n && Array.isArray(s.cats) && s.cats.length === s.n;
    }
    function fresh(level) {
      const n = LEVELS[level].n;
      const date = Games.today();
      const rnd = level === 'daily' ? Games.seeded(Games.hashString('metro-start-catnap-' + date)) : Math.random;
      const p = CatNapEngine.generate(n, rnd);
      // cushion colors are shuffled so the same shapes don't always get the same colors
      const colors = Games.shuffle([...Array(n).keys()], rnd);
      return { level, date, n, regions: p.regions, cats: p.cats, colors, marks: Array(n * n).fill(0), hearts: 3, time: 0, over: false, won: false, hints: 0 };
    }
    // marks: 0 empty, 1 crossed out, 2 cat
    const isAnswer = i => st.cats[Math.floor(i / st.n)] === i % st.n;
    const auto = () => api.stats().auto !== false;

    // squares no cat can use, given the cats placed so far (shown faintly when auto-cross is on)
    function blocked() {
      const n = st.n;
      const out = new Uint8Array(n * n);
      st.marks.forEach((m, i) => {
        if (m !== 2) return;
        const r = Math.floor(i / n);
        const c = i % n;
        for (let j = 0; j < n * n; j++) {
          if (j === i) continue;
          const rr = Math.floor(j / n);
          const cc = j % n;
          if (rr === r || cc === c || st.regions[j] === st.regions[i] || (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1)) out[j] = 1;
        }
      });
      return out;
    }

    // ---- board
    const board = h('div', { class: 'cn-board', role: 'grid', 'aria-label': 'Cat Nap board' });
    const wrap = h('div', { class: 'cn-wrap' }, board,
      h('p', { class: 'game-hint' }, 'One cat per row, column and cushion, and cats can’t touch, even at the corners. Click to cross out, click again for a cat. Right-click puts a cat down.'));
    api.stage.append(wrap);

    function build() {
      const n = st.n;
      board.style.setProperty('--n', n);
      cells = Array.from({ length: n * n }, (_, i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        const g = st.regions[i];
        const edge = (rr, cc) => rr < 0 || cc < 0 || rr >= n || cc >= n || st.regions[rr * n + cc] !== g;
        const el = h('div', { class: 'cn-cell', role: 'gridcell', dataset: { i: String(i) } });
        el.style.background = CUSHIONS[st.colors[g] % CUSHIONS.length];
        el.style.borderTopWidth = edge(r - 1, c) ? '3px' : '1px';
        el.style.borderLeftWidth = edge(r, c - 1) ? '3px' : '1px';
        el.style.borderBottomWidth = r === n - 1 ? '3px' : '0';
        el.style.borderRightWidth = c === n - 1 ? '3px' : '0';
        return el;
      });
      board.replaceChildren(...cells);
      fit();
    }
    function fit() {
      const r = api.stage.getBoundingClientRect();
      const size = Math.floor(Math.min((r.width - 20) / st.n, (r.height - 70) / st.n));
      board.style.setProperty('--cs', `${Math.max(26, Math.min(68, size))}px`);
    }
    function render() {
      const faint = auto() && !st.over ? blocked() : new Uint8Array(st.n * st.n);
      cells.forEach((el, i) => {
        const m = st.marks[i];
        const cls = 'cn-cell' + (m === 2 ? ' cat' : m === 1 ? ' crossed' : faint[i] ? ' faint' : '') + (i === flash ? ' wrong' : '') + (st.won && m === 2 ? ' asleep' : '');
        if (el.className !== cls) el.className = cls;
        const html = m === 2 ? CAT : m === 1 || faint[i] ? '<span class="cn-x">×</span>' : '';
        if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
      });
      status();
    }
    function status() {
      const placed = st.marks.filter(m => m === 2).length;
      const label = st.level === 'daily' ? `Daily ${st.date}` : LEVELS[st.level].label;
      api.status([
        [label, Games.fmtTime(st.time)],
        ['Cats', `${placed} / ${st.n}`],
        ['Hearts', HEART.repeat(st.hearts) + '♡︎'.repeat(3 - st.hearts)],
      ]);
    }
    function after() { api.save(st); render(); }

    // ---- moves
    function setMark(i, m) {
      if (st.over || api.bannerOpen()) return;
      if (m === 2 && st.marks[i] !== 2) {
        if (!isAnswer(i)) {
          // wrong spot: lose a heart, and the square is crossed out for you
          st.hearts--;
          st.marks[i] = 1;
          flash = i;
          setTimeout(() => { flash = -1; render(); }, 450);
          if (st.hearts <= 0) lose();
          after();
          return;
        }
        if (!st.started) startedNow();
      }
      st.marks[i] = m;
      if (m === 2) checkWin();
      after();
    }
    function startedNow() {
      st.started = true;
      const s = api.stats();
      const lv = s[st.level] || {};
      api.setStats({ [st.level]: { ...lv, played: (lv.played || 0) + 1 } });
    }
    function cycle(i) {
      const next = { 0: 1, 1: 2, 2: 0 }[st.marks[i]];
      setMark(i, next);
    }
    function lose() {
      st.over = true;
      api.banner({
        title: 'Out of hearts',
        text: 'Those cats wanted different cushions. Try this puzzle again, or start a new one.',
        actions: [{ label: 'Try again', primary: true, run: restart }, { label: 'New puzzle', run: () => newGame(st.level === 'daily' ? 'medium' : st.level) }],
      });
    }
    function checkWin() {
      if (!st.marks.every((m, i) => (m === 2) === isAnswer(i))) return;
      st.over = true;
      st.won = true;
      const s = api.stats();
      const lv = s[st.level] || {};
      const best = lv.best ? Math.min(lv.best, st.time) : st.time;
      const update = { [st.level]: { ...lv, solved: (lv.solved || 0) + 1, best } };
      if (st.level === 'daily') update.lastDaily = st.date;
      api.setStats(update);
      setTimeout(() => api.banner({
        title: 'Every cat is napping',
        text: `${LEVELS[st.level].label} in ${Games.fmtTime(st.time)}` + (st.hearts < 3 ? ` with ${st.hearts} heart${st.hearts === 1 ? '' : 's'} left.` : ' without losing a heart.') +
          (best === st.time ? ' That’s your best time.' : ` Best: ${Games.fmtTime(best)}.`),
        actions: [{ label: 'New puzzle', primary: true, run: () => newGame(st.level === 'daily' ? 'medium' : st.level) }, { label: 'Admire the cats', run: () => api.clearBanner() }],
      }), 900);
    }
    function hint() {
      if (st.over) return;
      // place the cat for a cushion that doesn't have one yet
      const todo = [];
      for (let r = 0; r < st.n; r++) { const i = r * st.n + st.cats[r]; if (st.marks[i] !== 2) todo.push(i); }
      if (!todo.length) return;
      const i = todo[Math.floor(Math.random() * todo.length)];
      st.hints++;
      if (!st.started) startedNow();
      st.marks[i] = 2;
      cells[i].classList.add('hinted');
      checkWin();
      after();
    }
    function restart() {
      st = { ...st, marks: Array(st.n * st.n).fill(0), hearts: 3, time: 0, over: false, won: false, hints: 0, started: false };
      api.clearBanner();
      after();
    }
    function newGame(level) {
      st = fresh(level);
      levelSeg.mark(level);
      api.clearBanner();
      build();
      after();
    }

    // ---- input: click cycles, right-click is a cat, dragging crosses out (or clears crosses)
    let drag = null;
    board.addEventListener('pointerdown', e => {
      const el = e.target.closest('.cn-cell');
      if (!el || e.button !== 0 || st.over || api.bannerOpen()) return;
      const i = +el.dataset.i;
      drag = { start: i, moved: false, mode: st.marks[i] === 1 ? 0 : 1, done: new Set() };
      board.setPointerCapture(e.pointerId);
    });
    board.addEventListener('pointermove', e => {
      if (!drag) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el && el.closest && el.closest('.cn-cell');
      if (!cell) return;
      const i = +cell.dataset.i;
      if (i === drag.start && !drag.moved) return;
      if (!drag.moved) { drag.moved = true; paint(drag.start); }
      paint(i);
    });
    function paint(i) {
      if (drag.done.has(i)) return;
      drag.done.add(i);
      if (drag.mode === 1 && st.marks[i] === 0) st.marks[i] = 1;
      else if (drag.mode === 0 && st.marks[i] === 1) st.marks[i] = 0;
      render();
    }
    board.addEventListener('pointerup', () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.moved) after();
      else cycle(d.start);
    });
    board.addEventListener('pointercancel', () => { drag = null; after(); });
    board.addEventListener('contextmenu', e => {
      e.preventDefault();
      const el = e.target.closest('.cn-cell');
      if (!el) return;
      const i = +el.dataset.i;
      setMark(i, st.marks[i] === 2 ? 0 : 2);
    });

    const levelSeg = Games.seg(Object.entries(LEVELS).map(([k, v]) => [k, v.label]), st.level, (lv, mark) => {
      if (lv === st.level && !(lv === 'daily' && st.date !== Games.today())) return;
      const go = () => { mark(lv); newGame(lv); };
      if (st.started && !st.over) api.confirm('Start a new puzzle? This one will be lost.', 'New puzzle', go);
      else go();
    }, 'Difficulty');
    const autoBtn = Games.button('', () => {
      api.setStats({ auto: !auto() });
      autoBtn.textContent = auto() ? 'Auto-cross: on' : 'Auto-cross: off';
      render();
    }, { title: 'Faintly cross out squares that can’t hold a cat' });
    autoBtn.textContent = auto() ? 'Auto-cross: on' : 'Auto-cross: off';
    api.tools([
      levelSeg,
      Games.button('Hint', hint, { title: 'Place one cat for you' }),
      autoBtn,
      Games.button('Restart', () => (st.started && !st.over ? api.confirm('Clear the board and start this puzzle again?', 'Restart', restart) : restart())),
      Games.button('New puzzle', () => {
        const go = () => newGame(st.level === 'daily' ? 'medium' : st.level);
        if (st.started && !st.over) api.confirm('Start a new puzzle? This one will be lost.', 'New puzzle', go);
        else go();
      }),
    ]);

    const stopClock = Games.clock(() => st.started && !st.over && !api.bannerOpen(), dt => {
      const before = Math.floor(st.time);
      st.time += dt;
      if (Math.floor(st.time) !== before) { status(); if (Math.floor(st.time) % 5 === 0) api.save(st); }
    });
    const ro = new ResizeObserver(fit);
    ro.observe(api.stage);

    api.save(st);
    build();
    render();
    if (st.over) {
      api.banner(st.won
        ? { title: 'Every cat is napping', text: 'Start a new puzzle whenever you like.', actions: [{ label: 'New puzzle', primary: true, run: () => newGame(st.level === 'daily' ? 'medium' : st.level) }, { label: 'Admire the cats', run: () => api.clearBanner() }] }
        : { title: 'Out of hearts', text: 'Try this puzzle again, or start a new one.', actions: [{ label: 'Try again', primary: true, run: restart }, { label: 'New puzzle', run: () => newGame(st.level === 'daily' ? 'medium' : st.level) }] });
    }
    return { destroy() { stopClock(); ro.disconnect(); api.save(st); } };
  },
});
