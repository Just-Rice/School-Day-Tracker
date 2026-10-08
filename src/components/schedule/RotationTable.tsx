import type { Bell, ClassInfo, SchoolSchedule } from '../../types';
import { classesOnDay, formatTimeRange, rotationRows, slotName } from '../../lib/schedule';
import { Dot } from '../ui';
import { roomText } from './bits';

/**
 * Cycle days across, slot positions down: which class meets when in each cycle day of a bell.
 * Rows show the time when it's the same on every day (drop schedules), otherwise each cell does.
 */
export default function RotationTable({ schedule, classes, clock, bell, todayCycleId, caption }: { schedule: SchoolSchedule; classes: ClassInfo[]; clock: '12h' | '24h'; bell?: Bell; todayCycleId?: string; caption: string }) {
  const days = schedule.cycle.days;
  const rows = rotationRows(schedule, bell);
  if (rows.length === 0) return <p className="muted">No times in this bell schedule yet.</p>;
  return (
    <div className="scroll-x" role="region" aria-label={caption} tabIndex={0}>
      <table className="table rot-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {days.map((d) => (
              <th scope="col" key={d.id} className={d.id === todayCycleId ? 'is-today' : undefined}>
                {d.name}
                {d.id === todayCycleId && <span className="sr-only"> (today)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row" className="num">
                {r.start && r.end ? formatTimeRange(r.start, r.end, clock) : `Block ${i + 1}`}
              </th>
              {r.cells.map((slot, j) => {
                const d = days[j];
                if (!slot)
                  return (
                    <td key={d.id} className={d.id === todayCycleId ? 'is-today' : undefined}>
                      <span className="muted">—</span>
                    </td>
                  );
                const [m] = classesOnDay({ date: '', isSchoolDay: true, cycleDay: d, slots: [slot], notes: [] }, classes);
                const sub = [m.cls ? slotName(schedule, slot) : '', m.cls ? roomText(m.room) : '', r.start ? '' : formatTimeRange(slot.start, slot.end, clock)].filter(Boolean).join(' · ');
                return (
                  <td key={d.id} className={d.id === todayCycleId ? 'is-today' : undefined}>
                    <div className="rot-cell">
                      {m.cls ? (
                        <span className="rot-cls">
                          <Dot color={m.cls.color} /> {m.cls.name}
                        </span>
                      ) : (
                        <span>{slotName(schedule, slot)}</span>
                      )}
                      {sub && <span className="muted">{sub}</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
