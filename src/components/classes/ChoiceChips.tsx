import type { ReactNode } from 'react';

export interface Choice {
  value: string;
  label: ReactNode;
  /** tooltip / extra description */
  title?: string;
  /** shown after a divider (e.g. lunch, or periods no longer in the schedule) */
  secondary?: boolean;
}

/**
 * A group of checkbox chips. With `allLabel`, a first chip stands for "none picked = all"
 * (e.g. "Every day"): it's checked while `value` is empty and clears the others when picked.
 */
export default function ChoiceChips({
  legend,
  hint,
  choices,
  value,
  onChange,
  allLabel,
  error,
  id,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  choices: Choice[];
  value: string[];
  onChange: (v: string[]) => void;
  allLabel?: string;
  error?: string;
  id?: string;
}) {
  const toggle = (v: string, on: boolean) => {
    const next = on ? [...value, v] : value.filter((x) => x !== v);
    // keep the order of the choices so saved values are tidy
    onChange(choices.map((c) => c.value).filter((x) => next.includes(x)).concat(next.filter((x) => !choices.some((c) => c.value === x))));
  };
  const primary = choices.filter((c) => !c.secondary);
  const secondary = choices.filter((c) => c.secondary);
  const chip = (c: Choice) => (
    <label key={c.value} className="pick" title={c.title}>
      <input type="checkbox" checked={value.includes(c.value)} onChange={(e) => toggle(c.value, e.target.checked)} />
      <span>{c.label}</span>
    </label>
  );
  return (
    <fieldset className="cls-fieldset" id={id} aria-invalid={error ? true : undefined}>
      <legend className="field-label">{legend}</legend>
      <div className="pick-row">
        {allLabel && (
          <label className="pick">
            <input type="checkbox" checked={value.length === 0} onChange={(e) => e.target.checked && onChange([])} />
            <span>{allLabel}</span>
          </label>
        )}
        {primary.map(chip)}
        {secondary.length > 0 && primary.length > 0 && <span className="pick-sep" aria-hidden />}
        {secondary.map(chip)}
      </div>
      {error && <span className="field-hint cls-err">{error}</span>}
      {hint && <span className="field-hint">{hint}</span>}
    </fieldset>
  );
}
