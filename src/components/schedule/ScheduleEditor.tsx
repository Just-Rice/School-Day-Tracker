import { useMemo, useState, type ReactNode } from 'react';
import type { ISODate, SchoolSchedule } from '../../types';
import { validateSchedule } from '../../lib/schedule';
import { Button } from '../ui';
import EditBells from './EditBells';
import EditCalendar from './EditCalendar';
import EditCycle from './EditCycle';
import EditPeriods from './EditPeriods';
import type { useConfirm } from './useConfirm';

export interface EditorSectionProps {
  s: SchoolSchedule;
  onChange: (s: SchoolSchedule) => void;
  ask: ReturnType<typeof useConfirm>[0];
  today: ISODate;
}

function Section({ title, count, children, open = true }: { title: string; count?: number; children: ReactNode; open?: boolean }) {
  return (
    <details className="card ed-section" open={open}>
      <summary>
        <h2>{title}</h2>
        {count !== undefined && <span className="muted small">{count}</span>}
      </summary>
      <div className="stack ed-body">{children}</div>
    </details>
  );
}

/**
 * Edits a copy of the schedule; nothing is saved until Save. Problems from validateSchedule are
 * shown live but don't block saving (the engine copes with them).
 */
export default function ScheduleEditor({ initial, today, ask, onSave, onCancel }: { initial: SchoolSchedule; today: ISODate; ask: EditorSectionProps['ask']; onSave: (s: SchoolSchedule) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const problems = useMemo(() => validateSchedule(draft), [draft]);
  const dirty = draft !== initial;
  const props: EditorSectionProps = { s: draft, onChange: setDraft, ask, today };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => {
    if (!dirty) return onCancel();
    ask({ title: 'Discard your changes?', body: 'Your edits since the last save will be lost.', confirmLabel: 'Discard', run: onCancel });
  };

  const bar = (
    <div className="ed-bar">
      <Button variant="primary" onClick={save} disabled={saving || !dirty}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
      <Button onClick={cancel} disabled={saving}>
        {dirty ? 'Cancel' : 'Done'}
      </Button>
      <span className="muted small">{dirty ? 'Unsaved changes' : 'No changes'}</span>
    </div>
  );

  return (
    <div className="editor stack">
      {bar}
      <div className={'banner ' + (problems.length ? 'banner-warn' : 'banner-info')} role="status">
        {problems.length === 0 ? (
          'No problems found.'
        ) : (
          <>
            <strong>
              {problems.length} problem{problems.length === 1 ? '' : 's'} to check:
            </strong>
            <ul className="ed-problems">
              {problems.slice(0, 12).map((p, i) => (
                <li key={i}>{p}</li>
              ))}
              {problems.length > 12 && <li>…and {problems.length - 12} more</li>}
            </ul>
          </>
        )}
      </div>
      <Section title="Periods" count={draft.periods.length}>
        <EditPeriods {...props} />
      </Section>
      <Section title="Bell schedules" count={draft.bells.length}>
        <EditBells {...props} />
      </Section>
      <Section title="Cycle" count={draft.cycle.days.length}>
        <EditCycle {...props} />
      </Section>
      <Section title="Calendar">
        <EditCalendar {...props} />
      </Section>
      {bar}
    </div>
  );
}
