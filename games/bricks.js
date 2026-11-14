'use strict';
/* Bricks: keep the ball in play with the paddle and clear every brick. Mouse or ← →, click or Space to launch, P pauses. */
Games.register('bricks', {
  title: 'Bricks',
  color: '#b91d47',
  mount(api) {
    const W = 640;
    const H = 480;
    const view = Games.canvas(api.stage, W, H);
    const { ctx } = view;
    const ROW_COLORS = ['#ee1111', '#da532c', '#e3a21a', '#ffc40d', '#00a300', '#00aba9', '#2d89ef', '#603cba'];
    const COLS = 10;
    const BW = 58;
    const BH = 18;
    const GAP = 4;
    const LEFT = (W - (COLS * BW + (COLS - 1) * GAP)) / 2;
    const TOP = 54;
    const PADDLE_Y = H - 36;
    const R = 7;
    let g;
    const keys = { left: false, right: false };

    function buildLevel(level) {
      const rows = Math.min(8, 4 + level);
      const bricks = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          // later levels leave a few gaps in a pattern so each level looks different
          if (level > 1 && (r * 7 + c * 3 + level) % (9 - Math.min(level, 6)) === 0) continue;
          bricks.push({ x: LEFT + c * (BW + GAP), y: TOP + r * (BH + GAP), color: ROW_COLORS[(r + level - 1) % ROW_COLORS.length], points: (rows - r) * 10, hits: level >= 3 && r === 0 ? 2 : 1 });
        }
      }
      return bricks;
    }
    function reset() {
      g = { level: 1, score: 0, lives: 3, paddle: { x: W / 2, w: 96 }, bricks: buildLevel(1), state: 'ready' };
      serve();
      status();
    }
    function serve() {
      g.ball = { x: g.paddle.x, y: PADDLE_Y - R - 1, vx: 0, vy: 0, stuck: true };
      g.state = g.state === 'over' ? 'over' : 'ready';
    }
    const speed = () => 330 + (g.level - 1) * 40;
    function launch() {
      if (g.state === 'over' || api.bannerOpen()) return;
      if (g.state === 'paused') { g.state = 'playing'; return; }
      if (!g.ball.stuck) return;
      const a = (-Math.PI / 2) + (Math.random() * 0.6 - 0.3);
      g.ball.vx = Math.cos(a) * speed();
      g.ball.vy = Math.sin(a) * speed();
      g.ball.stuck = false;
      g.state = 'playing';
    }
    function status() {
      api.status([['Score', g.score.toLocaleString()], ['Lives', String(g.lives)], ['Level', String(g.level)]]);
    }
    function lose() {
      g.lives--;
      status();
      if (g.lives <= 0) {
        g.state = 'over';
        const s = api.stats();
        const best = Math.max(s.best || 0, g.score);
        api.setStats({ best, bestLevel: Math.max(s.bestLevel || 0, g.level), played: (s.played || 0) + 1 });
        api.banner({
          title: 'Game over',
          text: `Score ${g.score.toLocaleString()}, level ${g.level}.` + (g.score > 0 && g.score >= best ? ' That’s your best.' : ` Best: ${best.toLocaleString()}.`),
          actions: [{ label: 'Play again', primary: true, run: () => { api.clearBanner(); reset(); } }],
        });
      } else serve();
    }
    function nextLevel() {
      g.level++;
      g.bricks = buildLevel(g.level);
      g.paddle.w = Math.max(64, 96 - (g.level - 1) * 6);
      serve();
      status();
    }

    function step(dt) {
      const p = g.paddle;
      if (keys.left) p.x -= 560 * dt;
      if (keys.right) p.x += 560 * dt;
      p.x = Math.max(p.w / 2, Math.min(W - p.w / 2, p.x));
      const b = g.ball;
      if (b.stuck) { b.x = p.x; return; }
      // small sub-steps so a fast ball can't skip through a brick
      const n = 4;
      for (let i = 0; i < n; i++) {
        b.x += (b.vx * dt) / n;
        b.y += (b.vy * dt) / n;
        if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); }
        if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); }
        if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); }
        if (b.y > H + R) { lose(); return; }
        // paddle: the further from the middle you hit, the sharper the angle
        if (b.vy > 0 && b.y + R >= PADDLE_Y && b.y + R <= PADDLE_Y + 12 && b.x >= p.x - p.w / 2 - R && b.x <= p.x + p.w / 2 + R) {
          const off = Math.max(-1, Math.min(1, (b.x - p.x) / (p.w / 2)));
          const a = -Math.PI / 2 + off * 1.05;
          const sp = Math.min(speed() * 1.35, Math.hypot(b.vx, b.vy) * 1.01);
          b.vx = Math.cos(a) * sp;
          b.vy = Math.sin(a) * sp;
          b.y = PADDLE_Y - R;
        }
        for (const br of g.bricks) {
          if (b.x + R < br.x || b.x - R > br.x + BW || b.y + R < br.y || b.y - R > br.y + BH) continue;
          // bounce off the side we overlap least
          const ox = Math.min(b.x + R - br.x, br.x + BW - (b.x - R));
          const oy = Math.min(b.y + R - br.y, br.y + BH - (b.y - R));
          if (ox < oy) b.vx = -b.vx; else b.vy = -b.vy;
          br.hits--;
          if (br.hits <= 0) { g.score += br.points; br.dead = true; }
          status();
          break;
        }
        if (g.bricks.some(x => x.dead)) g.bricks = g.bricks.filter(x => !x.dead);
        if (!g.bricks.length) { nextLevel(); return; }
      }
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(0, 0, W, H);
      for (const br of g.bricks) {
        ctx.fillStyle = br.color;
        ctx.fillRect(br.x, br.y, BW, BH);
        if (br.hits > 1) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.strokeRect(br.x + 2, br.y + 2, BW - 4, BH - 4); }
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(g.paddle.x - g.paddle.w / 2, PADDLE_Y, g.paddle.w, 10);
      ctx.beginPath();
      ctx.arc(g.ball.x, g.ball.y, R, 0, Math.PI * 2);
      ctx.fill();
      if (g.state === 'ready' || g.state === 'paused') {
        ctx.textAlign = 'center';
        ctx.font = Games.font(300, 24);
        ctx.fillText(g.state === 'paused' ? 'Paused' : g.level > 1 && g.ball.stuck && g.score ? `Level ${g.level}` : 'Click or press Space to launch', W / 2, H / 2 + 40);
        ctx.font = Games.font(400, 13);
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillText(g.state === 'paused' ? 'Click or press P to carry on' : 'Move with the mouse or ← →. P pauses.', W / 2, H / 2 + 64);
      }
    }

    const stop = Games.loop(dt => {
      if (g.state === 'playing' && (document.hidden || api.bannerOpen())) g.state = 'paused';
      if (g.state === 'playing' || g.state === 'ready') step(dt);
      draw();
    });

    view.cv.addEventListener('pointermove', e => {
      if (g.state === 'paused' || g.state === 'over') return;
      const r = view.cv.getBoundingClientRect();
      g.paddle.x = ((e.clientX - r.left) / r.width) * W;
    });
    view.cv.addEventListener('pointerdown', e => {
      const r = view.cv.getBoundingClientRect();
      if (g.state !== 'paused') g.paddle.x = ((e.clientX - r.left) / r.width) * W;
      launch();
    });
    view.cv.style.touchAction = 'none';
    view.cv.style.cursor = 'none';
    api.onKey(e => {
      if (e.ctrlKey || e.metaKey || e.altKey || api.bannerOpen()) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); keys.left = true; }
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); keys.right = true; }
      else if (e.key === ' ') { e.preventDefault(); launch(); }
      else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); if (g.state === 'playing') g.state = 'paused'; else if (g.state === 'paused') g.state = 'playing'; }
    });
    const keyUp = e => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    };
    document.addEventListener('keyup', keyUp);

    api.tools([Games.button('New game', () => (g.state !== 'over' && g.score > 0 ? api.confirm('Start a new game? This one will be lost.', 'New game', reset) : (api.clearBanner(), reset())))]);
    reset();
    return { destroy() { stop(); view.destroy(); document.removeEventListener('keyup', keyUp); } };
  },
});
