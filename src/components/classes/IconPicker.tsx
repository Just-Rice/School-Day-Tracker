import { useState } from 'react';
import { ICON_SUGGESTIONS } from '../../lib/classes';

const FIRST = 14;

/** Emoji text input plus a row of subject emoji to pick from. */
export default function IconPicker({ value, onChange, suggested, error, id }: { value: string; onChange: (icon: string) => void; suggested?: string; error?: string; id?: string }) {
  const [more, setMore] = useState(false);
  // the icon that fits the class name comes first
  const all = suggested ? [...ICON_SUGGESTIONS.filter((s) => s.icon === suggested), ...ICON_SUGGESTIONS.filter((s) => s.icon !== suggested)] : ICON_SUGGESTIONS;
  const shown = more ? all : all.slice(0, FIRST);
  return (
    <div className="field icon-picker">
      <label className="field-label" htmlFor={id}>
        Icon
      </label>
      <div className="row icon-row">
        <input id={id} className="icon-input" value={value} maxLength={12} placeholder="🙂" aria-invalid={error ? true : undefined} aria-describedby={id && `${id}-hint`} onChange={(e) => onChange(e.target.value)} />
        <span className="field-hint" id={id && `${id}-hint`}>
          {error ? <span className="cls-err">{error}</span> : 'An emoji or a few letters. Leave it empty to show initials.'}
        </span>
      </div>
      <div className="icon-grid" role="group" aria-label="Suggested icons">
        {shown.map((s) => (
          <button key={s.icon} type="button" className={'icon-btn' + (value === s.icon ? ' on' : '')} aria-pressed={value === s.icon} aria-label={s.label} title={s.label} onClick={() => onChange(value === s.icon ? '' : s.icon)}>
            {s.icon}
          </button>
        ))}
        {all.length > FIRST && (
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            {more ? 'Fewer' : 'More…'}
          </button>
        )}
      </div>
    </div>
  );
}
