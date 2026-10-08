import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Assignment, AssignmentStatus, ISODate, Priority } from '../types';
import { Button, Card, Chip, EmptyState, Field, Modal, Page } from '../components/ui';
import LinksEditor from '../components/homework/LinksEditor';
import SubtasksEditor from '../components/homework/SubtasksEditor';
import { FieldGroup, Segmented } from '../components/homework/bits';
import { useData } from '../data/DataProvider';
import { classesOnDay, useNow, useSchedule } from '../hooks/useSchedule';
import { addDays, formatDate, formatTime, todayISO } from '../lib/dates';
import { isISODate } from '../lib/schedule';
import {
  ASSIGNMENT_TYPES,
  PRIORITIES,
  STATUSES,
  defaultDueDate,
  emptyAssignment,
  isAssignmentType,
  makeLink,
  nextMeetingDate,
  normalizeAssignment,
  relativeDue,
  withCompletion,
} from '../lib/homework';
import './homework.css';

/** keyed by route so going from one assignment to another starts a fresh form */
export default function HomeworkEditPage() {
  const { id } = useParams();
  const { search } = useLocation();
  return <AssignmentEditor key={id ?? 'new' + search} id={id} />;
}

function AssignmentEditor({ id }: { id?: string }) {
  const { assignments, classes, profile, saveAssignment, deleteAssignment } = useData();
  const { getDay } = useSchedule();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const now = useNow(60000);
  const today = todayISO(now);
  const isNew = !id;

  // a snapshot: later changes (another device, our own delete) don't reset what's being edited
  const [initial] = useState<Assignment | undefined>(() => {
    if (id) {
      const found = assignments.find((a) => a.id === id);
      return found && normalizeAssignment(found);
    }
    const classId = params.get('classId');
    const type = params.get('type');
    return emptyAssignment({
      classId: classId && classes.some((c) => c.id === classId) ? classId : null,
      type: isAssignmentType(type) ? type : 'homework',
    });
  });
  const [draft, setDraft] = useState<Assignment | undefined>(initial);
  // new assignments follow the class's next meeting until a date is picked
  const dueParam = params.get('due');
  const [pickedDue, setPickedDue] = useState<ISODate | null>(() => (isNew ? (isISODate(dueParam) ? dueParam : null) : (initial?.dueDate ?? null)));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const classId = draft?.classId ?? null;
  const autoDue = useMemo(() => defaultDueDate(classId, today, getDay, classes), [classId, today, getDay, classes]);
  const nextClass = useMemo(() => (classId ? nextMeetingDate(classId, today, getDay, classes) : null), [classId, today, getDay, classes]);
  const due = pickedDue ?? autoDue;
  // the class's start time on the due date, offered as a due time
  const classStart = useMemo(() => {
    if (!classId) return undefined;
    const day = getDay(due);
    return day.isSchoolDay ? classesOnDay(day, classes).find((m) => m.cls?.id === classId)?.slot.start : undefined;
  }, [classId, due, getDay, classes]);

  const goBack = () => {
    // 'default' is the first page this tab opened: there's nothing of ours to go back to
    if (location.key !== 'default') navigate(-1);
    else navigate('/homework', { replace: true });
  };

  if (!draft || !initial) {
    return (
      <Page title="Assignment not found">
        <Card>
          <EmptyState
            icon="🔎"
            title="This assignment isn't here"
            action={
              <Link className="btn btn-primary" to="/homework">
                Back to homework
              </Link>
            }
          >
            It may have been deleted, maybe on another device.
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const set = (p: Partial<Assignment>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const cls = classes.find((c) => c.id === classId);
  const classOptions = classes.filter((c) => !c.archived || c.id === classId);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || saving) return;
    const title = draft.title.trim();
    if (!title) {
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    const minutes = draft.estimatedMinutes;
    const out = withCompletion({
      ...draft,
      title,
      dueDate: due,
      dueTime: draft.dueTime || undefined,
      notes: draft.notes?.trim() ? draft.notes : undefined,
      estimatedMinutes: minutes && minutes > 0 ? Math.round(minutes) : undefined,
      links: draft.links.filter((l) => l.url.trim()).map((l) => makeLink(l.label, l.url)),
      subtasks: draft.subtasks.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text),
    });
    setSaving(true);
    try {
      await saveAssignment(out);
      goBack();
    } catch {
      setSaving(false);
    }
  }

  async function remove() {
    setConfirmDelete(false);
    setSaving(true);
    try {
      await deleteAssignment(initial!.id);
      goBack();
    } catch {
      setSaving(false);
    }
  }

  const quickDue: { label: string; date: ISODate | null; hint?: string }[] = [
    { label: 'Next class', date: nextClass, hint: nextClass ? relativeDue(nextClass, today) : undefined },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'In a week', date: addDays(today, 7) },
  ];

  return (
    <Page
      title={isNew ? 'New assignment' : 'Edit assignment'}
      subtitle={cls ? cls.name : undefined}
      actions={
        <Button type="submit" form="hw-edit-form" variant="primary" disabled={saving}>
          Save
        </Button>
      }
    >
      <form id="hw-edit-form" className="hw-form" onSubmit={save} noValidate>
        <Card>
          <div className="form-grid">
            <Field
              label={
                <>
                  Title <span aria-hidden>*</span>
                </>
              }
              wide
            >
              <input
                ref={titleRef}
                value={draft.title}
                onChange={(e) => {
                  set({ title: e.target.value });
                  if (titleError && e.target.value.trim()) setTitleError(false);
                }}
                placeholder="e.g. Read chapter 4, problems 1–20"
                required
                aria-invalid={titleError || undefined}
                aria-describedby={titleError ? 'hw-title-error' : undefined}
                autoFocus={isNew}
                maxLength={200}
              />
            </Field>
            {titleError && (
              <p id="hw-title-error" className="hw-error field-wide" role="alert">
                Give the assignment a title.
              </p>
            )}
            <Field label="Class">
              <select
                value={classId ?? ''}
                onChange={(e) => set({ classId: e.target.value || null })}
              >
                <option value="">No class</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon ? c.icon + ' ' : ''}
                    {c.name}
                    {c.archived ? ' (archived)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estimated time" hint="Minutes">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={5}
                value={draft.estimatedMinutes ?? ''}
                onChange={(e) => set({ estimatedMinutes: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
                placeholder="e.g. 30"
              />
            </Field>
            <FieldGroup label="Type" wide>
              <div className="hw-chips">
                {ASSIGNMENT_TYPES.map((t) => (
                  <Chip key={t.id} active={draft.type === t.id} onClick={() => set({ type: t.id })} color="var(--accent)">
                    <span aria-hidden>{t.emoji}</span> {t.label}
                  </Chip>
                ))}
              </div>
            </FieldGroup>
          </div>
        </Card>

        <Card title="Due">
          <div className="form-grid">
            <Field label="Date">
              <input type="date" value={due} onChange={(e) => e.target.value && setPickedDue(e.target.value)} required />
            </Field>
            <Field label="Time (optional)">
              <input type="time" value={draft.dueTime ?? ''} onChange={(e) => set({ dueTime: e.target.value || undefined })} />
            </Field>
            <FieldGroup label="Quick pick" wide hint={`${formatDate(due, { long: true })}${draft.dueTime ? ' at ' + formatTime(draft.dueTime, profile.clock) : ''}`}>
              <div className="hw-chips">
                {quickDue.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    className={'chip hw-quick-chip' + (q.date && q.date === due ? ' chip-active' : '')}
                    style={{ '--chip': 'var(--accent)' } as React.CSSProperties}
                    aria-pressed={!!q.date && q.date === due}
                    disabled={!q.date}
                    title={q.label === 'Next class' && !q.date ? (classId ? 'No meeting found in the next 3 weeks' : 'Pick a class first') : undefined}
                    onClick={() => q.date && setPickedDue(q.date)}
                  >
                    {q.label}
                    {q.hint && <span className="hw-chip-hint"> · {q.hint}</span>}
                  </button>
                ))}
                {classStart && (
                  <button
                    type="button"
                    className={'chip hw-quick-chip' + (draft.dueTime === classStart ? ' chip-active' : '')}
                    style={{ '--chip': 'var(--accent)' } as React.CSSProperties}
                    aria-pressed={draft.dueTime === classStart}
                    onClick={() => set({ dueTime: classStart })}
                  >
                    Start of class · {formatTime(classStart, profile.clock)}
                  </button>
                )}
                {draft.dueTime && (
                  <button type="button" className="chip hw-quick-chip" onClick={() => set({ dueTime: undefined })}>
                    No time
                  </button>
                )}
              </div>
            </FieldGroup>
          </div>
        </Card>

        <Card>
          <div className="form-grid">
            <FieldGroup label="Priority">
              <Segmented<Priority> label="Priority" options={PRIORITIES} value={draft.priority} onChange={(v) => set({ priority: v })} />
            </FieldGroup>
            <FieldGroup label="Status">
              <Segmented<AssignmentStatus> label="Status" options={STATUSES} value={draft.status} onChange={(v) => set({ status: v })} />
            </FieldGroup>
          </div>
        </Card>

        <Card title="Steps">
          <SubtasksEditor value={draft.subtasks} onChange={(subtasks) => set({ subtasks })} />
        </Card>

        <Card title="Notes and links">
          <div className="stack">
            <Field label="Notes">
              <textarea value={draft.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Instructions, pages, who to ask…" rows={4} />
            </Field>
            <FieldGroup label="Links">
              <LinksEditor value={draft.links} onChange={(links) => set({ links })} />
            </FieldGroup>
          </div>
        </Card>

        <div className="hw-form-actions">
          {!isNew && (
            <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
              Delete
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={goBack} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Add assignment' : 'Save'}
          </Button>
        </div>
      </form>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this assignment?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          </>
        }
      >
        <p>“{initial.title || 'Untitled'}” will be deleted. This can't be undone.</p>
      </Modal>
    </Page>
  );
}
