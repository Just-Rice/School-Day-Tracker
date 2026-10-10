import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { SchoolSchedule } from '../../types';
import { toMinutes } from '../../lib/dates';
import { formatTimeRange, hasTimes, slotKind, slotName, sortSlots } from '../../lib/schedule';
import { Chip } from '../ui';

/** Bells as tabs; each shows its slots, per cycle day when the bell has per-day times. */
export default function BellView({ schedule, clock, todayBellId, todayCycleId }: { schedule: SchoolSchedule; clock: '12h' | '24h'; todayBellId?: string; todayCycleId?: string }) {
  const bells = schedule.bells;
  const [bellId, setBellId] = useState(todayBellId && bells.some((b) => b.id === todayBellId) ? todayBellId : bells[0]?.id);
  const [dayId, setDayId] = useState(todayCycleId ?? schedule.cycle.days[0]?.id);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const bell = bells.find((b) => b.id === bellId) ?? bells[0];
  if (!bell) return <p className="muted">No bell schedules yet.</p>;

  const perDay = Object.keys(bell.days).some((k) => k !== '*') && schedule.cycle.days.length > 0;
  const day = schedule.cycle.days.find((d) => d.id === dayId) ?? schedule.cycle.days[0];
  const slots = sortSlots(((perDay && day ? bell.days[day.id] : undefined) ?? bell.days['*'] ?? []).filter(hasTimes));
  const index = bells.indexOf(bell);

  const onKey = (e: KeyboardEvent) => {
    const n = bells.length;
    let j = -1;
    if (e.key === 'ArrowRight') j = (index + 1) % n;
    else if (e.key === 'ArrowLeft') j = (index - 1 + n) % n;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    if (j < 0) return;
    e.preventDefault();
    setBellId(bells[j].id);
    tabRefs.current[j]?.focus();
  };

  return (
    <div>
      {bells.length > 1 && (
        <div className="tabs" role="tablist" aria-label="Bell schedules" onKeyDown={onKey}>
          {bells.map((b, i) => (
            <button
              key={b.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={b === bell}
              aria-controls={`${base}-panel`}
              tabIndex={b === bell ? 0 : -1}
              onClick={() => setBellId(b.id)}
            >
              {b.name}
              {b.id === todayBellId && <span className="sr-only"> (today)</span>}
            </button>
          ))}
        </div>
      )}
      <div role={bells.length > 1 ? 'tabpanel' : undefined} id={`${base}-panel`} aria-labelledby={bells.length > 1 ? `${base}-tab-${index}` : undefined}>
        {perDay ? (
          <div className="chip-row" role="group" aria-label="Cycle day">
            {schedule.cycle.days.map((d) => (
              <Chip key={d.id} onClick={() => setDayId(d.id)} active={d === day} color="var(--accent)" title={d.id === todayCycleId ? 'Today' : undefined}>
                {d.name}
                {d.id === todayCycleId ? ' •' : ''}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 0 }}>
            Same times every day.
          </p>
        )}
        {slots.length === 0 ? (
          <p className="muted">No times{perDay && day ? ` for ${day.name}` : ''}.</p>
        ) : (
          <table className="table slot-table">
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Time</th>
                <th scope="col" className="num">
                  Length
                </th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s, i) => (
                <tr key={i} className={slotKind(schedule, s) !== 'class' ? 'is-break' : undefined}>
                  <td>{slotName(schedule, s)}</td>
                  <td className="num">{formatTimeRange(s.start, s.end, clock)}</td>
                  <td className="num">{toMinutes(s.end) - toMinutes(s.start)} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
