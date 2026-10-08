// CONTRACT: <HomeworkDueCard days={2} /> lists unfinished assignments due within `days` days
// (plus overdue ones), for the Today page. Implemented by the homework feature.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../data/DataProvider';
import { useNow } from '../hooks/useSchedule';
import { daysBetween, minutesNow, todayISO } from '../lib/dates';
import { normalizeAssignment, sortAssignments } from '../lib/homework';
import AssignmentRow from './homework/AssignmentRow';
import { useToggleDone } from './homework/bits';
import { Card } from './ui';
import '../pages/homework.css';

const MAX_ROWS = 6;

function emptyText(days: number): string {
  if (days <= 0) return 'Nothing due today';
  if (days === 1) return 'Nothing due today or tomorrow';
  return `Nothing due in the next ${days} days`;
}

export default function HomeworkDueCard({ days = 2, classId }: { days?: number; classId?: string }) {
  const { assignments, classes, profile } = useData();
  const now = useNow(60000);
  const today = todayISO(now);
  const nowMinutes = minutesNow(now);
  const { pinned, toggle } = useToggleDone();
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  // overdue work has a negative day count, so it's always included
  const due = useMemo(
    () =>
      sortAssignments(
        assignments
          .map(normalizeAssignment)
          .filter((a) => (!classId || a.classId === classId) && (a.status !== 'done' || pinned.has(a.id)) && daysBetween(today, a.dueDate) <= days),
      ),
    [assignments, classId, pinned, today, days],
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
          {emptyText(days)} <span aria-hidden>🎉</span>
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
