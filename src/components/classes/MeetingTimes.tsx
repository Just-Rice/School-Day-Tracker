// A class's meeting times from the bell schedule: one row per group of cycle days with the
// same times, plus the days its period is dropped.
import type { Bell, ClassInfo, CycleDay, SchoolSchedule } from '../../types';
import { formatTimeRange, meetingTimes, shortCycleDayName, slotName } from '../../lib/schedule';
import { daysWithoutMeetings, groupMeetingTimes, joinNames, type MeetingGroup } from '../../lib/classes';

type Clock = '12h' | '24h';

function dayNames(days: CycleDay[], schedule: SchoolSchedule): string {
  return joinNames(days.map((d) => (schedule.cycle.mode === 'weekday' ? shortCycleDayName(d) : d.name)));
}

export function groupLabel(g: MeetingGroup, schedule: SchoolSchedule): string {
  return g.everyDay ? 'Every day' : dayNames(g.days, schedule);
}

function groupsFor(schedule: SchoolSchedule, cls: Pick<ClassInfo, 'periods' | 'days'>, bell?: Bell) {
  const s = bell ? { ...schedule, bells: [bell] } : schedule;
  const times = meetingTimes(s, cls);
  return { groups: groupMeetingTimes(times, schedule.cycle.days.length), missing: daysWithoutMeetings(s, cls, times) };
}

/** 'A Day 7:40–8:40 AM · B & C Days 8:45–9:45 AM', for the edit form */
export function meetingLine(schedule: SchoolSchedule, cls: Pick<ClassInfo, 'periods' | 'days'>, clock: Clock): string {
  const { groups } = groupsFor(schedule, cls);
  return groups.map((g) => `${groupLabel(g, schedule)} ${g.slots.map((s) => formatTimeRange(s.start, s.end, clock)).join(' & ')}`).join(' · ');
}

function Groups({ schedule, cls, clock, bell }: { schedule: SchoolSchedule; cls: Pick<ClassInfo, 'periods' | 'days'>; clock: Clock; bell?: Bell }) {
  const { groups, missing } = groupsFor(schedule, cls, bell);
  if (!groups.length) return <p className="muted small">Doesn’t meet on this schedule.</p>;
  return (
    <dl className="when-list">
      {groups.map((g) => (
        <div key={g.days.map((d) => d.id).join()} className="when-row">
          <dt>{groupLabel(g, schedule)}</dt>
          {g.slots.map((s, i) => (
            <dd key={i}>
              <span className="when-time">{formatTimeRange(s.start, s.end, clock)}</span>
              <span className="muted"> · {slotName(schedule, s)}</span>
            </dd>
          ))}
        </div>
      ))}
      {missing.length > 0 && (
        <div className="when-row when-off">
          <dt>{dayNames(missing, schedule)}</dt>
          <dd className="muted">No class (its period isn’t on {missing.length === 1 ? 'that day’s' : 'those days’'} schedule)</dd>
        </div>
      )}
    </dl>
  );
}

/** Regular-bell times, with the other bells (delayed opening, early dismissal...) folded away. */
export default function MeetingTimes({ schedule, cls, clock }: { schedule: SchoolSchedule; cls: Pick<ClassInfo, 'periods' | 'days'>; clock: Clock }) {
  const others = schedule.bells.slice(1).filter((b) => meetingTimes({ ...schedule, bells: [b] }, cls).length > 0);
  return (
    <div className="stack">
      <Groups schedule={schedule} cls={cls} clock={clock} />
      {others.length > 0 && (
        <details className="when-more">
          <summary>Times on other bell schedules</summary>
          {others.map((b) => (
            <div key={b.id} className="when-bell">
              <h3 className="small">{b.name}</h3>
              <Groups schedule={schedule} cls={cls} clock={clock} bell={b} />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
