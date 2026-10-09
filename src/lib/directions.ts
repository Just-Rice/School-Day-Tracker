// Turns a route from nav.ts into written walking directions: "Walk 40 m (130 ft) down the Main
// Hall", "Turn left into the 700s Hallway", "Take the Blue stairs up to the 2nd floor", "Room 214
// is on your left". The polyline is cleaned up first (grid paths zigzag, cut corners and jog
// around columns), then every remaining corner becomes a step, named after the hallway zone it
// turns into or the room it turns at.
import type { MapRoom, Rect, SchoolMapData } from '../types';
import type { NavRoute } from './nav';

export type MapOrientation = 'north-up-xz' | 'plan';

/** world (x, z) meters -> 2-D map (u right, v down) meters, per SchoolMeta.mapOrientation */
export function toMap(o: MapOrientation | undefined, x: number, z: number): [number, number] {
  return o === 'north-up-xz' ? [z, -x] : [x, z];
}

export type StepKind = 'start' | 'walk' | 'turn' | 'stairs' | 'arrive';

export interface DirectionStep {
  text: string;
  level: number;
  /** meters walked in this step */
  distance?: number;
  kind: StepKind;
  /** world point where the step happens: a corner, the stairs, the door */
  at: { x: number; z: number };
}

export interface Directions {
  steps: DirectionStep[];
  totalMeters: number;
  /** walking time at about 1.3 m/s, at least 1 */
  minutes: number;
}

type NamedRoom = Pick<MapRoom, 'title' | 'name' | 'label' | 'R' | 'level' | 'key' | 'big'>;
type LandmarkRoom = NamedRoom & Pick<MapRoom, 'type'>;

export interface DirectionsOptions {
  /** where the walk starts, as shown to the user: 'Front entrance', 'Room 214' */
  fromLabel: string;
  /** the room the walk starts in, if it starts in one */
  fromRoom?: NamedRoom | null;
  toRoom: NamedRoom;
  /** SchoolMeta.floorNames */
  floorNames?: string[];
  /** SchoolMeta.mapOrientation, so left and right match the map the student sees */
  orientation?: MapOrientation;
}

export const WALK_SPEED = 1.3;

const M_TO_FT = 3.28084;

/** '40 m (130 ft)': 10 m steps, 5 m steps under 15 m */
export function formatDistance(m: number): string {
  const r = m < 15 ? Math.max(5, Math.round(m / 5) * 5) : Math.round(m / 10) * 10;
  const ft = r * M_TO_FT;
  return `${r} m (${ft < 50 ? Math.round(ft / 5) * 5 : Math.round(ft / 10) * 10} ft)`;
}

export function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / WALK_SPEED / 60));
}

/** 'the Media Center', 'the 700s Hallway', but 'Room 214', 'A103', 'Lecture Hall 300' */
export function withThe(name: string): string {
  if (/^the\b/i.test(name) || /^room\b/i.test(name) || /^[A-Z]?\d+[A-Z]?(\s·|$)/.test(name) || /\s[A-Z]?\d+[A-Z]?$/.test(name)) return name;
  return 'the ' + name;
}

/** how a room is said in a sentence: 'Room 214', 'Lecture Hall 300' (not '300 · Lecture Hall 300') */
export function spokenName(r: Pick<MapRoom, 'title' | 'name' | 'label'>): string {
  if (r.label && r.name && r.name.includes(r.label)) return r.name;
  return r.title;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

interface Pt {
  x: number;
  z: number;
}

interface Seg {
  a: Pt;
  b: Pt;
  len: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.z - a.z);
const seg = (a: Pt, b: Pt): Seg => ({ a, b, len: dist(a, b) });
const lerp = (s: Seg, t: number): Pt => ({ x: s.a.x + (s.b.x - s.a.x) * t, z: s.a.z + (s.b.z - s.a.z) * t });

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

function distToRect(r: Rect, p: Pt): number {
  return Math.hypot(Math.max(r[0] - p.x, 0, p.x - r[2]), Math.max(r[1] - p.z, 0, p.z - r[3]));
}

/** Ramer-Douglas-Peucker: drops points closer than tol to the line through their neighbors */
function rdp(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) {
      const d = distToSegment(pts[k], pts[i], pts[j]);
      if (d > bd) {
        bd = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i, best], [best, j]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** signed heading change from segment s to t in degrees, as seen on the map; positive = right */
export function turnAngle(o: MapOrientation | undefined, s: Pick<Seg, 'a' | 'b'>, t: Pick<Seg, 'a' | 'b'>): number {
  const [u1, v1] = toMap(o, s.b.x - s.a.x, s.b.z - s.a.z);
  const [u2, v2] = toMap(o, t.b.x - t.a.x, t.b.z - t.a.z);
  // the map's v axis points down, so a clockwise (right) turn has a positive cross product
  return (Math.atan2(u1 * v2 - v1 * u2, u1 * u2 + v1 * v2) * 180) / Math.PI;
}

/** the last few meters into a doorway or stairwell aren't a step of their own */
const TAIL = 5;
/** the first few meters out of a doorway are folded into the first step */
const HEAD = 6;
const STRAIGHT = 22;
/** a corner moving you sideways less than this (m) is a jog, not a turn */
const JOG = 3;

/**
 * The straight runs of a walk on one floor, without the grid's zigzags, jogs and corner-cutting
 * diagonals. The first / last corner can be kept as is: they're the turn out of a doorway and
 * the approach that says which side the door is on.
 */
export function cleanSegments(pts: Pt[], o: MapOrientation | undefined, keepFirst: boolean, keepLast: boolean): Seg[] {
  const p = rdp(pts, 1.1);
  const lateral = (i: number) => {
    const a = Math.abs(turnAngle(o, seg(p[i - 1], p[i]), seg(p[i], p[i + 1])));
    const short = Math.min(dist(p[i - 1], p[i]), dist(p[i], p[i + 1]));
    return a < STRAIGHT ? 0 : short * (a > 90 ? 1 : Math.sin((a * Math.PI) / 180));
  };
  // a door's corner is only worth keeping when the bit through the door is short
  const fixed = (i: number) => (keepFirst && i === 1 && dist(p[0], p[1]) < HEAD) || (keepLast && i === p.length - 2 && dist(p[i], p[i + 1]) < TAIL);
  for (let changed = true; changed && p.length > 2; ) {
    changed = false;
    // fold the shortest inner segment under 3 m (a cut corner or a jog) into one corner
    let si = -1, sl = 3;
    for (let i = 1; i < p.length - 2; i++) {
      const l = dist(p[i], p[i + 1]);
      if (l < sl && !fixed(i) && !fixed(i + 1)) {
        sl = l;
        si = i;
      }
    }
    if (si >= 0) {
      p.splice(si, 2, { x: (p[si].x + p[si + 1].x) / 2, z: (p[si].z + p[si + 1].z) / 2 });
      changed = true;
      continue;
    }
    // drop the least significant corner that's nearly straight or only a small jog
    let wi = -1, wl = JOG;
    for (let i = 1; i < p.length - 1; i++) {
      if (fixed(i)) continue;
      const l = lateral(i);
      if (l < wl) {
        wl = l;
        wi = i;
      }
    }
    if (wi >= 0) {
      p.splice(wi, 1);
      changed = true;
    }
  }
  const out: Seg[] = [];
  for (let i = 1; i < p.length; i++) if (dist(p[i - 1], p[i]) > 1e-6) out.push(seg(p[i - 1], p[i]));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------------------------

type Zone = SchoolMapData['zones'][number];
const area = (r: Rect) => (r[2] - r[0]) * (r[3] - r[1]);

/** big or one-of-a-kind rooms, worth naming as you walk past */
const DISTINCT = new Set(['media', 'theatre', 'dining', 'gym', 'pool', 'music', 'lecture', 'weights', 'art', 'locker']);
/** rooms worth naming at a corner */
const CORNER = new Set([...DISTINCT, 'class', 'lab', 'office', 'kitchen']);
/** names that don't tell one room from the next */
const GENERIC = /^(office|offices|storage|closet|custodian|mechanical|mech room|elevator|restrooms?|kitchen storage|prep room)$/i;
const nameable = (r: LandmarkRoom) => !!r.label || !GENERIC.test(r.name);

interface Run {
  name: string | null;
  from: number;
  to: number;
}

/** zone parts shorter than this don't get their own "Continue into ..." step */
const MIN_RUN = 8;

/** pseudo-zones for walks out of the building (routes do go outside where the model has no indoor way) */
const OUTSIDE = 'outside';
const COURTYARD = 'courtyard';
const isOut = (z: string | null) => z === OUTSIDE || z === COURTYARD;
const BUCKET = 8;

type LandmarkData = Pick<SchoolMapData, 'zones' | 'blocks' | 'courtyards'>;

class Landmarks {
  private zones: Zone[];
  private data: LandmarkData;
  private rooms: LandmarkRoom[];
  private skip: Set<string>;

  /** the footprint's rects bucketed by BUCKET-meter cells, for quick "is this indoors" checks */
  private buckets = new Map<number, Rect[]>();
  private runCache = new Map<Seg, Run[]>();

  constructor(data: LandmarkData, rooms: LandmarkRoom[], skip: Set<string>) {
    // smallest first, so a point gets its most specific zone
    this.zones = [...data.zones].sort((a, b) => area(a.R) - area(b.R));
    this.data = data;
    this.rooms = rooms;
    this.skip = skip;
    for (const r of data.blocks)
      for (let i = Math.floor((r[0] - 0.5) / BUCKET); i <= Math.floor((r[2] + 0.5) / BUCKET); i++)
        for (let k = Math.floor((r[1] - 0.5) / BUCKET); k <= Math.floor((r[3] + 0.5) / BUCKET); k++) {
          const key = i * 4096 + k;
          this.buckets.set(key, [...(this.buckets.get(key) ?? []), r]);
        }
  }

  private indoors(p: Pt): boolean {
    const near = this.buckets.get(Math.floor(p.x / BUCKET) * 4096 + Math.floor(p.z / BUCKET));
    return !!near && near.some((r) => distToRect(r, p) < 0.5);
  }

  zoneAt(level: number, p: Pt): string | null {
    if (level === 0) {
      if (this.data.courtyards.some((r) => inside(r, p))) return COURTYARD;
      if (!this.indoors(p)) return OUTSIDE;
    }
    for (const zn of this.zones) if (zn.level === level && inside(zn.R, p)) return zn.name;
    return null;
  }

  /** the named zones a segment runs through, in order (parts under 8 m or unnamed fold into a neighbor) */
  zoneRuns(level: number, s: Seg): Run[] {
    let runs = this.runCache.get(s);
    if (!runs) this.runCache.set(s, (runs = this.computeRuns(level, s)));
    return runs.map((r) => ({ ...r }));
  }

  private computeRuns(level: number, s: Seg): Run[] {
    const n = Math.max(2, Math.ceil(s.len));
    let runs: Run[] = [];
    for (let i = 0; i < n; i++) {
      const name = this.zoneAt(level, lerp(s, (i + 0.5) / n));
      const last = runs[runs.length - 1];
      if (last && last.name === name) last.to = (i + 1) / n;
      else runs.push({ name, from: i / n, to: (i + 1) / n });
    }
    const len = (r: Run) => r.to - r.from;
    // which neighbor a short run joins: a named hallway over the outdoors over nothing, then the longer
    const rank = (r: Run) => (!r.name ? 0 : isOut(r.name) ? 1 : 2);
    const merge = (wi: number) => {
      const r = runs[wi], prev = runs[wi - 1], next = runs[wi + 1];
      const into = !prev ? next : !next ? prev : rank(prev) !== rank(next) ? (rank(prev) > rank(next) ? prev : next) : len(prev) >= len(next) ? prev : next;
      into.from = Math.min(into.from, r.from);
      into.to = Math.max(into.to, r.to);
      runs.splice(wi, 1);
      runs = runs.filter((q, i) => {
        if (i === 0 || q.name !== runs[i - 1].name) return true;
        runs[i - 1].to = q.to;
        return false;
      });
    };
    // first the bits too short to mention, shortest first...
    for (let wi = 0; runs.length > 1 && wi >= 0; ) {
      wi = -1;
      runs.forEach((r, i) => {
        if (len(r) * s.len < MIN_RUN && (wi < 0 || len(r) < len(runs[wi]))) wi = i;
      });
      if (wi >= 0) merge(wi);
    }
    // ...then long stretches with no name, which just extend their neighbor
    for (let wi = runs.findIndex((r) => !r.name); runs.length > 1 && wi >= 0; wi = runs.findIndex((r) => !r.name)) merge(wi);
    return runs;
  }

  /** a room right at a corner, for "Turn left at the Media Center" */
  atCorner(level: number, p: Pt, avoid: Set<string>): string | null {
    let best: string | null = null, bs = Infinity;
    for (const r of this.rooms) {
      if (r.level !== level || !CORNER.has(r.type) || this.skip.has(r.key) || !nameable(r)) continue;
      const d = distToRect(r.R, p);
      if (d > 2.5) continue;
      const name = spokenName(r);
      if (avoid.has(name)) continue;
      const score = d - (DISTINCT.has(r.type) || r.big ? 2 : 0);
      if (score < bs) {
        bs = score;
        best = name;
      }
    }
    return best;
  }

  /** a distinctive room beside the middle of a long walk, for ", past the Cafeteria" */
  passing(level: number, s: Seg, avoid: Set<string>): string | null {
    let best: string | null = null, bs = Infinity;
    for (const r of this.rooms) {
      if (r.level !== level || !(DISTINCT.has(r.type) || r.big) || this.skip.has(r.key) || !nameable(r)) continue;
      // beside the walk, not where it starts or ends
      const c = { x: (r.R[0] + r.R[2]) / 2, z: (r.R[1] + r.R[3]) / 2 };
      const t = ((c.x - s.a.x) * (s.b.x - s.a.x) + (c.z - s.a.z) * (s.b.z - s.a.z)) / (s.len * s.len);
      if (t < 0.15 || t > 0.85) continue;
      const d = distToRect(r.R, lerp(s, t));
      if (d > 2.5) continue;
      const name = spokenName(r);
      if (avoid.has(name)) continue;
      const score = d - area(r.R) / 1000;
      if (score < bs) {
        bs = score;
        best = name;
      }
    }
    return best;
  }
}

/** 'down the 700s Hallway', 'through the Lobby', 'outside' */
function along(zone: string): string {
  if (zone === OUTSIDE) return 'outside';
  return (/hall|corridor|concourse|connector|wing/i.test(zone) ? 'down ' : 'through ') + withThe(zone);
}

/** ' into the 700s Hallway', ' out the doors', ' back inside', or '' when nothing changes */
function entering(zone: string | null, prev: string | null): string {
  if (zone === prev) return '';
  if (zone === OUTSIDE) return ' out the doors';
  if (zone === COURTYARD) return ' into the courtyard';
  if (isOut(prev)) return zone ? ` back inside into ${withThe(zone)}` : ' back inside';
  return zone ? ` into ${withThe(zone)}` : '';
}

function turnWords(deg: number): string {
  const side = deg > 0 ? 'right' : 'left';
  const a = Math.abs(deg);
  if (a < 45) return `bear ${side}`;
  if (a <= 135) return `turn ${side}`;
  if (a < 165) return `make a sharp ${side}`;
  return 'turn around';
}

/** where p is as you walk along s: 'on your left', 'on your right', 'straight ahead' */
function sideOf(o: MapOrientation | undefined, s: Seg, p: Pt): string {
  const deg = turnAngle(o, s, seg(s.b, p));
  if (Math.abs(deg) < 35) return 'straight ahead';
  return deg > 0 ? 'on your right' : 'on your left';
}

// ---------------------------------------------------------------------------------------------
// Directions
// ---------------------------------------------------------------------------------------------


export function buildDirections(route: NavRoute, data: LandmarkData, rooms: LandmarkRoom[], opts: DirectionsOptions): Directions {
  const o = opts.orientation;
  const floors = opts.floorNames ?? ['1st floor', '2nd floor'];
  const floorName = (lv: number) => floors[lv] ?? `floor ${lv + 1}`;
  const from = opts.fromRoom ?? null;
  const dest = opts.toRoom;
  const lm = new Landmarks(data, rooms, new Set([dest.key, ...(from ? [from.key] : [])]));
  const pts = route.points;
  const totalMeters = route.length;
  const steps: DirectionStep[] = [];
  // a landmark named in the last step isn't named again right away
  let recent = new Set<string>();
  const out = (s: DirectionStep, names: (string | null)[] = []) => {
    steps.push({ ...s, text: capitalize(s.text), at: { x: s.at.x, z: s.at.z } });
    recent = new Set(names.filter((n): n is string => !!n));
  };
  const destName = spokenName(dest);
  if (!pts.length) return { steps, totalMeters, minutes: walkingMinutes(totalMeters) };
  const end = pts[pts.length - 1];

  const startText = from ? `leave ${withThe(spokenName(from))}` : /entrance|exit|door/i.test(opts.fromLabel) ? `enter through ${withThe(opts.fromLabel)}` : `start at ${withThe(opts.fromLabel)}`;
  if (totalMeters < 1 || pts.length < 2) {
    out({ kind: 'start', level: pts[0].level, text: startText, at: pts[0] });
    out({ kind: 'arrive', level: end.level, text: `you're already at ${withThe(destName)}`, at: end });
    return { steps, totalMeters, minutes: walkingMinutes(totalMeters) };
  }

  // legs: walks on one floor between stairwells
  const legs: { from: number; to: number }[] = [];
  let at = 0;
  for (const st of route.stairs) {
    legs.push({ from: at, to: st.start });
    at = st.end;
  }
  legs.push({ from: at, to: pts.length - 1 });

  let arrival = 'straight ahead';
  let arrivedInside = false;
  for (let li = 0; li < legs.length; li++) {
    const leg = legs[li];
    const level = pts[leg.from].level;
    const before = li > 0 ? route.stairs[li - 1] : undefined;
    const after = route.stairs[li];
    let segs = cleanSegments(pts.slice(leg.from, leg.to + 1), o, li === 0 && !!from, true);

    // the leg ends at a door or a stairwell: say which side it's on instead of walking into it
    const legEnd = pts[leg.to];
    while (segs.length > 1 && segs[segs.length - 1].len < TAIL) segs = segs.slice(0, -1);
    const approach = segs[segs.length - 1];
    let side = 'straight ahead';
    if (approach && dist(approach.b, legEnd) >= 1.5) side = sideOf(o, approach, legEnd);
    else if (approach && after && pts[after.start + 1]) side = sideOf(o, approach, pts[after.start + 1]);
    if (!after) {
      arrival = side;
      // walked well into the room (a gym, the cafeteria), not just up to its door
      arrivedInside = !!approach && inside(dest.R, approach.b) && (!!dest.big || (approach.len > 3 && inside(dest.R, lerp(approach, 1 - 3 / approach.len))));
    }

    // the zones a segment runs through; the few steps from the front walk up to the doors don't count
    const runsOf = (s: Seg, opening: boolean): Run[] => {
      if (opening && !from) {
        let d = 0;
        while (d < Math.min(12, s.len - 1) && lm.zoneAt(level, lerp(s, d / s.len)) === OUTSIDE) d += 0.5;
        if (d > 0 && d < Math.min(12, s.len - 1)) {
          const t = d / s.len;
          const runs = lm.zoneRuns(level, seg(lerp(s, t), s.b)).map((r) => ({ ...r, from: t + r.from * (1 - t), to: t + r.to * (1 - t) }));
          runs[0].from = 0;
          return runs;
        }
      }
      return lm.zoneRuns(level, s);
    };

    // heading as you come off the stairs: the last flight of the switchback
    let entry: Seg | null = null;
    if (before) {
      const a = pts[before.end - 1], b = pts[before.end];
      if (a && b && dist(a, b) > 0.5) entry = seg(a, b);
    }

    let i = 0;
    let lead = '';
    if (li === 0) {
      // out of the door (or in through the entrance) and into the first hallway
      const s0 = segs[0];
      const head = !!s0 && s0.len < HEAD && segs.length > 1;
      // some routes skirt the building outside first (where the model has no way through)
      const first = segs[head ? 1 : 0];
      const text = !from && first && runsOf(first, true)[0].name === OUTSIDE ? `start outside ${withThe(opts.fromLabel)}` : startText;
      if (head) {
        const deg = turnAngle(o, s0, segs[1]);
        out({ kind: 'start', level, text: text + (Math.abs(deg) >= STRAIGHT ? ` and ${turnWords(deg)}` : ''), at: pts[0] });
        i = 1;
      } else out({ kind: 'start', level, text, at: pts[0] });
      if (segs.length === 1 && segs[0].len < 2) i = 1;
    } else if (before) {
      lead = before.to > before.from ? 'at the top of the stairs, ' : 'at the bottom of the stairs, ';
      const deg = entry && segs[0] ? turnAngle(o, entry, segs[0]) : 0;
      if (Math.abs(deg) >= 45) lead += `${turnWords(deg)} and `;
    }

    for (const first = i; i < segs.length; i++) {
      const s = segs[i];
      const runs = runsOf(s, li === 0 && i === first);
      const run0 = seg(s.a, lerp(s, runs[0].to));
      const zone = runs[0].name;
      const prev = i > first ? segs[i - 1] : null;
      const prevZone = i > 0 ? runsOf(segs[i - 1], li === 0 && i - 1 === first).at(-1)!.name : li > 0 ? null : lm.zoneAt(level, s.a);
      const past = run0.len >= 20 ? lm.passing(level, run0, recent) : null;
      const pastText = past ? `, past ${withThe(past)}` : '';
      if (!prev) {
        // the first walk of a leg (or right after "Leave Room 214 and turn left")
        const where = zone ? ' ' + along(zone) : '';
        out({ kind: 'walk', level, distance: run0.len, text: `${lead}walk ${formatDistance(run0.len)}${where}${pastText}`, at: s.a }, [past]);
      } else {
        const deg = turnAngle(o, prev, s);
        const room = Math.abs(deg) >= 45 ? lm.atCorner(level, s.a, recent) : null;
        const pastHere = past && past !== room ? past : null;
        const pastHereText = pastHere ? `, past ${withThe(pastHere)}` : '';
        const where = (room ? ` at ${withThe(room)}` : '') + entering(zone, prevZone);
        const outside = zone === OUTSIDE ? ' outside' : '';
        out({ kind: 'turn', level, distance: run0.len, text: `${turnWords(deg)}${where} and walk ${formatDistance(run0.len)}${outside}${pastHereText}`, at: s.a }, [room, pastHere]);
      }
      // a long straight walk on into the next hallway (or through a few, named by the last)
      if (runs.length > 1) {
        const rest = seg(lerp(s, runs[1].from), s.b);
        const last = runs[runs.length - 1].name, before = runs[runs.length - 2].name;
        const d = formatDistance(rest.len);
        const text = last === OUTSIDE ? `go out the doors and continue ${d} outside` : isOut(before) && !isOut(last) ? `go back inside and continue ${d}${last ? ` into ${withThe(last)}` : ''}` : `continue ${d}${entering(last, before)}`;
        if (rest.len >= MIN_RUN) out({ kind: 'walk', level, distance: rest.len, text, at: rest.a });
      }
    }

    if (after) {
      const st = pts[after.start];
      const sideText = side === 'straight ahead' ? '' : ` ${side}`;
      out({ kind: 'stairs', level, text: `take the ${after.id} stairs${sideText} ${after.to > after.from ? 'up' : 'down'} to the ${floorName(after.to)}`, at: st });
    }
  }

  const arrive = arrivedInside ? `you've arrived at ${withThe(destName)}` : `${withThe(destName)} is ${arrival}`;
  out({ kind: 'arrive', level: end.level, text: arrive, at: end });
  return { steps, totalMeters, minutes: walkingMinutes(totalMeters) };
}

function inside(r: Rect, p: Pt): boolean {
  return p.x >= r[0] && p.x <= r[2] && p.z >= r[1] && p.z <= r[3];
}
