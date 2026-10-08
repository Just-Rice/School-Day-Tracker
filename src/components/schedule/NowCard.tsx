import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { BellSlot, ClassRoom, DayInfo, ISODate, SchoolSchedule } from '../../types';
import { formatDuration, formatTime, relativeDay, toMinutes } from '../../lib/dates';
import { currentAndNext, formatTimeRange, slotName, slotProgress, type Meeting } from '../../lib/schedule';
import { Card, Dot } from '../ui';
import { meetingMeta, meetingTitle, roomText } from './bits';

export interface UpcomingDay {
  day: DayInfo;
  meetings: Meeting[];
}

interface Props {
  day: DayInfo;
  meetings: Meeting[];
  schedule: SchoolSchedule | null;
  today: ISODate;
  /** minutes after midnight, fractional */
  minutes: number;
  clock: '12h' | '24h';
  /** the school has an indoor map, so offer directions */
  hasMap: boolean;
  /** the next school day after today, for after school and days off */
  upcoming?: UpcomingDay;
}

/** '#/map?from=…&to=…' when the destination is on the map and isn't where you already are */
export function directionsPath(from: string | undefined, to: ClassRoom | undefined): string | null {
  if (!to?.mapKey) return null;
  const f = from || 'entrance';
  if (f === to.mapKey) return null;
  return `/map?${new URLSearchParams({ from: f, to: to.mapKey })}`;
}

function Directions({ hasMap, from, to }: { hasMap: boolean; from?: string; to?: ClassRoom }) {
  const path = hasMap ? directionsPath(from, to) : null;
  if (!path) return null;
  return (
    <Link className="btn btn-primary btn-sm" to={path}>
      <span aria-hidden>⌖</span> Directions{from && from !== 'entrance' ? '' : ' from the entrance'} to {roomText(to)}
    </Link>
  );
}

/** the class's color as a CSS variable for the accent stripe */
const tint = (m: Meeting | undefined): CSSProperties | undefined => (m?.cls ? ({ '--cls': m.cls.color } as CSSProperties) : undefined);

function Upcoming({ upcoming, today, clock, schedule, prefix }: { upcoming?: UpcomingDay; today: ISODate; clock: '12h' | '24h'; schedule: SchoolSchedule | null; prefix?: string }) {
  if (!upcoming) return <p className="muted">No more school days on this year's calendar.</p>;
  const { day, meetings } = upcoming;
  const first = meetings.find((m) => m.cls);
  const when = relativeDay(day.date, today);
  const cycle = day.cycleDay && schedule?.cycle.mode === 'rotation' ? ` (${day.cycleDay.name})` : '';
  return (
    <div className="now-next">
      <span className="now-label">
        {prefix ?? 'Next school day'} · {when}
        {cycle}
      </span>
      {first ? (
        <>
          <span className="now-next-title">
            <Dot color={first.cls!.color} /> {first.cls!.name}
          </span>
          <span className="muted small">
            First class at {formatTime(first.slot.start, clock)}
            {roomText(first.room) && ` in ${roomText(first.room)}`}
          </span>
        </>
      ) : (
        <span className="muted small">{day.slots[0] ? `School starts at ${formatTime(day.slots[0].start, clock)}` : 'No bell times set for that day'}</span>
      )}
    </div>
  );
}

function NextLine({ m, schedule, clock, minutesUntil }: { m: Meeting; schedule: SchoolSchedule | null; clock: '12h' | '24h'; minutesUntil?: number }) {
  const room = roomText(m.room);
  return (
    <div className="now-next">
      <span className="now-label">
        Next · {formatTime(m.slot.start, clock)}
        {minutesUntil !== undefined && ` · in ${formatDuration(minutesUntil)}`}
      </span>
      <span className="now-next-title">
        {m.cls && <Dot color={m.cls.color} />} {meetingTitle(m, schedule)}
      </span>
      {(m.cls || room) && <span className="muted small">{[m.cls ? slotName(schedule, m.slot) : '', room].filter(Boolean).join(' · ')}</span>}
    </div>
  );
}

function Countdown({ verb, minutes, at, clock }: { verb: string; minutes: number; at: string; clock: '12h' | '24h' }) {
  return (
    <p className="now-count">
      {verb} <strong>in {formatDuration(minutes)}</strong> <span className="muted">· {formatTime(at, clock)}</span>
    </p>
  );
}

export default function NowCard({ day, meetings, schedule, today, minutes, clock, hasMap, upcoming }: Props) {
  const st = currentAndNext(day, minutes);
  const bySlot = (s?: BellSlot) => (s ? meetings.find((m) => m.slot === s) : undefined);
  const cur = bySlot(st.current);
  const nxt = bySlot(st.next);
  // where you'll walk next: the next meeting that has a class (lunch has no room)
  const nextClass = meetings.find((m) => m.cls && toMinutes(m.slot.start) > minutes && m !== cur);
  const lastClass = [...meetings].reverse().find((m) => m.cls && toMinutes(m.slot.end) <= minutes);

  let body: ReactNode;
  if (st.state === 'no-school') {
    body = (
      <>
        <div className="now-block">
          <p className="now-label">No school today</p>
          <h2 className="now-title">{day.reason ?? 'Day off'}</h2>
        </div>
        <Upcoming upcoming={upcoming} today={today} clock={clock} schedule={schedule} />
      </>
    );
  } else if (day.slots.length === 0) {
    body = (
      <div className="now-block">
        <p className="now-label">School day</p>
        <h2 className="now-title">No bell times for today</h2>
        <p className="muted">
          Add times for {day.cycleDay?.name ?? 'this day'} on the <Link to="/schedule">Bell schedule</Link> page.
        </p>
      </div>
    );
  } else if (st.state === 'during' && st.current) {
    const pct = Math.round(slotProgress(st.current, minutes) * 100);
    const meta = cur ? meetingMeta(cur, schedule, { slot: false }) : '';
    body = (
      <>
        <div className="now-block" style={tint(cur)}>
          <p className="now-label">
            Now · {slotName(schedule, st.current)} · {formatTimeRange(st.current.start, st.current.end, clock)}
          </p>
          <h2 className="now-title">
            {cur?.cls?.icon && <span aria-hidden>{cur.cls.icon} </span>}
            {cur ? meetingTitle(cur, schedule) : slotName(schedule, st.current)}
          </h2>
          {meta && <p className="now-meta">{meta}</p>}
          <p className="now-count">
            Ends <strong>in {formatDuration(st.minutesLeft ?? 0)}</strong> <span className="muted">· {formatTime(st.current.end, clock)}</span>
          </p>
          <div className="progress" role="progressbar" aria-label="Time through this period" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        {nxt ? <NextLine m={nxt} schedule={schedule} clock={clock} minutesUntil={st.minutesUntilNext} /> : <p className="muted small">Last period of the day.</p>}
        <div className="now-actions">
          <Directions hasMap={hasMap} from={cur?.room?.mapKey} to={nextClass?.room} />
        </div>
      </>
    );
  } else if (st.state === 'passing' && nxt) {
    const meta = meetingMeta(nxt, schedule);
    body = (
      <>
        <div className="now-block" style={tint(nxt)}>
          <p className="now-label">Passing time</p>
          <h2 className="now-title">Next: {meetingTitle(nxt, schedule)}</h2>
          {meta && <p className="now-meta">{meta}</p>}
          <Countdown verb="Starts" minutes={st.minutesUntilNext ?? 0} at={nxt.slot.start} clock={clock} />
        </div>
        <div className="now-actions">
          <Directions hasMap={hasMap} from={lastClass?.room?.mapKey} to={nextClass?.room} />
        </div>
      </>
    );
  } else if (st.state === 'before' && st.next) {
    const first = meetings.find((m) => m.cls);
    const firstMeta = first ? meetingMeta(first, schedule, { slot: false }) : '';
    const startsLater = first && first.slot !== st.next;
    body = (
      <>
        <div className="now-block" style={tint(first)}>
          <p className="now-label">{first ? `First class · ${slotName(schedule, first.slot)}` : 'Before school'}</p>
          <h2 className="now-title">{first ? meetingTitle(first, schedule) : `School starts at ${formatTime(st.next.start, clock)}`}</h2>
          {firstMeta && <p className="now-meta">{firstMeta}</p>}
          {first ? (
            <Countdown verb="Starts" minutes={toMinutes(first.slot.start) - minutes} at={first.slot.start} clock={clock} />
          ) : (
            <Countdown verb="School starts" minutes={st.minutesUntilNext ?? 0} at={st.next.start} clock={clock} />
          )}
          {startsLater && (
            <p className="muted small">
              School starts with {slotName(schedule, st.next)} at {formatTime(st.next.start, clock)} (in {formatDuration(st.minutesUntilNext ?? 0)}).
            </p>
          )}
        </div>
        <div className="now-actions">
          <Directions hasMap={hasMap} to={first?.room} />
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="now-block">
          <p className="now-label">After school</p>
          <h2 className="now-title">School's out</h2>
          {lastClass && (
            <p className="now-meta">
              Your last class ended at {formatTime(lastClass.slot.end, clock)}.
            </p>
          )}
        </div>
        <Upcoming upcoming={upcoming} today={today} clock={clock} schedule={schedule} />
      </>
    );
  }

  return (
    <Card className="now-card">
      {body}
    </Card>
  );
}
