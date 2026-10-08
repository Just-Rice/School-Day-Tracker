import { useState, type KeyboardEvent } from 'react';
import type { LinkItem } from '../../types';
import { isSafeUrl, makeLink, moveItem } from '../../lib/homework';
import { Button } from '../ui';

/** Links (Google Classroom, a doc, the rubric): edit in place, reorder, remove, or add new ones. */
export default function LinksEditor({ value, onChange }: { value: LinkItem[]; onChange: (v: LinkItem[]) => void }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');

  const update = (i: number, p: Partial<LinkItem>) => onChange(value.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const add = () => {
    if (!url.trim()) return;
    onChange([...value, makeLink(label, url)]);
    setLabel('');
    setUrl('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="hw-links">
      {value.length > 0 && (
        <ul className="hw-edit-list">
          {value.map((l, i) => (
            <li key={i} className="hw-link-row">
              <div className="hw-link-fields">
                <input value={l.label} onChange={(e) => update(i, { label: e.target.value })} aria-label={`Link ${i + 1} name`} placeholder="Name" />
                <input value={l.url} onChange={(e) => update(i, { url: e.target.value })} aria-label={`Link ${i + 1} address`} placeholder="https://" inputMode="url" />
              </div>
              <span className="hw-icon-btns">
                {isSafeUrl(l.url) && (
                  <a className="btn btn-ghost btn-sm" href={l.url} target="_blank" rel="noreferrer noopener" aria-label={`Open ${l.label || l.url}`} title="Open">
                    ↗
                  </a>
                )}
                <Button small variant="ghost" onClick={() => onChange(moveItem(value, i, -1))} disabled={i === 0} aria-label={`Move link ${i + 1} up`}>
                  ↑
                </Button>
                <Button small variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove link ${i + 1}`}>
                  ✕
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="hw-add-row hw-add-link">
        <label className="sr-only" htmlFor="hw-link-label">
          New link name
        </label>
        <input id="hw-link-label" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={onKey} placeholder="Name (optional)" maxLength={100} />
        <label className="sr-only" htmlFor="hw-link-url">
          New link address
        </label>
        <input id="hw-link-url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={onKey} placeholder="Paste a link" inputMode="url" autoComplete="url" />
        <Button onClick={add} disabled={!url.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
