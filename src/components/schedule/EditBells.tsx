import { useState } from 'react';
import type { Bell, BellSlot, SlotKind } from '../../types';
import { sortSlots } from '../../lib/schedule';
import { Button, Chip, Field } from '../ui';
import IdInput from './IdInput';
import { addBell, makeRegular, nextSlot, removeBell, setBellDay, SLOT_KINDS, updateBell } from './editorOps';
import type { EditorSectionProps } from './ScheduleEditor';

export default function EditBells({ s, onChange, rename, ask }: EditorSectionProps) {
  const [bellId, setBellId] = useState(s.bells[0]?.id ?? '');
  const bell = s.bells.find((b) => b.id === bellId) ?? s.bells[0];
  const cycleDays = s.cycle.days;
  // a bell with only per-day times opens on its first day rather than the empty "all days"
  const firstKey = (b: Bell | undefined) => (!b || b.days['*'] ? '*' : (cycleDays.find((d) => b.days[d.id])?.id ?? '*'));
  const [key, setKey] = useState(() => firstKey(bell));
  const selectBell = (id: string, next = s) => {
    setBellId(id);
    setKey(firstKey(next.bells.find((b) => b.id === id)));
  };
  const dayName = (k: string) => (k === '*' ? 'all days' : (cycleDays.find((d) => d.id === k)?.name ?? k));

  if (!bell)
    return (
      <div>
        <p className="muted">No bell schedules yet.</p>
        <Button small onClick={() => onChange(addBell(s))}>
          + Add bell schedule
        </Button>
      </div>
    );

  const slots = bell.days[key];
  const setSlots = (next: BellSlot[] | undefined) => onChange(setBellDay(s, bell.id, key, next));
  const setSlot = (i: number, patch: Partial<BellSlot>) => slots && setSlots(slots.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const sorted = slots ? sortSlots(slots) : [];
  const isSorted = !!slots && sorted.every((x, i) => x === slots[i]);

  return (
    <>
      <p className="muted small">The first bell schedule is the regular day; others (early dismissal, delayed opening, …) are used on special days or when you pick them for a date.</p>
      <div className="chip-row" role="group" aria-label="Bell schedule to edit">
        {s.bells.map((b, i) => (
          <Chip key={b.id} onClick={() => selectBell(b.id)} active={b === bell} color="var(--accent)">
            {b.name || b.id}
            {i === 0 ? ' (regular)' : ''}
          </Chip>
        ))}
      </div>
      <div className="form-grid">
        <Field label="Name">
          <input value={bell.name} onChange={(e) => onChange(updateBell(s, bell.id, { name: e.target.value }))} />
        </Field>
        <Field label="ID" hint="Used by special days in the calendar">
          <IdInput
            label="Bell schedule ID"
            value={bell.id}
            taken={s.bells.filter((b) => b !== bell).map((b) => b.id)}
            onCommit={(id) => {
              rename('bell', bell.id, id);
              setBellId(id);
            }}
          />
        </Field>
      </div>
      <div className="row">
        <Button
          small
          onClick={() => {
            const next = addBell(s, bell);
            onChange(next);
            selectBell(next.bells[next.bells.length - 1].id, next);
          }}
        >
          Duplicate
        </Button>
        <Button
          small
          onClick={() => {
            const next = addBell(s);
            onChange(next);
            selectBell(next.bells[next.bells.length - 1].id, next);
          }}
        >
          + New bell schedule
        </Button>
        {s.bells[0] !== bell && (
          <Button small onClick={() => onChange(makeRegular(s, bell.id))}>
            Make regular
          </Button>
        )}
        {s.bells.length > 1 && (
          <Button
            small
            variant="danger"
            onClick={() =>
              ask({
                title: `Remove ${bell.name || bell.id}?`,
                body: 'Special days and day changes that use it will use the regular bell instead.',
                confirmLabel: 'Remove',
                run: () => {
                  const next = removeBell(s, bell.id);
                  onChange(next);
                  selectBell(next.bells[0]?.id ?? '', next);
                },
              })
            }
          >
            Remove
          </Button>
        )}
      </div>

      <h3 className="ed-sub">Times</h3>
      {cycleDays.length > 0 && (
        <div className="chip-row" role="group" aria-label="Times for">
          {['*', ...cycleDays.map((d) => d.id)].map((k) => (
            <Chip key={k} onClick={() => setKey(k)} active={k === key} color="var(--accent)" title={bell.days[k] ? `${dayName(k)} has its own times` : undefined}>
              {k === '*' ? 'All days' : dayName(k)}
              {k !== '*' && bell.days[k] ? ' •' : ''}
            </Chip>
          ))}
        </div>
      )}
      {!slots ? (
        <div className="stack ed-empty">
          <p className="muted" style={{ margin: 0 }}>
            {key === '*' ? 'No times for all days yet.' : bell.days['*'] ? `${dayName(key)} uses the all-days times.` : `No times for ${dayName(key)}.`}
          </p>
          <div>
            <Button small onClick={() => setSlots(structuredClone(key === '*' ? [] : (bell.days['*'] ?? [])))}>
              {key === '*' ? 'Add times for all days' : `Give ${dayName(key)} its own times`}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="ed-head ed-slot" aria-hidden>
            <span>Period</span>
            <span>Label</span>
            <span>Start</span>
            <span>End</span>
            <span>Kind</span>
            <span />
          </div>
          <ul className="ed-rows">
            {slots.map((x, i) => {
              const what = x.label || s.periods.find((p) => p.id === x.period)?.name || x.period;
              return (
                <li key={i} className="ed-slot">
                  <label className="ed-f ed-f-period">
                    <span className="ed-cap">Period</span>
                    <select value={x.period} onChange={(e) => setSlot(i, { period: e.target.value })}>
                      {!s.periods.some((p) => p.id === x.period) && <option value={x.period}>{x.period || '(none)'} (unknown)</option>}
                      {s.periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ed-f ed-f-label">
                    <span className="ed-cap">Label</span>
                    <input value={x.label ?? ''} placeholder="optional" onChange={(e) => setSlot(i, { label: e.target.value || undefined })} />
                  </label>
                  <label className="ed-f ed-f-start">
                    <span className="ed-cap">Start</span>
                    <input type="time" value={x.start} onChange={(e) => setSlot(i, { start: e.target.value })} aria-label={`${what} start`} />
                  </label>
                  <label className="ed-f ed-f-end">
                    <span className="ed-cap">End</span>
                    <input type="time" value={x.end} onChange={(e) => setSlot(i, { end: e.target.value })} aria-label={`${what} end`} />
                  </label>
                  <label className="ed-f ed-f-kind">
                    <span className="ed-cap">Kind</span>
                    <select value={x.kind ?? ''} onChange={(e) => setSlot(i, { kind: (e.target.value || undefined) as SlotKind | undefined })}>
                      <option value="">From period</option>
                      {SLOT_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button small variant="ghost" className="ed-del" onClick={() => setSlots(slots.filter((_, j) => j !== i))} aria-label={`Remove ${what} at ${x.start}`}>
                    ✕
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="row">
            <Button small onClick={() => setSlots([...slots, nextSlot(slots, s.periods)])}>
              + Add time
            </Button>
            {!isSorted && (
              <Button small onClick={() => setSlots(sorted)}>
                Sort by time
              </Button>
            )}
            {key !== '*' && (
              <Button small variant="danger" onClick={() => setSlots(undefined)}>
                {bell.days['*'] ? `Use all-days times for ${dayName(key)}` : `Remove ${dayName(key)}'s times`}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}
