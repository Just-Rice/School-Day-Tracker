// Room input for a class. Schools with a map get a combobox over the map's rooms (stores the
// room's key and the school so the map can route to it); anything typed that isn't on the map is
// kept as text. A room picked on another school's map shows as text until it's picked again here.
// Schools without a map get a room label plus a free-text "where" (building, wing, floor).
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ClassRoom, MapRoom, SchoolId } from '../../types';
import { SCHOOLS } from '../../schools';
import { roomMapElsewhere, roomMapKey, searchRooms, useSchoolMap } from '../../lib/mapData';
import { matchMapRoom } from '../../lib/classes';

export function floorName(schoolId: SchoolId, level: number): string {
  return SCHOOLS[schoolId].floorNames?.[level] ?? `Floor ${level + 1}`;
}

const TYPE_NAMES: Record<string, string> = { lab: 'Lab', art: 'Art room', music: 'Music', lecture: 'Lecture hall', office: 'Office', media: 'Library', theatre: 'Theater', dining: 'Cafeteria', gym: 'Gym', pool: 'Pool', weights: 'Weight room', locker: 'Locker room', kitchen: 'Kitchen' };

export default function RoomPicker({
  schoolId,
  value,
  onChange,
  label = 'Room',
  id,
  error,
  placeholder,
}: {
  schoolId: SchoolId;
  value: ClassRoom;
  onChange: (room: ClassRoom) => void;
  label?: string;
  id?: string;
  error?: string;
  placeholder?: string;
}) {
  const auto = useId();
  const inputId = id ?? `${auto}-room`;
  const school = SCHOOLS[schoolId];
  const map = useSchoolMap(schoolId);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => (open ? searchRooms(map.rooms, value.label ?? '', 8) : []), [open, map.rooms, value.label]);
  const linkedKey = roomMapKey(value, schoolId);
  const linked = linkedKey ? map.byKey.get(linkedKey) : undefined;
  const elsewhere = roomMapElsewhere(value, schoolId);

  if (!school.hasMap) {
    return (
      <div className="form-grid room-free">
        <label className="field">
          <span className="field-label">{label}</span>
          {/* a new label drops any map link (from a school with a map), which named another room */}
          <input id={inputId} value={value.label ?? ''} placeholder={placeholder ?? 'e.g. 214, Gym, Lab B'} aria-invalid={error ? true : undefined} onChange={(e) => onChange({ label: e.target.value, where: value.where })} />
          {error && <span className="field-hint cls-err">{error}</span>}
        </label>
        <label className="field">
          <span className="field-label">Where</span>
          <input value={value.where ?? ''} placeholder="Building, wing or floor" onChange={(e) => onChange({ ...value, where: e.target.value })} />
        </label>
      </div>
    );
  }

  const listId = `${auto}-list`;
  const showList = open && results.length > 0;
  const pick = (r: MapRoom) => {
    onChange({ label: r.label || r.name, mapKey: r.key, mapSchool: schoolId });
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && showList) {
      e.preventDefault();
      pick(results[Math.min(active, results.length - 1)]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  let status: ReactNode = null;
  if (error) status = <span className="field-hint cls-err">{error}</span>;
  else if (linked)
    status = (
      <span className="field-hint room-status room-linked">
        <span aria-hidden>📍</span> On the map: {linked.title} · {floorName(schoolId, linked.level)}
      </span>
    );
  else if (elsewhere)
    status = (
      <span className="field-hint room-status">
        Linked to a room on the {SCHOOLS[elsewhere].short} map, not this one. Pick it from the list to link it to the {school.short} map.
      </span>
    );
  else if (map.loading) status = <span className="field-hint">Loading the map…</span>;
  else if (map.error) status = <span className="field-hint">Couldn’t load the map, so the room is saved as typed.</span>;
  else if (value.label?.trim()) status = <span className="field-hint room-status">Not on the {school.short} map. It’ll be saved as typed.</span>;
  else status = <span className="field-hint">Type a room number or name, then pick it from the list.</span>;

  return (
    <div className="field room-picker">
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="combo">
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${Math.min(active, results.length - 1)}` : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          value={value.label ?? ''}
          placeholder={placeholder ?? 'e.g. 214, A103, Media Center'}
          onChange={(e) => {
            const text = e.target.value;
            const match = matchMapRoom(map.rooms, text);
            onChange({ label: text, mapKey: match?.key, mapSchool: match ? schoolId : undefined });
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKey}
        />
        {value.label && (
          <button type="button" className="combo-clear" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange({ label: '' })}>
            ✕
          </button>
        )}
        <ul id={listId} role="listbox" className="combo-list" hidden={!showList} aria-label={`${school.short} rooms`}>
          {results.map((r, i) => (
            <li
              key={r.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              // keep focus in the input so blur doesn't close the list before the click lands
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
            >
              <span className="combo-title">{r.title}</span>
              <span className="combo-meta">
                {[TYPE_NAMES[r.type], floorName(schoolId, r.level)].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {status}
    </div>
  );
}
