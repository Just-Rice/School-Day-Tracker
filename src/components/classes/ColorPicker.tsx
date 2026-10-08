import { useId, type CSSProperties } from 'react';
import { CLASS_COLOR_OPTIONS, colorName } from '../../lib/classes';

/** Palette swatches (radio buttons) plus a custom color input. */
export default function ColorPicker({ value, onChange, error }: { value: string; onChange: (hex: string) => void; error?: string }) {
  const name = useId();
  const custom = !colorName(value);
  return (
    <fieldset className="cls-fieldset">
      <legend className="field-label">Color</legend>
      <div className="swatches">
        {CLASS_COLOR_OPTIONS.map((c) => (
          <label key={c.hex} className="swatch" title={c.name} style={{ '--swatch': c.hex } as CSSProperties}>
            <input type="radio" name={name} value={c.hex} checked={value.toLowerCase() === c.hex} onChange={() => onChange(c.hex)} aria-label={c.name} />
            <span aria-hidden>✓</span>
          </label>
        ))}
        <label className={'swatch swatch-custom' + (custom ? ' swatch-on' : '')} title="Custom color">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} aria-label="Custom color" />
        </label>
      </div>
      {error && <span className="field-hint cls-err">{error}</span>}
    </fieldset>
  );
}
