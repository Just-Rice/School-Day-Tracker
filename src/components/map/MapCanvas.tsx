// The interactive floor map: an SVG in screen pixels with one transformed group in map meters.
// Drag / touch to pan, wheel / pinch / buttons to zoom, tap a room to pick it. The floor plan
// itself is memoized, so a pan or zoom only re-renders the transform and a few markers.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MapRoom, SchoolMapData } from '../../types';
import type { NavRoute } from '../../lib/nav';
import { toMap, type MapOrientation } from '../../lib/directions';
import { FloorLabels, FloorPlan } from './FloorPlan';
import { clampView, fitView, fromMap, rectBox, roomAt, scaleBar, schoolBox, zoomAt, type Box, type Insets, type View } from './geometry';

export interface Highlight {
  key: string;
  color: string;
  name: string;
}

export interface MapFocus {
  /** changes whenever the map should move */
  id: number;
  /** null: the whole school */
  box: Box | null;
}

interface Props {
  data: SchoolMapData;
  rooms: MapRoom[];
  level: number;
  orientation: MapOrientation | undefined;
  northDeg: number;
  /** 'HSN, 1st floor', for screen readers */
  label: string;
  floorNames: string[];
  selected: MapRoom | null;
  route: NavRoute | null;
  highlights: Highlight[];
  focus: MapFocus;
  /** space taken by overlays, kept clear when fitting */
  getInsets?: () => Insets;
  onPickRoom(room: MapRoom | null): void;
  onLevel(level: number): void;
  /** overlay controls drawn in the top-left corner */
  children?: ReactNode;
}

const MAX_K = 40;
const ZOOM_STEP = 1.6;
/** a tap waits this long before picking a room, so a double-click can zoom in instead */
const DOUBLE_MS = 250;

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** black or white, whichever reads better on a class color */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? '#111' : '#fff';
}

export default function MapCanvas(props: Props) {
  const { data, rooms, level, orientation: o, selected, route, highlights, focus, getInsets, onPickRoom, onLevel } = props;
  const uid = useId().replace(/:/g, '');
  const hatchId = `hatch-${uid}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setViewState] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  const anim = useRef(0);

  const bounds = useMemo(() => schoolBox(data, o), [data, o]);
  const fitAll = useMemo(() => (size ? fitView(bounds, size.w, size.h) : null), [bounds, size]);
  const minK = fitAll ? fitAll.k * 0.6 : 0.1;

  const setView = useCallback(
    (v: View) => {
      if (!size) return;
      const c = clampView(v, bounds, size.w, size.h, minK, MAX_K);
      viewRef.current = c;
      setViewState(c);
    },
    [size, bounds, minK],
  );

  const insets = useCallback((): Insets => getInsets?.() ?? { top: 12, right: 12, bottom: 12, left: 12 }, [getInsets]);

  const animateTo = useCallback(
    (target: View) => {
      cancelAnimationFrame(anim.current);
      const from = viewRef.current;
      if (!from || !size || reducedMotion()) return setView(target);
      const { w, h } = size;
      // move the center in map space and the zoom in log space, so it doesn't swing around
      const c0 = [(w / 2 - from.tx) / from.k, (h / 2 - from.ty) / from.k], c1 = [(w / 2 - target.tx) / target.k, (h / 2 - target.ty) / target.k];
      const t0 = performance.now(), dur = 320;
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
        const k = Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e);
        const cu = c0[0] + (c1[0] - c0[0]) * e, cv = c0[1] + (c1[1] - c0[1]) * e;
        setView({ k, tx: w / 2 - cu * k, ty: h / 2 - cv * k });
        if (t < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [setView, size],
  );

  // size
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize((s) => (s && Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // move to the requested focus (and fit the first time the map has a size)
  const fitted = useRef<{ id: number; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!size) return;
    const f = fitted.current;
    if (f && f.id === focus.id) {
      if (Math.abs(f.w - size.w) > 1 || Math.abs(f.h - size.h) > 1) {
        // keep the same middle when the viewport changes size
        const v = viewRef.current;
        if (v) setView({ k: v.k, tx: v.tx + (size.w - f.w) / 2, ty: v.ty + (size.h - f.h) / 2 });
        fitted.current = { id: focus.id, w: size.w, h: size.h };
      }
      return;
    }
    const target = fitView(focus.box ?? bounds, size.w, size.h, insets(), focus.box ? 9 : MAX_K);
    if (!viewRef.current) setView(target);
    else animateTo(target);
    fitted.current = { id: focus.id, w: size.w, h: size.h };
  }, [focus, size, bounds, insets, setView, animateTo]);

  // a tap's room pick, waiting to see whether it's the first half of a double-click
  const pendingPick = useRef(0);
  const cancelPick = () => {
    clearTimeout(pendingPick.current);
    pendingPick.current = 0;
  };

  useEffect(
    () => () => {
      cancelAnimationFrame(anim.current);
      clearTimeout(pendingPick.current);
    },
    [],
  );

  // ------------------------------------------------------------------------- input
  const zoomBy = useCallback(
    (f: number, px?: number, py?: number) => {
      const v = viewRef.current;
      if (!v || !size) return;
      cancelAnimationFrame(anim.current);
      setView(zoomAt(v, f, px ?? size.w / 2, py ?? size.h / 2));
    },
    [setView, size],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      zoomBy(Math.exp(-Math.max(-300, Math.min(300, dy)) * (e.ctrlKey ? 0.01 : 0.0022)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: View; x: number; y: number; d: number } | null>(null);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const startGesture = () => {
    const v = viewRef.current;
    const ps = [...ptrs.current.values()];
    if (!v || !ps.length) return (gesture.current = null);
    const x = ps.reduce((s, p) => s + p.x, 0) / ps.length, y = ps.reduce((s, p) => s + p.y, 0) / ps.length;
    const d = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    gesture.current = { view: v, x, y, d };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as Element).closest('[data-map-control]')) return;
    cancelAnimationFrame(anim.current);
    // pressing again right after a tap: a double-click (it zooms), not a pick
    cancelPick();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    press.current = ptrs.current.size === 1 ? { ...p, moved: false } : press.current && { ...press.current, moved: true };
    startGesture();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    const ps = [...ptrs.current.values()];
    const x = ps.reduce((s, q) => s + q.x, 0) / ps.length, y = ps.reduce((s, q) => s + q.y, 0) / ps.length;
    if (press.current && !press.current.moved && Math.hypot(p.x - press.current.x, p.y - press.current.y) > 6) {
      press.current.moved = true;
      setDragging(true);
    }
    if (!press.current?.moved) return;
    let v: View = { ...g.view, tx: g.view.tx + x - g.x, ty: g.view.ty + y - g.y };
    if (ps.length > 1 && g.d > 0) {
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      v = zoomAt(v, d / g.d, x, y);
    }
    setView(v);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.delete(e.pointerId);
    const pr = press.current;
    if (!ptrs.current.size) {
      press.current = null;
      setDragging(false);
      if (pr && !pr.moved && e.type === 'pointerup') tap(local(e));
    }
    startGesture();
  };

  const tap = (p: { x: number; y: number }) => {
    const v = viewRef.current;
    if (!v) return;
    const [x, z] = fromMap(o, (p.x - v.tx) / v.k, (p.y - v.ty) / v.k);
    const r = roomAt(rooms, level, x, z);
    if (!r && route) return;
    cancelPick();
    pendingPick.current = window.setTimeout(() => {
      pendingPick.current = 0;
      onPickRoom(r);
    }, DOUBLE_MS);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = viewRef.current;
    if (!v || e.target !== e.currentTarget) return;
    const pan = (dx: number, dy: number) => setView({ ...v, tx: v.tx + dx, ty: v.ty + dy });
    const keys: Record<string, () => void> = {
      ArrowLeft: () => pan(60, 0),
      ArrowRight: () => pan(-60, 0),
      ArrowUp: () => pan(0, 60),
      ArrowDown: () => pan(0, -60),
      '+': () => zoomBy(ZOOM_STEP),
      '=': () => zoomBy(ZOOM_STEP),
      '-': () => zoomBy(1 / ZOOM_STEP),
      '0': () => fitAll && animateTo(fitView(bounds, size!.w, size!.h, insets())),
    };
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  // ------------------------------------------------------------------------- route geometry
  const routeGeo = useMemo(() => {
    if (!route) return null;
    const pts = route.points;
    const paths: string[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a.level !== b.level) continue;
      const [u0, v0] = toMap(o, a.x, a.z), [u1, v1] = toMap(o, b.x, b.z);
      const contiguous = i > 1 && pts[i - 2].level === a.level;
      paths[a.level] = (paths[a.level] ?? '') + (contiguous ? '' : `M${u0.toFixed(2)} ${v0.toFixed(2)}`) + `L${u1.toFixed(2)} ${v1.toFixed(2)}`;
    }
    const at = (i: number) => {
      const p = pts[i];
      const [u, v] = toMap(o, p.x, p.z);
      return { u, v, level: p.level };
    };
    const stairs = route.stairs.flatMap((s) => [
      { ...at(s.start), go: s.to, up: s.to > s.from, id: s.id },
      { ...at(s.end), go: s.from, up: s.from > s.to, id: s.id },
    ]);
    return { paths, start: at(0), end: at(pts.length - 1), stairs };
  }, [route, o]);

  const hl = useMemo(
    () =>
      highlights
        .map((h) => ({ h, room: rooms.find((r) => r.key === h.key) }))
        .filter((x): x is { h: Highlight; room: MapRoom } => !!x.room && x.room.level === level)
        .map(({ h, room }) => ({ h, box: rectBox(o, room.R) })),
    [highlights, rooms, level, o],
  );
  const selBox = selected && selected.level === level ? rectBox(o, selected.R) : null;
  // rooms with a class pill or the pin's label don't need their own label too
  const hideKeys = useMemo(() => [...hl.map((x) => x.h.key), ...(selBox && selected ? [selected.key] : [])].join('\n'), [hl, selBox, selected]);
  // without a route the pin marks the selected room's door
  const selPin = selected && selected.level === level ? (selected.target ? toMap(o, selected.target[0], selected.target[1]) : toMap(o, (selected.R[0] + selected.R[2]) / 2, (selected.R[1] + selected.R[3]) / 2)) : null;

  const entrances = useMemo(() => data.entrances.map((e) => ({ ...e, uv: toMap(o, e.x, e.z) })), [data, o]);
  const spawnUV = useMemo(() => toMap(o, data.spawn[0], data.spawn[1]), [data, o]);

  const k = view?.k ?? 1;
  const inv = 1 / k;
  const at = (u: number, v: number) => `translate(${u} ${v}) scale(${inv})`;
  const sb = scaleBar(k);
  const floorName = (lv: number) => props.floorNames[lv] ?? `Floor ${lv + 1}`;

  return (
    <div
      ref={wrapRef}
      className={'mp-canvas' + (dragging ? ' is-dragging' : '')}
      tabIndex={0}
      role="application"
      aria-roledescription="map"
      aria-label={`${props.label}. Arrow keys pan, plus and minus zoom, 0 fits the school.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={(e) => {
        cancelPick();
        const p = local(e);
        zoomBy(2, p.x, p.y);
      }}
    >
      <svg className="mp-svg" width="100%" height="100%">
        <defs>
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width="0.9" height="0.9" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.9" className="mp-hatch-line" strokeWidth="0.22" />
          </pattern>
        </defs>
        {view && (
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            <g aria-hidden>
              <FloorPlan data={data} rooms={rooms} level={level} orientation={o} hatchId={hatchId} />
              {hl.map(({ h, box }) => (
                <rect key={h.key} className="mp-mine" x={box.u0} y={box.v0} width={box.u1 - box.u0} height={box.v1 - box.v0} style={{ fill: h.color, stroke: h.color }} />
              ))}
              {selBox && <rect className="mp-selected" x={selBox.u0} y={selBox.v0} width={selBox.u1 - selBox.u0} height={selBox.v1 - selBox.v0} />}
              <FloorLabels rooms={rooms} level={level} orientation={o} k={k} hideKeys={hideKeys} />
              {routeGeo &&
                routeGeo.paths.map((d, lv) =>
                  d && lv !== level ? <path key={'o' + lv} className="mp-route-other" d={d} /> : null,
                )}
              {routeGeo?.paths[level] && (
                // keyed by floor, so the flow animation plays again on the other floor
                <g key={level} className="mp-route">
                  <path className="mp-route-casing" d={routeGeo.paths[level]} />
                  <path className="mp-route-line" d={routeGeo.paths[level]} />
                  <path className="mp-route-flow" d={routeGeo.paths[level]} />
                </g>
              )}

              {/* markers keep their screen size */}
              {level === 0 &&
                entrances.map((e, i) => {
                  if (!e.main) {
                    return (
                      <g key={i} transform={at(e.uv[0], e.uv[1])} className="mp-entrance">
                        <title>{e.name}</title>
                        <circle r="3.5" />
                      </g>
                    );
                  }
                  // the label goes on the outside, away from the doors
                  const ang = Math.atan2(e.uv[1] - spawnUV[1], e.uv[0] - spawnUV[0]);
                  const lx = -Math.cos(ang) * 22, ly = -Math.sin(ang) * 22;
                  return (
                    <g key={i} transform={at(...spawnUV)} className="mp-entrance-main">
                      <circle r="9" />
                      <path d="M4.5 0 L-3.5 -4.5 L-3.5 4.5 Z" className="mp-entrance-arrow" transform={`rotate(${Math.round((ang * 180) / Math.PI)})`} />
                      <text x={lx} y={ly + 4} textAnchor={Math.abs(lx) < 8 ? 'middle' : lx > 0 ? 'start' : 'end'} className="mp-pin-text">
                        Front entrance
                      </text>
                    </g>
                  );
                })}
              {hl.map(({ h, box }) => {
                const name = h.name.length > 16 ? h.name.slice(0, 15) + '…' : h.name;
                const w = name.length * 6.4 + 12;
                return (
                  <g key={'p' + h.key} transform={at((box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2)} className="mp-mine-pill">
                    <rect x={-w / 2} y="-9" width={w} height="18" rx="9" style={{ fill: h.color }} />
                    <text y="4" style={{ fill: inkOn(h.color) }}>
                      {name}
                    </text>
                  </g>
                );
              })}
            </g>
            {routeGeo &&
              routeGeo.stairs
                .filter((s) => s.level === level)
                .map((s, i) => (
                  <g
                    key={'s' + i}
                    data-map-control
                    transform={at(s.u, s.v)}
                    className="mp-stairs-btn"
                    role="button"
                    tabIndex={0}
                    aria-label={`Show the ${floorName(s.go)}`}
                    onClick={() => onLevel(s.go)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onLevel(s.go);
                      }
                    }}
                  >
                    <rect x="-8" y="-30" width={floorName(s.go).length * 6.6 + 26} height="22" rx="11" />
                    <text x="3" y="-15">
                      {(s.up ? '↑ ' : '↓ ') + floorName(s.go)}
                    </text>
                    <circle r="5" />
                  </g>
                ))}
            <g aria-hidden>
              {routeGeo && (
                <g transform={at(routeGeo.start.u, routeGeo.start.v)} className={'mp-start' + (routeGeo.start.level === level ? '' : ' is-other')}>
                  <circle r="8" />
                  <circle r="3" className="mp-start-dot" />
                </g>
              )}
              {(routeGeo || selPin) && (
                <g
                  transform={at(...((routeGeo ? [routeGeo.end.u, routeGeo.end.v] : selPin!) as [number, number]))}
                  className={'mp-pin' + (routeGeo && routeGeo.end.level !== level ? ' is-other' : '')}
                >
                  <path d="M0 0 C-2 -6 -10 -11 -10 -19 A10 10 0 1 1 10 -19 C10 -11 2 -6 0 0 Z" />
                  <circle cy="-19" r="4" className="mp-pin-dot" />
                  {selected && (
                    <text x="14" y="-15" className="mp-pin-text">
                      {selected.title}
                    </text>
                  )}
                </g>
              )}
            </g>
          </g>
        )}
      </svg>

      <div className="mp-overlay mp-tl" data-map-control>
        {props.children}
      </div>
      <div className="mp-overlay mp-tr" data-map-control>
        <div className="mp-compass" role="img" aria-label={props.northDeg ? `Compass: north is ${Math.abs(props.northDeg)}° ${props.northDeg < 0 ? 'left' : 'right'} of up` : 'Compass: north is up'}>
          <svg viewBox="-20 -20 40 40" width="40" height="40" aria-hidden>
            <g transform={`rotate(${props.northDeg})`}>
              <text y="-10.5" className="mp-compass-text">
                N
              </text>
              <path d="M0 -5 L4.5 5 L-4.5 5 Z" className="mp-compass-n" />
              <path d="M0 15 L4.5 5 L-4.5 5 Z" className="mp-compass-s" />
            </g>
          </svg>
        </div>
        <div className="mp-zoom">
          <button type="button" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">
            +
          </button>
          <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => size && animateTo(fitView(bounds, size.w, size.h, insets()))} aria-label="Fit the whole school" title="Fit the whole school">
            ⤢
          </button>
        </div>
      </div>
      {view && (
        <div className="mp-overlay mp-scale" data-map-control aria-hidden>
          <div className="mp-scale-bar" style={{ width: sb.px }} />
          <span>
            {sb.meters} m · {Math.round(sb.meters * 3.28084)} ft
          </span>
        </div>
      )}
    </div>
  );
}
