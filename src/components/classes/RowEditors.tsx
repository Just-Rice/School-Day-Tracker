// Editors for the repeatable rows of a class: links, custom fields and alternate rooms.
import { useEffect, useRef } from 'react';
import type { ClassRoom, CustomField, LinkItem, SchoolId } from '../../types';
import { Button } from '../ui';
import ChoiceChips, { type Choice } from './ChoiceChips';
import RoomPicker from './RoomPicker';

type Errors = Record<string, string>;

const replace = <T,>(list: T[], i: number, item: T) => list.map((x, j) => (j === i ? item : x));
const remove = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i);

let keySeq = 0;

/** Stable React keys for rows that are added and removed only through the editor. */
function useRowKeys(length: number) {
  const keys = useRef<string[]>([]);
  while (keys.current.length < length) keys.current.push(`r${++keySeq}`);
  if (keys.current.length > length) keys.current.length = length;
  return {
    keys: keys.current,
    drop: (i: number) => keys.current.splice(i, 1),
  };
}

/** focuses `selector` inside the last row after a row is added */
function useFocusNewRow(count: number, selector: string) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) ref.current?.querySelector<HTMLElement>(`.edit-row:last-child ${selector}`)?.focus();
    prev.current = count;
  }, [count, selector]);
  return ref;
}

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <span className="field-hint cls-err" id={id}>
      {msg}
    </span>
  ) : null;
}

export function LinksEditor({ links, onChange, errors, idPrefix }: { links: LinkItem[]; onChange: (l: LinkItem[]) => void; errors: Errors; idPrefix: string }) {
  const ref = useFocusNewRow(links.length, 'input');
  const { keys, drop } = useRowKeys(links.length);
  return (
    <div className="stack" ref={ref}>
      {links.length === 0 && <p className="muted small">Google Classroom, the textbook site, a class Drive folder, the syllabus…</p>}
      {links.map((l, i) => {
        const err = errors[`links.${i}.url`];
        const eid = `${idPrefix}-links-${i}-url`;
        return (
          <div className="edit-row" key={keys[i]}>
            <input aria-label={`Link ${i + 1} name`} placeholder="Name (e.g. Google Classroom)" value={l.label} onChange={(e) => onChange(replace(links, i, { ...l, label: e.target.value }))} />
            <div className="edit-cell">
              <input
                id={eid}
                type="url"
                inputMode="url"
                aria-label={`Link ${i + 1} address`}
                placeholder="classroom.google.com/…"
                value={l.url}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? `${eid}-err` : undefined}
                onChange={(e) => onChange(replace(links, i, { ...l, url: e.target.value }))}
              />
              <Err id={`${eid}-err`} msg={err} />
            </div>
            <Button variant="ghost" small className="edit-remove" aria-label={`Remove link ${l.label || i + 1}`} onClick={() => {
              drop(i);
              onChange(remove(links, i));
            }}>
              ✕
            </Button>
          </div>
        );
      })}
      <div>
        <Button small onClick={() => onChange([...links, { label: '', url: '' }])}>
          + Add link
        </Button>
      </div>
    </div>
  );
}

export const FIELD_SUGGESTIONS = ['Locker #', 'Seat', 'Textbook', 'Textbook ISBN', 'Google Classroom code', 'Lab partner', 'Calculator', 'Online book login', 'Extra help days', 'Late work policy'];

export function CustomFieldsEditor({ fields, onChange, errors, idPrefix }: { fields: CustomField[]; onChange: (f: CustomField[]) => void; errors: Errors; idPrefix: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(fields.length);
  // a blank row starts at its name; a suggested one (name filled in) at its value
  useEffect(() => {
    if (fields.length > prev.current) {
      const last = fields[fields.length - 1];
      ref.current?.querySelector<HTMLElement>(`.edit-row:last-child ${last?.key ? '.cf-value' : '.cf-key'}`)?.focus();
    }
    prev.current = fields.length;
  }, [fields]);
  const { keys, drop } = useRowKeys(fields.length);
  const unused = FIELD_SUGGESTIONS.filter((s) => !fields.some((f) => f.key.trim().toLowerCase() === s.toLowerCase()));
  return (
    <div className="stack" ref={ref}>
      {fields.map((f, i) => {
        const err = errors[`customFields.${i}.key`];
        const eid = `${idPrefix}-customFields-${i}-key`;
        return (
          <div className="edit-row" key={keys[i]}>
            <div className="edit-cell">
              <input
                id={eid}
                className="cf-key"
                aria-label={`Detail ${i + 1} name`}
                placeholder="Name (e.g. Locker #)"
                value={f.key}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? `${eid}-err` : undefined}
                onChange={(e) => onChange(replace(fields, i, { ...f, key: e.target.value }))}
              />
              <Err id={`${eid}-err`} msg={err} />
            </div>
            <input className="cf-value" aria-label={`${f.key || `Detail ${i + 1}`} value`} placeholder="Value" value={f.value} onChange={(e) => onChange(replace(fields, i, { ...f, value: e.target.value }))} />
            <Button variant="ghost" small className="edit-remove" aria-label={`Remove ${f.key || `detail ${i + 1}`}`} onClick={() => {
              drop(i);
              onChange(remove(fields, i));
            }}>
              ✕
            </Button>
          </div>
        );
      })}
      <div className="row">
        <Button small onClick={() => onChange([...fields, { key: '', value: '' }])}>
          + Add a detail
        </Button>
      </div>
      {unused.length > 0 && (
        <div className="suggest-row" role="group" aria-label="Suggested details">
          <span className="muted small">Ideas:</span>
          {unused.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => onChange([...fields, { key: s, value: '' }])}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type AltRoom = { days: string[]; room: ClassRoom };

/** "On some days this class is somewhere else" rows: cycle days + a room. */
export function AltRoomsEditor({
  rows,
  onChange,
  errors,
  idPrefix,
  schoolId,
  dayChoices,
}: {
  rows: AltRoom[];
  onChange: (r: AltRoom[]) => void;
  errors: Errors;
  idPrefix: string;
  schoolId: SchoolId;
  /** cycle days to choose from; empty when there's no schedule (days are typed instead) */
  dayChoices: Choice[];
}) {
  const ref = useFocusNewRow(rows.length, 'input');
  const { keys, drop } = useRowKeys(rows.length);
  return (
    <div className="stack" ref={ref}>
      {rows.map((r, i) => (
        <div className="edit-row edit-row-block" key={keys[i]}>
          <div className="stack">
            {dayChoices.length > 0 ? (
              <ChoiceChips id={`${idPrefix}-altRooms-${i}-days`} legend="On these days" choices={dayChoices} value={r.days} onChange={(days) => onChange(replace(rows, i, { ...r, days }))} error={errors[`altRooms.${i}.days`]} />
            ) : (
              <label className="field">
                <span className="field-label">On these days</span>
                <input
                  id={`${idPrefix}-altRooms-${i}-days`}
                  placeholder="e.g. A, C"
                  defaultValue={r.days.join(', ')}
                  aria-invalid={errors[`altRooms.${i}.days`] ? true : undefined}
                  onChange={(e) => onChange(replace(rows, i, { ...r, days: e.target.value.split(/[,\s]+/).filter(Boolean) }))}
                />
                {errors[`altRooms.${i}.days`] && <span className="field-hint cls-err">{errors[`altRooms.${i}.days`]}</span>}
              </label>
            )}
            <RoomPicker id={`${idPrefix}-altRooms-${i}-room`} schoolId={schoolId} label="Room on those days" value={r.room} onChange={(room) => onChange(replace(rows, i, { ...r, room }))} error={errors[`altRooms.${i}.room`]} placeholder="e.g. lab or gym" />
          </div>
          <Button variant="ghost" small className="edit-remove" aria-label={`Remove other room ${i + 1}`} onClick={() => {
              drop(i);
              onChange(remove(rows, i));
            }}>
            ✕
          </Button>
        </div>
      ))}
      <div>
        <Button small onClick={() => onChange([...rows, { days: [], room: { label: '' } }])}>
          + Different room on some days
        </Button>
      </div>
    </div>
  );
}
