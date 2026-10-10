import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ClassInfo, ClassRoom, SchoolId, SchoolMapData } from '../types';
import { buildRooms, roomMapElsewhere, roomMapKey, stampMapSchool } from './mapData';

const room = (mapKey?: string, mapSchool?: SchoolId): ClassRoom => ({ label: mapKey ?? 'Gym', mapKey, mapSchool });

const cls = (r: ClassRoom, altRooms?: ClassInfo['altRooms']): ClassInfo => ({
  id: 'c1',
  name: 'Chem',
  teacher: { name: '' },
  room: r,
  periods: ['1'],
  altRooms,
  term: 'full',
  color: '#2f6fdf',
  links: [],
  customFields: [],
  createdAt: 1,
  updatedAt: 1,
});

describe('roomMapKey', () => {
  it('gives the key only for the school whose map the room was picked on', () => {
    expect(roomMapKey(room('214', 'hsn'), 'hsn')).toBe('214');
    expect(roomMapKey(room('214', 'cms'), 'cms')).toBe('214');
    expect(roomMapKey(room('214', 'cms'), 'hsn')).toBeUndefined();
    expect(roomMapKey(room('Gym', 'hsn'), 'cms')).toBeUndefined();
  });

  it('counts links saved before rooms kept their school as the current school’s', () => {
    expect(roomMapKey(room('214'), 'hsn')).toBe('214');
    expect(roomMapKey(room('214'), 'cms')).toBe('214');
  });

  it('is undefined for unlinked rooms and schools without a map', () => {
    expect(roomMapKey(room(), 'hsn')).toBeUndefined();
    expect(roomMapKey(undefined, 'hsn')).toBeUndefined();
    expect(roomMapKey(room('214'), 'other')).toBeUndefined();
    expect(roomMapKey(room('214', 'hsn'), 'other')).toBeUndefined();
  });

  it('matters: the shipped maps share keys for different rooms', () => {
    const rooms = (id: string) => buildRooms(JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../public/schools/${id}/map.json`), 'utf8')) as SchoolMapData);
    const hsn = rooms('hsn').find((r) => r.key === '214');
    const cms = rooms('cms').find((r) => r.key === '214');
    expect(hsn && cms).toBeTruthy();
    expect(hsn!.level).not.toBe(cms!.level);
  });
});

describe('roomMapElsewhere', () => {
  it('names the other school a room was picked at', () => {
    expect(roomMapElsewhere(room('214', 'cms'), 'hsn')).toBe('cms');
    expect(roomMapElsewhere(room('214', 'hsn'), 'other')).toBe('hsn');
    expect(roomMapElsewhere(room('214', 'hsn'), 'hsn')).toBeUndefined();
    expect(roomMapElsewhere(room('214'), 'hsn')).toBeUndefined();
    expect(roomMapElsewhere({ label: '214', mapSchool: 'cms' }, 'hsn')).toBeUndefined();
    expect(roomMapElsewhere(undefined, 'hsn')).toBeUndefined();
  });
});

describe('stampMapSchool', () => {
  it('marks links without a school, in the room and the other rooms', () => {
    const c = cls(room('214'), [
      { days: ['A'], room: room('Gym') },
      { days: ['B'], room: room('108', 'cms') },
      { days: ['C'], room: room() },
    ]);
    const out = stampMapSchool(c, 'hsn');
    expect(out.room).toEqual(room('214', 'hsn'));
    expect(out.altRooms!.map((a) => a.room)).toEqual([room('Gym', 'hsn'), room('108', 'cms'), room()]);
    // unchanged rows stay the same objects; the input isn't touched
    expect(out.altRooms![1]).toBe(c.altRooms![1]);
    expect(c.room.mapSchool).toBeUndefined();
    expect(roomMapKey(out.room, 'cms')).toBeUndefined();
  });

  it('returns the class itself when there is nothing to mark', () => {
    const linked = cls(room('214', 'cms'), [{ days: ['A'], room: room('A104', 'hsn') }]);
    expect(stampMapSchool(linked, 'hsn')).toBe(linked);
    const unlinked = cls(room());
    expect(stampMapSchool(unlinked, 'cms')).toBe(unlinked);
    // a school without a map has no rooms to link to
    const legacy = cls(room('214'));
    expect(stampMapSchool(legacy, 'other')).toBe(legacy);
  });
});
