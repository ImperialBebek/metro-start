'use strict';
/* Klondike Solitaire: drag cards, or click a card to send it to the best spot. Draw 1 or Draw 3, undo, auto-finish. */
Games.register('solitaire', {
  title: 'Solitaire',
  color: '#1e7145',
  mount(api) {
    const SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'];
    const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const red = c => c.s === 1 || c.s === 2;

    let st = api.load();
    if (!valid(st)) st = deal(1);
    let history = [];
    let layout = null;
    let finishing = false;
    let finishRun = 0; // bumped on undo/new deal so an old auto-finish stops

    function valid(s) {
      if (!s || !Array.isArray(s.stock) || !Array.isArray(s.tab) || s.tab.length !== 7 || !Array.isArray(s.found)) return false;
      const all = [...s.stock, ...s.waste, ...s.found.flat(), ...s.tab.flat()];
      return all.length === 52 && new Set(all.map(c => c.id)).size === 52;
    }
    function deal(draw) {
      const deck = [];
      for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ id: s * 13 + r - 1, s, r, up: false });
      Games.shuffle(deck);
      const tab = [];
      for (let i = 0; i < 7; i++) {
        tab.push(deck.splice(0, i + 1));
        tab[i][i].up = true;
      }
      return { draw, stock: deck, waste: [], found: [[], [], [], []], tab, moves: 0, time: 0, started: false, over: false };
    }

    // ---- rules
    const top = pile => pile[pile.length - 1];
    function canFound(card, f) {
      const t = top(st.found[f]);
      return t ? t.s === card.s && card.r === t.r + 1 : card.r === 1;
    }
    function canTab(card, col) {
      const t = top(st.tab[col]);
      return t ? t.up && red(t) !== red(card) && card.r === t.r - 1 : card.r === 13;
    }
    // where a card lives: { pile: 'waste'|'found'|'tab'|'stock', i, k }
    function locate(id) {
      if (st.waste.some(c => c.id === id)) return { pile: 'waste', i: 0, k: st.waste.findIndex(c => c.id === id) };
      for (let f = 0; f < 4; f++) { const k = st.found[f].findIndex(c => c.id === id); if (k >= 0) return { pile: 'found', i: f, k }; }
      for (let t = 0; t < 7; t++) { const k = st.tab[t].findIndex(c => c.id === id); if (k >= 0) return { pile: 'tab', i: t, k }; }
      return { pile: 'stock', i: 0, k: st.stock.findIndex(c => c.id === id) };
    }
    const pileOf = loc => (loc.pile === 'waste' ? st.waste : loc.pile === 'found' ? st.found[loc.i] : loc.pile === 'tab' ? st.tab[loc.i] : st.stock);
    // which cards can be picked up from here (null if none)
    function grab(loc) {
      const pile = pileOf(loc);
      if (loc.pile === 'stock') return null;
      if (loc.pile === 'tab') return pile[loc.k].up ? pile.slice(loc.k) : null;
      return loc.k === pile.length - 1 ? [pile[loc.k]] : null;
    }

    function remember() {
      history.push(JSON.stringify({ stock: st.stock, waste: st.waste, found: st.found, tab: st.tab, moves: st.moves }));
      if (history.length > 300) history.shift();
    }
    function startClock() {
      if (st.started) return;
      st.started = true;
      const s = api.stats();
      api.setStats({ played: (s.played || 0) + 1 });
    }
    function move(loc, to) {
      const pile = pileOf(loc);
      const cards = pile.slice(loc.k);
      remember();
      pile.splice(loc.k);
      (to.pile === 'found' ? st.found[to.i] : st.tab[to.i]).push(...cards);
      if (loc.pile === 'tab' && pile.length && !top(pile).up) top(pile).up = true;
      st.moves++;
      startClock();
      afterMove();
    }
    function drawCards() {
      if (finishing) return;
      remember();
      if (!st.stock.length) {
        if (!st.waste.length) { history.pop(); return; }
        st.stock = st.waste.reverse().map(c => ({ ...c, up: false }));
        st.waste = [];
      } else {
        const n = Math.min(st.draw, st.stock.length);
        for (let k = 0; k < n; k++) { const c = st.stock.pop(); c.up = true; st.waste.push(c); }
      }
      st.moves++;
      startClock();
      afterMove();
    }
    // a click sends the card to a foundation if it can go there, otherwise to the best tableau column
    function autoMove(loc) {
      const cards = grab(loc);
      if (!cards) return false;
      if (cards.length === 1) {
        for (let f = 0; f < 4; f++) if (canFound(cards[0], f)) { move(loc, { pile: 'found', i: f }); return true; }
      }
      const options = [];
      for (let t = 0; t < 7; t++) {
        if (loc.pile === 'tab' && t === loc.i) continue;
        if (!canTab(cards[0], t)) continue;
        // don't shuffle a king that already sits at the bottom of a column into another empty column
        if (!st.tab[t].length && loc.pile === 'tab' && loc.k === 0) continue;
        options.push(t);
      }
      options.sort((a, b) => (st.tab[a].length ? 0 : 1) - (st.tab[b].length ? 0 : 1));
      if (options.length) { move(loc, { pile: 'tab', i: options[0] }); return true; }
      return false;
    }
    function afterMove() {
      const done = st.found.reduce((n, f) => n + f.length, 0) === 52;
      if (done && !st.over) win();
      api.save(st);
      render();
      if (!st.over && !finishing && !st.stock.length && !st.waste.length && st.tab.every(col => col.every(c => c.up))) autoFinish();
    }
    function autoFinish() {
      finishing = true;
      const run = ++finishRun;
      const step = () => {
        if (run !== finishRun) return;
        if (st.over) { finishing = false; return; }
        let best = null;
        for (let t = 0; t < 7; t++) {
          const c = top(st.tab[t]);
          if (!c) continue;
          for (let f = 0; f < 4; f++) {
            if (canFound(c, f) && (!best || c.r < best.c.r)) best = { c, t, f };
          }
        }
        if (!best) { finishing = false; return; }
        move({ pile: 'tab', i: best.t, k: st.tab[best.t].length - 1 }, { pile: 'found', i: best.f });
        setTimeout(step, 90);
      };
      setTimeout(step, 250);
    }
    function win() {
      st.over = true;
      const s = api.stats();
      const key = `best${st.draw}`;
      const best = s[key] ? Math.min(s[key], st.time) : st.time;
      api.setStats({ won: (s.won || 0) + 1, [key]: best });
      api.banner({
        title: 'You won',
        text: `${st.moves} moves in ${Games.fmtTime(st.time)}.` + (best === st.time ? ' That’s your best time.' : ` Best: ${Games.fmtTime(best)}.`),
        actions: [{ label: 'Deal again', primary: true, run: () => newGame(st.draw) }],
      });
    }
    function doUndo() {
      if (!history.length || st.over || finishing) return;
      Object.assign(st, JSON.parse(history.pop()));
      api.save(st);
      render();
    }
    function newGame(draw) {
      st = deal(draw);
      history = [];
      finishing = false;
      finishRun++;
      drawSeg.mark(draw);
      api.clearBanner();
      api.save(st);
      build();
    }

    // ---- drawing: every card is one element; moves animate because only positions change
    const board = h('div', { class: 'sol-board' });
    api.stage.append(board);
    const cardEls = new Map();
    let slots = [];

    function cardEl(c) {
      const sym = SUITS[c.s] + '\uFE0E';
      const rank = RANKS[c.r];
      const el = h('div', { class: 'card' + (red(c) ? ' red' : ''), dataset: { id: String(c.id) } },
        h('div', { class: 'card-face' },
          h('span', { class: 'c-corner' }, rank, h('br'), sym),
          h('span', { class: 'c-mid' + (c.r > 10 ? ' face' : '') }, c.r > 10 ? rank : sym),
          h('span', { class: 'c-corner c-br' }, rank, h('br'), sym)),
        h('div', { class: 'card-back' }));
      el.setAttribute('aria-label', `${rank} of ${['spades', 'hearts', 'diamonds', 'clubs'][c.s]}`);
      return el;
    }
    function computeLayout() {
      const W = api.stage.clientWidth;
      const H = api.stage.clientHeight;
      const gap = Math.max(6, Math.round(W * 0.012));
      let cw = Math.min((W - gap * 8) / 7, 118, (H - gap * 3) / 1.45 / 2.6);
      cw = Math.max(44, Math.floor(cw));
      const ch = Math.round(cw * 1.42);
      const total = cw * 7 + gap * 6;
      const left = Math.max(0, Math.floor((W - total) / 2));
      const x = i => left + i * (cw + gap);
      return { W, H, gap, cw, ch, x, y0: 0, y1: ch + gap * 2 };
    }
    function build() {
      layout = computeLayout();
      board.style.setProperty('--cw', `${layout.cw}px`);
      board.style.setProperty('--ch', `${layout.ch}px`);
      slots = [];
      const slot = (cls, x, y, extra) => { const el = h('div', { class: `sol-slot ${cls}`, style: { left: `${x}px`, top: `${y}px` }, ...extra }); slots.push(el); return el; };
      slot('stock-slot', layout.x(0), layout.y0, { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4v4h-4"/></svg>', title: 'Turn the pile over' });
      slot('waste-slot', layout.x(1), layout.y0);
      for (let f = 0; f < 4; f++) slot('found-slot', layout.x(3 + f), layout.y0, { dataset: { f: String(f) } });
      for (let t = 0; t < 7; t++) slot('tab-slot', layout.x(t), layout.y1, { dataset: { t: String(t) } });
      cardEls.clear();
      const all = [...st.stock, ...st.waste, ...st.found.flat(), ...st.tab.flat()];
      board.replaceChildren(...slots, ...all.map(c => { const el = cardEl(c); cardEls.set(c.id, el); return el; }));
      board.classList.add('no-move');
      render();
      requestAnimationFrame(() => board.classList.remove('no-move'));
    }
    function place(c, x, y, z) {
      const el = cardEls.get(c.id);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.zIndex = String(z);
      el.classList.toggle('down', !c.up);
    }
    function tabOffsets(col) {
      const avail = layout.H - layout.y1 - layout.ch - 4;
      const downs = col.filter(c => !c.up).length;
      const ups = col.length - downs;
      let down = layout.ch * 0.1;
      let up = layout.ch * 0.25;
      const need = downs * down + Math.max(0, ups - 1) * up;
      if (need > avail && need > 0) { const k = Math.max(avail, 0) / need; down *= k; up *= k; }
      return { down, up };
    }
    function render() {
      if (!layout) return;
      st.stock.forEach((c, k) => place(c, layout.x(0), layout.y0, k + 1));
      const fanFrom = st.draw === 3 ? Math.max(0, st.waste.length - 3) : st.waste.length;
      st.waste.forEach((c, k) => place(c, layout.x(1) + (k >= fanFrom ? (k - fanFrom) * layout.cw * 0.22 : 0), layout.y0, 100 + k));
      st.found.forEach((pile, f) => pile.forEach((c, k) => place(c, layout.x(3 + f), layout.y0, 200 + k)));
      st.tab.forEach((col, t) => {
        const { down, up } = tabOffsets(col);
        let y = layout.y1;
        col.forEach((c, k) => { place(c, layout.x(t), y, 300 + k); y += c.up ? up : down; });
      });
      slots[0].classList.toggle('empty', !st.stock.length);
      slots[0].classList.toggle('done', !st.stock.length && !st.waste.length);
      statusLine();
    }
    function statusLine() { api.status([['Moves', String(st.moves)], ['Time', Games.fmtTime(st.time)]]); }

    // ---- input: drag and drop, or click
    let drag = null;
    board.addEventListener('pointerdown', e => {
      if (api.bannerOpen() || finishing || e.button !== 0) return;
      const cardNode = e.target.closest('.card');
      if (!cardNode) {
        if (e.target.closest('.stock-slot')) drawCards();
        return;
      }
      const loc = locate(+cardNode.dataset.id);
      if (loc.pile === 'stock') { drawCards(); return; }
      const cards = grab(loc);
      if (!cards) return;
      e.preventDefault();
      board.setPointerCapture(e.pointerId);
      drag = {
        loc, cards, x: e.clientX, y: e.clientY, moved: false,
        start: cards.map(c => { const el = cardEls.get(c.id); return { el, left: parseFloat(el.style.left), top: parseFloat(el.style.top) }; }),
      };
    });
    board.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) { drag.moved = true; drag.start.forEach((s, k) => { s.el.classList.add('dragging'); s.el.style.zIndex = String(1000 + k); }); }
      drag.start.forEach(s => { s.el.style.left = `${s.left + dx}px`; s.el.style.top = `${s.top + dy}px`; });
    });
    board.addEventListener('pointerup', e => {
      if (!drag) return;
      const d = drag;
      drag = null;
      d.start.forEach(s => s.el.classList.remove('dragging'));
      if (!d.moved) {
        if (!autoMove(d.loc)) { const el = d.start[0].el; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); render(); }
        return;
      }
      // drop on whichever pile the dragged card overlaps most
      const lead = d.start[0];
      const L = parseFloat(lead.el.style.left);
      const T = parseFloat(lead.el.style.top);
      const overlap = (x, y, w, hh) => Math.max(0, Math.min(L + layout.cw, x + w) - Math.max(L, x)) * Math.max(0, Math.min(T + layout.ch, y + hh) - Math.max(T, y));
      let best = null;
      const card = d.cards[0];
      if (d.cards.length === 1) {
        for (let f = 0; f < 4; f++) {
          const a = overlap(layout.x(3 + f), layout.y0, layout.cw, layout.ch);
          if (a > 0 && canFound(card, f) && (!best || a > best.a)) best = { a, to: { pile: 'found', i: f } };
        }
      }
      for (let t = 0; t < 7; t++) {
        if (d.loc.pile === 'tab' && t === d.loc.i) continue;
        const a = overlap(layout.x(t), layout.y1 - layout.gap, layout.cw, layout.H - layout.y1 + layout.gap);
        if (a > 0 && canTab(card, t) && (!best || a > best.a)) best = { a, to: { pile: 'tab', i: t } };
      }
      if (best) move(d.loc, best.to);
      else render();
    });
    board.addEventListener('pointercancel', () => { if (drag) { drag.start.forEach(s => s.el.classList.remove('dragging')); drag = null; render(); } });

    const drawSeg = Games.seg([[1, 'Draw 1'], [3, 'Draw 3']], st.draw, (v, mark) => {
      if (v === st.draw) return;
      const go = () => { mark(v); newGame(v); };
      if (st.started && !st.over) api.confirm(`Deal a new Draw ${v} game? This one will be lost.`, 'Deal', go);
      else go();
    }, 'Cards to draw');
    api.tools([
      drawSeg,
      Games.button('Undo', doUndo, { title: 'Undo (Ctrl+Z)' }),
      Games.button('Deal', () => (st.started && !st.over ? api.confirm('Deal a new game? This one will be lost.', 'Deal', () => newGame(st.draw)) : newGame(st.draw))),
    ]);
    api.onKey(e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
      else if (e.key === ' ' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); drawCards(); }
    });

    const stopClock = Games.clock(() => st.started && !st.over && !api.bannerOpen(), dt => {
      const before = Math.floor(st.time);
      st.time += dt;
      if (Math.floor(st.time) !== before) { statusLine(); if (Math.floor(st.time) % 5 === 0) api.save(st); }
    });
    const ro = new ResizeObserver(() => {
      const next = computeLayout();
      if ((layout && next.W === layout.W && next.H === layout.H) || drag) return;
      build();
    });
    ro.observe(api.stage);

    api.save(st); // a new game is saved right away, so it's there next time
    build();
    if (st.over) api.banner({ title: 'You won', text: 'Deal again whenever you like.', actions: [{ label: 'Deal again', primary: true, run: () => newGame(st.draw) }] });
    return { destroy() { stopClock(); ro.disconnect(); api.save(st); } };
  },
});
