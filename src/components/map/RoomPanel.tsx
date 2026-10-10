// The selected room: what and where it is, where to start walking from, and the directions.
import { useId, useState } from 'react';
import type { MapRoom } from '../../types';
import type { DirectionStep, Directions } from '../../lib/directions';
import { Button, Dot, Spinner } from '../ui';
import DirectionsList from './DirectionsList';
import RoomSearch from './RoomSearch';
import { roomTypeName } from './geometry';

export interface FromOption {
  value: string;
  label: string;
}

interface Props {
  room: MapRoom;
  floorNames: string[];
  /** the user's classes that meet here */
  myClasses: { name: string; color: string }[];
  entranceOptions: FromOption[];
  classOptions: FromOption[];
  /** ?from= while a route is shown */
  from: string | null;
  /** the start picked before asking for directions */
  pendingFrom: string;
  rooms: MapRoom[];
  classNames: Map<string, string[]>;
  routing: boolean;
  routeError: string | null;
  directions: Directions | null;
  onPendingFrom(value: string): void;
  onFrom(value: string): void;
  onSwap: (() => void) | null;
  onClear(): void;
  onClose(): void;
  onStep(step: DirectionStep): void;
  /** the "Start from room" search got focus */
  onSearchFocus?(): void;
}

const OTHER = '__other';

export default function RoomPanel(p: Props) {
  const id = useId();
  const { room } = p;
  const [picking, setPicking] = useState(false);
  const value = p.from ?? p.pendingFrom;
  const known = [...p.entranceOptions, ...p.classOptions].some((o) => o.value === value);
  const custom = !known && value !== OTHER ? p.rooms.find((r) => r.key === value) : undefined;

  const choose = (v: string) => {
    if (v === OTHER) return setPicking(true);
    setPicking(false);
    if (p.from) p.onFrom(v);
    else p.onPendingFrom(v);
  };

  return (
    <div className="mp-room">
      <div className="mp-room-head">
        <div className="mp-room-title">
          <h2>{room.title}</h2>
          <p className="muted small">
            {roomTypeName(room.type)} · {p.floorNames[room.level] ?? `Floor ${room.level + 1}`}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClose} aria-label={`Close ${room.title}`}>
          ✕
        </button>
      </div>
      {p.myClasses.length > 0 && (
        <ul className="mp-room-classes">
          {p.myClasses.map((c) => (
            <li key={c.name}>
              <Dot color={c.color} /> {c.name}
            </li>
          ))}
        </ul>
      )}

      <div className="mp-from">
        <label className="mp-from-label" htmlFor={`${id}-from`}>
          From
        </label>
        <select id={`${id}-from`} value={picking ? OTHER : value} onChange={(e) => choose(e.target.value)}>
          <optgroup label="Entrances">
            {p.entranceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
          {p.classOptions.length > 0 && (
            <optgroup label="My classes">
              {p.classOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
          {custom && <option value={custom.key}>{custom.title}</option>}
          <option value={OTHER}>Another room…</option>
        </select>
        {p.onSwap && (
          <Button small variant="ghost" onClick={p.onSwap} aria-label="Swap start and destination" title="Swap start and destination">
            ⇅
          </Button>
        )}
      </div>
      {picking && (
        <RoomSearch
          rooms={p.rooms}
          floorNames={p.floorNames}
          classNames={p.classNames}
          label="Start from room"
          placeholder="Start from room…"
          autoFocus
          onFocusChange={(f) => f && p.onSearchFocus?.()}
          onPick={(r) => {
            setPicking(false);
            if (p.from) p.onFrom(r.key);
            else p.onPendingFrom(r.key);
          }}
        />
      )}

      {!p.from && (
        <Button variant="primary" className="mp-go" onClick={() => p.onFrom(value === OTHER ? 'entrance' : value)}>
          Directions to here
        </Button>
      )}

      {p.from && (
        <div className="mp-route-out" aria-live="polite">
          {p.routing && <Spinner label="Finding the way…" />}
          {!p.routing && p.routeError && <div className="banner banner-warn">{p.routeError}</div>}
          {!p.routing && p.directions && <DirectionsList directions={p.directions} floorNames={p.floorNames} onStep={p.onStep} />}
          <div className="mp-room-actions">
            <Button small onClick={p.onClear}>
              Clear route
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
