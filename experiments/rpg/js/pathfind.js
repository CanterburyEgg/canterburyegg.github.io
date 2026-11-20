// A* on the planet grid (8-directional, no corner cutting) + line-of-sight smoothing.
// Pure JS; operates on P.passable / P.reach.

import { cellToWorld } from './worldgen.js';

const SQ2 = Math.SQRT2;
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2],
];

class MinHeap {
  constructor() { this.ids = []; this.keys = []; }
  get size() { return this.ids.length; }
  push(id, key) {
    const ids = this.ids, keys = this.keys;
    let i = ids.length;
    ids.push(id); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p];
      i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop() {
    const ids = this.ids, keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop(), lastKey = keys.pop();
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      while (true) {
        const l = i * 2 + 1, r = l + 1;
        let m = i, mk = lastKey;
        if (l < n && keys[l] < mk) { m = l; mk = keys[l]; }
        if (r < n && keys[r] < mk) { m = r; mk = keys[r]; }
        if (m === i) break;
        ids[i] = ids[m]; keys[i] = keys[m];
        i = m;
      }
      ids[i] = lastId; keys[i] = lastKey;
    }
    return top;
  }
}

export function isOpen(P, gx, gy) {
  return gx >= 0 && gy >= 0 && gx < P.W && gy < P.H && P.passable[gy * P.W + gx] === 1;
}

// Returns world-space waypoints (excluding the start), or null if unreachable.
export function findPath(P, sx, sy, tx, ty) {
  const { W, H, passable } = P;
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
  const N = W * H;
  const start = sy * W + sx, goal = ty * W + tx;
  if (!passable[goal]) return null;
  if (start === goal) return [];

  if (!P._astar || P._astar.N !== N) {
    P._astar = { N, g: new Float32Array(N), parent: new Int32Array(N), stamp: new Uint32Array(N), closedStamp: new Uint32Array(N), gen: 0 };
  }
  const A = P._astar;
  A.gen++;
  const gen = A.gen;
  const g = A.g, parent = A.parent, stamp = A.stamp, closedStamp = A.closedStamp;
  const seen = (i) => stamp[i] === gen;
  const heap = new MinHeap();
  const hfn = (x, y) => {
    const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
  };
  g[start] = 0; parent[start] = -1; stamp[start] = gen;
  heap.push(start, hfn(sx, sy));
  let found = false;

  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) { found = true; break; }
    if (closedStamp[cur] === gen) continue;
    closedStamp[cur] = gen;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (!passable[ni] || closedStamp[ni] === gen) continue;
      if (dx && dy && (!passable[cy * W + nx] || !passable[ny * W + cx])) continue;
      const ng = g[cur] + cost;
      if (!seen(ni) || ng < g[ni]) {
        stamp[ni] = gen;
        g[ni] = ng;
        parent[ni] = cur;
        heap.push(ni, ng + hfn(nx, ny));
      }
    }
  }
  if (!found) return null;

  const cells = [];
  for (let c = goal; c !== -1; c = parent[c]) {
    cells.push(c);
    if (c === start) break;
  }
  cells.reverse();
  const smooth = smoothPath(P, cells);
  return smooth.slice(1).map((c) => cellToWorld(P, c % W, (c / W) | 0));
}

function lineOfSight(P, a, b) {
  const W = P.W;
  const ax = (a % W) + 0.5, ay = ((a / W) | 0) + 0.5;
  const bx = (b % W) + 0.5, by = ((b / W) | 0) + 0.5;
  const dx = bx - ax, dy = by - ay;
  const steps = Math.ceil(Math.hypot(dx, dy) / 0.25);
  const r = 0.3; // body clearance
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = ax + dx * t, y = ay + dy * t;
    if (!isOpen(P, Math.floor(x - r), Math.floor(y - r))) return false;
    if (!isOpen(P, Math.floor(x + r), Math.floor(y - r))) return false;
    if (!isOpen(P, Math.floor(x - r), Math.floor(y + r))) return false;
    if (!isOpen(P, Math.floor(x + r), Math.floor(y + r))) return false;
  }
  return true;
}

function smoothPath(P, cells) {
  if (cells.length <= 2) return cells;
  const out = [cells[0]];
  let anchor = 0;
  for (let i = 2; i < cells.length; i++) {
    if (!lineOfSight(P, cells[anchor], cells[i])) {
      out.push(cells[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(cells[cells.length - 1]);
  return out;
}

// Closest passable + reachable cell to (gx, gy), searching outward in rings.
export function nearestReachable(P, gx, gy, maxR = 24) {
  const { W, H } = P;
  let best = null, bestD = Infinity;
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = gx + dx, y = gy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (!P.passable[i] || !P.reach[i]) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { gx: x, gy: y }; }
      }
    }
    if (best) return best;
  }
  return null;
}
