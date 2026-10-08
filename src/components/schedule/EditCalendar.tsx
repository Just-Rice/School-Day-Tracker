import type { NoSchoolDay, SchoolCalendar, SpecialDay } from '../../types';
import { Button, Field } from '../ui';
import type { EditorSectionProps } from './ScheduleEditor';

export default function EditCalendar({ s, onChange, today }: EditorSectionProps) {
  const cal = s.calendar;
  const rotation = s.cycle.mode === 'rotation';
  const setCal = (patch: Partial<SchoolCalendar>) => onChange({ ...s, calendar: { ...cal, ...patch } });
  const setOff = (i: number, patch: Partial<NoSchoolDay>) => setCal({ noSchool: cal.noSchool.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const setSpecial = (i: number, patch: Partial<SpecialDay>) => setCal({ specialDays: cal.specialDays.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const newDate = today >= cal.firstDay && today <= cal.lastDay ? today : cal.firstDay || today;

  return (
    <>
      <div className="form-grid">
        <Field label="School year">
          <input value={s.schoolYear} onChange={(e) => onChange({ ...s, schoolYear: e.target.value })} placeholder="2026-2027" />
        </Field>
        <Field label="First day of school">
          <input type="date" value={cal.firstDay} onChange={(e) => setCal({ firstDay: e.target.value })} />
        </Field>
        <Field label="Last day of school">
          <input type="date" value={cal.lastDay} onChange={(e) => setCal({ lastDay: e.target.value })} />
        </Field>
      </div>

      {rotation && s.cycle.days.length > 0 && (
        <div className="stack ed-group">
          <label className="check">
            <input
              type="checkbox"
              checked={!!cal.anchor}
              onChange={(e) => setCal({ anchor: e.target.checked ? { date: newDate, cycleDay: s.cycle.days[0].id } : undefined })}
            />
            Set a known cycle day
          </label>
          <p className="muted small" style={{ margin: 0 }}>
            The rotation is counted forwards and backwards from this day. Without it, the first day of school is {s.cycle.days[0].name}.
          </p>
          {cal.anchor && (
            <div className="form-grid">
              <Field label="Date">
                <input type="date" value={cal.anchor.date} onChange={(e) => setCal({ anchor: { ...cal.anchor!, date: e.target.value } })} />
              </Field>
              <Field label="Was">
                <select value={cal.anchor.cycleDay} onChange={(e) => setCal({ anchor: { ...cal.anchor!, cycleDay: e.target.value } })}>
                  {!s.cycle.days.some((d) => d.id === cal.anchor!.cycleDay) && <option value={cal.anchor.cycleDay}>{cal.anchor.cycleDay} (unknown)</option>}
                  {s.cycle.days.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>
      )}

      <h3 className="ed-sub">Days off</h3>
      {cal.noSchool.length === 0 && <p className="muted small">No days off yet.</p>}
      <ul className="ed-rows ed-cards">
        {cal.noSchool.map((d, i) => (
          <li key={i} className="ed-card">
            <Field label="Name">
              <input value={d.name} placeholder="Thanksgiving break" onChange={(e) => setOff(i, { name: e.target.value })} />
            </Field>
            <Field label="From">
              <input type="date" value={d.date} onChange={(e) => setOff(i, { date: e.target.value })} />
            </Field>
            <Field label="To (optional)">
              <input type="date" value={d.end ?? ''} min={d.date} onChange={(e) => setOff(i, { end: e.target.value || undefined })} />
            </Field>
            <Button small variant="ghost" className="ed-del" onClick={() => setCal({ noSchool: cal.noSchool.filter((_, j) => j !== i) })} aria-label={`Remove ${d.name || 'day off'}`}>
              ✕
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button small onClick={() => setCal({ noSchool: [...cal.noSchool, { date: newDate, name: '' }] })}>
          + Add day off
        </Button>
      </div>

      <h3 className="ed-sub">Special days</h3>
      <p className="muted small" style={{ margin: 0 }}>
        Days with a different bell schedule (early dismissal, delayed opening){rotation ? ', a forced cycle day, or that don’t count in the rotation' : ' or that follow another day’s schedule'}.
      </p>
      <ul className="ed-rows ed-cards">
        {cal.specialDays.map((d, i) => (
          <li key={i} className="ed-card">
            <Field label="Name">
              <input value={d.name ?? ''} placeholder="Early dismissal" onChange={(e) => setSpecial(i, { name: e.target.value })} />
            </Field>
            <Field label="Date">
              <input type="date" value={d.date} onChange={(e) => setSpecial(i, { date: e.target.value })} />
            </Field>
            <Field label="Bell schedule">
              <select value={d.bell ?? ''} onChange={(e) => setSpecial(i, { bell: e.target.value || undefined })}>
                <option value="">As usual</option>
                {d.bell && !s.bells.some((b) => b.id === d.bell) && <option value={d.bell}>{d.bell} (unknown)</option>}
                {s.bells.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            {s.cycle.days.length > 0 && (
              <Field label={rotation ? 'Cycle day' : 'Follow the schedule of'}>
                <select value={d.cycleDay ?? ''} onChange={(e) => setSpecial(i, { cycleDay: e.target.value || undefined })}>
                  <option value="">As scheduled</option>
                  {d.cycleDay && !s.cycle.days.some((c) => c.id === d.cycleDay) && <option value={d.cycleDay}>{d.cycleDay} (unknown)</option>}
                  {s.cycle.days.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {rotation && (
              <label className="check ed-check">
                <input type="checkbox" checked={d.advance === false} onChange={(e) => setSpecial(i, { advance: e.target.checked ? false : undefined })} />
                Doesn’t count in the rotation
              </label>
            )}
            <Button small variant="ghost" className="ed-del" onClick={() => setCal({ specialDays: cal.specialDays.filter((_, j) => j !== i) })} aria-label={`Remove ${d.name || 'special day'}`}>
              ✕
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button small onClick={() => setCal({ specialDays: [...cal.specialDays, { date: newDate, name: '', bell: s.bells[1]?.id }] })}>
          + Add special day
        </Button>
      </div>
    </>
  );
}
