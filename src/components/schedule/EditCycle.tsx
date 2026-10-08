import { Button } from '../ui';
import IdInput from './IdInput';
import { addCycleDay, moveItem, removeCycleDay, renameCycleDay, toWeekdayCycle, WEEKDAY_CYCLE } from './editorOps';
import type { EditorSectionProps } from './ScheduleEditor';

export default function EditCycle({ s, onChange, ask }: EditorSectionProps) {
  const weekday = s.cycle.mode === 'weekday';
  const isWeekdayIds = s.cycle.days.length > 0 && s.cycle.days.every((d) => WEEKDAY_CYCLE.some((w) => w.id === d.id));
  const setName = (i: number, name: string) => onChange({ ...s, cycle: { ...s.cycle, days: s.cycle.days.map((d, j) => (j === i ? { ...d, name } : d)) } });

  const toWeekday = () => {
    if (isWeekdayIds) return onChange({ ...s, cycle: { ...s.cycle, mode: 'weekday' } });
    ask({
      title: 'Switch to weekdays?',
      body: 'The cycle days become Monday to Friday. Times set for the current cycle days are dropped, except that bells without all-days times keep the first day’s times.',
      confirmLabel: 'Switch',
      run: () => onChange(toWeekdayCycle(s)),
    });
  };

  return (
    <>
      <div className="segmented" role="group" aria-label="How the days repeat">
        <button type="button" aria-pressed={!weekday} onClick={() => onChange({ ...s, cycle: { ...s.cycle, mode: 'rotation' } })}>
          Rotation
        </button>
        <button type="button" aria-pressed={weekday} onClick={toWeekday}>
          Weekdays
        </button>
      </div>
      <p className="muted small">
        {weekday
          ? 'Each weekday has its own schedule (Monday, Tuesday, …).'
          : 'The cycle days take turns, one per school day, skipping weekends and days off (Day 1, Day 2, … or A, B). The order below is the rotation order.'}
      </p>
      <div className="ed-head ed-cycle" aria-hidden>
        <span>ID</span>
        <span>Name</span>
        <span />
      </div>
      <ul className="ed-rows">
        {s.cycle.days.map((d, i) => (
          <li key={i} className="ed-cycle">
            <IdInput label={`ID of ${d.name || 'cycle day ' + (i + 1)}`} value={d.id} disabled={weekday} taken={s.cycle.days.filter((_, j) => j !== i).map((x) => x.id)} onCommit={(id) => onChange(renameCycleDay(s, d.id, id))} />
            <input aria-label={`Name of cycle day ${d.id}`} value={d.name} onChange={(e) => setName(i, e.target.value)} />
            {!weekday && (
              <span className="ed-btns">
                <Button small variant="ghost" disabled={i === 0} onClick={() => onChange({ ...s, cycle: { ...s.cycle, days: moveItem(s.cycle.days, i, -1) } })} aria-label={`Move ${d.name} earlier`}>
                  ↑
                </Button>
                <Button small variant="ghost" disabled={i === s.cycle.days.length - 1} onClick={() => onChange({ ...s, cycle: { ...s.cycle, days: moveItem(s.cycle.days, i, 1) } })} aria-label={`Move ${d.name} later`}>
                  ↓
                </Button>
                <Button
                  small
                  variant="ghost"
                  className="ed-del"
                  onClick={() =>
                    ask({ title: `Remove ${d.name || d.id}?`, body: 'Its bell times are removed too.', confirmLabel: 'Remove', run: () => onChange(removeCycleDay(s, d.id)) })
                  }
                  aria-label={`Remove ${d.name || d.id}`}
                >
                  ✕
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!weekday && (
        <div>
          <Button small onClick={() => onChange(addCycleDay(s))}>
            + Add cycle day
          </Button>
        </div>
      )}
      {weekday && !isWeekdayIds && (
        <div>
          <Button small onClick={() => onChange(toWeekdayCycle(s))}>
            Use Monday–Friday
          </Button>
        </div>
      )}
    </>
  );
}
