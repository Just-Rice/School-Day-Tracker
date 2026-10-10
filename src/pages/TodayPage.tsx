import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Page } from '../components/ui';
import HomeworkDueCard from '../components/HomeworkDueCard';
import DayTimeline from '../components/schedule/DayTimeline';
import NowCard, { type UpcomingDay } from '../components/schedule/NowCard';
import { DayChips, ScheduleMissing } from '../components/schedule/bits';
import { useData } from '../data/DataProvider';
import { classesOnDay, useNow, useSchedule } from '../hooks/useSchedule';
import { formatDate, minutesNow, relativeDay, todayISO } from '../lib/dates';
import { currentAndNext, nextSchoolDay } from '../lib/schedule';
import './schedule.css';

export default function TodayPage() {
  const { profile, classes } = useData();
  const { schedule, loading, error, getDay } = useSchedule();
  const now = useNow(15000);
  const today = todayISO(now);
  const minutes = minutesNow(now);
  const clock = profile.clock;

  const day = getDay(today);
  const meetings = useMemo(() => classesOnDay(day, classes), [day, classes]);
  const upcoming = useMemo<UpcomingDay | undefined>(() => {
    if (!schedule) return undefined;
    const d = nextSchoolDay(getDay, today);
    return d && { day: d, meetings: classesOnDay(d, classes) };
  }, [schedule, getDay, today, classes]);

  const status = currentAndNext(day, minutes);
  const current = status.current && meetings.find((m) => m.slot === status.current);
  const hasClasses = classes.some((c) => !c.archived);
  // after school and on days off, the next school day's schedule is the useful one
  const showUpcoming = (!day.isSchoolDay || (status.state === 'after' && day.slots.length > 0)) && upcoming;

  return (
    <Page
      title={formatDate(today, { long: true })}
      subtitle={schedule ? <DayChips day={day} schedule={schedule} /> : undefined}
    >
      {!schedule ? (
        <ScheduleMissing loading={loading} error={error} />
      ) : (
        <div className="today-grid">
          <div className="today-main">
            <NowCard day={day} meetings={meetings} schedule={schedule} today={today} minutes={minutes} clock={clock} schoolId={profile.schoolId} upcoming={upcoming} />
            {!hasClasses && (
              <Card>
                <EmptyState
                  icon="📚"
                  title="Add your classes"
                  action={
                    <Link className="btn btn-primary" to="/classes/new">
                      Add a class
                    </Link>
                  }
                >
                  Add each class with its period, room and teacher, and this page will show where you need to be and when.
                </EmptyState>
              </Card>
            )}
            <HomeworkDueCard days={2} />
          </div>
          <div className="today-side">
            {day.isSchoolDay && meetings.length > 0 && !showUpcoming && (
              <Card title="Today's schedule" actions={<Link to="/week" className="btn btn-ghost btn-sm">Week</Link>}>
                <DayTimeline meetings={meetings} schedule={schedule} clock={clock} minutes={minutes} current={current} />
              </Card>
            )}
            {showUpcoming && upcoming.meetings.length > 0 && (
              <Card
                title={
                  <>
                    {relativeDay(upcoming.day.date, today)}
                    <span className="muted card-sub"> · {formatDate(upcoming.day.date)}</span>
                  </>
                }
                actions={<DayChips day={upcoming.day} schedule={schedule} />}
              >
                <DayTimeline meetings={upcoming.meetings} schedule={schedule} clock={clock} />
              </Card>
            )}
            <p className="muted small today-foot">
              Snow day or a schedule change? <Link to="/schedule">Bell schedule &amp; day changes</Link>
            </p>
          </div>
        </div>
      )}
    </Page>
  );
}
