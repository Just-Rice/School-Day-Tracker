// Small pieces shared by the homework pages and the Today page's HomeworkDueCard.
import { useCallback, useId, useState, type ReactNode } from 'react';
import type { Assignment, ClassInfo } from '../../types';
import { useData } from '../../data/DataProvider';
import { setDone } from '../../lib/homework';
import { Chip } from '../ui';

/** A large, round "done" checkbox (a real checkbox underneath, so it works with the keyboard). */
export function DoneCheck({ checked, onChange, label, color }: { checked: boolean; onChange: (done: boolean) => void; label: string; color?: string }) {
  return (
    <label className="hw-check" style={color ? ({ '--hw-color': color } as React.CSSProperties) : undefined} title={checked ? 'Mark not done' : 'Mark done'}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="hw-check-box" aria-hidden>
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </label>
  );
}

export function ClassChip({ cls }: { cls: ClassInfo }) {
  return (
    <Chip color={cls.color}>
      <span className="hw-chip-text">
        {cls.icon ? cls.icon + ' ' : ''}
        {cls.name}
      </span>
    </Chip>
  );
}

/** A labelled group for controls that can't sit inside a <label> (segmented buttons, chips). */
export function FieldGroup({ label, hint, children, wide }: { label: ReactNode; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  const id = useId();
  return (
    <div className={'field' + (wide ? ' field-wide' : '')} role="group" aria-labelledby={id}>
      <span className="field-label" id={id}>
        {label}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

/** Segmented buttons for picking one of a few values. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented hw-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Toggles done and remembers which assignments were checked here, so lists can keep showing them
 * (checked, struck through) until the user leaves, which is what makes unchecking an undo.
 */
export function useToggleDone() {
  const { saveAssignment } = useData();
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback(
    (a: Assignment, done: boolean) => {
      if (done) setPinned((prev) => new Set(prev).add(a.id));
      // a failed save shows in the app's error banner
      saveAssignment(setDone(a, done)).catch(() => undefined);
    },
    [saveAssignment],
  );
  const unpinAll = useCallback(() => setPinned(new Set()), []);
  return { pinned, toggle, unpinAll };
}
