// CONTRACT: <HomeworkDueCard days={2} /> lists unfinished assignments due within `days` days, or
// through the next school day when that's later (plus overdue ones), for the Today page.
// Implemented by the homework feature.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ISODate } from '../types';
import { useData } from '../data/DataProvider';
import { useNow, useSchedule } from '../hooks/useSchedule';
import { daysBetween, formatDate, minutesNow, parseISODate, todayISO } from '../lib/dates';
import { dueSoonUntil, normalizeAssignment, sortAssignments } from '../lib/homework';
import AssignmentRow from './homework/AssignmentRow';
import { useToggleDone } from './homework/bits';
import { Card } from './ui';
import '../pages/homework.css';

const MAX_ROWS = 6;

function emptyText(days: number, today: ISODate, until: ISODate): string {
  const n = daysBetween(today, until);
  if (n > Math.max(0, days)) {
    // reached out to the next school day: "through Monday", "through Jan 4"
    return `Nothing due through ${n < 7 ? parseISODate(until).toLocaleDateString(undefined, { weekday: 'long' }) : formatDate(until, { weekday: false })}`;
  }
  if (days <= 0) return 'Nothing due today';
  if (days === 1) return 'Nothing due today or tomorrow';
  return `Nothing due in the next ${days} days`;
}

export default function HomeworkDueCard({ days = 2, classId }: { days?: number; classId?: string }) {
  const { assignments, classes, profile } = useData();
  const { getDay } = useSchedule();
  const now = useNow(60000);
  const today = todayISO(now);
  // on a Friday that's Monday, not just the weekend
  const until = useMemo(() => dueSoonUntil(today, days, getDay), [today, days, getDay]);
  const reach = daysBetween(today, until);
  const nowMinutes = minutesNow(now);
  const { pinned, toggle } = useToggleDone();
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  // overdue work has a negative day count, so it's always included
  const due = useMemo(
    () =>
      sortAssignments(
        assignments
          .map(normalizeAssignment)
          .filter((a) => (!classId || a.classId === classId) && (a.status !== 'done' || pinned.has(a.id)) && daysBetween(today, a.dueDate) <= reach),
      ),
    [assignments, classId, pinned, today, reach],
  );
  const left = due.filter((a) => a.status !== 'done').length;
  const shown = due.slice(0, MAX_ROWS);
  const more = due.length - shown.length;
  const allHref = classId ? `/homework?class=${encodeURIComponent(classId)}` : '/homework';
  const addHref = classId ? `/homework/new?classId=${encodeURIComponent(classId)}` : '/homework/new';

  return (
    <Card
      className="hw-due-card"
      title={
        <>
          Homework due {left > 0 && <span className="hw-group-count">{left}</span>}
        </>
      }
      actions={
        <>
          <Link className="btn btn-ghost btn-sm" to={addHref} aria-label="Add homework">
            + Add
          </Link>
          <Link className="btn btn-ghost btn-sm" to={allHref}>
            See all
          </Link>
        </>
      }
    >
      {due.length === 0 ? (
        <p className="muted hw-due-empty">
          {emptyText(days, today, until)} <span aria-hidden>🎉</span>
        </p>
      ) : (
        <>
          <ul className="hw-list">
            {shown.map((a) => (
              <AssignmentRow
                key={a.id}
                a={a}
                cls={a.classId ? classById.get(a.classId) : undefined}
                today={today}
                nowMinutes={nowMinutes}
                clock={profile.clock}
                onToggle={toggle}
                hideClass={!!classId}
                compact
              />
            ))}
          </ul>
          {more > 0 && (
            <p className="hw-due-more small">
              <Link to={allHref}>
                +{more} more due soon
              </Link>
            </p>
          )}
        </>
      )}
    </Card>
  );
}
