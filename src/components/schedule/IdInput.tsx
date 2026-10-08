import { useEffect, useId, useState } from 'react';

/**
 * An id field that only commits on blur or Enter, so renames (which cascade through the
 * schedule) never happen half-typed. Empty or duplicate values are rejected and reverted.
 */
export default function IdInput({ value, taken, onCommit, label, disabled }: { value: string; taken: string[]; onCommit: (id: string) => void; label: string; disabled?: boolean }) {
  const [text, setText] = useState(value);
  const [error, setError] = useState('');
  const errId = useId();
  useEffect(() => setText(value), [value]);

  const commit = () => {
    const t = text.trim();
    if (t === value) return setError('');
    if (!t) {
      setText(value);
      return setError('An ID is required');
    }
    if (t === '*' || taken.includes(t)) {
      setText(value);
      return setError(`"${t}" is already used`);
    }
    setError('');
    onCommit(t);
  };

  return (
    <span className="id-input">
      <input
        className="mono"
        aria-label={label}
        value={text}
        disabled={disabled}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      {error && (
        <span id={errId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
