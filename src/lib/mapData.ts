// Loads a school's map.json and gives every room a stable key and a display title.
// Keys are what ClassInfo.room.mapKey stores, so they must not change between data exports:
// a room's label when it's unique ('214', 'A104'), otherwise name/label + floor (+ a counter).
import { useEffect, useState } from 'react';
import type { MapRoom, MapRoomRaw, SchoolId, SchoolMapData } from '../types';
import { loadSchoolMap, SCHOOLS } from '../schools';

/** room types people look for by name (not restrooms, closets, ...) */
export const NAMED_TYPES = new Set(['class', 'lab', 'art', 'music', 'lecture', 'office', 'media', 'theatre', 'dining', 'pool', 'gym', 'weights', 'locker', 'kitchen']);

export function roomTitle(r: MapRoomRaw): string {
  if (r.label && /^[A-Z]?\d/.test(r.label)) return r.name && r.name !== `Room ${r.label}` ? `${r.label} · ${r.name}` : `Room ${r.label}`;
  return r.name || r.label || r.type;
}

export function buildRooms(data: SchoolMapData): MapRoom[] {
  const count = new Map<string, number>();
  const base = (r: MapRoomRaw) => (r.label || r.name || r.type).trim();
  for (const r of data.rooms) count.set(base(r), (count.get(base(r)) ?? 0) + 1);
  const used = new Map<string, number>();
  return data.rooms.map((r) => {
    let key = base(r);
    if ((count.get(key) ?? 0) > 1) {
      key = `${key}@${r.level + 1}`;
      const n = (used.get(key) ?? 0) + 1;
      used.set(key, n);
      if (n > 1) key = `${key}#${n}`;
    }
    return { ...r, key, title: roomTitle(r) };
  });
}

/** case-insensitive match on label, name, title and key; numbers match room labels first */
export function searchRooms(rooms: MapRoom[], q: string, limit = 20): MapRoom[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const scored: [number, MapRoom][] = [];
  for (const r of rooms) {
    if (r.type === 'stair') continue;
    const label = r.label.toLowerCase(), name = r.name.toLowerCase();
    let score = -1;
    if (label === s) score = 0;
    else if (label.startsWith(s)) score = 1;
    else if (name === s) score = 2;
    else if (name.startsWith(s)) score = 3;
    else if (name.includes(s) || r.title.toLowerCase().includes(s)) score = 4;
    if (score >= 0) scored.push([score + (NAMED_TYPES.has(r.type) ? 0 : 0.5), r]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].title.localeCompare(b[1].title, undefined, { numeric: true })).slice(0, limit).map((x) => x[1]);
}

export interface SchoolMapState {
  data: SchoolMapData | null;
  rooms: MapRoom[];
  byKey: Map<string, MapRoom>;
  loading: boolean;
  error: string | null;
}

export function useSchoolMap(schoolId: SchoolId): SchoolMapState {
  const [state, setState] = useState<SchoolMapState>({ data: null, rooms: [], byKey: new Map(), loading: SCHOOLS[schoolId].hasMap, error: null });
  useEffect(() => {
    if (!SCHOOLS[schoolId].hasMap) {
      setState({ data: null, rooms: [], byKey: new Map(), loading: false, error: null });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadSchoolMap(schoolId)
      .then((data) => {
        if (!live) return;
        const rooms = buildRooms(data);
        setState({ data, rooms, byKey: new Map(rooms.map((r) => [r.key, r])), loading: false, error: null });
      })
      .catch((e: Error) => live && setState({ data: null, rooms: [], byKey: new Map(), loading: false, error: e.message }));
    return () => {
      live = false;
    };
  }, [schoolId]);
  return state;
}
