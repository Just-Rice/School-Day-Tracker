// @vitest-environment node
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SchoolMapData } from '../../types';
import { toMap } from '../../lib/directions';
import { buildRooms } from '../../lib/mapData';
import { clampView, fitLabel, fitView, footprintHoles, fromMap, rectBox, rectsPath, roomAt, roomLabels, scaleBar, schoolBox, wallsPath, zoomAt } from './geometry';
import { entranceLabels, fromParam, parseFrom, startLevel } from './endpoints';

const load = (id: string): SchoolMapData => JSON.parse(fs.readFileSync(`public/schools/${id}/map.json`, 'utf8'));

describe('map projection', () => {
  it('round-trips world and map coordinates for both orientations', () => {
    for (const o of ['north-up-xz', 'plan'] as const) {
      const [u, v] = toMap(o, 12.5, -3);
      expect(fromMap(o, u, v)).toEqual([12.5, -3]);
    }
    // HSN: world +x (north) is up the screen
    expect(toMap('north-up-xz', 10, 20)).toEqual([20, -10]);
    expect(rectBox('north-up-xz', [0, 0, 10, 20])).toEqual({ u0: 0, v0: -10, u1: 20, v1: -0 });
  });

  it('draws rects and walls as single paths', () => {
    expect(rectsPath('plan', [[0, 0, 2, 1]])).toBe('M0 0H2V1H0Z');
    // axis 'z': along z = 5 from x = 1 to 3; axis 'x': along x = 2 from z = 0 to 4
    expect(wallsPath('plan', [['z', 5, 1, 3], ['x', 2, 0, 4]])).toBe('M1 5L3 5M2 0L2 4');
    expect(wallsPath('north-up-xz', [['z', 5, 1, 3]])).toBe('M5 -1L5 -3');
  });
});

describe('view math', () => {
  const box = { u0: 0, v0: 0, u1: 100, v1: 50 };

  it('fits a box into the viewport, centered, leaving the insets free', () => {
    const v = fitView(box, 400, 400, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(v.k).toBeCloseTo(4);
    expect(v.tx).toBeCloseTo(0);
    expect(v.ty).toBeCloseTo(100);
    const inset = fitView(box, 400, 400, { top: 50, right: 0, bottom: 150, left: 0 });
    expect(inset.ty + 25 * inset.k).toBeCloseTo(150); // the box's middle sits in the middle of the free area
    expect(fitView(box, 400, 400, undefined, 2).k).toBe(2);
  });

  it('zooms about a point, which stays put', () => {
    const v = { k: 2, tx: 10, ty: 20 };
    const z = zoomAt(v, 3, 100, 100);
    const before = [(100 - v.tx) / v.k, (100 - v.ty) / v.k], after = [(100 - z.tx) / z.k, (100 - z.ty) / z.k];
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
    expect(z.k).toBe(6);
  });

  it('keeps the zoom in range and some of the map on screen', () => {
    expect(clampView({ k: 100, tx: 0, ty: 0 }, box, 400, 400, 1, 10).k).toBe(10);
    expect(clampView({ k: 0.1, tx: 0, ty: 0 }, box, 400, 400, 1, 10).k).toBe(1);
    const far = clampView({ k: 2, tx: 5000, ty: -5000 }, box, 400, 400, 1, 10, 60);
    expect(far.tx).toBe(400 - 60);
    expect(far.ty).toBe(60 - 100);
  });

  it('picks round scale-bar lengths', () => {
    expect(scaleBar(4)).toEqual({ meters: 25, px: 100 });
    expect(scaleBar(10).meters).toBe(10);
    expect(scaleBar(0.5).meters).toBe(200);
  });
});

describe('labels', () => {
  it('fits text along the long side of narrow rooms and gives up when it cannot', () => {
    const wide = fitLabel({ u0: 0, v0: 0, u1: 10, v1: 6 }, ['214'], 2);
    expect(wide).toMatchObject({ text: '214', vertical: false, u: 5, v: 3, size: 2 });
    const tall = fitLabel({ u0: 0, v0: 0, u1: 3, v1: 12 }, ['214'], 2)!;
    expect(tall.vertical).toBe(true);
    expect(fitLabel({ u0: 0, v0: 0, u1: 2, v1: 2 }, ['Media Center'], 2)).toBeNull();
    // falls back to the next candidate
    expect(fitLabel({ u0: 0, v0: 0, u1: 6, v1: 4 }, ['Media Center', 'MC'], 2)!.text).toBe('MC');
  });

  it('labels most HSN classrooms on the 1st floor', () => {
    const data = load('hsn');
    const rooms = buildRooms(data);
    const labels = roomLabels('north-up-xz', rooms, 0);
    const classes = rooms.filter((r) => r.level === 0 && r.type === 'class');
    const labeled = classes.filter((r) => labels.some((l) => l.key === r.key));
    expect(labeled.length / classes.length).toBeGreaterThan(0.9);
    expect(labels.find((l) => l.key === 'Media Center')!.text).toBe('Media Center');
  });
});

describe('school data helpers', () => {
  const hsn = load('hsn');
  const cms = load('cms');

  it('finds the room under a point, ignoring stairwells', () => {
    const rooms = buildRooms(hsn);
    const r214 = rooms.find((r) => r.key === '214')!;
    const [x, z] = [(r214.R[0] + r214.R[2]) / 2, (r214.R[1] + r214.R[3]) / 2];
    expect(roomAt(rooms, 1, x, z)!.key).toBe('214');
    expect(roomAt(rooms, 0, -100, -100)).toBeNull();
  });

  it('frames the whole school including the front walk', () => {
    const b = schoolBox(hsn, 'north-up-xz');
    const [u, v] = toMap('north-up-xz', hsn.spawn[0], hsn.spawn[1]);
    expect(u).toBeGreaterThan(b.u0);
    expect(v).toBeLessThan(b.v1);
  });

  it('fills the small pockets between footprint rects but not the courtyards', () => {
    for (const data of [hsn, cms]) {
      const holes = footprintHoles(data.blocks);
      for (const c of data.courtyards) {
        const mid = [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2];
        expect(holes.some((h) => mid[0] >= h[0] && mid[0] <= h[2] && mid[1] >= h[1] && mid[1] <= h[3])).toBe(false);
      }
    }
    // a 1 m gap enclosed by four rects
    const ring: [number, number, number, number][] = [
      [0, 0, 3, 1],
      [0, 2, 3, 3],
      [0, 1, 1, 2],
      [2, 1, 3, 2],
    ];
    const h = footprintHoles(ring);
    expect(h).toEqual([
      [1, 1, 2, 1.5],
      [1, 1.5, 2, 2],
    ]);
    expect(footprintHoles(ring, 0.5)).toEqual([]);
  });
});

describe('route start points', () => {
  const hsn = load('hsn');
  const rooms = buildRooms(hsn);
  const byKey = new Map(rooms.map((r) => [r.key, r]));
  const labels = entranceLabels(hsn, 'north-up-xz');

  it('names entrances, telling same-named ones apart', () => {
    expect(labels[hsn.entrances.findIndex((e) => e.main)]).toBe('Front entrance');
    const courtyard = labels.filter((l) => l.startsWith('Courtyard Doors'));
    expect(courtyard).toHaveLength(2);
    expect(new Set(courtyard).size).toBe(2);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('parses and formats ?from=', () => {
    const main = parseFrom('entrance', hsn, byKey, labels)!;
    expect(main).toMatchObject({ kind: 'entrance', main: true, label: 'Front entrance' });
    expect(fromParam(main)).toBe('entrance');
    const side = parseFrom('entrance:1', hsn, byKey, labels)!;
    expect(side).toMatchObject({ kind: 'entrance', index: 1, main: false });
    expect(fromParam(side)).toBe('entrance:1');
    const room = parseFrom('214', hsn, byKey, labels)!;
    expect(room).toMatchObject({ kind: 'room', label: 'Room 214' });
    expect(startLevel(room)).toBe(1);
    expect(fromParam(room)).toBe('214');
    expect(parseFrom('entrance:99', hsn, byKey, labels)).toBeNull();
    expect(parseFrom('nope', hsn, byKey, labels)).toBeNull();
    expect(parseFrom(null, hsn, byKey, labels)).toBeNull();
  });
});
