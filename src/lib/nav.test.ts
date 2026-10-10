// @vitest-environment node
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MapRoomRaw, SchoolMapData } from '../types';
import { createNavGrid, decodeGrid, entrancePoint, inRect, NavGrid, roomTarget, routeBetween, routeFromEntrance, solveRoute, spawnPoint, type NavRoute, type NavSource } from './nav';

// ---------------------------------------------------------------------------------------------
// Small hand-made grids: '#' blocked, '.' free; rows are z (k), columns are x (i); 0.5 m cells.
// ---------------------------------------------------------------------------------------------

function pack(rows: string[]): string {
  const NX = rows[0].length, N = NX * rows.length;
  const bytes = new Uint8Array(Math.ceil(N / 8));
  rows.forEach((row, k) => [...row].forEach((ch, i) => ch === '#' && (bytes[(k * NX + i) >> 3] |= 1 << ((k * NX + i) & 7))));
  return Buffer.from(bytes).toString('base64');
}

function grid(levels: string[][], opts: { heights?: number[][]; stairs?: NavSource['stairs'] } = {}): NavSource {
  const NX = levels[0][0].length, NZ = levels[0].length;
  const h = new Int8Array(NX * NZ);
  opts.heights?.forEach((row, k) => row.forEach((v, i) => (h[k * NX + i] = Math.round(v * 10))));
  return {
    grid: { X0: 0, Z0: 0, CS: 0.5, NX, NZ },
    levelH: 4,
    blocked: levels.map(pack),
    heights: Buffer.from(new Uint8Array(h.buffer)).toString('base64'),
    stairs: opts.stairs ?? [],
  };
}

/** world center of cell (i, k) */
const at = (i: number, k: number, level = 0) => ({ level, x: i * 0.5 + 0.25, z: k * 0.5 + 0.25 });

describe('decodeGrid', () => {
  it('unpacks blocked bits and signed decimeter heights', () => {
    const src = grid([['.#.', '#..']], { heights: [[0, 1.2, -0.5], [0, 0, 12.7]] });
    const { blocked, heights } = decodeGrid(src);
    expect([...blocked[0]]).toEqual([0, 1, 0, 1, 0, 0]);
    expect(heights[1]).toBeCloseTo(1.2);
    expect(heights[2]).toBeCloseTo(-0.5);
    expect(heights[5]).toBeCloseTo(12.7);
  });
});

describe('NavGrid on small grids', () => {
  it('walks a straight corridor as a single segment', () => {
    const g = new NavGrid(grid([['..........']]));
    const r = g.find(at(0, 0), at(9, 0))!;
    expect(r.points).toEqual([at(0, 0), at(9, 0)]);
    expect(r.length).toBeCloseTo(4.5);
    expect(r.stairs).toEqual([]);
  });

  it('goes around a wall through its gap', () => {
    const rows = ['.......', '.......', '######.', '.......'];
    const g = new NavGrid(grid([rows]));
    const r = g.find(at(0, 0), at(0, 3))!;
    expect(r).not.toBeNull();
    // down to the gap at column 6 and back: 6 cells across, 3 down, 6 back (diagonals shorten it)
    expect(r.length).toBeGreaterThan(5);
    expect(r.points.some((p) => p.x > 3)).toBe(true);
    expect(r.length).toBeLessThan(8);
  });

  it('never cuts a blocked corner diagonally', () => {
    const g = new NavGrid(grid([['.#', '#.']]));
    expect(g.find(at(0, 0), at(1, 1))).toBeNull();
  });

  it("doesn't step up more than 0.75 m on the ground floor", () => {
    const rows = ['....', '....'];
    const steep = new NavGrid(grid([rows], { heights: [[0, 0, 1, 1], [0, 0, 1, 1]] }));
    expect(steep.find(at(0, 0), at(3, 0))).toBeNull();
    const ramp = new NavGrid(grid([rows], { heights: [[0, 0.5, 1, 1.5], [0, 0.5, 1, 1.5]] }));
    expect(ramp.find(at(0, 0), at(3, 0))).not.toBeNull();
  });

  it('takes the stairs between floors and walks their switchback', () => {
    const ground = ['......', '......', '......'];
    const upper = ['######', '######', '......'];
    const stairs = [{ id: 'A', a: [2.75, 0.25] as [number, number], b: [2.75, 1.25] as [number, number], cost: 10, via: [[2.75, 0.5, 0], [2.75, 1, 2.4], [2.75, 1.2, 4]] as [number, number, number][] }];
    const g = new NavGrid(grid([ground, upper], { stairs }));
    const r = g.find(at(0, 0), at(0, 2, 1))!;
    expect(r.stairs).toHaveLength(1);
    expect(r.stairs[0]).toMatchObject({ id: 'A', from: 0, to: 1 });
    expect(r.points[0].level).toBe(0);
    expect(r.points.at(-1)!.level).toBe(1);
    expect(r.points[r.stairs[0].start]).toEqual({ level: 0, x: 2.75, z: 0.25 });
    expect(r.points[r.stairs[0].end]).toEqual({ level: 1, x: 2.75, z: 1.25 });
    // the via points in between: below 3 m is still the ground floor (straight bits are simplified away)
    const levels = r.points.slice(r.stairs[0].start, r.stairs[0].end + 1).map((p) => p.level);
    expect(levels).toEqual([...levels].sort());
    expect(r.points.slice(r.stairs[0].start + 1, r.stairs[0].end)).toContainEqual({ level: 1, x: 2.75, z: 1.2 });
    // 2.5 m to the stairs, the flight (10), 2.5 m back on the upper floor
    expect(r.length).toBeCloseTo(15);
    // and back down
    const back = g.find(at(0, 2, 1), at(0, 0))!;
    expect(back.stairs[0]).toMatchObject({ from: 1, to: 0 });
  });

  it('snaps the goal into the target rect and gives up beyond the snapping range', () => {
    const rows = ['.....', '.###.', '.....'];
    const g = new NavGrid(grid([rows]));
    // goal on a blocked cell, inside a rect that only covers the bottom row
    const r = g.find(at(0, 0), at(2, 1), [0, 1, 2.5, 1.5])!;
    expect(r.points.at(-1)!.z).toBeCloseTo(1.25);
    const far = new NavGrid(grid([['.' + '#'.repeat(40)]]));
    expect(far.find(at(0, 0), at(40, 0))).toBeNull();
  });

  it('straightens grid staircases into any-angle lines when smoothing', () => {
    const rows = Array.from({ length: 8 }, () => '..........');
    const raw = new NavGrid(grid([rows])).find(at(0, 0), at(9, 3))!;
    const smooth = new NavGrid(grid([rows]), { smooth: true }).find(at(0, 0), at(9, 3))!;
    expect(raw.points.length).toBeGreaterThan(2);
    expect(smooth.points).toEqual([at(0, 0), at(9, 3)]);
    expect(smooth.length).toBeCloseTo(raw.length);
  });

  it('checks line of sight cell by cell', () => {
    const g = new NavGrid(grid([['....', '.#..', '....']]));
    expect(g.lineOfSight(0, 0.25, 0.25, 1.75, 0.25)).toBe(true);
    expect(g.lineOfSight(0, 0.25, 0.75, 1.75, 0.75)).toBe(false);
    // a perfect diagonal past the blocked cell's corner
    expect(g.lineOfSight(0, 0.25, 0.25, 1.25, 1.25)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The real school maps
// ---------------------------------------------------------------------------------------------

const load = (id: string): SchoolMapData => JSON.parse(fs.readFileSync(`public/schools/${id}/map.json`, 'utf8'));
const schools = { hsn: load('hsn'), cms: load('cms') };
const grids = { hsn: createNavGrid(schools.hsn), cms: createNavGrid(schools.cms) };
const byLabel = (data: SchoolMapData, label: string) => data.rooms.find((r) => r.label === label || r.name === label)!;

/** meters of a route's ground-floor walk outside the building's footprint */
function outdoors(data: SchoolMapData, route: NavRoute): number {
  let m = 0;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i];
    if (a.level || b.level) continue;
    const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
    if (!data.blocks.some((r) => inRect(r, x, z, 0.3))) m += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return m;
}

describe.each(['hsn', 'cms'] as const)('%s map', (id) => {
  const data = schools[id];
  const g = grids[id];
  const rooms = data.rooms.filter((r) => r.type !== 'stair');

  it('reaches every room from the front entrance, about as far as the 3D game walks', () => {
    const t = performance.now();
    const off: string[] = [];
    for (const r of rooms) {
      const route = routeFromEntrance(g, data, r);
      expect(route, `${r.label || r.name} on floor ${r.level + 1}`).not.toBeNull();
      // never shorter than the game's walk (the shortest), and only much longer to stay inside where the game cuts across outdoors
      const ratio = route!.length / r.fromEntrance!;
      if (ratio < 0.97 || ratio > (outdoors(data, route!) < 15 ? 1.3 : 1.15)) off.push(`${r.label || r.name}: ${route!.length.toFixed(0)} m vs ${r.fromEntrance} m`);
      // starts outside the main entrance, ends at the room's door
      expect(route!.points[0].level).toBe(0);
      expect(route!.points.at(-1)!.level).toBe(r.level);
    }
    const ms = performance.now() - t;
    expect(off).toEqual([]);
    expect(ms).toBeLessThan(3000);
  });

  it('reaches every room without leaving the building from just inside the front entrance', () => {
    // only the footprint is walkable: no detours around the outside, no courtyards
    const indoor = new NavGrid(data, { outdoorMargin: 0.3 });
    for (let c = 0; c < indoor.N; c++) {
      const [x, z] = indoor.center(c);
      if (data.courtyards.some((r) => inRect(r, x, z))) indoor.blocked[c] = 1;
    }
    const main = data.entrances.findIndex((e) => e.main);
    const start = entrancePoint(indoor, { ...data, entrances: data.entrances.map((e) => ({ ...e, main: false })) }, main)!;
    expect(indoor.isFree(0, start.x, start.z)).toBe(true);
    const outside = rooms.filter((r) => !indoor.find(start, roomTarget(r), r.R)).map((r) => `${r.label || r.name} on floor ${r.level + 1}`);
    expect(outside).toEqual([]);
  });

  it('matches the 3D game closely without the app tweaks (a faithful port of nav.js)', () => {
    const plain = new NavGrid(data);
    for (const r of rooms.filter((_, i) => i % 12 === 0)) {
      const route = routeFromEntrance(plain, data, r)!;
      expect(Math.abs(route.length - r.fromEntrance!)).toBeLessThanOrEqual(Math.max(2, r.fromEntrance! * 0.03));
    }
  });

  it('takes the stairs to every 2nd-floor room', () => {
    const upstairs = rooms.filter((r) => r.level === 1);
    expect(upstairs.length).toBeGreaterThan(0);
    for (const r of upstairs) {
      const route = routeFromEntrance(g, data, r)!;
      expect(route.stairs.length).toBeGreaterThanOrEqual(1);
      expect(route.stairs[0]).toMatchObject({ from: 0, to: 1 });
      expect(data.stairs.map((s) => s.id)).toContain(route.stairs[0].id);
    }
  });

  it('routes between rooms on different floors', () => {
    const up = rooms.find((r) => r.level === 1 && NAMED(r))!;
    const down = rooms.filter((r) => r.level === 0 && NAMED(r)).at(-1)!;
    const there = routeBetween(g, down, up)!;
    const back = routeBetween(g, up, down)!;
    expect(there.stairs[0]).toMatchObject({ from: 0, to: 1 });
    expect(back.stairs[0]).toMatchObject({ from: 1, to: 0 });
    expect(back.points[0].level).toBe(1);
    expect(back.length).toBeCloseTo(there.length, -1);
  });

  it('only draws straight lines that are walkable', () => {
    for (const r of rooms.filter((_, i) => i % 9 === 0)) {
      const route = routeFromEntrance(g, data, r)!;
      const inStairs = (i: number) => route.stairs.some((s) => i > s.start && i <= s.end);
      for (let i = 1; i < route.points.length; i++) {
        if (inStairs(i)) continue;
        const a = route.points[i - 1], b = route.points[i];
        expect(g.lineOfSight(a.level, a.x, a.z, b.x, b.z), `${r.label || r.name} #${i}`).toBe(true);
      }
    }
  });

  it('starts from any entrance', () => {
    const target = rooms.find((r) => r.level === 0 && NAMED(r))!;
    data.entrances.forEach((e, i) => {
      const p = entrancePoint(g, data, i)!;
      if (e.main) expect(p).toEqual(spawnPoint(data));
      else expect(g.isFree(0, p.x, p.z), e.name).toBe(true);
      const route = solveRoute(g, data, { from: { entrance: i }, to: { level: 0, x: target.target![0], z: target.target![1] }, toRect: target.R });
      expect(route, e.name).not.toBeNull();
    });
  });
});

function NAMED(r: MapRoomRaw) {
  return r.type === 'class' && !!r.label;
}

describe('school specifics', () => {
  it('HSN: Room 214 is up the W stairs from the front entrance', () => {
    const r = routeFromEntrance(grids.hsn, schools.hsn, byLabel(schools.hsn, '214'))!;
    expect(r.stairs.map((s) => s.id)).toEqual(['W']);
  });

  it('CMS: 2nd-floor rooms are reached by one of its three stairwells', () => {
    const r = routeFromEntrance(grids.cms, schools.cms, byLabel(schools.cms, '801'))!;
    expect(['Blue', 'Red', '905']).toContain(r.stairs[0].id);
  });
});
