import { useState } from 'react';
import type { SchoolSchedule } from '../types';
import { Button, Card, Chip, Page, Spinner } from '../components/ui';
import BellView from '../components/schedule/BellView';
import CalendarView from '../components/schedule/CalendarView';
import DayOverridesCard from '../components/schedule/DayOverridesCard';
import ScheduleEditor from '../components/schedule/ScheduleEditor';
import { DayChips } from '../components/schedule/bits';
import { prepareForSave, renameInClass, renameInOverrides } from '../components/schedule/editorOps';
import { useConfirm } from '../components/schedule/useConfirm';
import { useData } from '../data/DataProvider';
import { clean } from '../data/store';
import { activeCustomSchedule, useNow, useSchedule } from '../hooks/useSchedule';
import { formatDate, todayISO } from '../lib/dates';
import { formatTimeRange, isISODate } from '../lib/schedule';
import { loadSchoolSchedule, SCHOOLS } from '../schools';
import './schedule.css';

function SourceLinks({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <ul className="source-links">
      {urls.map((u) => (
        <li key={u}>
          <a href={u} target="_blank" rel="noreferrer">
            {u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function SchedulePage() {
  const { profile, classes, saveProfile, saveClass } = useData();
  const { schedule, loading, error, getDay } = useSchedule();
  const now = useNow(60000);
  const today = todayISO(now);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [ask, confirmModal] = useConfirm();
  const school = SCHOOLS[profile.schoolId];
  const isCustom = !!activeCustomSchedule(profile);
  const todayInfo = getDay(today);

  const copy = async (base: SchoolSchedule) => {
    setBusy(true);
    setProblem(null);
    try {
      await saveProfile({ customSchedule: clean({ ...structuredClone(base), schoolId: profile.schoolId }) });
      setEditing(true);
    } catch {
      setProblem('Could not save your copy of the schedule.');
    } finally {
      setBusy(false);
    }
  };
  // there's room for one custom schedule; one made for another school is kept until replaced here
  const otherCustom = !isCustom ? profile.customSchedule : undefined;
  const customize = async (base: SchoolSchedule) => {
    if (!otherCustom) return copy(base);
    const was = otherCustom.schoolId && otherCustom.schoolId !== 'other' ? (SCHOOLS[otherCustom.schoolId]?.short ?? 'your other school') : 'your other school';
    ask({
      title: `Replace your custom schedule for ${was}?`,
      body: `You can keep only one custom bell schedule, so customizing this one replaces the one you made for ${was}.`,
      confirmLabel: 'Replace',
      run: () => void copy(base),
    });
  };
  const fromTemplate = async () => {
    try {
      const t = await loadSchoolSchedule('other');
      await customize({ ...t, schoolId: profile.schoolId, source: { urls: [], note: 'Set up by you from the blank template.', verified: false } });
    } catch {
      setProblem('Could not load the template. Check your connection and try again.');
    }
  };
  const reset = () =>
    ask({
      title: "Reset to the school's schedule?",
      body: "Your edits to periods, bell times and the calendar will be lost. Your day changes (snow days and such) are kept.",
      confirmLabel: 'Reset',
      run: () => {
        setEditing(false);
        void saveProfile({ customSchedule: undefined }).catch(() => setProblem('Could not reset the schedule.'));
      },
    });

  const title = 'Bell schedule';
  if (!schedule) {
    return (
      <Page title={title}>
        <Card>
          {loading ? (
            <Spinner label="Loading the bell schedule…" />
          ) : (
            <div className="stack">
              <div className="banner banner-warn" role="alert">
                {error ?? 'There is no bell schedule yet.'}
              </div>
              <p>Start from a blank template (seven periods, Monday to Friday) and change the times, periods and calendar to match your school.</p>
              <div>
                <Button variant="primary" onClick={fromTemplate} disabled={busy}>
                  Start from a template
                </Button>
              </div>
              {problem && <p className="banner banner-error">{problem}</p>}
            </div>
          )}
        </Card>
        {confirmModal}
      </Page>
    );
  }

  const src = schedule.source;
  const subtitle = (
    <>
      {school.short === 'Other' ? 'Your school' : school.short} · {schedule.schoolYear || 'School year'}
      {isCustom && (
        <>
          {' '}
          <Chip color="var(--accent)">Customized</Chip>
        </>
      )}
    </>
  );

  if (editing && isCustom) {
    return (
      <Page title="Edit bell schedule" subtitle={subtitle}>
        <ScheduleEditor
          initial={schedule}
          today={today}
          ask={ask}
          onCancel={() => setEditing(false)}
          onSave={async (s, renames) => {
            setProblem(null);
            // renamed period, cycle day and bell ids carry over to the classes and day changes using them
            const dayOverrides = renameInOverrides(profile.dayOverrides, renames);
            try {
              await saveProfile({ customSchedule: clean(prepareForSave(s)), ...(dayOverrides !== profile.dayOverrides && { dayOverrides }) });
            } catch {
              return setProblem('Could not save the schedule.');
            }
            try {
              await Promise.all(classes.map((c) => renameInClass(c, renames)).filter((c, i) => c !== classes[i]).map((c) => saveClass(c)));
            } catch {
              // the schedule is saved, so close the editor (saving again would apply the renames twice)
              setProblem('The schedule was saved, but some classes could not be updated to the new IDs. Check their periods and days.');
            }
            setEditing(false);
            window.scrollTo?.({ top: 0 });
          }}
        />
        {problem && <p className="banner banner-error">{problem}</p>}
        {confirmModal}
      </Page>
    );
  }

  return (
    <Page
      title={title}
      subtitle={subtitle}
      actions={
        isCustom ? (
          <Button variant="primary" small onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : (
          <Button variant="primary" small onClick={() => customize(schedule)} disabled={busy}>
            Customize
          </Button>
        )
      }
    >
      {problem && <p className="banner banner-error">{problem}</p>}
      {!isCustom && profile.schoolId === 'other' && (
        <div className="banner banner-info" role="note">
          This is a generic template. Use <strong>Customize</strong> to set your school’s periods, bell times and calendar.
        </div>
      )}
      {src && !src.verified && !isCustom && profile.schoolId !== 'other' && (
        <div className="banner banner-warn" role="note">
          These times haven’t been checked against an official {school.short} schedule yet. Double-check them with your school
          {src.urls.length ? ' (sources below)' : ''}, and use <strong>Customize</strong> to fix anything that’s off.
        </div>
      )}
      <Card className="sched-today">
        <span className="now-label">Today · {formatDate(today)}</span>
        <span className="row">
          <DayChips day={todayInfo} schedule={schedule} />
          {todayInfo.isSchoolDay && todayInfo.slots.length > 0 && (
            <span className="muted small">{formatTimeRange(todayInfo.slots[0].start, todayInfo.slots.reduce((a, x) => (x.end > a ? x.end : a), todayInfo.slots[0].end), profile.clock)}</span>
          )}
        </span>
      </Card>
      <Card title="Bell schedules" className="sched-cards">
        <BellView schedule={schedule} clock={profile.clock} todayBellId={todayInfo.bell?.id} todayCycleId={todayInfo.cycleDay?.id} />
      </Card>
      <DayOverridesCard schedule={schedule} today={today} />
      <Card title="Calendar" className="sched-cards">
        <CalendarView schedule={schedule} today={today} />
      </Card>
      <Card title="About this schedule" className="sched-cards">
        <div className="stack">
          {isCustom ? (
            <p style={{ margin: 0 }}>You’re using your own customized copy. Changes you make only affect your account.</p>
          ) : (
            <p style={{ margin: 0 }}>
              {school.short === 'Other' ? 'This is a blank template.' : `The ${school.name} schedule built into the app.`} Use Customize to make your own copy and edit it.
            </p>
          )}
          {src?.note && <p className="muted" style={{ margin: 0 }}>{src.note}</p>}
          {src && src.urls.length > 0 && (
            <div>
              <span className="small">Sources:</span>
              <SourceLinks urls={src.urls} />
            </div>
          )}
          {src?.retrieved && isISODate(src.retrieved) && <p className="muted small" style={{ margin: 0 }}>Checked {formatDate(src.retrieved)}{src.verified ? ' · verified' : ' · not verified'}</p>}
          {isCustom && (
            <div>
              <Button variant="danger" small onClick={reset}>
                Reset to the school’s schedule
              </Button>
            </div>
          )}
        </div>
      </Card>
      {confirmModal}
    </Page>
  );
}
