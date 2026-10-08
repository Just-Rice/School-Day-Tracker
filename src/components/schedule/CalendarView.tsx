import { useState } from 'react';
import type { ISODate, SchoolSchedule } from '../../types';
import { formatDate } from '../../lib/dates';
import { isISODate, upcomingCalendar } from '../../lib/schedule';
import { Button, Chip } from '../ui';

const SHOW = 8;

/** The school year and its upcoming days off and special days. */
export default function CalendarView({ schedule, today }: { schedule: SchoolSchedule; today: ISODate }) {
  const [all, setAll] = useState(false);
  const cal = schedule.calendar;
  const events = upcomingCalendar(schedule, today);
  const shown = all ? events : events.slice(0, SHOW);
  return (
    <div className="stack">
      <dl className="kv">
        <dt>First day</dt>
        <dd>{isISODate(cal.firstDay) ? formatDate(cal.firstDay, { long: true }) : '—'}</dd>
        <dt>Last day</dt>
        <dd>{isISODate(cal.lastDay) ? formatDate(cal.lastDay, { long: true }) : '—'}</dd>
      </dl>
      <h3>Coming up</h3>
      {events.length === 0 ? (
        <p className="muted">No more days off or special days on the calendar.</p>
      ) : (
        <ul className="list cal-list">
          {shown.map((e) => {
            const sp = e.special;
            const tags: string[] = [];
            if (sp?.bell) tags.push(schedule.bells.find((b) => b.id === sp.bell)?.name ?? sp.bell);
            if (sp?.cycleDay) tags.push(schedule.cycle.days.find((d) => d.id === sp.cycleDay)?.name ?? sp.cycleDay);
            if (sp?.advance === false) tags.push("Doesn't count as a cycle day");
            return (
              <li key={`${e.kind}-${e.date}-${e.name}`}>
                <span>
                  <span className="cal-date">
                    {formatDate(e.date)}
                    {e.end && ` – ${formatDate(e.end)}`}
                  </span>
                  <br />
                  <span>{e.name}</span>
                </span>
                <span className="row">
                  {e.kind === 'no-school' ? (
                    <Chip color="var(--danger)">No school</Chip>
                  ) : (
                    tags.map((t) => (
                      <Chip key={t} color="var(--warn)">
                        {t}
                      </Chip>
                    ))
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {events.length > SHOW && (
        <div>
          <Button small variant="ghost" onClick={() => setAll(!all)} aria-expanded={all}>
            {all ? 'Show fewer' : `Show all ${events.length}`}
          </Button>
        </div>
      )}
    </div>
  );
}
