import { Link } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import { activeCustomSchedule, useSchedule } from '../../hooks/useSchedule';
import { todayISO } from '../../lib/dates';
import { SCHOOLS } from '../../schools';
import { Card, Chip } from '../ui';

export default function ScheduleCard() {
  const { profile } = useData();
  const { schedule } = useSchedule();
  const custom = !!activeCustomSchedule(profile);
  const school = SCHOOLS[profile.schoolId];
  const today = todayISO();
  const dates = Object.keys(profile.dayOverrides ?? {});
  const upcoming = dates.filter((d) => d >= today).length;
  const year = schedule?.schoolYear ? ` ${schedule.schoolYear}` : '';

  return (
    <Card title="Schedule" className="acct-card">
      <div className="stack">
        <p>
          {custom ? (
            <>
              Using <strong>your own bell schedule</strong>
              {year && <span className="muted"> ({year.trim()})</span>}.
            </>
          ) : profile.schoolId === 'other' ? (
            <>No school bell schedule yet: set one up to see what’s happening each period.</>
          ) : (
            <>
              Using {school.short}’s published{year} bell schedule and calendar.
            </>
          )}
        </p>
        <div className="row">
          {custom && <Chip color="var(--warn)">Custom schedule</Chip>}
          <Chip>
            {dates.length} {dates.length === 1 ? 'day change' : 'day changes'}
            {dates.length > 0 && ` · ${upcoming} upcoming`}
          </Chip>
        </div>
        <div className="row">
          <Link to="/schedule" className="btn">
            Bell schedule &amp; day overrides
          </Link>
        </div>
      </div>
    </Card>
  );
}
