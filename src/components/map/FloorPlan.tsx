// The static part of a floor: footprint, courtyards, rooms by type, stairs, walls and room
// labels. Everything is in map meters and memoized per floor, so panning and zooming only
// changes the transform of the group around it.
import { memo, useMemo } from 'react';
import type { MapRoom, Rect, SchoolMapData } from '../../types';
import type { MapOrientation } from '../../lib/directions';
import { footprintHoles, rectsPath, roomLabels, wallsPath, zoomBucket, type Label } from './geometry';

interface FloorProps {
  data: SchoolMapData;
  rooms: MapRoom[];
  level: number;
  orientation: MapOrientation | undefined;
  hatchId: string;
}

// built once per school and floor, so switching floors back and forth is instant
const cache = new WeakMap<object, Map<string, unknown>>();
function cached<T>(owner: object, key: string, make: () => T): T {
  let m = cache.get(owner);
  if (!m) cache.set(owner, (m = new Map()));
  if (!m.has(key)) m.set(key, make());
  return m.get(key) as T;
}

export const FloorPlan = memo(function FloorPlan({ data, rooms, level, orientation: o, hatchId }: FloorProps) {
  const ground = cached(data, `ground|${o}`, () => rectsPath(o, [...data.blocks, ...footprintHoles(data.blocks)]));
  const g = cached(rooms, `floor|${level}|${o}`, () => {
    const byType = new Map<string, Rect[]>();
    const stairs: Rect[] = [];
    for (const r of rooms) {
      if (r.level !== level) continue;
      if (r.type === 'stair') stairs.push(r.R);
      else byType.set(r.type, [...(byType.get(r.type) ?? []), r.R]);
    }
    return {
      upper: level > 0 ? rectsPath(o, data.level1) : '',
      courts: rectsPath(o, data.courtyards),
      types: [...byType].map(([t, rs]) => [t, rectsPath(o, rs)] as const),
      stairs: rectsPath(o, stairs),
      walls: wallsPath(o, data.walls[level] ?? []),
    };
  });
  return (
    <g className="mp-floor">
      <path className={level > 0 ? 'mp-ground mp-ground-below' : 'mp-ground'} d={ground} />
      {level > 0 && <path className="mp-ground" d={g.upper} />}
      <path className="mp-court" d={g.courts} />
      {g.types.map(([t, d]) => (
        <path key={t} className={`mp-room t-${t}`} d={d} />
      ))}
      <path className="mp-room t-stair" d={g.stairs} />
      <path className="mp-hatch" d={g.stairs} fill={`url(#${hatchId})`} />
      <path className="mp-walls" d={g.walls} />
    </g>
  );
});

const LabelGroup = memo(function LabelGroup({ labels, hidden }: { labels: Label[]; hidden: boolean }) {
  return (
    <g visibility={hidden ? 'hidden' : undefined}>
      {labels.map((l) => (
        <text key={l.key} x={l.u} y={l.v} fontSize={l.size} transform={l.vertical ? `rotate(-90 ${l.u} ${l.v})` : undefined}>
          {l.text}
        </text>
      ))}
    </g>
  );
});

/** room labels, shown once they're big enough to read at the current zoom */
export const FloorLabels = memo(function FloorLabels({ rooms, level, orientation, k, hideKeys }: { rooms: MapRoom[]; level: number; orientation: MapOrientation | undefined; k: number; hideKeys?: string }) {
  const groups = useMemo(() => {
    const hide = new Set(hideKeys ? hideKeys.split('\n') : []);
    const m = new Map<number, Label[]>();
    for (const l of cached(rooms, `labels|${level}|${orientation}`, () => roomLabels(orientation, rooms, level))) {
      if (hide.has(l.key)) continue;
      const b = Math.ceil(Math.log2(l.minK) * 3);
      m.set(b, [...(m.get(b) ?? []), l]);
    }
    return [...m].sort((a, b) => a[0] - b[0]);
  }, [rooms, level, orientation, hideKeys]);
  const bucket = zoomBucket(k);
  return (
    <g className="mp-labels" aria-hidden>
      {groups.map(([b, ls]) => (
        <LabelGroup key={b} labels={ls} hidden={b > bucket} />
      ))}
    </g>
  );
});
