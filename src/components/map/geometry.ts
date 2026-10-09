// Map-space geometry for the SVG floor plans. Map space is meters with u to the right and v
// down (see toMap in lib/directions.ts); the view maps it to screen pixels as
// px = u * k + tx, py = v * k + ty.
import type { MapRoom, Rect, SchoolMapData } from '../../types';
import { toMap, type MapOrientation } from '../../lib/directions';

export interface Box {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface View {
  k: number;
  tx: number;
  ty: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** map space -> world (x, z), the inverse of toMap */
export function fromMap(o: MapOrientation | undefined, u: number, v: number): [number, number] {
  return o === 'north-up-xz' ? [-v, u] : [u, v];
}

export function rectBox(o: MapOrientation | undefined, r: Rect): Box {
  const [a, b] = toMap(o, r[0], r[1]);
  const [c, d] = toMap(o, r[2], r[3]);
  return { u0: Math.min(a, c), v0: Math.min(b, d), u1: Math.max(a, c), v1: Math.max(b, d) };
}

export function pointsBox(pts: [number, number][], pad = 0): Box | null {
  if (!pts.length) return null;
  const b = { u0: Infinity, v0: Infinity, u1: -Infinity, v1: -Infinity };
  for (const [u, v] of pts) {
    b.u0 = Math.min(b.u0, u);
    b.v0 = Math.min(b.v0, v);
    b.u1 = Math.max(b.u1, u);
    b.v1 = Math.max(b.v1, v);
  }
  return padBox(b, pad);
}

export function padBox(b: Box, pad: number): Box {
  return { u0: b.u0 - pad, v0: b.v0 - pad, u1: b.u1 + pad, v1: b.v1 + pad };
}

export function unionBox(a: Box, b: Box): Box {
  return { u0: Math.min(a.u0, b.u0), v0: Math.min(a.v0, b.v0), u1: Math.max(a.u1, b.u1), v1: Math.max(a.v1, b.v1) };
}

/** the whole school: the building plus the walk outside the front entrance */
export function schoolBox(data: Pick<SchoolMapData, 'blocks' | 'spawn' | 'entrances'>, o: MapOrientation | undefined): Box {
  let b = data.blocks.map((r) => rectBox(o, r)).reduce(unionBox);
  b = unionBox(b, pointsBox([toMap(o, data.spawn[0], data.spawn[1])])!);
  return padBox(b, 4);
}

/** the view that shows `box` inside a w x h viewport, leaving `insets` free for overlays */
export function fitView(box: Box, w: number, h: number, insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }, maxK = 12): View {
  const aw = Math.max(40, w - insets.left - insets.right), ah = Math.max(40, h - insets.top - insets.bottom);
  const bw = Math.max(1, box.u1 - box.u0), bh = Math.max(1, box.v1 - box.v0);
  const k = Math.min(aw / bw, ah / bh, maxK);
  return { k, tx: insets.left + (aw - bw * k) / 2 - box.u0 * k, ty: insets.top + (ah - bh * k) / 2 - box.v0 * k };
}

/** zoom by `factor` about the screen point (px, py) */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const k = v.k * factor;
  return { k, tx: px - (px - v.tx) * factor, ty: py - (py - v.ty) * factor };
}

/** keeps zoom within [minK, maxK] and at least `margin` px of `box` on screen */
export function clampView(v: View, box: Box, w: number, h: number, minK: number, maxK: number, margin = 60): View {
  let { k, tx, ty } = v;
  if (k < minK || k > maxK) {
    const nk = Math.min(maxK, Math.max(minK, k));
    const f = nk / k;
    tx = w / 2 - (w / 2 - tx) * f;
    ty = h / 2 - (h / 2 - ty) * f;
    k = nk;
  }
  const m = Math.min(margin, w / 2, h / 2);
  tx = Math.min(w - m - box.u0 * k, Math.max(m - box.u1 * k, tx));
  ty = Math.min(h - m - box.v0 * k, Math.max(m - box.v1 * k, ty));
  return { k, tx, ty };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** one SVG path for many rects */
export function rectsPath(o: MapOrientation | undefined, rects: Rect[]): string {
  let d = '';
  for (const r of rects) {
    const b = rectBox(o, r);
    d += `M${r2(b.u0)} ${r2(b.v0)}H${r2(b.u1)}V${r2(b.v1)}H${r2(b.u0)}Z`;
  }
  return d;
}

/** one SVG path for a floor's walls ([axis, c, p, q]: axis 'z' runs along z = c from x = p to q) */
export function wallsPath(o: MapOrientation | undefined, walls: SchoolMapData['walls'][number]): string {
  let d = '';
  for (const [axis, c, p, q] of walls) {
    const [a, b] = axis === 'z' ? toMap(o, p, c) : toMap(o, c, p);
    const [e, f] = axis === 'z' ? toMap(o, q, c) : toMap(o, c, q);
    d += `M${r2(a)} ${r2(b)}L${r2(e)} ${r2(f)}`;
  }
  return d;
}

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------

/** rough width of bold system-ui text, in ems (canvas measuring isn't available everywhere) */
export function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    if (/[0-9]/.test(ch)) w += 0.6;
    else if (/[MWmw]/.test(ch)) w += 0.9;
    else if (/[A-Z]/.test(ch)) w += 0.7;
    else if (/[iljtfrI'’.,·:!|]/.test(ch)) w += 0.34;
    else if (ch === ' ') w += 0.28;
    else w += 0.6;
  }
  return w * size;
}

export interface Label {
  key: string;
  text: string;
  u: number;
  v: number;
  /** font size in meters */
  size: number;
  vertical: boolean;
  /** smallest zoom (px per m) at which the label is readable */
  minK: number;
}

/** smallest on-screen font size (px) worth drawing */
export const MIN_LABEL_PX = 7;

/**
 * Fits `candidates` (best first) into a room, the way the 3D game's maps do: along the long side
 * of narrow rooms, shrinking down to `minSize` meters. Returns null when nothing fits.
 */
export function fitLabel(box: Box, candidates: string[], maxSize: number, minSize = 1.1): Omit<Label, 'key'> | null {
  const w = box.u1 - box.u0, h = box.v1 - box.v0;
  const vertical = h > w * 1.25 && w < 9;
  const span = vertical ? h : w, thick = vertical ? w : h;
  for (const text of candidates) {
    if (!text) continue;
    let size = Math.min(maxSize, thick * 0.62);
    const room = span * 0.92 - 0.4;
    while (size > minSize && textWidth(text, size) > room) size -= 0.1;
    if (size < minSize - 1e-9 || textWidth(text, size) > room || thick < size * 0.95) continue;
    return { text, u: (box.u0 + box.u1) / 2, v: (box.v0 + box.v1) / 2, size: r2(size), vertical, minK: MIN_LABEL_PX / size };
  }
  return null;
}

export function roomLabels(o: MapOrientation | undefined, rooms: MapRoom[], level: number): Label[] {
  const out: Label[] = [];
  for (const r of rooms) {
    if (r.level !== level || r.type === 'stair') continue;
    const box = rectBox(o, r.R);
    const cands = r.big ? [r.name, r.label] : r.label ? [r.label] : [r.name, lastWord(r.name)];
    const l = fitLabel(box, cands, r.big ? 4 : 2.1, r.big ? 1.2 : 0.9);
    if (l) out.push({ key: r.key, ...l });
  }
  return out;
}

/** 'Girls' Restroom' -> 'Restroom', for rooms too small for the whole name */
function lastWord(name: string): string {
  const words = name.split(' ');
  return words.length > 1 ? words[words.length - 1] : '';
}

/** zoom levels are bucketed so label visibility changes only at a few steps */
export function zoomBucket(k: number): number {
  return Math.floor(Math.log2(k) * 3);
}

// ---------------------------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------------------------

/** a round scale-bar length near `targetPx` pixels at zoom k */
export function scaleBar(k: number, targetPx = 90): { meters: number; px: number } {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  let meters = steps[0];
  for (const s of steps) if (s * k <= targetPx * 1.25) meters = s;
  return { meters, px: meters * k };
}

export const ROOM_TYPE_NAMES: Record<string, string> = {
  class: 'Classroom',
  lab: 'Lab',
  art: 'Art room',
  music: 'Music room',
  lecture: 'Lecture hall',
  office: 'Office',
  media: 'Library / media center',
  theatre: 'Auditorium',
  dining: 'Cafeteria',
  kitchen: 'Kitchen',
  lav: 'Restroom',
  locker: 'Locker room',
  pool: 'Pool',
  gym: 'Gym',
  weights: 'Fitness room',
  storage: 'Storage',
  stair: 'Stairs',
};

export function roomTypeName(type: string): string {
  return ROOM_TYPE_NAMES[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

/** the smallest room on a floor containing a world point */
export function roomAt(rooms: MapRoom[], level: number, x: number, z: number): MapRoom | null {
  let best: MapRoom | null = null, ba = Infinity;
  for (const r of rooms) {
    if (r.level !== level || r.type === 'stair') continue;
    if (x < r.R[0] || x > r.R[2] || z < r.R[1] || z > r.R[3]) continue;
    const a = (r.R[2] - r.R[0]) * (r.R[3] - r.R[1]);
    if (a < ba) {
      ba = a;
      best = r;
    }
  }
  return best;
}

/**
 * Small pockets the footprint's rects leave uncovered (wall cavities, shafts): enclosed empty
 * areas under `maxArea` m², as rects to draw with the footprint. Courtyards are bigger.
 */
export function footprintHoles(blocks: Rect[], maxArea = 40, cs = 0.5): Rect[] {
  if (!blocks.length) return [];
  const x0 = Math.min(...blocks.map((b) => b[0])) - cs, z0 = Math.min(...blocks.map((b) => b[1])) - cs;
  const x1 = Math.max(...blocks.map((b) => b[2])) + cs, z1 = Math.max(...blocks.map((b) => b[3])) + cs;
  const NX = Math.ceil((x1 - x0) / cs), NZ = Math.ceil((z1 - z0) / cs);
  // 0 empty, 1 building, 2 outside (reached from the border)
  const g = new Uint8Array(NX * NZ);
  for (const b of blocks) {
    const i0 = Math.max(0, Math.floor((b[0] - x0) / cs)), i1 = Math.min(NX - 1, Math.ceil((b[2] - x0) / cs) - 1);
    const k0 = Math.max(0, Math.floor((b[1] - z0) / cs)), k1 = Math.min(NZ - 1, Math.ceil((b[3] - z0) / cs) - 1);
    for (let k = k0; k <= k1; k++) g.fill(1, k * NX + i0, k * NX + i1 + 1);
  }
  const flood = (start: number, mark: number, cells?: number[]) => {
    const stack = [start];
    g[start] = mark;
    while (stack.length) {
      const c = stack.pop()!;
      cells?.push(c);
      const i = c % NX;
      for (const n of [i > 0 ? c - 1 : -1, i < NX - 1 ? c + 1 : -1, c - NX, c + NX])
        if (n >= 0 && n < g.length && g[n] === 0) {
          g[n] = mark;
          stack.push(n);
        }
    }
  };
  for (let i = 0; i < NX; i++) {
    if (!g[i]) flood(i, 2);
    if (!g[(NZ - 1) * NX + i]) flood((NZ - 1) * NX + i, 2);
  }
  for (let k = 0; k < NZ; k++) {
    if (!g[k * NX]) flood(k * NX, 2);
    if (!g[k * NX + NX - 1]) flood(k * NX + NX - 1, 2);
  }
  const out: Rect[] = [];
  for (let c = 0; c < g.length; c++) {
    if (g[c]) continue;
    const cells: number[] = [];
    flood(c, 3, cells);
    if (cells.length * cs * cs > maxArea) continue;
    // one rect per run of cells along a row
    cells.sort((a, b) => a - b);
    for (let j = 0; j < cells.length; ) {
      let e = j;
      while (e + 1 < cells.length && cells[e + 1] === cells[e] + 1 && cells[e + 1] % NX !== 0) e++;
      const i = cells[j] % NX, k = (cells[j] - i) / NX;
      out.push([x0 + i * cs, z0 + k * cs, x0 + (i + e - j + 1) * cs, z0 + (k + 1) * cs]);
      j = e + 1;
    }
  }
  return out;
}
