// Room search box (an ARIA combobox): matches room numbers and names, and the names of the
// user's own classes ("chem" finds the AP Chemistry room).
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { MapRoom } from '../../types';
import { searchRooms } from '../../lib/mapData';
import { roomTypeName } from './geometry';

interface Props {
  rooms: MapRoom[];
  floorNames: string[];
  onPick(room: MapRoom): void;
  /** room key -> names of the user's classes there */
  classNames?: Map<string, string[]>;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  onFocusChange?(focused: boolean): void;
}

export default function RoomSearch({ rooms, floorNames, onPick, classNames, label, placeholder, autoFocus, onFocusChange }: Props) {
  const id = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const mine: MapRoom[] = [];
    if (classNames)
      for (const [key, names] of classNames)
        if (names.some((n) => n.toLowerCase().includes(s))) {
          const r = rooms.find((x) => x.key === key);
          if (r) mine.push(r);
        }
    const rest = searchRooms(rooms, q, 12).filter((r) => !mine.includes(r));
    return [...mine, ...rest].slice(0, 12);
  }, [q, rooms, classNames]);

  const listId = `${id}-list`;
  const show = open && q.trim().length > 0;
  const pick = (r: MapRoom) => {
    onPick(r);
    setQ('');
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      if (show && results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === 'Escape') {
      if (q) {
        e.preventDefault();
        setQ('');
      }
      setOpen(false);
    }
  };

  return (
    <div className="mp-search">
      <label className="sr-only" htmlFor={`${id}-input`}>
        {label}
      </label>
      <span className="mp-search-icon" aria-hidden>
        ⌕
      </span>
      <input
        id={`${id}-input`}
        type="search"
        role="combobox"
        autoComplete="off"
        enterKeyHint="search"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && results[active] ? `${id}-opt-${active}` : undefined}
        placeholder={placeholder ?? 'Search rooms: 214, Media Center…'}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          onFocusChange?.(true);
        }}
        onBlur={() => {
          setOpen(false);
          onFocusChange?.(false);
        }}
        onKeyDown={onKey}
      />
      {show && (
        <ul className="mp-results" role="listbox" id={listId} aria-label={label}>
          {results.length === 0 && (
            <li className="mp-result-empty muted" role="presentation">
              No rooms match “{q.trim()}”
            </li>
          )}
          {results.map((r, i) => {
            const mine = classNames?.get(r.key);
            return (
              <li
                key={r.key}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={'mp-result' + (i === active ? ' is-active' : '')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r)}
              >
                <span className="mp-result-title">{r.title}</span>
                <span className="mp-result-meta muted">
                  {roomTypeName(r.type)} · {floorNames[r.level] ?? `Floor ${r.level + 1}`}
                  {mine && <strong className="mp-result-mine"> · {mine.join(', ')}</strong>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
