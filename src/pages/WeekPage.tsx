import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ClassInfo, DayInfo, ISODate, SchoolSchedule } from '../types';
import { Button, Card, Dot, Page } from '../components/ui';
import RotationTable from '../components/schedule/RotationTable';
import { DayChips, ScheduleMissing } from '../components/schedule/bits';
import { useData } from '../data/DataProvider';
import { classesOnDay, useNow, useSchedule } from '../hooks/useSchedule';
import { addDays, formatDate, formatTime, isWeekend, parseISODate, startOfWeek, todayISO } from '../lib/dates';
import { isISODate, slotName } from '../lib/schedule';
import './schedule.css';

function WeekDay({ day, today, schedule, classes, clock }: { day: DayInfo; today: ISODate; schedule: SchoolSchedule; classes: ClassInfo[]; clock: '12h' | '24h' }) {
  const meetings = useMemo(() => classesOnDay(day, classes), [day, classes]);
  const isToday = day.date === today;
  const weekdayName = parseISODate(day.date).toLocaleDateString(undefined, { weekday: 'short' });
  const headId = `wk-${day.date}`;
  return (
    <section className={'wk-day' + (isToday ? ' is-today' : '') + (day.isSchoolDay ? '' : ' is-off')} aria-labelledby={headId}>
      <div className="wk-head">
        <h3 id={headId}>
          {weekdayName}
          <small>{formatDate(day.date, { weekday: false })}</small>
        </h3>
        {isToday && <span className="wk-today">Today</span>}
      </div>
      {!day.isSchoolDay ? (
        <p className="wk-off">No school · {day.reason}</p>
      ) : (
        <>
          <DayChips day={day} schedule={schedule} compact />
          {meetings.length === 0 ? (
            <p className="wk-off">No bell times for this day.</p>
          ) : (
            <ul className="wk-list">
              {meetings.map((m, i) => {
                const inner = (
                  <>
                    <time dateTime={m.slot.start}>{formatTime(m.slot.start, clock)}</time>
                    <span className="wk-name">
                      {m.cls && <Dot color={m.cls.color} size={8} />}
                      <span>
                        {m.cls?.name ?? slotName(schedule, m.slot)}
                        {m.room?.label && <span className="wk-room"> {m.room.label}</span>}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={`${m.slot.period}-${m.slot.start}-${i}`}>
                    {m.cls ? (
                      <Link className="wk-row" to={`/classes/${m.cls.id}`}>
                        {inner}
                      </Link>
                    ) : (
                      <div className="wk-row is-empty">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default function WeekPage() {
  const { profile, classes } = useData();
  const { schedule, loading, error, getDay } = useSchedule();
  const now = useNow(60000);
  const today = todayISO(now);
  const [params, setParams] = useSearchParams();

  // on weekends "this week" is the coming one
  const thisWeek = isWeekend(today) ? addDays(startOfWeek(today), 7) : startOfWeek(today);
  const w = params.get('w');
  const start = isISODate(w) ? startOfWeek(w) : thisWeek;
  const go = (s: ISODate) => setParams(s === thisWeek ? {} : { w: s }, { replace: true });
  const dates = [0, 1, 2, 3, 4].map((i) => addDays(start, i));
  const rangeLabel = `${formatDate(dates[0], { weekday: false })} – ${formatDate(dates[4], { weekday: false })}`;
  const todayDay = getDay(today);
  // the rotation grid only says something when days differ: per-day bell times or A/B-day classes
  const rotation =
    !!schedule &&
    schedule.cycle.mode === 'rotation' &&
    schedule.cycle.days.length > 1 &&
    (Object.keys(schedule.bells[0]?.days ?? {}).some((k) => k !== '*') || classes.some((c) => !c.archived && (c.days?.length || c.altRooms?.length)));

  return (
    <Page
      title="Week"
      wide
      actions={
        <Link className="btn btn-ghost btn-sm" to="/schedule">
          Bell schedule
        </Link>
      }
    >
      {!schedule ? (
        <ScheduleMissing loading={loading} error={error} />
      ) : (
        <>
          <div className="week-nav">
            <h2 aria-live="polite">
              {start === thisWeek ? 'This week' : 'Week of'} · {rangeLabel}
            </h2>
            <div className="week-nav-btns" role="group" aria-label="Change week">
              <Button small onClick={() => go(addDays(start, -7))} aria-label="Previous week">
                ‹ Prev
              </Button>
              <Button small onClick={() => go(thisWeek)} disabled={start === thisWeek}>
                This week
              </Button>
              <Button small onClick={() => go(addDays(start, 7))} aria-label="Next week">
                Next ›
              </Button>
            </div>
          </div>
          <div className="week-grid">
            {dates.map((d) => (
              <WeekDay key={d} day={getDay(d)} today={today} schedule={schedule} classes={classes} clock={profile.clock} />
            ))}
          </div>
          {rotation && (
            <Card title="Rotation" className="sched-cards">
              <p className="muted small" style={{ marginTop: -4, marginBottom: 10 }}>
                Which class meets in each block on every day of the {schedule.cycle.days.length}-day cycle ({schedule.bells[0]?.name ?? 'regular schedule'}).
              </p>
              <RotationTable schedule={schedule} classes={classes} clock={profile.clock} todayCycleId={todayDay.cycleDay?.id} caption="Classes by cycle day" />
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
