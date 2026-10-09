import type { CSSProperties } from 'react';
import type { SchoolId } from '../../types';
import { SCHOOL_LIST } from '../../schools';

const BLURB: Record<SchoolId, string> = {
  hsn: 'Grades 9–12 · bell schedule, room map and walking directions',
  cms: 'Grades 6–8 · bell schedule, room map and walking directions',
  other: 'Set up your own bell schedule · no map',
};

/** School choice as big radio cards (keyboard: arrow keys move between them). */
export default function SchoolPicker({ value, onChange, name = 'school', compact }: { value: SchoolId; onChange: (id: SchoolId) => void; name?: string; compact?: boolean }) {
  return (
    <div className={'school-options' + (compact ? ' school-options-compact' : '')} role="radiogroup" aria-label="School">
      {SCHOOL_LIST.map((s) => (
        <label key={s.id} className={'school-option' + (value === s.id ? ' is-selected' : '')} style={{ '--opt': s.color } as CSSProperties}>
          <input type="radio" name={name} value={s.id} checked={value === s.id} onChange={() => onChange(s.id)} />
          <span className="school-mark" aria-hidden>
            {s.id === 'other' ? '＋' : s.short}
          </span>
          <span className="school-text">
            <strong>{s.id === 'other' ? 'Another school' : s.name}</strong>
            {!compact && s.address && <span className="muted small">{s.address}</span>}
            <span className="muted small">{BLURB[s.id]}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
