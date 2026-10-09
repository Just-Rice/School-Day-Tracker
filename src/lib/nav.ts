// Route finding over a school's walkable grid, ported from the 3D game's nav.js (hsn-3d /
// cms-3d): A* on 0.5 m cells over both floors, 8-connected moves without cutting corners, level-0
// moves blocked across steep height changes (raked theatre floor, stage steps), and stairwell
// portals between the floors. The grid itself comes from map.json (tools/extract-school-map.mjs).
//
// Two optional additions on top of nav.js, both off by default (createNavGrid turns them on):
// a surcharge for walking outdoors, so routes stay inside when there's a way through, and
// landmark distances (ALT), which keep A* from searching most of the school on long routes.
import type { MapRoomRaw, Rect, SchoolMapData } from '../types';

export interface NavPoint {
  level: number;
  x: number;
  z: number;
}

/** a stairwell on the route; start/end index the route's points where the stair walk begins and ends */
export interface StairUse {
  id: string;
  from: number;
  to: number;
  start: number;
  end: number;
}

export interface NavRoute {
  points: NavPoint[];
  /** walking distance in meters; a stairwell counts as two flights plus the landing */
  length: number;
  stairs: StairUse[];
}

export type NavSource = Pick<SchoolMapData, 'grid' | 'levelH' | 'blocked' | 'heights' | 'stairs'> & Partial<Pick<SchoolMapData, 'blocks'>>;

export interface NavOptions {
  /**
   * Cost multiplier for steps outside the building's footprint (needs data.blocks). 1 is the 3D
   * game's behavior; more keeps routes indoors when there's a way through.
   */
  outdoorCost?: number;
  /** level-0 cells farther than this many meters outside the footprint are left out (needs data.blocks) */
  outdoorMargin?: number;
  /** points to precompute distances from, for a tighter A* heuristic */
  landmarks?: NavPoint[];
  /**
   * Straighten the route where a straight line is walkable (any-angle paths), instead of the
   * grid's 45-degree staircase. Off in nav.js; the length reported is A*'s either way.
   */
  smooth?: boolean;
}

export const inRect = (r: Rect, x: number, z: number, m = 0) => x >= r[0] - m && x <= r[2] + m && z >= r[1] - m && z <= r[3] + m;

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface DecodedGrid {
  /** one byte per cell per level, 1 = blocked */
  blocked: Uint8Array[];
  /** level-0 ground height per cell, in meters */
  heights: Float32Array;
}

/** Unpacks map.json's base64 grids: bit i of byte i >> 3 = cell i blocked; heights are Int8 decimeters. */
export function decodeGrid(data: Pick<SchoolMapData, 'grid' | 'blocked' | 'heights'>): DecodedGrid {
  const N = data.grid.NX * data.grid.NZ;
  const blocked = data.blocked.map((b64) => {
    const bytes = fromBase64(b64);
    const out = new Uint8Array(N);
    for (let i = 0; i < N; i++) out[i] = (bytes[i >> 3] >> (i & 7)) & 1;
    return out;
  });
  const hb = fromBase64(data.heights);
  const heights = new Float32Array(N);
  for (let i = 0; i < N; i++) heights[i] = ((hb[i] << 24) >> 24) / 10;
  return { blocked, heights };
}

interface Portal {
  to: number;
  cost: number;
}

interface Link {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cost: number;
}

interface RawPoint extends NavPoint {
  h: number;
}

// neighbor offsets (di, dk) and step weights, as in nav.js
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DK = [0, 0, 1, -1, 1, -1, 1, -1];
const W = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];

/** walkways at least this high are on the upper floor (nav.js's stair 'via' rule) */
const UPPER_H = 3;
/** breaks f-ties toward the goal; paths stay within 0.1% of the shortest */
const TIE = 1.001;

export class NavGrid {
  readonly X0: number;
  readonly Z0: number;
  readonly CS: number;
  readonly NX: number;
  readonly NZ: number;
  /** cells per level */
  readonly N: number;
  readonly levels: number;
  /** all levels back to back: node = level * N + cell */
  readonly blocked: Uint8Array;
  /** level-0 ground height per cell (m) */
  readonly h: Float32Array;
  readonly levelH: number;
  readonly stairs: NavSource['stairs'];
  /** portal node per stair on level 0 and level 1 (-1 when it could not be placed) */
  readonly stairNodes: [number, number][];
  maxIterations = 300000;
  readonly smooth: boolean;
  readonly outdoorCost: number;
  /** level-0 cells outside the building's footprint (only when outdoorCost != 1) */
  readonly outdoor: Uint8Array | null = null;

  private portals = new Map<number, Portal[]>();
  private links: Link[] = [];
  /** shortest distances from each landmark to every node (Infinity: unreachable) */
  private landmarks: Float32Array[] = [];
  private G: Float64Array;
  private came: Int32Array;
  private seen: Uint32Array;
  private done: Uint32Array;
  private gen = 0;
  private heap = new MinHeap();

  constructor(data: NavSource, opts: NavOptions = {}) {
    const { X0, Z0, CS, NX, NZ } = data.grid;
    this.X0 = X0;
    this.Z0 = Z0;
    this.CS = CS;
    this.NX = NX;
    this.NZ = NZ;
    this.N = NX * NZ;
    const dec = decodeGrid(data);
    this.levels = dec.blocked.length;
    this.blocked = new Uint8Array(this.levels * this.N);
    dec.blocked.forEach((b, lv) => this.blocked.set(b, lv * this.N));
    this.h = dec.heights;
    this.levelH = data.levelH;
    this.stairs = data.stairs;
    this.smooth = !!opts.smooth;
    this.outdoorCost = data.blocks ? (opts.outdoorCost ?? 1) : 1;
    if (data.blocks && this.outdoorCost !== 1) this.outdoor = this.outsideMask(data.blocks, 0.3);
    if (data.blocks && opts.outdoorMargin !== undefined) {
      // the open ground around the school is never on a sensible walk, but A* would search it all
      const far = this.outsideMask(data.blocks, opts.outdoorMargin);
      for (let c = 0; c < this.N; c++) if (far[c]) this.blocked[c] = 1;
    }
    const M = this.levels * this.N;
    this.G = new Float64Array(M);
    this.came = new Int32Array(M);
    this.seen = new Uint32Array(M);
    this.done = new Uint32Array(M);

    // stair portals: the exported a / b are the centers of the cells nav.js linked
    this.stairNodes = data.stairs.map((s) => {
      const a = this.nearestFree(0, s.a[0], s.a[1], 4);
      const b = this.nearestFree(1, s.b[0], s.b[1], 4);
      if (a < 0 || b < 0) return [-1, -1];
      const A = a, B = this.N + b;
      this.addPortal(A, { to: B, cost: s.cost });
      this.addPortal(B, { to: A, cost: s.cost });
      const [ax, az] = this.center(a), [bx, bz] = this.center(b);
      this.links.push({ ax, az, bx, bz, cost: s.cost });
      return [A, B];
    });

    for (const p of opts.landmarks ?? []) {
      const c = this.nearestFree(p.level, p.x, p.z, 6);
      if (c < 0) continue;
      this.search(p.level * this.N + c, -1);
      const dist = new Float32Array(M).fill(Infinity);
      for (let n = 0; n < M; n++) if (this.seen[n] === this.gen) dist[n] = this.G[n];
      this.landmarks.push(dist);
    }
  }

  private addPortal(node: number, p: Portal) {
    const list = this.portals.get(node);
    if (list) list.push(p);
    else this.portals.set(node, [p]);
  }

  private portalCost(a: number, b: number): number {
    return this.portals.get(a)?.find((p) => p.to === b)?.cost ?? 0;
  }

  /** 1 for cells whose centers are more than `pad` outside every rect */
  private outsideMask(rects: Rect[], pad: number): Uint8Array {
    const out = new Uint8Array(this.N).fill(1);
    const { X0, Z0, CS, NX, NZ } = this;
    for (const r of rects) {
      const i0 = Math.max(0, Math.ceil((r[0] - pad - X0) / CS - 0.5)), i1 = Math.min(NX - 1, Math.floor((r[2] + pad - X0) / CS - 0.5));
      const k0 = Math.max(0, Math.ceil((r[1] - pad - Z0) / CS - 0.5)), k1 = Math.min(NZ - 1, Math.floor((r[3] + pad - Z0) / CS - 0.5));
      for (let k = k0; k <= k1; k++) if (i1 >= i0) out.fill(0, k * NX + i0, k * NX + i1 + 1);
    }
    return out;
  }

  /** cell index of a world point, or -1 outside the grid */
  idx(x: number, z: number): number {
    const i = Math.floor((x - this.X0) / this.CS), k = Math.floor((z - this.Z0) / this.CS);
    if (i < 0 || k < 0 || i >= this.NX || k >= this.NZ) return -1;
    return k * this.NX + i;
  }

  center(cell: number): [number, number] {
    const i = cell % this.NX, k = (cell - i) / this.NX;
    return [this.X0 + (i + 0.5) * this.CS, this.Z0 + (k + 0.5) * this.CS];
  }

  isFree(level: number, x: number, z: number): boolean {
    const c = this.idx(x, z);
    return c >= 0 && level >= 0 && level < this.levels && !this.blocked[level * this.N + c];
  }

  /** nearest walkable cell to (x, z) within maxR meters (ring by ring), optionally inside a rect */
  nearestFree(level: number, x: number, z: number, maxR = 12, within?: Rect): number {
    const c = this.idx(x, z);
    if (c < 0 || level < 0 || level >= this.levels) return -1;
    const bl = this.blocked, off = level * this.N, NX = this.NX, NZ = this.NZ;
    if (!bl[off + c]) return c;
    const ci = c % NX, ck = (c - ci) / NX;
    for (let r = 1; r <= maxR / this.CS; r++) {
      let best = -1, bd = Infinity;
      for (let dk = -r; dk <= r; dk++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue;
          const i = ci + di, k = ck + dk;
          if (i < 0 || k < 0 || i >= NX || k >= NZ) continue;
          const id = k * NX + i;
          if (bl[off + id]) continue;
          if (within) {
            const [px, pz] = this.center(id);
            if (!inRect(within, px, pz, -0.2)) continue;
          }
          const d = di * di + dk * dk;
          if (d < bd) {
            bd = d;
            best = id;
          }
        }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** octile distance to the goal; a node on another floor must go through some stairwell first */
  private stairsHeuristic(node: number, goalLevel: number, gx: number, gz: number): number {
    const lv = (node / this.N) | 0;
    const [x, z] = this.center(node - lv * this.N);
    if (lv === goalLevel) return oct(x, z, gx, gz);
    let best = Infinity;
    for (const l of this.links) {
      const v = lv === 0 ? oct(x, z, l.ax, l.az) + l.cost + oct(l.bx, l.bz, gx, gz) : oct(x, z, l.bx, l.bz) + l.cost + oct(l.ax, l.az, gx, gz);
      if (v < best) best = v;
    }
    return best;
  }

  /**
   * A* from start to goal (with goal -1: Dijkstra over everything reachable). Leaves G / came
   * filled in for this.gen; returns whether the goal was reached.
   */
  private search(start: number, goal: number): boolean {
    const N = this.N, NX = this.NX, NZ = this.NZ, CS = this.CS;
    const { G, came, seen, done, blocked: bl, h, portals, heap } = this;
    if (++this.gen === 0xffffffff) {
      seen.fill(0);
      done.fill(0);
      this.gen = 1;
    }
    const gen = this.gen;
    const aim = goal >= 0;
    const goalLevel = aim ? (goal / N) | 0 : 0;
    const [gx, gz] = aim ? this.center(goal - goalLevel * N) : [0, 0];
    const cx0 = this.X0 + CS / 2, cz0 = this.Z0 + CS / 2;
    const outdoor = this.outdoorCost !== 1 ? this.outdoor : null;
    const extra = this.outdoorCost - 1;
    const lms = aim ? this.landmarks : [];
    const lg = lms.map((L) => L[goal]);

    // lower bound on the distance left; Infinity when the node can't reach the goal at all
    const estimate = (node: number, cell: number, sameLevel: boolean): number => {
      let est: number;
      if (sameLevel) {
        const i = cell % NX, k = (cell - i) / NX;
        const dx = Math.abs(cx0 + i * CS - gx), dz = Math.abs(cz0 + k * CS - gz);
        est = dx > dz ? dx + 0.414 * dz : dz + 0.414 * dx;
      } else est = this.stairsHeuristic(node, goalLevel, gx, gz);
      for (let j = 0; j < lms.length; j++) {
        const ln = lms[j][node], gl = lg[j];
        if (ln === Infinity || gl === Infinity) {
          if (ln !== gl) return Infinity; // in a part of the school the goal isn't connected to
          continue;
        }
        const d = ln > gl ? ln - gl : gl - ln;
        if (d > est) est = d;
      }
      return est;
    };

    heap.clear();
    G[start] = 0;
    seen[start] = gen;
    came[start] = -1;
    heap.push(start, 0);
    let iter = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) return true;
      if (done[cur] === gen) continue;
      done[cur] = gen;
      if (aim && ++iter > this.maxIterations) return false;
      const lv = (cur / N) | 0;
      const off = lv * N;
      const id = cur - off;
      const i = id % NX, k = (id - i) / NX;
      const gc = G[cur];
      const sameLevel = lv === goalLevel;
      for (let d = 0; d < 8; d++) {
        const di = DI[d], dk = DK[d];
        const ni = i + di, nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= NX || nk >= NZ) continue;
        const nid = nk * NX + ni;
        if (bl[off + nid]) continue;
        if (di && dk && (bl[off + k * NX + ni] || bl[off + nk * NX + i])) continue;
        if (lv === 0 && Math.abs(h[nid] - h[id]) > 0.75) continue;
        let ng = gc + W[d] * CS;
        if (outdoor && lv === 0 && (outdoor[nid] || outdoor[id])) ng += W[d] * CS * extra;
        const node = off + nid;
        if (seen[node] !== gen || ng < G[node]) {
          const est = aim ? estimate(node, nid, sameLevel) : 0;
          if (est === Infinity) continue;
          seen[node] = gen;
          G[node] = ng;
          came[node] = cur;
          heap.push(node, ng + est * TIE);
        }
      }
      const ps = portals.get(cur);
      if (ps)
        for (const p of ps) {
          const ng = gc + p.cost;
          if (seen[p.to] !== gen || ng < G[p.to]) {
            const plv = (p.to / N) | 0;
            const est = aim ? estimate(p.to, p.to - plv * N, plv === goalLevel) : 0;
            if (est === Infinity) continue;
            seen[p.to] = gen;
            G[p.to] = ng;
            came[p.to] = cur;
            heap.push(p.to, ng + est * TIE);
          }
        }
    }
    return false;
  }

  /**
   * Shortest walk from `from` to `to`. The start snaps to a free cell within 6 m and the goal to
   * one within 14 m (inside targetRect when given). Returns null when there's no way through.
   */
  find(from: NavPoint, to: NavPoint, targetRect?: Rect): NavRoute | null {
    const N = this.N, NX = this.NX, CS = this.CS;
    const s = this.nearestFree(from.level, from.x, from.z, 6);
    const g = this.nearestFree(to.level, to.x, to.z, 14, targetRect);
    if (s < 0 || g < 0) return null;
    const start = from.level * N + s, goal = to.level * N + g;
    if (!this.search(start, goal)) return null;

    const nodes: number[] = [];
    for (let n = goal; n >= 0; n = this.came[n]) {
      nodes.push(n);
      if (n === start) break;
    }
    nodes.reverse();
    // walking distance (G also holds any outdoor surcharge)
    let length = 0;
    for (let j = 1; j < nodes.length; j++) {
      const a = nodes[j - 1], b = nodes[j];
      if (((a / N) | 0) !== ((b / N) | 0)) length += this.portalCost(a, b);
      else length += (a % NX === b % NX || Math.abs(a - b) === 1 ? 1 : 1.414) * CS;
    }

    // walk the stairwell's switchback instead of jumping between the landings
    const pts: RawPoint[] = [];
    const keep = new Set<number>();
    const used: StairUse[] = [];
    for (let j = 0; j < nodes.length; j++) {
      const n = nodes[j];
      const lv = (n / N) | 0;
      const [x, z] = this.center(n - lv * N);
      pts.push({ level: lv, x, z, h: lv ? this.levelH : this.h[n - lv * N] });
      const next = nodes[j + 1];
      if (next === undefined || ((next / N) | 0) === lv) continue;
      const si = this.stairNodes.findIndex(([a, b]) => (a === n && b === next) || (b === n && a === next));
      if (si < 0) continue;
      const st = this.stairs[si];
      const startAt = pts.length - 1;
      const via = lv === 0 ? st.via : [...st.via].reverse();
      for (const [vx, vz, vh] of via) pts.push({ level: vh < UPPER_H ? 0 : 1, x: vx, z: vz, h: vh });
      keep.add(startAt).add(pts.length);
      used.push({ id: st.id, from: lv, to: (next / N) | 0, start: startAt, end: pts.length });
    }
    const { points, index } = simplify(pts, keep, this.smooth ? this.pull(pts, used) : null);
    return { points, length, stairs: used.map((u) => ({ ...u, start: index[u.start], end: index[u.end] })) };
  }

  /** marks the points a straight walk can skip (string pulling); stairwell walks stay as they are */
  private pull(pts: RawPoint[], stairs: StairUse[]): Uint8Array {
    const fixed = new Uint8Array(pts.length);
    for (const u of stairs) fixed.fill(1, u.start, u.end + 1);
    const drop = new Uint8Array(pts.length);
    let anchor = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[anchor], c = pts[i + 1];
      if (!fixed[i] && a.level === c.level && this.lineOfSight(a.level, a.x, a.z, c.x, c.z)) drop[i] = 1;
      else anchor = i;
    }
    return drop;
  }

  /**
   * Whether the straight line between two points on a floor crosses only walkable cells (every
   * cell it touches, both sides at exact corners) with no step over 0.75 m on the ground floor.
   */
  lineOfSight(level: number, ax: number, az: number, bx: number, bz: number): boolean {
    const { X0, Z0, CS, NX, NZ, h } = this;
    const bl = this.blocked, off = level * this.N;
    let i = Math.floor((ax - X0) / CS), k = Math.floor((az - Z0) / CS);
    const i1 = Math.floor((bx - X0) / CS), k1 = Math.floor((bz - Z0) / CS);
    if (i < 0 || k < 0 || i >= NX || k >= NZ || i1 < 0 || k1 < 0 || i1 >= NX || k1 >= NZ) return false;
    const dx = bx - ax, dz = bz - az;
    const si = Math.sign(dx), sk = Math.sign(dz);
    const tdx = si ? CS / Math.abs(dx) : Infinity, tdz = sk ? CS / Math.abs(dz) : Infinity;
    let tmx = si ? (X0 + (i + (si > 0 ? 1 : 0)) * CS - ax) / dx : Infinity;
    let tmz = sk ? (Z0 + (k + (sk > 0 ? 1 : 0)) * CS - az) / dz : Infinity;
    let prev = k * NX + i;
    if (bl[off + prev]) return false;
    const ok = (c: number, p: number) => !bl[off + c] && (level !== 0 || Math.abs(h[c] - h[p]) <= 0.75);
    for (let n = Math.abs(i1 - i) + Math.abs(k1 - k); n > 0 && (i !== i1 || k !== k1); n--) {
      if (Math.abs(tmx - tmz) < 1e-9) {
        if (!ok(k * NX + i + si, prev) || !ok((k + sk) * NX + i, prev)) return false;
        i += si;
        k += sk;
        tmx += tdx;
        tmz += tdz;
        n--;
      } else if (tmx < tmz) {
        i += si;
        tmx += tdx;
      } else {
        k += sk;
        tmz += tdz;
      }
      if (i < 0 || k < 0 || i >= NX || k >= NZ) return false;
      const c = k * NX + i;
      if (!ok(c, prev)) return false;
      prev = c;
    }
    return i === i1 && k === k1;
  }
}

function oct(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
  return dx > dz ? dx + 0.414 * dz : dz + 0.414 * dx;
}

/**
 * Drops points in the middle of straight runs (and any marked in `drop`); `index` maps old point
 * indices to new ones.
 */
function simplify(pts: RawPoint[], keep: Set<number>, drop: Uint8Array | null): { points: NavPoint[]; index: Int32Array } {
  const index = new Int32Array(pts.length).fill(-1);
  const live: number[] = [];
  for (let i = 0; i < pts.length; i++) if (!drop?.[i] || i === 0 || i === pts.length - 1) live.push(i);
  const out: RawPoint[] = [];
  const add = (i: number) => {
    index[i] = out.length;
    out.push(pts[i]);
  };
  if (live.length) add(live[0]);
  for (let j = 1; j < live.length - 1; j++) {
    const i = live[j];
    const a = out[out.length - 1], b = pts[i], c = pts[live[j + 1]];
    if (keep.has(i) || a.level !== b.level || b.level !== c.level) {
      add(i);
      continue;
    }
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) > 1e-6 || Math.abs(b.h - a.h) > 0.05) add(i);
  }
  if (live.length > 1) add(live[live.length - 1]);
  return { points: out.map(({ level, x, z }) => ({ level, x, z })), index };
}

/** binary min-heap of (node, priority) on typed arrays, reused between searches */
class MinHeap {
  private k = new Int32Array(1 << 14);
  private v = new Float64Array(1 << 14);
  size = 0;

  clear() {
    this.size = 0;
  }

  push(key: number, val: number) {
    if (this.size === this.k.length) {
      const k = new Int32Array(this.size * 2), v = new Float64Array(this.size * 2);
      k.set(this.k);
      v.set(this.v);
      this.k = k;
      this.v = v;
    }
    const K = this.k, V = this.v;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (V[p] <= val) break;
      K[i] = K[p];
      V[i] = V[p];
      i = p;
    }
    K[i] = key;
    V[i] = val;
  }

  pop(): number {
    const K = this.k, V = this.v;
    const top = K[0];
    const n = --this.size;
    if (n > 0) {
      const lk = K[n], lv = V[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = -1, mv = lv;
        if (l < n && V[l] < mv) {
          m = l;
          mv = V[l];
        }
        if (r < n && V[r] < mv) m = r;
        if (m < 0) break;
        K[i] = K[m];
        V[i] = V[m];
        i = m;
      }
      K[i] = lk;
      V[i] = lv;
    }
    return top;
  }
}

// ---------------------------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------------------------

type RoomLike = Pick<MapRoomRaw, 'level' | 'R' | 'target'>;

/** the grid the app routes on: indoor routes preferred, the front entrance as a landmark, straightened paths */
export function createNavGrid(data: NavSource & Pick<SchoolMapData, 'spawn'>): NavGrid {
  return new NavGrid(data, { outdoorCost: 2, outdoorMargin: 10, landmarks: [spawnPoint(data)], smooth: true });
}

/** where routes to a room end: the walkable point just inside its door (or its middle) */
export function roomTarget(room: RoomLike): NavPoint {
  const [x, z] = room.target ?? [(room.R[0] + room.R[2]) / 2, (room.R[1] + room.R[3]) / 2];
  return { level: room.level, x, z };
}

/** outside the main entrance, where "from the front entrance" routes start */
export function spawnPoint(data: Pick<SchoolMapData, 'spawn'>): NavPoint {
  return { level: 0, x: data.spawn[0], z: data.spawn[1] };
}

/**
 * A walkable point just inside an entrance (entrances are given on the wall plane): the side
 * that's in the building's footprint and not in a courtyard. The main entrance starts outside.
 */
export function entrancePoint(grid: NavGrid, data: Pick<SchoolMapData, 'entrances' | 'blocks' | 'courtyards' | 'spawn'>, index: number): NavPoint | null {
  const e = data.entrances[index];
  if (!e) return null;
  if (e.main) return spawnPoint(data);
  const indoors = (x: number, z: number) => data.blocks.some((b) => inRect(b, x, z)) && !data.courtyards.some((c) => inRect(c, x, z));
  for (const d of [1.25, 2, 3]) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = e.x + dx * d, z = e.z + dz * d;
      if (indoors(x, z) && grid.isFree(0, x, z)) return { level: 0, x, z };
    }
  }
  return { level: 0, x: e.x, z: e.z };
}

export function routeFromEntrance(grid: NavGrid, data: Pick<SchoolMapData, 'spawn'>, room: RoomLike): NavRoute | null {
  return grid.find(spawnPoint(data), roomTarget(room), room.R);
}

export function routeBetween(grid: NavGrid, a: RoomLike, b: RoomLike): NavRoute | null {
  return grid.find(roomTarget(a), roomTarget(b), b.R);
}

/** where a route starts: a point (a room's door) or one of data.entrances */
export type RouteStart = { point: NavPoint } | { entrance: number };

export interface RouteQuery {
  from: RouteStart;
  to: NavPoint;
  /** the destination room's rect; the goal snaps to a cell inside it */
  toRect?: Rect;
}

/** answers a RouteQuery; shared by the routing worker and the main-thread fallback */
export function solveRoute(grid: NavGrid, data: Pick<SchoolMapData, 'entrances' | 'blocks' | 'courtyards' | 'spawn'>, q: RouteQuery): NavRoute | null {
  const start = 'entrance' in q.from ? entrancePoint(grid, data, q.from.entrance) : q.from.point;
  return start ? grid.find(start, q.to, q.toRect) : null;
}
