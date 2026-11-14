'use strict';
/* Minesweeper: click to open, right-click (or long-press) to flag, click a number to open around it. */
Games.register('minesweeper', {
  title: 'Minesweeper',
  color: '#2b5797',
  mount(api) {
    const LEVELS = {
      easy: { w: 9, h: 9, m: 10, label: 'Easy' },
      medium: { w: 16, h: 16, m: 40, label: 'Medium' },
      expert: { w: 30, h: 16, m: 99, label: 'Expert' },
    };
    const FLAG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2v12" stroke="currentColor" stroke-width="1.6"/><path d="M4.8 2.5h7.5l-2 2.5 2 2.5H4.8z" fill="currentColor"/></svg>';
    const MINE = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.6" fill="currentColor"/><path d="M8 1.8v2.4M8 11.8v2.4M1.8 8h2.4M11.8 8h2.4M3.6 3.6l1.6 1.6M10.8 10.8l1.6 1.6M3.6 12.4l1.6-1.6M10.8 5.2l1.6-1.6" stroke="currentColor" stroke-width="1.3"/></svg>';

    let st = api.load();
    if (!st || !LEVELS[st.level] || !Array.isArray(st.open)) st = fresh('easy');
    let cells = [];

    function fresh(level) {
      const L = LEVELS[level];
      const n = L.w * L.h;
      return { level, w: L.w, h: L.h, m: L.m, mines: [], open: Array(n).fill(0), flag: Array(n).fill(0), started: false, over: null, time: 0, boom: -1 };
    }
    const mineSet = () => new Set(st.mines);
    function around(i) {
      const r = Math.floor(i / st.w);
      const c = i % st.w;
      const out = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < st.h && cc >= 0 && cc < st.w) out.push(rr * st.w + cc);
        }
      }
      return out;
    }
    function placeMines(safe) {
      // the first click and its neighbours never hold a mine
      const keep = new Set([safe, ...around(safe)]);
      const pool = [];
      for (let i = 0; i < st.w * st.h; i++) if (!keep.has(i)) pool.push(i);
      st.mines = Games.shuffle(pool).slice(0, st.m);
    }
    const countAround = (i, set) => around(i).filter(j => set.has(j)).length;

    // ---- actions
    function reveal(i) {
      if (st.over || st.flag[i] || st.open[i]) return;
      if (!st.started) {
        placeMines(i);
        st.started = true;
        const s = api.stats();
        const lv = s[st.level] || {};
        api.setStats({ [st.level]: { ...lv, played: (lv.played || 0) + 1 } });
      }
      const set = mineSet();
      if (set.has(i)) { lose(i); return; }
      const stack = [i];
      while (stack.length) {
        const j = stack.pop();
        if (st.open[j] || st.flag[j]) continue;
        st.open[j] = 1;
        if (countAround(j, set) === 0) around(j).forEach(k => { if (!st.open[k] && !set.has(k)) stack.push(k); });
      }
      checkWin();
    }
    function chord(i) {
      if (st.over || !st.open[i]) return;
      const set = mineSet();
      const n = countAround(i, set);
      const flags = around(i).filter(j => st.flag[j]).length;
      if (!n || flags !== n) return;
      for (const j of around(i)) {
        if (st.over) break;
        if (!st.open[j] && !st.flag[j]) reveal(j);
      }
    }
    function toggleFlag(i) {
      if (st.over || st.open[i]) return;
      st.flag[i] = st.flag[i] ? 0 : 1;
    }
    function lose(i) {
      st.over = 'lost';
      st.boom = i;
      api.banner({ title: 'Boom', text: 'That was a mine. Have another go?', actions: [{ label: 'Try again', primary: true, run: () => newGame(st.level) }, { label: 'Look at the board', run: () => api.clearBanner() }] });
    }
    function checkWin() {
      const opened = st.open.reduce((a, b) => a + b, 0);
      if (opened !== st.w * st.h - st.m) return;
      st.over = 'won';
      st.mines.forEach(j => { st.flag[j] = 1; });
      const s = api.stats();
      const lv = s[st.level] || {};
      const best = lv.best ? Math.min(lv.best, st.time) : st.time;
      api.setStats({ [st.level]: { ...lv, won: (lv.won || 0) + 1, best } });
      api.banner({
        title: 'You cleared the field',
        text: `${LEVELS[st.level].label} in ${Games.fmtTime(st.time)}.` + (best === st.time ? ' That’s your best time.' : ` Best: ${Games.fmtTime(best)}.`),
        actions: [{ label: 'Play again', primary: true, run: () => newGame(st.level) }],
      });
    }

    // ---- drawing
    const board = h('div', { class: 'ms-board', role: 'grid', 'aria-label': 'Minefield' });
    const wrap = h('div', { class: 'ms-wrap' }, board);
    api.stage.append(wrap);

    function build() {
      board.style.gridTemplateColumns = `repeat(${st.w}, var(--cs))`;
      cells = Array.from({ length: st.w * st.h }, (_, i) => h('div', { class: 'ms-cell', dataset: { i: String(i) } }));
      board.replaceChildren(...cells);
      fit();
    }
    function fit() {
      const r = api.stage.getBoundingClientRect();
      const size = Math.floor(Math.min((r.width - 16) / st.w, (r.height - 24) / st.h));
      board.style.setProperty('--cs', `${Math.max(18, Math.min(44, size))}px`);
    }
    function render() {
      const set = mineSet();
      const showMines = st.over;
      cells.forEach((el, i) => {
        let cls = 'ms-cell';
        let html = '';
        if (st.open[i]) {
          const n = countAround(i, set);
          cls += ' open' + (n ? ` n${n}` : '');
          html = n ? String(n) : '';
        } else if (showMines && set.has(i) && !(st.over === 'won')) {
          cls += ' open mine' + (i === st.boom ? ' boom' : '');
          html = st.flag[i] ? FLAG : MINE;
        } else if (st.flag[i]) {
          cls += ' flagged' + (showMines && !set.has(i) ? ' wrong' : '');
          html = FLAG;
        }
        if (el.className !== cls) el.className = cls;
        if (el.innerHTML !== html) el.innerHTML = html;
      });
      status();
    }
    function status() {
      const flags = st.flag.reduce((a, b) => a + b, 0);
      api.status([['Mines', String(st.m - flags)], ['Time', Games.fmtTime(st.time)]]);
    }
    function after() { api.save(st); render(); }

    function newGame(level) {
      st = fresh(level);
      api.clearBanner();
      levelSeg.mark(level);
      build();
      after();
    }

    const levelSeg = Games.seg(Object.entries(LEVELS).map(([k, v]) => [k, v.label]), st.level, (lv, mark) => {
      if (lv === st.level && !st.started) return;
      const go = () => { mark(lv); newGame(lv); };
      if (st.started && !st.over) api.confirm('Start a new game? This one will be lost.', 'New game', go);
      else go();
    }, 'Difficulty');
    api.tools([levelSeg, Games.button('New game', () => {
      if (st.started && !st.over) api.confirm('Start a new game? This one will be lost.', 'New game', () => newGame(st.level));
      else newGame(st.level);
    })]);

    // ---- input: click opens, right-click or long-press flags, clicking a number opens around it
    let press = null;
    board.addEventListener('pointerdown', e => {
      const el = e.target.closest('.ms-cell');
      if (!el || api.bannerOpen()) return;
      const i = +el.dataset.i;
      if (e.button === 2 || e.button === 1) return;
      press = { i, timer: setTimeout(() => { press.long = true; toggleFlag(i); after(); }, 450), long: false };
    });
    const endPress = () => { if (press) clearTimeout(press.timer); };
    board.addEventListener('pointerleave', () => { endPress(); press = null; });
    board.addEventListener('pointerup', e => {
      endPress();
      const el = e.target.closest('.ms-cell');
      if (!press || !el || +el.dataset.i !== press.i || press.long || e.button !== 0) { press = null; return; }
      const i = press.i;
      press = null;
      if (st.open[i]) chord(i);
      else reveal(i);
      after();
    });
    board.addEventListener('contextmenu', e => {
      e.preventDefault();
      const el = e.target.closest('.ms-cell');
      if (!el || api.bannerOpen()) return;
      const i = +el.dataset.i;
      if (st.open[i]) chord(i);
      else toggleFlag(i);
      after();
    });
    board.addEventListener('auxclick', e => {
      const el = e.target.closest('.ms-cell');
      if (e.button === 1 && el) { e.preventDefault(); chord(+el.dataset.i); after(); }
    });

    const stopClock = Games.clock(() => st.started && !st.over, dt => {
      const before = Math.floor(st.time);
      st.time += dt;
      if (Math.floor(st.time) !== before) { status(); if (Math.floor(st.time) % 5 === 0) api.save(st); }
    });
    const ro = new ResizeObserver(fit);
    ro.observe(api.stage);

    api.save(st); // a new game is saved right away, so it's there next time
    build();
    render();
    return { destroy() { stopClock(); ro.disconnect(); api.save(st); } };
  },
});
