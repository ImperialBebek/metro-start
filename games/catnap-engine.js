'use strict';
/* Cat Nap puzzle engine. An N×N board is split into N colored cushions. A solution places N cats so that every
   row, every column and every cushion has exactly one cat, and no two cats touch (not even diagonally).
   Puzzles are generated so they have exactly one solution. */
const CatNapEngine = (() => {
  // Count solutions (stopping at `limit`). regions: Int8Array of N*N cushion ids.
  // If `found` is an array, each solution's column list is pushed onto it.
  function countSolutions(N, regions, limit = 2, found = null) {
    let count = 0;
    const cols = new Array(N);
    const colUsed = new Uint8Array(N);
    const regUsed = new Uint8Array(N);
    function rec(r, prevCol) {
      if (r === N) { count++; if (found) found.push(cols.slice()); return count >= limit; }
      for (let c = 0; c < N; c++) {
        if (colUsed[c] || (prevCol >= 0 && Math.abs(c - prevCol) <= 1)) continue;
        const g = regions[r * N + c];
        if (regUsed[g]) continue;
        colUsed[c] = 1; regUsed[g] = 1; cols[r] = c;
        if (rec(r + 1, c)) return true;
        colUsed[c] = 0; regUsed[g] = 0;
      }
      return false;
    }
    rec(0, -1);
    return count;
  }

  // A random way to place N cats, one per row and column, none touching
  function randomPlacement(N, rnd) {
    const cols = new Array(N);
    const used = new Uint8Array(N);
    function rec(r) {
      if (r === N) return true;
      const order = Games.shuffle([...Array(N).keys()], rnd);
      for (const c of order) {
        if (used[c] || (r > 0 && Math.abs(c - cols[r - 1]) <= 1)) continue;
        cols[r] = c; used[c] = 1;
        if (rec(r + 1)) return true;
        used[c] = 0;
      }
      return false;
    }
    rec(0);
    return cols;
  }

  // Grow N cushions outward from the cats, one random cell at a time
  function growRegions(N, cols, rnd) {
    const regions = new Int8Array(N * N).fill(-1);
    cols.forEach((c, r) => { regions[r * N + c] = r; });
    let left = N * N - N;
    const nbrs = i => {
      const r = Math.floor(i / N);
      const c = i % N;
      const out = [];
      if (r > 0) out.push(i - N);
      if (r < N - 1) out.push(i + N);
      if (c > 0) out.push(i - 1);
      if (c < N - 1) out.push(i + 1);
      return out;
    };
    while (left > 0) {
      const frontier = [];
      for (let i = 0; i < N * N; i++) {
        if (regions[i] !== -1) continue;
        for (const j of nbrs(i)) if (regions[j] !== -1) frontier.push([i, regions[j]]);
      }
      const [cell, g] = frontier[Math.floor(rnd() * frontier.length)];
      regions[cell] = g;
      left--;
    }
    return regions;
  }

  // Is cushion g still in one piece?
  function connected(N, regions, g) {
    const cells = [];
    for (let i = 0; i < N * N; i++) if (regions[i] === g) cells.push(i);
    if (!cells.length) return false;
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const i = stack.pop();
      const r = Math.floor(i / N);
      const c = i % N;
      for (const j of [r > 0 && i - N, r < N - 1 && i + N, c > 0 && i - 1, c < N - 1 && i + 1]) {
        if (j !== false && regions[j] === g && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    return seen.size === cells.length;
  }

  // When a board has a second solution, move one of that solution's cat cells into a neighboring cushion.
  // The intended cats never move, so the intended solution stays valid; the other one usually breaks.
  function repair(N, regions, cats, rnd, tries) {
    const isCat = new Set(cats.map((c, r) => r * N + c));
    for (let t = 0; t < tries; t++) {
      const sols = [];
      countSolutions(N, regions, 2, sols);
      if (sols.length === 1) return true;
      const other = sols.find(s => s.some((c, r) => c !== cats[r]));
      const cells = Games.shuffle(other.map((c, r) => r * N + c).filter(i => !isCat.has(i)), rnd);
      let moved = false;
      for (const i of cells) {
        const r = Math.floor(i / N);
        const c = i % N;
        const old = regions[i];
        const options = Games.shuffle([r > 0 && i - N, r < N - 1 && i + N, c > 0 && i - 1, c < N - 1 && i + 1]
          .filter(j => j !== false && regions[j] !== old).map(j => regions[j]), rnd);
        for (const g of options) {
          regions[i] = g;
          if (connected(N, regions, old)) { moved = true; break; }
          regions[i] = old;
        }
        if (moved) break;
      }
      if (!moved) return false;
    }
    return countSolutions(N, regions, 2) === 1;
  }

  // Keep trying until the puzzle has exactly one solution
  function generate(N, rnd = Math.random) {
    for (let attempt = 1; attempt <= 2000; attempt++) {
      const cols = randomPlacement(N, rnd);
      const regions = growRegions(N, cols, rnd);
      if (repair(N, regions, cols, rnd, N * 4)) return { N, regions: Array.from(regions), cats: cols, attempt };
    }
    throw new Error('Could not make a puzzle');
  }

  return { generate, countSolutions };
})();
