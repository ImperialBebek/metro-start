'use strict';
/* Sudoku: puzzles are generated here (each with exactly one solution), plus a daily puzzle that's the same all day. */
const SudokuEngine = (() => {
  const box = i => Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);
  const bits = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

  // Counts solutions up to `limit`. If `fill` is given, the first solution is written into it.
  function solve(grid, limit = 2, rnd = null, fill = null) {
    const g = Int8Array.from(grid);
    const rows = new Uint16Array(9);
    const cols = new Uint16Array(9);
    const boxes = new Uint16Array(9);
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (!v) continue;
      const bit = 1 << v;
      const r = Math.floor(i / 9);
      const c = i % 9;
      const b = box(i);
      if ((rows[r] | cols[c] | boxes[b]) & bit) return 0;
      rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
    }
    let count = 0;
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    function rec() {
      let best = -1;
      let bestMask = 0;
      let bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const mask = ~(rows[Math.floor(i / 9)] | cols[i % 9] | boxes[box(i)]) & 0x3FE;
        const n = bits(mask);
        if (n < bestN) { best = i; bestMask = mask; bestN = n; if (n <= 1) break; }
      }
      if (best < 0) {
        count++;
        if (count === 1 && fill) fill.set(g);
        return count >= limit;
      }
      if (bestN === 0) return false;
      const r = Math.floor(best / 9);
      const c = best % 9;
      const b = box(best);
      const order = rnd ? Games.shuffle(digits.slice(), rnd) : digits;
      for (const d of order) {
        const bit = 1 << d;
        if (!(bestMask & bit)) continue;
        g[best] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        if (rec()) return true;
        g[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      }
      return false;
    }
    rec();
    return count;
  }

  const CLUES = { easy: 38, medium: 30, hard: 25 };
  function generate(level, rnd = Math.random) {
    const solution = new Int8Array(81);
    solve(new Int8Array(81), 1, rnd, solution);
    const puzzle = Int8Array.from(solution);
    let clues = 81;
    const target = CLUES[level] || 30;
    // remove numbers in symmetric pairs while the puzzle still has exactly one solution
    for (const i of Games.shuffle([...Array(41).keys()], rnd)) {
      if (clues <= target) break;
      const j = 80 - i;
      const a = puzzle[i];
      const b = puzzle[j];
      puzzle[i] = 0; puzzle[j] = 0;
      if (solve(puzzle, 2) !== 1) { puzzle[i] = a; puzzle[j] = b; } else clues -= i === j ? 1 : 2;
    }
    return { puzzle: Array.from(puzzle).join(''), solution: Array.from(solution).join('') };
  }
  return { generate, solve, box };
})();

Games.register('sudoku', {
  title: 'Sudoku',
  color: '#00aba9',
  mount(api) {
    const LEVELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', daily: 'Daily' };
    const box = SudokuEngine.box;
    let st = api.load();
    if (!st || !LEVELS[st.level] || typeof st.puzzle !== 'string' || st.puzzle.length !== 81) st = fresh('easy');
    let history = [];

    function fresh(level) {
      const isDaily = level === 'daily';
      const date = Games.today();
      const rnd = isDaily ? Games.seeded(Games.hashString('metro-start-sudoku-' + date)) : Math.random;
      const { puzzle, solution } = SudokuEngine.generate(isDaily ? 'medium' : level, rnd);
      return {
        level, daily: isDaily ? date : null, puzzle, solution,
        grid: puzzle.split('').map(Number), notes: Array(81).fill(0),
        sel: puzzle.indexOf('0'), notesMode: false, time: 0, mistakes: 0, over: false,
      };
    }
    const given = i => st.puzzle[i] !== '0';
    const peers = i => {
      const r = Math.floor(i / 9);
      const c = i % 9;
      const b = box(i);
      const out = [];
      for (let j = 0; j < 81; j++) if (j !== i && (Math.floor(j / 9) === r || j % 9 === c || box(j) === b)) out.push(j);
      return out;
    };

    // ---- drawing
    const board = h('div', { class: 'sd-board', role: 'grid', 'aria-label': 'Sudoku board' });
    const cells = Array.from({ length: 81 }, (_, i) => h('div', {
      class: 'sd-cell', role: 'gridcell', dataset: { i: String(i) },
      style: {
        borderRightWidth: i % 9 === 2 || i % 9 === 5 ? '2px' : '',
        borderBottomWidth: Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5 ? '2px' : '',
      },
    }));
    board.append(...cells);
    const pad = h('div', { class: 'sd-pad' });
    const digitBtns = [];
    for (let d = 1; d <= 9; d++) {
      const b = h('button', { type: 'button', class: 'sd-key', onclick: () => input(d) }, String(d), h('span', { class: 'sd-left' }));
      digitBtns.push(b);
      pad.append(b);
    }
    const notesBtn = h('button', { type: 'button', class: 'sd-key sd-wide', onclick: () => { st.notesMode = !st.notesMode; after(); } }, 'Notes');
    pad.append(
      h('button', { type: 'button', class: 'sd-key sd-wide', onclick: erase }, 'Erase'),
      notesBtn,
      h('button', { type: 'button', class: 'sd-key sd-wide', onclick: doUndo }, 'Undo'),
    );
    api.stage.append(h('div', { class: 'sd-wrap' }, board, h('div', { class: 'sd-side' }, pad,
      h('p', { class: 'game-hint' }, 'Type 1–9, Backspace to erase, N for notes, arrows to move.'))));

    function render() {
      const selVal = st.sel >= 0 ? st.grid[st.sel] : 0;
      const selPeers = st.sel >= 0 ? new Set(peers(st.sel)) : new Set();
      cells.forEach((el, i) => {
        const v = st.grid[i];
        let cls = 'sd-cell';
        if (given(i)) cls += ' given';
        if (i === st.sel) cls += ' sel';
        else if (selPeers.has(i)) cls += ' peer';
        if (v && v === selVal && i !== st.sel) cls += ' same';
        if (v && !given(i) && String(v) !== st.solution[i]) cls += ' wrong';
        el.className = cls;
        if (v) {
          if (el.dataset.v !== String(v) || el.dataset.notes) { el.textContent = String(v); el.dataset.v = String(v); delete el.dataset.notes; }
        } else if (st.notes[i]) {
          const key = String(st.notes[i]);
          if (el.dataset.notes !== key) {
            el.replaceChildren(h('div', { class: 'sd-notes' }, Array.from({ length: 9 }, (_, k) => h('span', {}, st.notes[i] & (1 << (k + 1)) ? String(k + 1) : ''))));
            el.dataset.notes = key;
            delete el.dataset.v;
          }
        } else if (el.dataset.v || el.dataset.notes || el.textContent) {
          el.textContent = '';
          delete el.dataset.v;
          delete el.dataset.notes;
        }
      });
      // how many of each digit are still to place
      const placed = Array(10).fill(0);
      st.grid.forEach((v, i) => { if (v && String(v) === st.solution[i]) placed[v]++; });
      digitBtns.forEach((b, k) => {
        const left = 9 - placed[k + 1];
        b.classList.toggle('done', left <= 0);
        b.lastChild.textContent = left > 0 ? String(left) : '';
      });
      notesBtn.setAttribute('aria-pressed', String(!!st.notesMode));
      notesBtn.textContent = st.notesMode ? 'Notes on' : 'Notes';
      status();
    }
    function status() {
      const label = st.level === 'daily' ? `Daily ${st.daily}` : LEVELS[st.level];
      api.status([[label, Games.fmtTime(st.time)], ['Mistakes', String(st.mistakes)]]);
    }
    function after() { api.save(st); render(); }
    function remember() {
      history.push(JSON.stringify({ grid: st.grid, notes: st.notes, sel: st.sel }));
      if (history.length > 200) history.shift();
    }

    // ---- input
    function input(d) {
      if (st.over || st.sel < 0 || given(st.sel) || api.bannerOpen()) return;
      const i = st.sel;
      remember();
      if (st.notesMode) {
        if (st.grid[i]) return;
        st.notes[i] ^= 1 << d;
      } else if (st.grid[i] === d) {
        st.grid[i] = 0;
      } else {
        st.grid[i] = d;
        st.notes[i] = 0;
        if (String(d) !== st.solution[i]) st.mistakes++;
        else peers(i).forEach(j => { st.notes[j] &= ~(1 << d); });
      }
      checkWin();
      after();
    }
    function erase() {
      if (st.over || st.sel < 0 || given(st.sel)) return;
      remember();
      st.grid[st.sel] = 0;
      st.notes[st.sel] = 0;
      after();
    }
    function doUndo() {
      if (st.over || !history.length) return;
      Object.assign(st, JSON.parse(history.pop()));
      after();
    }
    function checkWin() {
      if (!st.grid.every((v, i) => String(v) === st.solution[i])) return;
      st.over = true;
      const s = api.stats();
      const key = st.level;
      const lv = s[key] || {};
      const best = lv.best ? Math.min(lv.best, st.time) : st.time;
      const update = { [key]: { ...lv, solved: (lv.solved || 0) + 1, best } };
      if (st.level === 'daily') update.lastDaily = st.daily;
      api.setStats(update);
      api.banner({
        title: st.level === 'daily' ? 'Daily puzzle solved' : 'Solved',
        text: `${Games.fmtTime(st.time)} with ${st.mistakes} mistake${st.mistakes === 1 ? '' : 's'}.` + (best === st.time ? ' That’s your best time.' : ` Best: ${Games.fmtTime(best)}.`),
        actions: st.level === 'daily'
          ? [{ label: 'Play an easy one', run: () => newGame('easy') }, { label: 'Play a hard one', primary: true, run: () => newGame('hard') }]
          : [{ label: 'New puzzle', primary: true, run: () => newGame(st.level) }],
      });
    }
    function newGame(level) {
      st = fresh(level);
      history = [];
      levelSeg.mark(level);
      api.clearBanner();
      after();
    }

    board.addEventListener('pointerdown', e => {
      const el = e.target.closest('.sd-cell');
      if (!el || api.bannerOpen()) return;
      st.sel = +el.dataset.i;
      after();
    });
    api.onKey(e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) { e.preventDefault(); input(+e.key); return; }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); erase(); return; }
      if (e.key === 'n' || e.key === 'N') { st.notesMode = !st.notesMode; after(); return; }
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key];
      if (step) {
        e.preventDefault();
        const i = st.sel < 0 ? 0 : st.sel;
        const r = Math.floor(i / 9);
        const c = i % 9;
        if (step === -1) st.sel = r * 9 + ((c + 8) % 9);
        else if (step === 1) st.sel = r * 9 + ((c + 1) % 9);
        else if (step === -9) st.sel = ((r + 8) % 9) * 9 + c;
        else st.sel = ((r + 1) % 9) * 9 + c;
        after();
      }
    });

    const levelSeg = Games.seg(Object.entries(LEVELS), st.level, (lv, mark) => {
      const go = () => { mark(lv); newGame(lv); };
      if (lv === 'daily' && st.level === 'daily' && st.daily === Games.today()) return;
      const inProgress = !st.over && st.grid.some((v, i) => v && !given(i));
      if (inProgress) api.confirm('Start a new puzzle? This one will be lost.', 'New puzzle', go);
      else go();
    }, 'Difficulty');
    api.tools([levelSeg, Games.button('New puzzle', () => {
      const go = () => newGame(st.level === 'daily' ? 'medium' : st.level);
      const inProgress = !st.over && st.grid.some((v, i) => v && !given(i));
      if (inProgress) api.confirm('Start a new puzzle? This one will be lost.', 'New puzzle', go);
      else go();
    })]);

    const stopClock = Games.clock(() => !st.over && !api.bannerOpen(), dt => {
      const before = Math.floor(st.time);
      st.time += dt;
      if (Math.floor(st.time) !== before) { status(); if (Math.floor(st.time) % 5 === 0) api.save(st); }
    });

    api.save(st); // a new game is saved right away, so it's there next time
    render();
    if (st.over) api.banner({ title: 'Solved', text: 'Start another puzzle whenever you like.', actions: [{ label: 'New puzzle', primary: true, run: () => newGame(st.level === 'daily' ? 'medium' : st.level) }] });
    return { destroy() { stopClock(); api.save(st); } };
  },
});
