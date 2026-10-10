// Indoor map of HSN / CMS with room search and walking directions. Everything the user picks is
// in the URL (?to=<room key>&from=<entrance | entrance:<i> | room key>&floor=<1|2>), so the Today
// and class pages can deep-link straight to a route and routes can be shared.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { MapRoom, SchoolId } from '../types';
import { Card, Chip, Dot, EmptyState, Page, Spinner } from '../components/ui';
import { useData } from '../data/DataProvider';
import { SCHOOLS } from '../schools';
import { roomMapKey, useSchoolMap } from '../lib/mapData';
import { buildDirections, toMap, type DirectionStep } from '../lib/directions';
import MapCanvas, { type Highlight, type MapFocus } from '../components/map/MapCanvas';
import RoomPanel, { type FromOption } from '../components/map/RoomPanel';
import RoomSearch from '../components/map/RoomSearch';
import { prepareRouting, useRoute } from '../components/map/routeClient';
import { entranceLabels, fromParam, parseFrom, routeQuery, startLevel } from '../components/map/endpoints';
import { padBox, pointsBox, rectBox, type Box, type Insets } from '../components/map/geometry';
import './map.css';

const SHOW_MINE_KEY = 'sdt:map:showClasses';
const PLACE_TYPES = new Set(['media', 'theatre', 'dining', 'gym', 'pool', 'lecture']);

function readPref(): boolean {
  try {
    return localStorage.getItem(SHOW_MINE_KEY) !== '0';
  } catch {
    return true;
  }
}

function writePref(on: boolean) {
  try {
    localStorage.setItem(SHOW_MINE_KEY, on ? '1' : '0');
  } catch {
    // private mode: the toggle just isn't remembered
  }
}

const isNarrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 900px)').matches;

export default function MapPage() {
  const { profile } = useData();
  const school = SCHOOLS[profile.schoolId];
  if (!school.hasMap) return <NoMap />;
  return <SchoolMap key={school.id} schoolId={school.id} />;
}

function NoMap() {
  return (
    <Page title="Map">
      <Card>
        <EmptyState icon="🗺️" title="Maps are available for HSN and CMS">
          School Day Tracker has indoor maps with walking directions for WW-P High School North and Community Middle School. Your school is set to another school, so there's no map to show. You can switch schools in Settings, or explore the 3D models.
        </EmptyState>
        <div className="row mp-nomap-links">
          <Link className="btn btn-primary" to="/settings">
            Change school
          </Link>
          {[SCHOOLS.hsn, SCHOOLS.cms].map((s) => (
            <a key={s.id} className="btn" href={s.model3d} target="_blank" rel="noopener noreferrer">
              {s.short} in 3D ↗
            </a>
          ))}
        </div>
      </Card>
    </Page>
  );
}

function SchoolMap({ schoolId }: { schoolId: SchoolId }) {
  const school = SCHOOLS[schoolId];
  const o = school.mapOrientation;
  const { classes } = useData();
  const map = useSchoolMap(schoolId);
  const { data, rooms, byKey } = map;
  const [params, setParams] = useSearchParams();
  const toKey = params.get('to');
  const fromRaw = params.get('from');
  const floorRaw = params.get('floor');
  const floorNames = useMemo(() => {
    const n = data?.blocked.length ?? 1;
    return Array.from({ length: n }, (_, i) => school.floorNames?.[i] ?? `Floor ${i + 1}`);
  }, [data, school]);

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  useEffect(() => {
    if (data) prepareRouting(schoolId, data);
  }, [data, schoolId]);

  // ------------------------------------------------------------------ selection and route
  const selected = toKey ? (byKey.get(toKey) ?? null) : null;
  const labels = useMemo(() => (data ? entranceLabels(data, o) : []), [data, o]);
  const from = useMemo(() => (data ? parseFrom(fromRaw, data, byKey, labels) : null), [data, fromRaw, byKey, labels]);
  const query = useMemo(() => (from && selected ? routeQuery(from, selected) : null), [from, selected]);
  const routeState = useRoute(schoolId, data, query, query ? `${fromRaw}>${toKey}` : '');
  const route = query ? routeState.route : null;
  const [pendingFrom, setPendingFrom] = useState('entrance');

  const levels = floorNames.length;
  const asked = floorRaw ? parseInt(floorRaw, 10) - 1 : NaN;
  const level = Math.min(levels - 1, Math.max(0, Number.isFinite(asked) ? asked : from && selected ? startLevel(from) : (selected?.level ?? 0)));

  const directions = useMemo(
    () =>
      route && selected && from && data
        ? buildDirections(route, data, rooms, { fromLabel: from.label, fromRoom: from.kind === 'room' ? from.room : null, toRoom: selected, floorNames, orientation: o })
        : null,
    [route, selected, from, data, rooms, floorNames, o],
  );

  // ------------------------------------------------------------------ the user's classes
  const mine = useMemo(() => {
    const byRoom = new Map<string, { name: string; color: string }[]>();
    for (const c of classes) {
      if (c.archived) continue;
      // rooms picked on another school's map aren't on this one (even when a key like '214' is)
      const keys = new Set([c.room, ...(c.altRooms ?? []).map((a) => a.room)].map((r) => roomMapKey(r, schoolId)));
      for (const k of keys) if (k && byKey.has(k)) byRoom.set(k, [...(byRoom.get(k) ?? []), { name: c.name, color: c.color }]);
    }
    return byRoom;
  }, [classes, byKey, schoolId]);
  const classNames = useMemo(() => new Map([...mine].map(([k, cs]) => [k, cs.map((c) => c.name)])), [mine]);
  const [showMine, setShowMine] = useState(readPref);
  const highlights = useMemo<Highlight[]>(() => (showMine ? [...mine].map(([key, cs]) => ({ key, color: cs[0].color, name: cs.map((c) => c.name).join(' / ') })) : []), [mine, showMine]);

  const entranceOptions = useMemo<FromOption[]>(() => {
    if (!data) return [];
    const opts = data.entrances.map((e, i) => ({ value: e.main ? 'entrance' : `entrance:${i}`, label: labels[i], main: e.main }));
    return [...opts.filter((x) => x.main), ...opts.filter((x) => !x.main).sort((a, b) => a.label.localeCompare(b.label))].map(({ value, label }) => ({ value, label }));
  }, [data, labels]);
  const classOptions = useMemo<FromOption[]>(() => {
    const out: FromOption[] = [];
    for (const c of classes) {
      const key = c.archived ? undefined : roomMapKey(c.room, schoolId);
      const r = key ? byKey.get(key) : undefined;
      if (r && r.key !== selected?.key && !out.some((x) => x.value === r.key)) out.push({ value: r.key, label: `${c.name} (${r.title})` });
    }
    return out;
  }, [classes, byKey, selected, schoolId]);

  const places = useMemo(() => {
    const seen = new Set<string>();
    return rooms
      .filter((r) => r.level === 0 && (r.big || PLACE_TYPES.has(r.type) || /^(main office|nurse|guidance)/i.test(r.name)))
      .filter((r) => !seen.has(r.name) && seen.add(r.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rooms]);

  // ------------------------------------------------------------------ where the map looks
  const [focus, setFocus] = useState<MapFocus>({ id: 0, box: null });
  // at least `min` meters across, so there's always some context around a room or a short route
  const focusOn = useCallback((box: Box | null, min = 40) => setFocus((f) => ({ id: f.id + 1, box: box && padBox(box, Math.max(0, min / 2 - (box.u1 - box.u0) / 2, min / 2 - (box.v1 - box.v0) / 2)) })), []);
  const roomBox = useCallback((r: MapRoom) => padBox(rectBox(o, r.R), 12), [o]);
  const skipRouteFit = useRef(false);

  // a deep link to a room (without a route) opens on that room
  const opened = useRef(false);
  useEffect(() => {
    if (!data || opened.current) return;
    opened.current = true;
    if (selected && !query) focusOn(roomBox(selected), 70);
    // only when the map first loads
  }, [data]);

  // a route fits on screen, one floor at a time
  useEffect(() => {
    if (!route) return;
    if (skipRouteFit.current) {
      skipRouteFit.current = false;
      return;
    }
    const pts = route.points.filter((p) => p.level === level).map((p) => toMap(o, p.x, p.z));
    focusOn(pointsBox(pts, 5) ?? (selected ? roomBox(selected) : null));
  }, [route, level]);

  // ------------------------------------------------------------------ mobile sheet
  const sheetRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // the map's own overlays (the scale bar) sit just above the bottom sheet on phones
  useEffect(() => {
    const sheet = sheetRef.current, shell = shellRef.current;
    if (!sheet || !shell || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => shell.style.setProperty('--mp-sheet', `${sheet.offsetHeight}px`));
    ro.observe(sheet);
    return () => ro.disconnect();
  }, []);
  const getInsets = useCallback((): Insets => {
    if (isNarrow()) return { top: 60, right: 60, bottom: (sheetRef.current?.offsetHeight ?? 0) + 36, left: 16 };
    return { top: 64, right: 64, bottom: 40, left: 24 };
  }, []);

  // ------------------------------------------------------------------ actions
  const pickRoom = (r: MapRoom | null, move: boolean) => {
    if (!r) return update({ to: null, from: null });
    if (fromRaw) setPendingFrom(fromRaw);
    update({ to: r.key, from: null, floor: String(r.level + 1) });
    if (move) focusOn(roomBox(r), 70);
    setSheetOpen(false);
  };
  const go = (v: string) => {
    const ep = data ? parseFrom(v, data, byKey, labels) : null;
    setPendingFrom(v);
    update({ from: v, floor: ep ? String(startLevel(ep) + 1) : null });
  };
  const swap =
    from?.kind === 'room' && selected
      ? () => {
          update({ from: selected.key, to: from.room.key, floor: String(selected.level + 1) });
        }
      : null;
  const onStep = (s: DirectionStep) => {
    if (s.level !== level) {
      skipRouteFit.current = true;
      update({ floor: String(s.level + 1) });
    }
    const [u, v] = toMap(o, s.at.x, s.at.z);
    focusOn({ u0: u, v0: v, u1: u, v1: v });
    if (isNarrow()) setSheetOpen(false);
  };
  const toggleMine = () => {
    setShowMine((on) => {
      writePref(!on);
      return !on;
    });
  };

  const routeLevels = useMemo(() => new Set(route?.points.map((p) => p.level) ?? []), [route]);
  const badTo = !!data && !!toKey && !selected;
  const badFrom = !!data && !!fromRaw && !from;

  return (
    <Page
      wide
      title={`${school.short} map`}
      actions={
        school.model3d && (
          <a className="btn btn-sm" href={school.model3d} target="_blank" rel="noopener noreferrer">
            Walk it in 3D ↗
          </a>
        )
      }
    >
      <div className="mp-shell" ref={shellRef} data-sheet={sheetOpen ? 'open' : 'peek'}>
        <div className="mp-stage">
          {map.loading && (
            <div className="mp-center">
              <Spinner label="Loading the map…" />
            </div>
          )}
          {map.error && (
            <div className="mp-center">
              <div className="banner banner-error" role="alert">
                {map.error}
              </div>
            </div>
          )}
          {data && (
            <MapCanvas
              data={data}
              rooms={rooms}
              level={level}
              orientation={o}
              northDeg={school.northDeg ?? 0}
              label={`${school.short} map, ${floorNames[level]}`}
              floorNames={floorNames}
              selected={selected}
              route={route}
              highlights={highlights}
              focus={focus}
              getInsets={getInsets}
              onPickRoom={(r) => pickRoom(r, false)}
              onLevel={(lv) => update({ floor: String(lv + 1) })}
            >
              {levels > 1 && (
                <div className="segmented mp-floors" role="group" aria-label="Floor">
                  {floorNames.map((n, i) => (
                    <button key={i} type="button" aria-pressed={i === level} onClick={() => update({ floor: String(i + 1) })}>
                      {n}
                      {route && i !== level && routeLevels.has(i) && <span className="mp-floor-dot" aria-label=" (route continues here)" />}
                    </button>
                  ))}
                </div>
              )}
              {mine.size > 0 && (
                <Chip color="var(--accent)" active={showMine} onClick={toggleMine}>
                  My classes
                </Chip>
              )}
            </MapCanvas>
          )}
        </div>

        <aside ref={sheetRef} className="mp-panel" data-open={sheetOpen} data-room={!!selected} aria-label="Rooms and directions">
          <button type="button" className="mp-sheet-handle" aria-expanded={sheetOpen} aria-label={sheetOpen ? 'Show less' : 'Show more'} onClick={() => setSheetOpen((v) => !v)}>
            <span aria-hidden />
          </button>
          <div className="mp-panel-body">
            {data && <RoomSearch rooms={rooms} floorNames={floorNames} classNames={classNames} label="Search rooms" onPick={(r) => pickRoom(r, true)} onFocusChange={(f) => f && setSheetOpen(true)} />}
            {badTo && <div className="banner banner-warn">Couldn't find room “{toKey}” on the {school.short} map.</div>}
            {badFrom && selected && <div className="banner banner-warn">Couldn't find the starting point “{fromRaw}”. Pick one below.</div>}
            {data && selected && (
              <RoomPanel
                key={selected.key}
                room={selected}
                floorNames={floorNames}
                myClasses={mine.get(selected.key) ?? []}
                entranceOptions={entranceOptions}
                classOptions={classOptions}
                from={from ? fromParam(from) : null}
                pendingFrom={pendingFrom}
                rooms={rooms}
                classNames={classNames}
                routing={routeState.loading}
                routeError={routeState.error}
                directions={directions}
                onPendingFrom={setPendingFrom}
                onFrom={go}
                onSwap={swap}
                onClear={() => update({ from: null })}
                onClose={() => update({ to: null, from: null })}
                onStep={onStep}
                onSearchFocus={() => setSheetOpen(true)}
              />
            )}
            {data && !selected && (
              <div className="mp-idle">
                <p className="muted small">Search for a room or tap one on the map to get walking directions.</p>
                {mine.size > 0 && (
                  <section>
                    <h3>My classes</h3>
                    <ul className="mp-quick">
                      {[...mine].map(([key, cs]) => {
                        const r = byKey.get(key)!;
                        return (
                          <li key={key}>
                            <button type="button" onClick={() => pickRoom(r, true)}>
                              <Dot color={cs[0].color} />
                              <span className="mp-quick-name">{cs.map((c) => c.name).join(' / ')}</span>
                              <span className="muted small">
                                {r.title} · {floorNames[r.level]}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                {places.length > 0 && (
                  <section>
                    <h3>Places</h3>
                    <div className="mp-places">
                      {places.map((r) => (
                        <button key={r.key} type="button" className="chip" onClick={() => pickRoom(r, true)}>
                          {r.name}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </Page>
  );
}
