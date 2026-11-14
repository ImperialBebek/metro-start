'use strict';
/* Five Letters: guess the five-letter word in six tries. Green = right letter, right spot; amber = in the word, wrong spot.
   A new daily word every day (the same for everyone using Metro Start), plus unlimited practice words. */
Games.register('words', {
  title: 'Five Letters',
  color: '#603cba',
  mount(api) {
    const chunk = s => { const out = []; for (let i = 0; i < s.length; i += 5) out.push(s.slice(i, i + 5)); return out; };
    const ANSWERS = chunk(WORD_DATA.answers);
    const VALID = new Set([...chunk(WORD_DATA.valid), ...ANSWERS]);
    // a fixed shuffle so daily words don't come in alphabetical order
    const ORDER = Games.shuffle(ANSWERS.slice(), Games.seeded(20260101));
    const dayNumber = date => Math.round((new Date(`${date}T12:00:00`) - new Date('2026-01-01T12:00:00')) / 86400000);
    const dailyWord = date => ORDER[((dayNumber(date) % ORDER.length) + ORDER.length) % ORDER.length];

    let st = api.load();
    if (!st || !['daily', 'practice'].includes(st.mode) || !ANSWERS.includes(st.answer)) st = fresh('daily');
    if (st.mode === 'daily' && st.date !== Games.today()) st = fresh('daily'); // a new day, a new word
    const dailyKey = 'dailyState'; // the daily game is kept separately, so practice words never lose it
    let typing = '';
    let revealing = false;

    function fresh(mode) {
      const date = Games.today();
      return {
        mode, date,
        answer: mode === 'daily' ? dailyWord(date) : ANSWERS[Math.floor(Math.random() * ANSWERS.length)],
        guesses: [], over: false, won: false,
      };
    }
    // two-pass scoring so repeated letters are marked fairly
    function score(guess, answer) {
      const res = Array(5).fill('absent');
      const left = {};
      for (let i = 0; i < 5; i++) {
        if (guess[i] === answer[i]) res[i] = 'correct';
        else left[answer[i]] = (left[answer[i]] || 0) + 1;
      }
      for (let i = 0; i < 5; i++) {
        if (res[i] === 'correct') continue;
        if (left[guess[i]]) { res[i] = 'present'; left[guess[i]]--; }
      }
      return res;
    }

    // ---- board and keyboard
    const rows = Array.from({ length: 6 }, () => {
      const tiles = Array.from({ length: 5 }, () => h('div', { class: 'wd-tile' }));
      return { el: h('div', { class: 'wd-row' }, tiles), tiles };
    });
    const board = h('div', { class: 'wd-board', role: 'grid', 'aria-label': 'Guesses' }, rows.map(r => r.el));
    const keyEls = {};
    const kb = h('div', { class: 'wd-kb' }, ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'].map(line => h('div', { class: 'wd-kb-row' },
      line.split('').map(ch => {
        const label = ch === '+' ? 'Enter' : ch === '-' ? '⌫' : ch.toUpperCase();
        const b = h('button', {
          type: 'button', class: 'wd-key' + (ch === '+' || ch === '-' ? ' wide' : ''), 'aria-label': ch === '-' ? 'Delete' : label,
          onclick: () => press(ch === '+' ? 'Enter' : ch === '-' ? 'Backspace' : ch),
        }, label);
        if (/[a-z]/.test(ch)) keyEls[ch] = b;
        return b;
      }))));
    api.stage.append(h('div', { class: 'wd-wrap' }, board, kb));

    function render() {
      const results = st.guesses.map(g => score(g, st.answer));
      rows.forEach((row, r) => {
        const word = r < st.guesses.length ? st.guesses[r] : r === st.guesses.length ? typing : '';
        row.tiles.forEach((t, i) => {
          const ch = word[i] || '';
          t.textContent = ch.toUpperCase();
          t.className = 'wd-tile' + (ch ? ' filled' : '') + (r < st.guesses.length ? ` ${results[r][i]}` : '');
        });
      });
      // keyboard: best result seen for each letter
      const rank = { absent: 1, present: 2, correct: 3 };
      const best = {};
      st.guesses.forEach((g, r) => g.split('').forEach((ch, i) => {
        const res = results[r][i];
        if (!best[ch] || rank[res] > rank[best[ch]]) best[ch] = res;
      }));
      Object.entries(keyEls).forEach(([ch, b]) => { b.className = 'wd-key' + (best[ch] ? ` ${best[ch]}` : ''); });
      const s = api.stats();
      api.status([
        [st.mode === 'daily' ? `Daily ${st.date}` : 'Practice', `${Math.min(st.guesses.length + (st.over ? 0 : 1), 6)} / 6`],
        ['Streak', String(s.streak || 0)],
      ]);
    }

    function shake(msg) {
      const row = rows[st.guesses.length].el;
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      if (msg) api.toast(msg);
    }

    function submit() {
      if (typing.length < 5) { shake('Not enough letters'); return; }
      if (!VALID.has(typing)) { shake('Not in the word list'); return; }
      const r = st.guesses.length;
      st.guesses.push(typing);
      typing = '';
      const res = score(st.guesses[r], st.answer);
      st.won = res.every(x => x === 'correct');
      st.over = st.won || st.guesses.length === 6;
      api.save(st);
      // reveal the row one tile at a time
      revealing = true;
      const row = rows[r];
      row.tiles.forEach((t, i) => setTimeout(() => t.classList.add('reveal'), i * 160));
      setTimeout(() => {
        revealing = false;
        render();
        row.tiles.forEach(t => t.classList.remove('reveal'));
        if (st.over) finish();
      }, 5 * 160 + 120);
      // show letters immediately (colors arrive with the flip)
      row.tiles.forEach((t, i) => { t.textContent = st.guesses[r][i].toUpperCase(); });
    }

    function finish() {
      const s = api.stats();
      const dist = (s.dist || [0, 0, 0, 0, 0, 0]).slice();
      const update = { played: (s.played || 0) + 1 };
      if (st.won) {
        dist[st.guesses.length - 1]++;
        update.won = (s.won || 0) + 1;
        update.dist = dist;
      }
      if (st.mode === 'daily') {
        // streaks count daily words solved on consecutive days
        const yesterday = (() => { const d = new Date(`${st.date}T12:00:00`); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
        const streak = st.won ? (s.lastDaily === yesterday ? (s.streak || 0) + 1 : 1) : 0;
        Object.assign(update, { streak, maxStreak: Math.max(s.maxStreak || 0, streak), lastDaily: st.won ? st.date : s.lastDaily });
      }
      api.setStats(update);
      const word = st.answer.toUpperCase();
      const praise = ['Genius', 'Brilliant', 'Great', 'Nice', 'Good', 'Phew'][st.guesses.length - 1];
      api.banner({
        title: st.won ? `${praise}! ${word}` : `The word was ${word}`,
        text: st.mode === 'daily'
          ? (st.won ? `Solved in ${st.guesses.length}. ` : '') + 'A new daily word arrives tomorrow.'
          : (st.won ? `Solved in ${st.guesses.length}.` : 'Better luck with the next one.'),
        actions: [{ label: st.mode === 'daily' ? 'Play a practice word' : 'Next word', primary: true, run: startPractice }, { label: 'Close', run: () => api.clearBanner() }],
      });
      render();
    }

    function press(key) {
      if (st.over || revealing || api.bannerOpen()) return;
      if (key === 'Enter') submit();
      else if (key === 'Backspace') { typing = typing.slice(0, -1); render(); }
      else if (/^[a-z]$/i.test(key) && typing.length < 5) { typing += key.toLowerCase(); render(); }
    }


    function switchMode(mode) {
      if (mode === st.mode) return;
      const s = api.stats();
      if (st.mode === 'daily') api.setStats({ [dailyKey]: st });
      if (mode === 'daily') {
        const d = s[dailyKey];
        st = d && d.date === Games.today() && d.answer === dailyWord(d.date) ? d : fresh('daily');
      } else st = fresh('practice');
      typing = '';
      modeSeg.mark(mode);
      api.clearBanner();
      api.save(st);
      render();
    }
    function startPractice() {
      if (st.mode === 'daily') api.setStats({ [dailyKey]: st });
      st = fresh('practice');
      typing = '';
      modeSeg.mark('practice');
      api.clearBanner();
      api.save(st);
      render();
    }
    const modeSeg = Games.seg([['daily', 'Daily'], ['practice', 'Practice']], st.mode, v => switchMode(v), 'Word');
    api.tools([modeSeg, Games.button('New practice word', startPractice)]);
    api.onKey(e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-zA-Z]$/.test(e.key)) {
        if (api.bannerOpen()) return;
        e.preventDefault();
        press(e.key);
      }
    });

    api.save(st);
    render();
    if (st.over) {
      const word = st.answer.toUpperCase();
      api.banner({
        title: st.won ? `Solved: ${word}` : `The word was ${word}`,
        text: st.mode === 'daily' ? 'A new daily word arrives tomorrow.' : '',
        actions: [{ label: st.mode === 'daily' ? 'Play a practice word' : 'Next word', primary: true, run: startPractice }, { label: 'Close', run: () => api.clearBanner() }],
      });
    }
    return { destroy() { if (st.mode === 'daily') api.setStats({ [dailyKey]: st }); api.save(st); } };
  },
});
