import { describe, expect, it } from 'vitest';
import type { MapRoom } from '../../types';
import { keepFrom, type Endpoint } from './endpoints';

const room = (key: string) => ({ key, title: `Room ${key}` }) as MapRoom;
const fromRoom = (key: string): Endpoint => ({ kind: 'room', room: room(key), label: `Room ${key}` });
const entrance = (index: number, main: boolean): Endpoint => ({ kind: 'entrance', index, label: 'Gym doors', main });

describe('keepFrom (the From picker after picking a destination)', () => {
  it('keeps a real start from the link', () => {
    expect(keepFrom(fromRoom('A101'), 'A101', 'entrance', '214')).toBe('A101');
    expect(keepFrom(entrance(3, false), 'entrance:3', 'entrance', '214')).toBe('entrance:3');
  });

  it("falls back to the front entrance when the link's start isn't on the map", () => {
    expect(keepFrom(null, 'nope', 'entrance', '118')).toBe('entrance');
    expect(keepFrom(null, 'nope', 'A101', '118')).toBe('entrance');
  });

  it('keeps what the picker had when the link has no start', () => {
    expect(keepFrom(null, null, 'entrance:2', '214')).toBe('entrance:2');
  });

  it('never starts from the destination itself', () => {
    expect(keepFrom(fromRoom('214'), '214', 'entrance', '214')).toBe('entrance');
    expect(keepFrom(null, null, 'A101', 'A101')).toBe('entrance');
  });
});
