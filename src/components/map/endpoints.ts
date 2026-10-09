// Where a route starts, as it appears in the URL (?from=entrance | entrance:<index> | <room key>)
// and in the "Directions from" picker.
import type { MapRoom, SchoolMapData } from '../../types';
import { roomTarget, type RouteQuery } from '../../lib/nav';
import { toMap, type MapOrientation } from '../../lib/directions';

export type Endpoint = { kind: 'entrance'; index: number; label: string; main: boolean } | { kind: 'room'; room: MapRoom; label: string };

export const MAIN_ENTRANCE_LABEL = 'Front entrance';

/**
 * Display names for data.entrances: the main one is "Front entrance"; names used twice get
 * a side, e.g. "Courtyard Doors (west)" (map right is roughly east at both schools).
 */
export function entranceLabels(data: Pick<SchoolMapData, 'entrances'>, o: MapOrientation | undefined): string[] {
  const groups = new Map<string, number[]>();
  data.entrances.forEach((e, i) => groups.set(e.name, [...(groups.get(e.name) ?? []), i]));
  return data.entrances.map((e, i) => {
    if (e.main) return MAIN_ENTRANCE_LABEL;
    const same = groups.get(e.name)!;
    if (same.length < 2) return e.name;
    const pts = same.map((j) => toMap(o, data.entrances[j].x, data.entrances[j].z));
    const [u, v] = toMap(o, e.x, e.z);
    const us = pts.map((p) => p[0]), vs = pts.map((p) => p[1]);
    const spreadU = Math.max(...us) - Math.min(...us), spreadV = Math.max(...vs) - Math.min(...vs);
    if (same.length === 2) {
      if (spreadU >= spreadV) return `${e.name} (${u === Math.min(...us) ? 'west' : 'east'})`;
      return `${e.name} (${v === Math.min(...vs) ? 'north' : 'south'})`;
    }
    return `${e.name} (${same.indexOf(i) + 1})`;
  });
}

export function mainEntranceIndex(data: Pick<SchoolMapData, 'entrances'>): number {
  return Math.max(0, data.entrances.findIndex((e) => e.main));
}

/** the ?from= value; null when it doesn't name anything on this map */
export function parseFrom(param: string | null, data: Pick<SchoolMapData, 'entrances'>, byKey: Map<string, MapRoom>, labels: string[]): Endpoint | null {
  if (!param) return null;
  if (param === 'entrance' || param.startsWith('entrance:')) {
    const index = param === 'entrance' ? mainEntranceIndex(data) : Number(param.slice(9));
    const e = data.entrances[index];
    if (!Number.isInteger(index) || !e) return null;
    return { kind: 'entrance', index, label: labels[index] ?? e.name, main: e.main };
  }
  const room = byKey.get(param);
  return room ? { kind: 'room', room, label: room.title } : null;
}

export function fromParam(ep: Endpoint): string {
  if (ep.kind === 'room') return ep.room.key;
  return ep.main ? 'entrance' : `entrance:${ep.index}`;
}

/** the floor a route from here starts on */
export function startLevel(ep: Endpoint): number {
  return ep.kind === 'room' ? ep.room.level : 0;
}

export function routeQuery(from: Endpoint, to: MapRoom): RouteQuery {
  return {
    from: from.kind === 'room' ? { point: roomTarget(from.room) } : { entrance: from.index },
    to: roomTarget(to),
    toRect: to.R,
  };
}
