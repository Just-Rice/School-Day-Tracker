import { Link } from 'react-router-dom';
import type { Assignment, ClassInfo, ISODate } from '../../types';
import { formatTime, toISODate } from '../../lib/dates';
import { completedTime, isOverdue, relativeDue, subtaskProgress, typeInfo } from '../../lib/homework';
import { ClassChip, DoneCheck } from './bits';

export interface AssignmentRowProps {
  a: Assignment;
  cls?: ClassInfo;
  today: ISODate;
  nowMinutes: number;
  clock: '12h' | '24h';
  onToggle: (a: Assignment, done: boolean) => void;
  /** hide the class chip (lists already grouped by class) */
  hideClass?: boolean;
  /** title, class and due only (HomeworkDueCard) */
  compact?: boolean;
  /** show when it was finished instead of when it's due */
  showCompleted?: boolean;
}

/** One assignment in a list: a done checkbox, and the rest links to its edit page. */
export default function AssignmentRow({ a, cls, today, nowMinutes, clock, onToggle, hideClass, compact, showCompleted }: AssignmentRowProps) {
  const done = a.status === 'done';
  const overdue = isOverdue(a, today, nowMinutes);
  const type = typeInfo(a.type);
  const sub = subtaskProgress(a);
  const title = a.title.trim() || 'Untitled';
  const cn = ['hw-row', overdue && 'hw-overdue', done && 'hw-is-done', compact && 'hw-compact'].filter(Boolean).join(' ');

  return (
    <li className={cn}>
      <DoneCheck checked={done} onChange={(v) => onToggle(a, v)} label={`Done: ${title}`} color={cls?.color} />
      <Link to={`/homework/${a.id}`} className="hw-row-link">
        <span className="hw-row-main">
          <span className="hw-title">
            {a.priority === 'high' && !done && (
              <span className="hw-flag" title="High priority">
                <span aria-hidden>!</span>
                <span className="sr-only">High priority: </span>
              </span>
            )}
            {title}
          </span>
          <span className="hw-meta">
            {cls && !hideClass && <ClassChip cls={cls} />}
            {!compact && a.type !== 'homework' && (
              <span className="chip hw-type">
                <span aria-hidden>{type.emoji}</span> {type.label}
              </span>
            )}
            {compact && hideClass && a.type !== 'homework' && <span className="muted small">{type.label}</span>}
            {!compact && sub.total > 0 && (
              <span className="hw-mini" title={`${sub.done} of ${sub.total} steps done`}>
                <span aria-hidden>☑</span> {sub.done}/{sub.total}
                <span className="sr-only"> steps done</span>
              </span>
            )}
            {!compact && a.notes?.trim() && (
              <span className="hw-mini" title="Has notes">
                <span aria-hidden>✎</span> notes
              </span>
            )}
            {!compact && a.estimatedMinutes ? <span className="hw-mini">~{a.estimatedMinutes} min</span> : null}
          </span>
        </span>
        <span className="hw-due">
          {showCompleted ? (
            <>
              <span className="hw-due-time">Done</span>
              <span className="hw-due-day">{relativeDue(toISODate(new Date(completedTime(a))), today)}</span>
            </>
          ) : (
            <>
              {overdue && <span className="sr-only">Overdue, was due </span>}
              <span className="hw-due-day">{relativeDue(a.dueDate, today)}</span>
              {a.dueTime && <span className="hw-due-time">{formatTime(a.dueTime, clock)}</span>}
            </>
          )}
        </span>
      </Link>
    </li>
  );
}
