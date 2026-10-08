import { Link } from 'react-router-dom';
import type { SchoolSchedule } from '../../types';
import { formatTime, toMinutes } from '../../lib/dates';
import type { Meeting } from '../../lib/schedule';
import { isBreakLike, meetingMeta, meetingTitle } from './bits';

/**
 * Every slot of a day in time order. With `minutes` (today), past slots are dimmed and the
 * current one is highlighted. Rows with a class link to the class.
 */
export default function DayTimeline({ meetings, schedule, clock, minutes, current }: { meetings: Meeting[]; schedule: SchoolSchedule | null; clock: '12h' | '24h'; minutes?: number; current?: Meeting }) {
  return (
    <ol className="tl">
      {meetings.map((m, i) => {
        const past = minutes !== undefined && toMinutes(m.slot.end) <= minutes;
        const now = m === current;
        const meta = meetingMeta(m, schedule);
        const cls = ['tl-item', past && !now ? 'is-past' : '', now ? 'is-now' : '', !m.cls ? 'is-empty' : '', isBreakLike(m, schedule) ? 'is-break' : ''].filter(Boolean).join(' ');
        const body = (
          <>
            <span className="tl-time">
              <span>{formatTime(m.slot.start, clock)}</span>
              <span className="tl-end">{formatTime(m.slot.end, clock)}</span>
            </span>
            <span className="tl-bar" style={m.cls ? { background: m.cls.color } : undefined} aria-hidden />
            <span className="tl-body">
              <span className="tl-name">
                {m.cls?.icon && <span aria-hidden>{m.cls.icon} </span>}
                {meetingTitle(m, schedule)}
                {now && <span className="tl-now">Now</span>}
              </span>
              {meta && <span className="tl-meta">{meta}</span>}
            </span>
          </>
        );
        return (
          <li key={`${m.slot.period}-${m.slot.start}-${i}`} className={cls} aria-current={now ? 'time' : undefined}>
            {m.cls ? (
              <Link className="tl-row" to={`/classes/${m.cls.id}`}>
                {body}
                <span className="tl-chev" aria-hidden>
                  ›
                </span>
              </Link>
            ) : (
              <div className="tl-row">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
