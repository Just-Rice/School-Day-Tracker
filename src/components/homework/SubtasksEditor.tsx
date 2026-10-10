import { useRef, type KeyboardEvent } from 'react';
import type { Subtask } from '../../types';
import { makeSubtask, moveItem } from '../../lib/homework';
import { Button } from '../ui';

/**
 * Checklist editor: toggle, rename, reorder (up/down) and remove steps, or add one with Enter.
 * The new step's text (`pending`) belongs to the page, so it can save a step typed but not added.
 */
export default function SubtasksEditor({
  value,
  onChange,
  pending: text,
  onPendingChange: setText,
}: {
  value: Subtask[];
  onChange: (v: Subtask[]) => void;
  pending: string;
  onPendingChange: (text: string) => void;
}) {
  const addRef = useRef<HTMLInputElement>(null);
  const done = value.filter((s) => s.done).length;

  const update = (id: string, p: Partial<Subtask>) => onChange(value.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const add = () => {
    if (!text.trim()) return;
    onChange([...value, makeSubtask(text)]);
    setText('');
    addRef.current?.focus();
  };
  // Enter adds a step here instead of submitting the whole form
  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="hw-subtasks">
      {value.length > 0 && (
        <>
          <div className="hw-progress" role="progressbar" aria-label="Steps done" aria-valuemin={0} aria-valuemax={value.length} aria-valuenow={done}>
            <span style={{ width: `${(done / value.length) * 100}%` }} />
          </div>
          <p className="muted small">
            {done} of {value.length} done
          </p>
        </>
      )}
      <ul className="hw-edit-list">
        {value.map((s, i) => (
          <li key={s.id} className={'hw-subtask' + (s.done ? ' hw-is-done' : '')}>
            <input type="checkbox" checked={s.done} onChange={(e) => update(s.id, { done: e.target.checked })} aria-label={`Done: ${s.text || 'step ' + (i + 1)}`} />
            <input
              className="hw-subtask-text"
              value={s.text}
              onChange={(e) => update(s.id, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRef.current?.focus();
                }
              }}
              aria-label={`Step ${i + 1}`}
            />
            <span className="hw-icon-btns">
              <Button small variant="ghost" onClick={() => onChange(moveItem(value, i, -1))} disabled={i === 0} aria-label={`Move step ${i + 1} up`}>
                ↑
              </Button>
              <Button small variant="ghost" onClick={() => onChange(moveItem(value, i, 1))} disabled={i === value.length - 1} aria-label={`Move step ${i + 1} down`}>
                ↓
              </Button>
              <Button small variant="ghost" onClick={() => onChange(value.filter((x) => x.id !== s.id))} aria-label={`Remove step ${i + 1}`}>
                ✕
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="hw-add-row">
        <label className="sr-only" htmlFor="hw-add-subtask">
          New step
        </label>
        <input id="hw-add-subtask" ref={addRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onAddKey} placeholder="Add a step, e.g. “Outline”" maxLength={200} />
        <Button onClick={add} disabled={!text.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
