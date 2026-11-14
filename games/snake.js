'use strict';
/* Snake: eat to grow, don't hit the walls or yourself. Arrow keys, WASD or swipe; P or Space pauses. */
Games.register('snake', {
  title: 'Snake',
  color: '#99b433',
  mount(api) {
    const W = 24;
    const H = 16;
    const C = 20; // logical pixels per cell
    const view = Games.canvas(api.stage, W * C, H * C);
    const { ctx } = view;
    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
    let g;

    function reset() {
      const y = Math.floor(H / 2);
      g = { snake: [{ x: 6, y }, { x: 5, y }, { x: 4, y }], dir: 'right', queue: [], food: null, score: 0, speed: 7, acc: 0, state: 'ready' };
      placeFood();
    }
    function placeFood() {
      const taken = new Set(g.snake.map(p => p.y * W + p.x));
      const free = [];
      for (let i = 0; i < W * H; i++) if (!taken.has(i)) free.push(i);
      const i = free[Math.floor(Math.random() * free.length)];
      g.food = { x: i % W, y: Math.floor(i / W) };
    }
    function turn(dir) {
      if (g.state === 'over') return;
      if (g.state === 'ready' || g.state === 'paused') g.state = 'playing';
      const last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
      if (dir !== last && dir !== OPP[last] && g.queue.length < 3) g.queue.push(dir);
    }
    function tick() {
      if (g.queue.length) g.dir = g.queue.shift();
      const [dx, dy] = DIRS[g.dir];
      const head = { x: g.snake[0].x + dx, y: g.snake[0].y + dy };
      const eating = head.x === g.food.x && head.y === g.food.y;
      const body = eating ? g.snake : g.snake.slice(0, -1);
      if (head.x < 0 || head.y < 0 || head.x >= W || head.y >= H || body.some(p => p.x === head.x && p.y === head.y)) { over(); return; }
      g.snake.unshift(head);
      if (eating) {
        g.score += 10;
        g.speed = Math.min(16, g.speed + 0.3);
        if (g.snake.length >= W * H) { over(true); return; }
        placeFood();
      } else g.snake.pop();
      status();
    }
    function over(perfect = false) {
      g.state = 'over';
      const s = api.stats();
      const best = Math.max(s.best || 0, g.score);
      api.setStats({ best, played: (s.played || 0) + 1 });
      status();
      api.banner({
        title: perfect ? 'You filled the board' : 'Game over',
        text: `Score ${g.score}.` + (g.score > 0 && g.score >= best ? ' That’s your best.' : ` Best: ${best}.`),
        actions: [{ label: 'Play again', primary: true, run: () => { api.clearBanner(); reset(); status(); } }],
      });
    }
    function status() {
      api.status([['Score', String(g.score)], ['Best', String(Math.max(api.stats().best || 0, g.score))]]);
    }

    function draw() {
      ctx.clearRect(0, 0, W * C, H * C);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(0, 0, W * C, H * C);
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      for (let x = 0; x < W; x++) for (let y = (x % 2); y < H; y += 2) ctx.fillRect(x * C, y * C, C, C);
      ctx.fillStyle = '#ffc40d';
      ctx.fillRect(g.food.x * C + 4, g.food.y * C + 4, C - 8, C - 8);
      g.snake.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? '#e9f7c8' : i % 2 ? '#99b433' : '#8aa52b';
        ctx.fillRect(p.x * C + 1, p.y * C + 1, C - 2, C - 2);
      });
      if (g.state !== 'playing' && g.state !== 'over') {
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(0, 0, W * C, H * C);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = Games.font(300, 26);
        ctx.fillText(g.state === 'paused' ? 'Paused' : 'Press an arrow key to start', (W * C) / 2, (H * C) / 2);
        ctx.font = Games.font(400, 13);
        ctx.fillText(g.state === 'paused' ? 'Press an arrow key or P to carry on' : 'Arrow keys, WASD or swipe. P pauses.', (W * C) / 2, (H * C) / 2 + 26);
      }
    }

    const stop = Games.loop(dt => {
      if (g.state === 'playing' && (document.hidden || api.bannerOpen())) g.state = 'paused';
      if (g.state === 'playing') {
        g.acc += dt;
        const stepTime = 1 / g.speed;
        while (g.acc >= stepTime && g.state === 'playing') { g.acc -= stepTime; tick(); }
      }
      draw();
    });

    const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
    api.onKey(e => {
      if (e.ctrlKey || e.metaKey || e.altKey || api.bannerOpen()) return;
      if (KEYS[e.key]) { e.preventDefault(); turn(KEYS[e.key]); }
      else if (e.key === 'p' || e.key === 'P' || e.key === ' ') {
        e.preventDefault();
        if (g.state === 'playing') g.state = 'paused';
        else if (g.state === 'paused') g.state = 'playing';
      }
    });
    let start = null;
    view.cv.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY }; });
    view.cv.addEventListener('pointerup', e => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
    view.cv.style.touchAction = 'none';

    api.tools([Games.button('New game', () => { api.clearBanner(); reset(); status(); })]);
    reset();
    status();
    return { destroy() { stop(); view.destroy(); } };
  },
});
