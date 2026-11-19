'use strict';
/* Pairs: turn over two cards at a time and find every matching pair of animals in as few moves as you can. */
const Critters = (() => {
  // Each animal is drawn from a few simple shapes on a 100×100 canvas
  const eye = (x, y, r = 4.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#2b2433"/><circle cx="${x + 1.4}" cy="${y - 1.6}" r="${r * 0.35}" fill="#fff"/>`;
  const eyes = (dy = 0, gap = 13, r) => eye(50 - gap, 50 + dy, r) + eye(50 + gap, 50 + dy, r);
  const blush = c => `<ellipse cx="29" cy="62" rx="6" ry="3.5" fill="${c}" opacity=".55"/><ellipse cx="71" cy="62" rx="6" ry="3.5" fill="${c}" opacity=".55"/>`;
  const smile = (y = 63) => `<path d="M44 ${y}q3 3.5 6 0q3 3.5 6 0" stroke="#2b2433" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const head = (c, rx = 33, ry = 30, cy = 54) => `<ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c}"/>`;
  const ANIMALS = {
    cat: () => `<path d="M22 46 20 16l22 14M78 46l2-30-22 14" fill="#f2a65a"/><path d="M25 38l-1-15 11 9M75 38l1-15-11 9" fill="#ffd6c2"/>${head('#f2a65a')}${eyes(-2)}<path d="M46 57h8l-4 4z" fill="#e66a7f"/>${smile(61)}<path d="M20 58l12 2M20 66l12-2M80 58l-12 2M80 66l-12-2" stroke="#7a4b2a" stroke-width="1.4" stroke-linecap="round"/>${blush('#ff8fa3')}`,
    fox: () => `<path d="M20 50 16 12l26 22M80 50l4-38-26 22" fill="#e8743b"/><path d="M24 40l-2-18 12 11M76 40l2-18-12 11" fill="#3b2a24"/>${head('#e8743b')}<path d="M17 52c10 2 22 8 33 22c11-14 23-20 33-22c-2 18-15 31-33 31S19 70 17 52z" fill="#fff"/>${eyes(-4)}<circle cx="50" cy="66" r="4" fill="#2b2433"/>`,
    bear: () => `<circle cx="24" cy="28" r="12" fill="#8d5f3f"/><circle cx="76" cy="28" r="12" fill="#8d5f3f"/><circle cx="24" cy="28" r="6" fill="#d9a77c"/><circle cx="76" cy="28" r="6" fill="#d9a77c"/>${head('#8d5f3f')}<ellipse cx="50" cy="64" rx="14" ry="10" fill="#d9a77c"/>${eyes(-6)}<ellipse cx="50" cy="59" rx="5" ry="3.6" fill="#2b2433"/>${smile(66)}`,
    panda: () => `<circle cx="24" cy="28" r="11" fill="#2b2433"/><circle cx="76" cy="28" r="11" fill="#2b2433"/>${head('#fafafa')}<ellipse cx="36" cy="50" rx="8" ry="10" fill="#2b2433" transform="rotate(-20 36 50)"/><ellipse cx="64" cy="50" rx="8" ry="10" fill="#2b2433" transform="rotate(20 64 50)"/><circle cx="37" cy="50" r="3" fill="#fff"/><circle cx="63" cy="50" r="3" fill="#fff"/><ellipse cx="50" cy="61" rx="5" ry="3.5" fill="#2b2433"/>${smile(66)}${blush('#ff8fa3')}`,
    bunny: () => `<ellipse cx="36" cy="22" rx="8" ry="22" fill="#eee7f2"/><ellipse cx="64" cy="22" rx="8" ry="22" fill="#eee7f2"/><ellipse cx="36" cy="24" rx="4" ry="16" fill="#f7b6c8"/><ellipse cx="64" cy="24" rx="4" ry="16" fill="#f7b6c8"/>${head('#eee7f2', 31, 28, 58)}${eyes(4, 12)}<path d="M46.5 64h7l-3.5 3.5z" fill="#e66a7f"/>${smile(68)}${blush('#ff8fa3')}`,
    frog: () => `<circle cx="32" cy="32" r="13" fill="#77b84a"/><circle cx="68" cy="32" r="13" fill="#77b84a"/>${head('#77b84a', 36, 26, 58)}<circle cx="32" cy="31" r="8" fill="#fff"/><circle cx="68" cy="31" r="8" fill="#fff"/>${eye(32, 32, 4)}${eye(68, 32, 4)}<path d="M33 64q17 12 34 0" stroke="#2b2433" stroke-width="2.4" fill="none" stroke-linecap="round"/>${blush('#ff8fa3')}`,
    pig: () => `<path d="M20 36l4-20 16 12zM80 36l-4-20-16 12z" fill="#f29bb3"/>${head('#f7b3c6')}${eyes(-6)}<ellipse cx="50" cy="61" rx="12" ry="8.5" fill="#f29bb3"/><ellipse cx="45.5" cy="61" rx="2.4" ry="3.2" fill="#a9506a"/><ellipse cx="54.5" cy="61" rx="2.4" ry="3.2" fill="#a9506a"/>`,
    mouse: () => `<circle cx="22" cy="30" r="16" fill="#a9b4c2"/><circle cx="78" cy="30" r="16" fill="#a9b4c2"/><circle cx="22" cy="30" r="9" fill="#f7b6c8"/><circle cx="78" cy="30" r="9" fill="#f7b6c8"/>${head('#a9b4c2', 30, 28, 58)}${eyes(2, 11)}<circle cx="50" cy="64" r="3.5" fill="#e66a7f"/><path d="M24 62l14 1M24 69l14-2M76 62l-14 1M76 69l-14-2" stroke="#5d6672" stroke-width="1.3" stroke-linecap="round"/>`,
    owl: () => `<path d="M22 34 18 14l16 10M78 34l4-20-16 10" fill="#8a6a55"/>${head('#8a6a55', 33, 32, 54)}<circle cx="37" cy="48" r="11" fill="#f3e1c7"/><circle cx="63" cy="48" r="11" fill="#f3e1c7"/>${eye(37, 48, 5.5)}${eye(63, 48, 5.5)}<path d="M45 58h10l-5 8z" fill="#f2a33a"/><path d="M34 74q8-5 16 0q8-5 16 0" stroke="#6d523f" stroke-width="2" fill="none"/>`,
    chick: () => `<path d="M46 22q4-12 8 0q6-8 6 4" stroke="#f2b632" stroke-width="3.5" fill="none" stroke-linecap="round"/>${head('#ffd75e', 32, 31, 56)}${eyes(-2, 11)}<path d="M43 57l7-4 7 4-7 5z" fill="#f28c28"/>${blush('#ff8fa3')}`,
    koala: () => `<circle cx="20" cy="38" r="17" fill="#9aa3ad"/><circle cx="80" cy="38" r="17" fill="#9aa3ad"/><circle cx="20" cy="38" r="10" fill="#e4e1e6"/><circle cx="80" cy="38" r="10" fill="#e4e1e6"/>${head('#9aa3ad', 30, 29, 56)}${eyes(-4, 13, 4)}<ellipse cx="50" cy="60" rx="7.5" ry="9" fill="#3b3346"/>${blush('#ff8fa3')}`,
    tiger: () => `<circle cx="24" cy="28" r="10" fill="#f39a32"/><circle cx="76" cy="28" r="10" fill="#f39a32"/><circle cx="24" cy="28" r="5" fill="#fff3e0"/><circle cx="76" cy="28" r="5" fill="#fff3e0"/>${head('#f39a32')}<path d="M50 25v9M42 26l2 7M58 26l-2 7M18 50h9M18 58h8M82 50h-9M82 58h-8" stroke="#3b2a24" stroke-width="3" stroke-linecap="round"/><ellipse cx="50" cy="64" rx="15" ry="11" fill="#fff3e0"/>${eyes(-6)}<path d="M46 59h8l-4 4z" fill="#3b2a24"/>${smile(66)}`,
  };
  const draw = name => `<svg viewBox="0 0 100 100" aria-hidden="true">${ANIMALS[name]()}</svg>`;
  return { names: Object.keys(ANIMALS), draw };
})();

Games.register('pairs', {
  title: 'Pairs',
  color: '#00aba9',
  mount(api) {
    const LEVELS = { easy: { cols: 4, rows: 3, label: 'Easy' }, medium: { cols: 4, rows: 4, label: 'Medium' }, hard: { cols: 6, rows: 4, label: 'Hard' } };
    const PAW = '<svg viewBox="0 0 40 40" aria-hidden="true" fill="currentColor"><ellipse cx="20" cy="26" rx="8" ry="6.5"/><circle cx="11" cy="17" r="3.4"/><circle cx="17" cy="12" r="3.4"/><circle cx="23" cy="12" r="3.4"/><circle cx="29" cy="17" r="3.4"/></svg>';
    let st = api.load();
    if (!st || !LEVELS[st.level] || !Array.isArray(st.deck)) st = fresh('easy');
    let open = []; // face-up cards waiting to be checked
    let busy = false;
    let els = [];

    function fresh(level) {
      const L = LEVELS[level];
      const kinds = Games.shuffle(Critters.names.slice()).slice(0, (L.cols * L.rows) / 2);
      return { level, deck: Games.shuffle([...kinds, ...kinds]), found: [], moves: 0, time: 0, started: false, over: false };
    }

    const board = h('div', { class: 'pr-board' });
    api.stage.append(h('div', { class: 'pr-wrap' }, board, h('p', { class: 'game-hint' }, 'Turn over two cards at a time. Find every pair in as few moves as you can.')));

    function build() {
      const L = LEVELS[st.level];
      board.style.setProperty('--cols', L.cols);
      board.style.setProperty('--rows', L.rows);
      els = st.deck.map((kind, i) => h('button', {
        type: 'button', class: 'pr-card', dataset: { i: String(i) }, 'aria-label': 'Card',
        onclick: () => flip(i),
      }, h('span', { class: 'pr-inner' },
        h('span', { class: 'pr-back', html: PAW }),
        h('span', { class: 'pr-front', html: Critters.draw(kind) }))));
      board.replaceChildren(...els);
      fit();
      render();
    }
    function fit() {
      const L = LEVELS[st.level];
      const r = api.stage.getBoundingClientRect();
      const size = Math.floor(Math.min((r.width - 20 - (L.cols - 1) * 12) / L.cols, (r.height - 60 - (L.rows - 1) * 12) / L.rows));
      board.style.setProperty('--card', `${Math.max(60, Math.min(150, size))}px`);
    }
    function render() {
      els.forEach((el, i) => {
        const up = st.found.includes(st.deck[i]) || open.includes(i);
        el.classList.toggle('up', up);
        el.classList.toggle('found', st.found.includes(st.deck[i]));
        el.setAttribute('aria-label', up ? st.deck[i] : 'Face-down card');
      });
      const best = (api.stats()[st.level] || {}).best;
      api.status([['Moves', String(st.moves)], ['Time', Games.fmtTime(st.time)], ['Best', best ? `${best} moves` : '—']]);
    }

    function flip(i) {
      if (busy || st.over || api.bannerOpen() || open.includes(i) || st.found.includes(st.deck[i])) return;
      if (!st.started) st.started = true;
      open.push(i);
      render();
      if (open.length < 2) return;
      st.moves++;
      const [a, b] = open;
      if (st.deck[a] === st.deck[b]) {
        st.found.push(st.deck[a]);
        open = [];
        els[a].classList.add('pop');
        els[b].classList.add('pop');
        if (st.found.length === st.deck.length / 2) win();
        api.save(st);
        render();
      } else {
        busy = true;
        api.save(st);
        setTimeout(() => { open = []; busy = false; render(); }, 850);
      }
    }
    function win() {
      st.over = true;
      const s = api.stats();
      const lv = s[st.level] || {};
      const best = lv.best ? Math.min(lv.best, st.moves) : st.moves;
      api.setStats({ [st.level]: { ...lv, won: (lv.won || 0) + 1, best } });
      setTimeout(() => api.banner({
        title: 'All pairs found',
        text: `${st.moves} moves in ${Games.fmtTime(st.time)}.` + (best === st.moves ? ' That’s your best.' : ` Best: ${best} moves.`),
        actions: [{ label: 'Play again', primary: true, run: () => newGame(st.level) }],
      }), 500);
    }
    function newGame(level) {
      st = fresh(level);
      open = [];
      busy = false;
      levelSeg.mark(level);
      api.clearBanner();
      api.save(st);
      build();
    }

    const levelSeg = Games.seg(Object.entries(LEVELS).map(([k, v]) => [k, v.label]), st.level, (lv, mark) => {
      if (lv === st.level) return;
      const go = () => { mark(lv); newGame(lv); };
      if (st.started && !st.over) api.confirm('Start a new game? This one will be lost.', 'New game', go);
      else go();
    }, 'Difficulty');
    api.tools([levelSeg, Games.button('New game', () => (st.started && !st.over ? api.confirm('Start a new game? This one will be lost.', 'New game', () => newGame(st.level)) : newGame(st.level)))]);

    const stopClock = Games.clock(() => st.started && !st.over && !api.bannerOpen(), dt => {
      const before = Math.floor(st.time);
      st.time += dt;
      if (Math.floor(st.time) !== before) { render(); if (Math.floor(st.time) % 5 === 0) api.save(st); }
    });
    const ro = new ResizeObserver(fit);
    ro.observe(api.stage);

    api.save(st);
    build();
    if (st.over) api.banner({ title: 'All pairs found', text: 'Play again whenever you like.', actions: [{ label: 'Play again', primary: true, run: () => newGame(st.level) }] });
    return { destroy() { stopClock(); ro.disconnect(); api.save(st); } };
  },
});
