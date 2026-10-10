import type { SchoolSchedule, SlotKind } from '../../types';
import { Button } from '../ui';
import IdInput from './IdInput';
import { addPeriod, periodUsage, removePeriod, SLOT_KINDS } from './editorOps';
import type { EditorSectionProps } from './ScheduleEditor';

export default function EditPeriods({ s, onChange, rename, ask }: EditorSectionProps) {
  const setPeriod = (i: number, patch: Partial<SchoolSchedule['periods'][number]>) => onChange({ ...s, periods: s.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const remove = (id: string, name: string) => {
    const used = periodUsage(s, id);
    if (!used) return onChange(removePeriod(s, id));
    ask({
      title: `Remove ${name || id}?`,
      body: `It's used in ${used} bell time${used === 1 ? '' : 's'}, which will be removed too. Classes in this period won't show on your schedule until you pick another period for them.`,
      confirmLabel: 'Remove',
      run: () => onChange(removePeriod(s, id)),
    });
  };

  return (
    <>
      <p className="muted small">The blocks of the day. Classes pick the periods they meet in, and each bell schedule gives the periods their times. IDs are short codes (1, 2, L, HR).</p>
      <div className="ed-head ed-period" aria-hidden>
        <span>ID</span>
        <span>Name</span>
        <span>Kind</span>
        <span />
      </div>
      <ul className="ed-rows">
        {s.periods.map((p, i) => (
          <li key={i} className="ed-period">
            <IdInput label={`ID of ${p.name || 'period ' + (i + 1)}`} value={p.id} taken={s.periods.filter((_, j) => j !== i).map((x) => x.id)} onCommit={(id) => rename('period', p.id, id)} />
            <input aria-label={`Name of period ${p.id}`} value={p.name} onChange={(e) => setPeriod(i, { name: e.target.value })} />
            <select aria-label={`Kind of ${p.name || p.id}`} value={p.kind ?? 'class'} onChange={(e) => setPeriod(i, { kind: e.target.value === 'class' ? undefined : (e.target.value as SlotKind) })}>
              {SLOT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <Button small variant="ghost" className="ed-del" onClick={() => remove(p.id, p.name)} aria-label={`Remove ${p.name || p.id}`}>
              ✕
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button small onClick={() => onChange(addPeriod(s))}>
          + Add period
        </Button>
      </div>
    </>
  );
}
