import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { AssignmentType, ClassInfo, DayInfo, ISODate } from '../../types';
import { useData } from '../../data/DataProvider';
import { ASSIGNMENT_TYPES, defaultDueDate, emptyAssignment, isAssignmentType, nextMeetingDate, relativeDue } from '../../lib/homework';
import { Button } from '../ui';

/**
 * One-line add: type a title and press Enter. The due date follows the chosen class's next
 * meeting (or tomorrow) until the user picks a date themselves.
 */
export default function QuickAdd({ classes, today, getDay, initialClassId }: { classes: ClassInfo[]; today: ISODate; getDay: (d: ISODate) => DayInfo; initialClassId?: string }) {
  const { saveAssignment } = useData();
  const active = useMemo(() => classes.filter((c) => !c.archived), [classes]);
  const [title, setTitle] = useState('');
  const [classId, setClassId] = useState(() => (initialClassId && active.some((c) => c.id === initialClassId) ? initialClassId : ''));
  const [type, setType] = useState<AssignmentType>('homework');
  const [pickedDue, setPickedDue] = useState<ISODate | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const meeting = useMemo(() => (classId ? nextMeetingDate(classId, today, getDay, classes) : null), [classId, today, getDay, classes]);
  const autoDue = useMemo(() => defaultDueDate(classId, today, getDay, classes), [classId, today, getDay, classes]);
  const due = pickedDue ?? autoDue;
  const cls = active.find((c) => c.id === classId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await saveAssignment(emptyAssignment({ title: t, classId: classId || null, type, dueDate: due }));
      setTitle('');
      setPickedDue(null);
      setAdded(t);
    } catch {
      // the app shows the error banner
    } finally {
      setBusy(false);
      titleRef.current?.focus();
    }
  }

  const hint = due === meeting && cls ? `Due ${relativeDue(due, today)}, next ${cls.name} class` : `Due ${relativeDue(due, today)}`;

  return (
    <form className="card hw-quick" onSubmit={submit} aria-label="Quick add homework">
      <div className="hw-quick-title">
        <label htmlFor="hw-quick-title" className="sr-only">
          New assignment title
        </label>
        <input
          id="hw-quick-title"
          ref={titleRef}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setAdded(null);
          }}
          placeholder="Add homework…"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={200}
        />
        <Button type="submit" variant="primary" disabled={!title.trim() || busy}>
          Add
        </Button>
      </div>
      <div className="hw-quick-opts">
        <label className="hw-quick-opt">
          <span className="sr-only">Class</span>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setPickedDue(null);
            }}
          >
            <option value="">No class</option>
            {active.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? c.icon + ' ' : ''}
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="hw-quick-opt">
          <span className="sr-only">Type</span>
          <select value={type} onChange={(e) => isAssignmentType(e.target.value) && setType(e.target.value)}>
            {ASSIGNMENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="hw-quick-opt">
          <span className="sr-only">Due date</span>
          <input type="date" value={due} onChange={(e) => setPickedDue(e.target.value || null)} required />
        </label>
      </div>
      <p className="hw-quick-hint muted small" aria-live="polite">
        {added ? <>Added “{added}”.</> : hint}
      </p>
    </form>
  );
}
