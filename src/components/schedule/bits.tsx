// Small pieces shared by the Today, Week and Bell schedule pages.
import { Link } from 'react-router-dom';
import type { ClassRoom, DayInfo, SchoolSchedule } from '../../types';
import { Card, Chip, Spinner } from '../ui';
import { shortCycleDayName, slotKind, slotName, WEEKDAY_IDS, type Meeting } from '../../lib/schedule';
import { weekday } from '../../lib/dates';

/** 'Room 214' for numbered rooms, otherwise the label as written ('Gym') */
export function roomText(room: ClassRoom | undefined): string {
  if (!room?.label) return '';
  return /^[A-Z]?\d/i.test(room.label) ? `Room ${room.label}` : room.label;
}

/** what a timeline row is called: the class, or the slot ('Lunch', 'Period 4') */
export function meetingTitle(m: Meeting, schedule: SchoolSchedule | null): string {
  return m.cls?.name ?? slotName(schedule, m.slot);
}

/** 'Period 3 · Room 214 · Ms. Lee' */
export function meetingMeta(m: Meeting, schedule: SchoolSchedule | null, opts: { slot?: boolean } = {}): string {
  const parts: string[] = [];
  if (m.cls && opts.slot !== false) parts.push(slotName(schedule, m.slot));
  if (m.cls) {
    const r = roomText(m.room);
    if (r) parts.push(r);
    if (m.cls.teacher?.name) parts.push(m.cls.teacher.name);
  }
  return parts.join(' · ');
}

/** lunch, homeroom and breaks (not class periods), when no class is in them */
export function isBreakLike(m: Meeting, schedule: SchoolSchedule | null): boolean {
  return !m.cls && slotKind(schedule, m.slot) !== 'class';
}

/**
 * Cycle day, bell and notes for a day. The weekday cycle day ('Thursday') is only shown when it
 * differs from the date's weekday (a "Monday schedule" on a Tuesday).
 */
export function DayChips({ day, schedule, compact }: { day: DayInfo; schedule: SchoolSchedule | null; /** hide the regular bell's name */ compact?: boolean }) {
  if (!day.isSchoolDay) return <Chip color="var(--muted)">{day.reason ?? 'No school'}</Chip>;
  const weekdayMode = schedule?.cycle.mode === 'weekday';
  const showCycle = day.cycleDay && (!weekdayMode || day.cycleDay.id !== WEEKDAY_IDS[weekday(day.date)]);
  const special = day.bell && schedule?.bells[0] && day.bell.id !== schedule.bells[0].id;
  return (
    <span className="day-chips">
      {showCycle && (
        <Chip color="var(--accent)" title="Cycle day">
          {weekdayMode ? `${shortCycleDayName(day.cycleDay!)} schedule` : day.cycleDay!.name}
        </Chip>
      )}
      {day.bell && (special || !compact) && (
        <Chip color={special ? 'var(--warn)' : undefined} title="Bell schedule">
          {day.bell.name}
        </Chip>
      )}
      {day.notes
        .filter((n) => n !== day.bell?.name)
        .map((n) => (
          <Chip key={n} color="var(--warn)">
            {n}
          </Chip>
        ))}
    </span>
  );
}

/** Shown instead of a schedule while it loads or when it couldn't be loaded. */
export function ScheduleMissing({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading)
    return (
      <Card>
        <Spinner label="Loading the bell schedule…" />
      </Card>
    );
  return (
    <Card>
      <div className="banner banner-warn" role="alert">
        {error ?? 'There is no bell schedule yet.'}
      </div>
      <p>You can set up your school's periods and times yourself, starting from a template.</p>
      <p>
        <Link className="btn btn-primary" to="/schedule">
          Set up the bell schedule
        </Link>
      </p>
    </Card>
  );
}
