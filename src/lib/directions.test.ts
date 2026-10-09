// @vitest-environment node
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MapRoom, SchoolMapData } from '../types';
import { buildDirections, formatDistance, spokenName, toMap, turnAngle, walkingMinutes, withThe, type MapOrientation } from './directions';
import { buildRooms } from './mapData';
import { createNavGrid, routeBetween, routeFromEntrance, type NavRoute } from './nav';

describe('formatting', () => {
  it('rounds distances to 10 m (5 m when short) with feet', () => {
    expect(formatDistance(40)).toBe('40 m (130 ft)');
    expect(formatDistance(43.9)).toBe('40 m (130 ft)');
    expect(formatDistance(2)).toBe('5 m (15 ft)');
    expect(formatDistance(12)).toBe('10 m (35 ft)');
    expect(formatDistance(147)).toBe('150 m (490 ft)');
  });

  it('walks at about 1.3 m/s, at least a minute', () => {
    expect(walkingMinutes(10)).toBe(1);
    expect(walkingMinutes(156)).toBe(2);
    expect(walkingMinutes(400)).toBe(5);
  });

  it('puts "the" in front of names but not room numbers', () => {
    expect(withThe('Media Center')).toBe('the Media Center');
    expect(withThe('700s Hallway')).toBe('the 700s Hallway');
    expect(withThe('7th Grade Concourse')).toBe('the 7th Grade Concourse');
    expect(withThe('Room 214')).toBe('Room 214');
    expect(withThe('A103')).toBe('A103');
    expect(withThe('Lecture Hall 300')).toBe('Lecture Hall 300');
    expect(spokenName({ title: '300 · Lecture Hall 300', name: 'Lecture Hall 300', label: '300' })).toBe('Lecture Hall 300');
    expect(spokenName({ title: 'Room 214', name: 'Room 214', label: '214' })).toBe('Room 214');
  });
});

describe('left and right', () => {
  // world: walk toward +x, then toward +z
  const s = { a: { x: 0, z: 0 }, b: { x: 10, z: 0 } };
  const t = { a: { x: 10, z: 0 }, b: { x: 10, z: 10 } };

  it('HSN (north-up, +x is north, +z is east): north then east is a right turn', () => {
    // check the map really draws north up and east right
    const [u0, v0] = toMap('north-up-xz', 0, 0), [, vN] = toMap('north-up-xz', 10, 0), [uE] = toMap('north-up-xz', 0, 10);
    expect(vN).toBeLessThan(v0);
    expect(uE).toBeGreaterThan(u0);
    expect(turnAngle('north-up-xz', s, t)).toBeCloseTo(90);
  });

  it('CMS (plan, +x right, +z down): right then down is a right turn', () => {
    expect(turnAngle('plan', s, t)).toBeCloseTo(90);
    expect(turnAngle('plan', t, s)).toBeCloseTo(-90);
    expect(turnAngle('plan', s, { a: t.a, b: { x: 10, z: -10 } })).toBeCloseTo(-90);
  });
});

// ---------------------------------------------------------------------------------------------
// A made-up school: a long north-south hall and an east wing, HSN-style orientation
// ---------------------------------------------------------------------------------------------

const toy: Pick<SchoolMapData, 'zones' | 'blocks' | 'courtyards'> = {
  zones: [
    { name: 'Main Hall', level: 0, R: [0, 0, 100, 10] },
    { name: '700s Hallway', level: 0, R: [90, 10, 100, 100] },
    { name: '800s Hallway', level: 1, R: [0, 0, 100, 100] },
  ],
  blocks: [[0, 0, 100, 100]],
  courtyards: [],
};

function room(key: string, R: [number, number, number, number], level = 0, extra: Partial<MapRoom> = {}): MapRoom {
  return { key, label: key, name: `Room ${key}`, title: `Room ${key}`, type: 'class', level, R, ...extra };
}

const pts = (level: number, ...xz: [number, number][]) => xz.map(([x, z]) => ({ level, x, z }));
const route = (points: NavRoute['points'], stairs: NavRoute['stairs'] = []): NavRoute => {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return { points, length, stairs };
};

describe('buildDirections on a made-up school', () => {
  const o: MapOrientation = 'north-up-xz';
  const r701 = room('701', [91, 58, 92.8, 66]);

  it('walks, turns into the next hallway and says which side the door is on', () => {
    // north up the hall, east down the 700s, then 2 m south through a door
    const rt = route(pts(0, [1, 5], [95, 5], [95, 60], [93, 60]));
    const d = buildDirections(rt, toy, [r701], { fromLabel: 'Front entrance', toRoom: r701, orientation: o });
    expect(d.steps.map((s) => s.kind)).toEqual(['start', 'walk', 'turn', 'arrive']);
    expect(d.steps.map((s) => s.text)).toEqual([
      'Enter through the Front entrance',
      'Walk 90 m (300 ft) down the Main Hall',
      'Turn right into the 700s Hallway and walk 60 m (200 ft)',
      // heading east, the door is to the south: on the right
      'Room 701 is on your right',
    ]);
    expect(d.steps[2].at).toEqual({ x: 95, z: 5 });
    expect(d.totalMeters).toBeCloseTo(rt.length);
    expect(d.minutes).toBe(2);
  });

  it('mirrors: west from the hall is a left turn, and a door to the south is then on the left', () => {
    const toyW = { ...toy, zones: [...toy.zones, { name: '600s Hallway', level: 0, R: [90, -100, 100, -10] as [number, number, number, number] }], blocks: [[0, -100, 100, 100] as [number, number, number, number]] };
    const r601 = room('601', [91, -61, 92.8, -53]);
    const rt = route(pts(0, [1, 5], [95, 5], [95, -55], [93, -55]));
    const d = buildDirections(rt, toyW, [r601], { fromLabel: 'Front entrance', toRoom: r601, orientation: o });
    expect(d.steps[2].text).toBe('Turn left into the 600s Hallway and walk 60 m (200 ft)');
    expect(d.steps.at(-1)!.text).toBe('Room 601 is on your left');
  });

  it('leaves a room through its door and names the corner it turns at', () => {
    const from = room('101', [50, 0, 60, 4]);
    const gym = room('Gym', [80, 8, 87, 30], 0, { type: 'gym', name: 'Main Gym', title: 'Main Gym', label: '', big: true });
    // out of 101's door (south side of the hall), north up the hall, right at the gym's corner
    const rt = route(pts(0, [55, 3], [55, 6], [88, 6], [88, 40], [86, 40]));
    const d = buildDirections(rt, toy, [from, gym, r701], { fromLabel: 'Room 101', fromRoom: from, toRoom: r701, orientation: o });
    expect(d.steps[0].text).toBe('Leave Room 101 and turn left');
    expect(d.steps[1].text).toBe('Walk 30 m (100 ft) down the Main Hall');
    expect(d.steps[2].text).toBe('Turn right at the Main Gym and walk 30 m (100 ft)');
  });

  it('takes the stairs and picks up on the other floor', () => {
    const r801 = room('801', [40, 30, 48, 38], 1);
    const rt = route(
      [...pts(0, [1, 5], [60, 5]), ...pts(0, [60, 8]), ...pts(1, [64, 8], [64, 5], [40, 5], [40, 28])],
      [{ id: 'Blue', from: 0, to: 1, start: 1, end: 4 }],
    );
    const d = buildDirections(rt, toy, [r801], { fromLabel: 'Front entrance', toRoom: r801, orientation: o, floorNames: ['1st floor', '2nd floor'] });
    // north up the hall; the first flight heads east, so the stairs are on the right
    expect(d.steps.map((s) => s.text)).toEqual([
      'Enter through the Front entrance',
      'Walk 60 m (200 ft) down the Main Hall',
      'Take the Blue stairs on your right up to the 2nd floor',
      // off the last flight heading west, then south: a left
      'At the top of the stairs, turn left and walk 20 m (70 ft) down the 800s Hallway',
      'Turn left and walk 20 m (70 ft)',
      'Room 801 is straight ahead',
    ]);
    expect(d.steps[2].level).toBe(0);
    expect(d.steps[3].level).toBe(1);
  });

  it('handles a route that starts where it ends', () => {
    const rt: NavRoute = { points: pts(0, [5, 5]), length: 0, stairs: [] };
    const d = buildDirections(rt, toy, [], { fromLabel: 'Room 701', fromRoom: r701, toRoom: r701, orientation: o });
    expect(d.steps.map((s) => s.text)).toEqual(['Leave Room 701', "You're already at Room 701"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Real routes
// ---------------------------------------------------------------------------------------------

const load = (id: string): SchoolMapData => JSON.parse(fs.readFileSync(`public/schools/${id}/map.json`, 'utf8'));
const school = (id: 'hsn' | 'cms', o: MapOrientation) => {
  const data = load(id);
  return { data, rooms: buildRooms(data), grid: createNavGrid(data), o };
};
const hsn = school('hsn', 'north-up-xz');
const cms = school('cms', 'plan');

function fromEntrance(s: typeof hsn, key: string) {
  const to = s.rooms.find((r) => r.key === key)!;
  const rt = routeFromEntrance(s.grid, s.data, to)!;
  return buildDirections(rt, s.data, s.rooms, { fromLabel: 'Front entrance', toRoom: to, orientation: s.o });
}

describe('buildDirections on the real maps', () => {
  it('HSN: front entrance to Room 214', () => {
    const d = fromEntrance(hsn, '214');
    const texts = d.steps.map((s) => s.text);
    expect(texts[0]).toBe('Enter through the Front entrance');
    expect(texts[1]).toMatch(/down the Main Hall/);
    // north up the Main Hall, then west: a left on the north-up map
    expect(texts).toContain('Turn left into the 100s Hallway and walk 60 m (200 ft)');
    expect(texts.find((t) => t.startsWith('Take the'))).toMatch(/^Take the W stairs (on your left )?up to the 2nd floor$/);
    expect(texts.at(-1)).toBe('Room 214 is on your left');
    expect(d.steps.length).toBeGreaterThanOrEqual(5);
    expect(d.steps.length).toBeLessThanOrEqual(10);
  });

  it('HSN: between floors, from a class to a class', () => {
    const a = hsn.rooms.find((r) => r.key === '214')!, b = hsn.rooms.find((r) => r.key === 'A103')!;
    const d = buildDirections(routeBetween(hsn.grid, a, b)!, hsn.data, hsn.rooms, { fromLabel: a.title, fromRoom: a, toRoom: b, orientation: hsn.o });
    const texts = d.steps.map((s) => s.text);
    expect(texts[0]).toMatch(/^Leave Room 214/);
    expect(texts.some((t) => /stairs .*down to the 1st floor/.test(t))).toBe(true);
    expect(texts.at(-1)).toMatch(/^Room A103 is /);
  });

  it('CMS: front entrance to the gym, through the lobby', () => {
    const texts = fromEntrance(cms, 'Gym').steps.map((s) => s.text);
    expect(texts).toEqual(['Enter through the Front entrance', 'Walk 15 m (50 ft) through the Lobby', 'Turn left into the Gym Hallway and walk 30 m (100 ft)', 'The Gym is on your left']);
  });

  it('says so when a route goes outside', () => {
    const texts = fromEntrance(cms, '801').steps.map((s) => s.text);
    expect(texts[0]).toBe('Start outside the Front entrance');
    expect(texts.some((t) => /back inside/.test(t))).toBe(true);
  });

  it.each([
    ['hsn', hsn],
    ['cms', cms],
  ] as const)('%s: every room gets a short, complete set of directions', (_, s) => {
    for (const r of s.rooms) {
      if (r.type === 'stair') continue;
      const d = fromEntrance(s, r.key);
      expect(d.steps[0].kind).toBe('start');
      expect(d.steps.at(-1)!.kind).toBe('arrive');
      expect(d.steps.length).toBeGreaterThanOrEqual(3);
      expect(d.steps.length).toBeLessThanOrEqual(16);
      for (const st of d.steps) expect(st.text, r.key).not.toMatch(/undefined|null|NaN|\s\s/);
      if (r.level === 1) expect(d.steps.some((st) => st.kind === 'stairs')).toBe(true);
    }
  });
});
