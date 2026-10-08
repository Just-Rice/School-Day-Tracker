import { useMemo, useRef, useState } from 'react';
import type { DayOverride, ISODate, SchoolSchedule } from '../../types';
import { useData } from '../../data/DataProvider';
import { formatDate, relativeDay } from '../../lib/dates';
import { cleanOverride, describeOverride, isISODate, resolveDay } from '../../lib/schedule';
import { Button, Card, Chip, Field } from '../ui';

type Kind = 'school' | 'off' | 'makeup';

const kindOf = (o: DayOverride): Kind => (o.noSchool === true ? 'off' : o.noSchool === false ? 'makeup' : 'school');

function without(overrides: Record<ISODate, DayOverride>, date: ISODate): Record<ISODate, DayOverride> {
  return Object.fromEntries(Object.entries(overrides).filter(([d]) => d !== date));
}

function dayText(schedule: SchoolSchedule, date: ISODate, overrides: Record<ISODate, DayOverride>): string {
  if (!isISODate(date)) return '';
  const d = resolveDay(schedule, date, overrides);
  if (!d.isSchoolDay) return `No school (${d.reason})`;
  return [d.cycleDay && schedule.cycle.mode === 'rotation' ? d.cycleDay.name : '', d.bell?.name, ...d.notes.filter((n) => n !== d.bell?.name)].filter(Boolean).join(' · ') || 'School day';
}

/** Per-user changes to single dates: snow days, "today is Day 3", early dismissals. */
export default function DayOverridesCard({ schedule, today }: { schedule: SchoolSchedule; today: ISODate }) {
  const { profile, saveProfile } = useData();
  const overrides = profile.dayOverrides;
  const [date, setDate] = useState<ISODate>(today);
  const [draft, setDraft] = useState<DayOverride>(() => overrides[today] ?? {});
  const [status, setStatus] = useState('');
  const dateRef = useRef<HTMLInputElement>(null);

  const existing = overrides[date];
  const kind = kindOf(draft);
  const others = useMemo(() => without(overrides, date), [overrides, date]);
  const cleaned = cleanOverride(draft);
  const regular = schedule.bells[0];

  const pick = (d: ISODate) => {
    setDate(d);
    setDraft(overrides[d] ?? {});
    setStatus('');
  };
  const save = async (next: Record<ISODate, DayOverride>, msg: string) => {
    try {
      await saveProfile({ dayOverrides: next });
      setStatus(msg);
    } catch {
      setStatus('Could not save the change.');
    }
  };
  const apply = () => {
    if (!isISODate(date)) return;
    if (!cleaned) return remove(date);
    void save({ ...others, [date]: cleaned }, `Saved the change for ${formatDate(date)}.`);
  };
  const remove = (d: ISODate) => {
    void save(without(overrides, d), `Removed the change for ${formatDate(d)}.`);
    if (d === date) setDraft({});
  };

  const list = Object.keys(overrides).sort();
  const upcoming = list.filter((d) => d >= today);
  const past = list.filter((d) => d < today);

  const item = (d: ISODate) => (
    <li key={d} className="ov-item">
      <span>
        <span className="cal-date">{relativeDay(d, today)}</span>
        {relativeDay(d, today) !== formatDate(d) && <span className="muted small"> · {formatDate(d)}</span>}
        <br />
        <span>{describeOverride(overrides[d], schedule)}</span>
      </span>
      <span className="row">
        <Button
          small
          variant="ghost"
          onClick={() => {
            pick(d);
            dateRef.current?.focus();
          }}
          aria-label={`Edit the change for ${formatDate(d)}`}
        >
          Edit
        </Button>
        <Button small variant="danger" onClick={() => remove(d)} aria-label={`Remove the change for ${formatDate(d)}`}>
          Remove
        </Button>
      </span>
    </li>
  );

  return (
    <Card title="Day changes" className="sched-cards">
      <p className="muted small" style={{ marginTop: -4 }}>
        Snow day? Early dismissal?{schedule.cycle.mode === 'rotation' ? ' School says it’s a different day in the rotation?' : ''} Change a single date here; it only affects your schedule.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="form-grid">
          <Field label="Date" hint={isISODate(date) ? `Scheduled: ${dayText(schedule, date, others)}` : undefined}>
            <input ref={dateRef} type="date" value={date} onChange={(e) => pick(e.target.value)} required />
          </Field>
          <Field label="What happens">
            <select
              value={kind}
              onChange={(e) => {
                const k = e.target.value as Kind;
                setDraft({ ...draft, noSchool: k === 'off' ? true : k === 'makeup' ? false : undefined });
              }}
            >
              <option value="school">School, with changes</option>
              <option value="off">No school</option>
              <option value="makeup">School on a day off (make-up day)</option>
            </select>
          </Field>
          <Field label="Name (optional)">
            <input value={draft.name ?? ''} placeholder={kind === 'off' ? 'Snow day' : 'Early dismissal'} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          {kind !== 'off' && schedule.cycle.days.length > 0 && (
            <Field label={schedule.cycle.mode === 'rotation' ? 'Cycle day' : 'Follow the schedule of'}>
              <select value={draft.cycleDay ?? ''} onChange={(e) => setDraft({ ...draft, cycleDay: e.target.value || undefined })}>
                <option value="">As scheduled</option>
                {schedule.cycle.days.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind !== 'off' && schedule.bells.length > 1 && (
            <Field label="Bell schedule">
              <select value={draft.bell ?? ''} onChange={(e) => setDraft({ ...draft, bell: e.target.value || undefined })}>
                <option value="">As scheduled</option>
                {schedule.bells.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="row" aria-label="Quick picks" role="group">
          <span className="muted small">Quick:</span>
          <Chip onClick={() => setDraft({ noSchool: true, name: 'Snow day' })}>Snow day</Chip>
          {schedule.bells
            .filter((b) => b !== regular)
            .map((b) => (
              <Chip key={b.id} onClick={() => setDraft({ name: b.name, bell: b.id })}>
                {b.name}
              </Chip>
            ))}
        </div>
        {isISODate(date) && cleaned && (
          <p className="small" style={{ margin: 0 }}>
            <strong>With this change:</strong> {dayText(schedule, date, { ...others, [date]: cleaned })}
          </p>
        )}
        <div className="row">
          <Button type="submit" variant="primary" disabled={!isISODate(date) || (!cleaned && !existing)}>
            {existing ? (cleaned ? 'Update change' : 'Remove change') : 'Save change'}
          </Button>
          {existing && cleaned && (
            <Button variant="danger" onClick={() => remove(date)}>
              Remove
            </Button>
          )}
          <span className="muted small" role="status">
            {status}
          </span>
        </div>
      </form>
      {(upcoming.length > 0 || past.length > 0) && <hr className="divider" />}
      {upcoming.length > 0 && (
        <>
          <h3>Your changes</h3>
          <ul className="list ov-list">{upcoming.map(item)}</ul>
        </>
      )}
      {past.length > 0 && (
        <details className="ov-past">
          <summary>Past changes ({past.length})</summary>
          <ul className="list ov-list">{past.map(item)}</ul>
          <Button small variant="danger" onClick={() => void save(Object.fromEntries(Object.entries(overrides).filter(([d]) => d >= today)), 'Cleared past changes.')}>
            Clear past changes
          </Button>
        </details>
      )}
    </Card>
  );
}
