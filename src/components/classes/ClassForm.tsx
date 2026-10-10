// The add/edit form for every field of a class. The page decides where to go after saving.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ClassInfo, CourseLevel, SchoolSchedule, Teacher, Term } from '../../types';
import { useData } from '../../data/DataProvider';
import { useSchedule } from '../../hooks/useSchedule';
import { meetingTimes } from '../../lib/schedule';
import {
  COURSE_LEVELS,
  LEVEL_LABELS,
  TERM_LABELS,
  TERMS,
  cycleDayName,
  describeDays,
  describePeriods,
  periodConflicts,
  prepareClass,
  suggestIcon,
  validateClass,
  withClassDefaults,
  type PeriodConflict,
} from '../../lib/classes';
import { rebaseEdits } from '../../lib/homework';
import { Button, Card, Field, Modal, Spinner, useUnsavedChanges } from '../ui';
import ChoiceChips, { type Choice } from './ChoiceChips';
import ColorPicker from './ColorPicker';
import IconPicker from './IconPicker';
import RoomPicker from './RoomPicker';
import { AltRoomsEditor, CustomFieldsEditor, LinksEditor } from './RowEditors';
import { meetingLine } from './MeetingTimes';
import { errorText, settleSoon } from './saving';

const splitList = (s: string) => s.split(/[,;\s]+/).filter(Boolean);

function Err({ msg }: { msg?: string }) {
  return msg ? <span className="cls-err">{msg}</span> : null;
}

function periodChoices(schedule: SchoolSchedule, selected: string[]): Choice[] {
  const isClass = (k?: string) => !k || k === 'class';
  const short = (name: string) => /^Period\s+(\S+)$/i.exec(name)?.[1];
  const make = (id: string, name: string, secondary: boolean): Choice => {
    const s = short(name);
    return { value: id, secondary, title: name, label: s ? <><span aria-hidden>{s}</span><span className="sr-only">{name}</span></> : name };
  };
  const known = new Set(schedule.periods.map((p) => p.id));
  return [
    ...schedule.periods.filter((p) => isClass(p.kind)).map((p) => make(p.id, p.name, false)),
    ...schedule.periods.filter((p) => !isClass(p.kind)).map((p) => make(p.id, p.name, true)),
    // periods saved earlier that the schedule no longer has, so they can be unticked
    ...selected.filter((id) => !known.has(id)).map((id) => ({ value: id, label: `${id} (not in schedule)`, secondary: true })),
  ];
}

function ConflictWarning({ conflicts, schedule }: { conflicts: PeriodConflict[]; schedule: SchoolSchedule | null }) {
  if (!conflicts.length) return null;
  return (
    <div className="banner banner-warn cls-banner" role="status">
      <strong>Shares a period with another class.</strong>
      <ul>
        {conflicts.map((x) => (
          <li key={x.other.id}>
            {describePeriods(x.periods, schedule)}
            {x.days ? ` on ${describeDays(x.days, schedule)}` : ''}: <strong>{x.other.name}</strong>
          </li>
        ))}
      </ul>
      <span className="small">That’s fine for a lab or a class that alternates days; on days both meet, the one set to specific days is shown.</span>
    </div>
  );
}

export default function ClassForm({
  initial,
  isNew,
  onSaved,
  onCancel,
  onDelete,
  leaving,
}: {
  initial: ClassInfo;
  isNew: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
  /** shows a Delete button (existing classes) */
  onDelete?: () => void;
  /** the page is leaving on its own (the class is being deleted): unsaved edits don't matter */
  leaving?: boolean;
}) {
  const { profile, classes, saveClass } = useData();
  const { schedule, loading: scheduleLoading } = useSchedule();
  const schoolId = profile.schoolId;
  const clock = profile.clock;
  const fid = useId().replace(/:/g, '');
  const id = (key: string) => `${fid}-${key.replace(/\./g, '-')}`;

  const [c, setC] = useState<ClassInfo>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [creditsText, setCreditsText] = useState(initial.credits?.toString() ?? '');
  const [periodsText, setPeriodsText] = useState(initial.periods.join(', '));
  const [daysText, setDaysText] = useState((initial.days ?? []).join(', '));
  // the icon we filled in from the name; null once the user picks one themselves
  const autoIcon = useRef<string | null>(isNew && !initial.icon ? '' : null);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = validateClass(c);
  const shown = submitted ? errors : {};
  const cycleDays = schedule?.cycle.days ?? [];
  const cycleIds = cycleDays.map((d) => d.id);
  const conflicts = periodConflicts(classes, c, cycleIds);
  const dirty = JSON.stringify(c) !== JSON.stringify(initial);
  const neverMeets = !!schedule && c.periods.length > 0 && meetingTimes(schedule, c).length === 0;

  // a tab, Back or swipe-back while there are edits asks first, like Cancel does
  const unsaved = useUnsavedChanges(dirty && !saving && !leaving);

  // after a failed submit, move focus to the first field with a problem
  useEffect(() => {
    if (!focusTick) return;
    const bad = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target = bad?.matches('input, select, textarea') ? bad : bad?.querySelector<HTMLElement>('input, select, textarea, button');
    target?.focus();
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [focusTick]);

  const set = (patch: Partial<ClassInfo>) => setC((prev) => ({ ...prev, ...patch }));
  const setTeacher = (patch: Partial<Teacher>) => setC((prev) => ({ ...prev, teacher: { ...prev.teacher, ...patch } }));

  const setName = (name: string) => {
    const patch: Partial<ClassInfo> = { name };
    if (autoIcon.current !== null && (c.icon ?? '') === autoIcon.current) {
      const guess = suggestIcon(name) ?? '';
      patch.icon = guess;
      autoIcon.current = guess;
    }
    set(patch);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) {
      setFocusTick((t) => t + 1);
      return;
    }
    setSaving(true);
    setSaveError(null);
    // Only what was changed here goes over the stored class, which may have changed since the form
    // opened (archived on another device, say); writing the whole snapshot would undo that.
    const live = classes.find((x) => x.id === c.id);
    const out = prepareClass(live ? rebaseEdits(initial, c, withClassDefaults(live)) : c, cycleIds);
    try {
      await settleSoon(saveClass(out));
      unsaved.allowLeave();
      onSaved(out.id);
    } catch (err) {
      setSaveError(errorText(err));
      setSaving(false);
    }
  };

  const cancel = () => (dirty ? setConfirmDiscard(true) : onCancel());
  const keepEditing = () => {
    setConfirmDiscard(false);
    unsaved.stay();
  };

  const dayChoices: Choice[] = cycleDays.map((d) => ({ value: d.id, label: cycleDayName(d.id, schedule) }));
  const errorCount = Object.keys(shown).length;

  let when: ReactNode;
  if (schedule) {
    when = (
      <>
        <ChoiceChips
          id={id('periods')}
          legend="Period"
          choices={periodChoices(schedule, c.periods)}
          value={c.periods}
          onChange={(periods) => set({ periods })}
          hint={c.periods.length > 1 ? 'Picked more than one: the class meets in each of them (e.g. a double-period lab).' : undefined}
        />
        {cycleDays.length > 1 && (
          <ChoiceChips
            id={id('days')}
            legend={schedule.cycle.mode === 'weekday' ? 'Days' : 'Cycle days'}
            allLabel="Every day"
            choices={dayChoices}
            value={c.days ?? []}
            onChange={(v) => set({ days: v.length && v.length < cycleIds.length ? v : undefined })}
            hint="Leave on “Every day” unless the class only meets on some days (e.g. a lab or an alternating class)."
          />
        )}
        {c.periods.length > 0 &&
          (neverMeets ? (
            <div className="banner banner-warn cls-banner" role="status">
              With these days, this class never meets: {describePeriods(c.periods, schedule)} isn’t on the {describeDays(c.days, schedule)} schedule.
            </div>
          ) : (
            <p className="when-preview">
              <span className="muted">Meets </span>
              {meetingLine(schedule, c, clock)}
            </p>
          ))}
      </>
    );
  } else if (scheduleLoading) {
    when = <Spinner label="Loading the bell schedule…" />;
  } else {
    when = (
      <div className="form-grid">
        <Field label="Periods" hint="Period numbers or names, separated by commas.">
          <input
            id={id('periods')}
            value={periodsText}
            placeholder="e.g. 3 or 3, 4"
            onChange={(e) => {
              setPeriodsText(e.target.value);
              set({ periods: splitList(e.target.value) });
            }}
          />
        </Field>
        <Field label="Days" hint="Leave empty if it meets every day.">
          <input
            id={id('days')}
            value={daysText}
            placeholder="e.g. A, C or Mon, Wed"
            onChange={(e) => {
              setDaysText(e.target.value);
              const d = splitList(e.target.value);
              set({ days: d.length ? d : undefined });
            }}
          />
        </Field>
      </div>
    );
  }

  return (
    <form ref={formRef} className="class-form" onSubmit={submit} noValidate aria-label={isNew ? 'New class' : `Edit ${initial.name}`}>
      <Card title="Class">
        <div className="form-grid">
          <Field label="Name *" wide hint={<Err msg={shown.name} />}>
            <input
              id={id('name')}
              value={c.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AP Chemistry"
              autoFocus={isNew}
              required
              aria-invalid={shown.name ? true : undefined}
              autoComplete="off"
            />
          </Field>
          <div className="field-wide">
            <IconPicker
              id={id('icon')}
              value={c.icon ?? ''}
              suggested={suggestIcon(c.name)}
              error={shown.icon}
              onChange={(icon) => {
                autoIcon.current = null;
                set({ icon });
              }}
            />
          </div>
          <div className="field-wide">
            <ColorPicker value={c.color} onChange={(color) => set({ color })} error={shown.color} />
          </div>
          <Field label="Level">
            <select id={id('level')} value={c.level ?? ''} onChange={(e) => set({ level: (e.target.value || undefined) as CourseLevel | undefined })}>
              <option value="">—</option>
              {COURSE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Term">
            <select id={id('term')} value={c.term} onChange={(e) => set({ term: e.target.value as Term })}>
              {TERMS.map((t) => (
                <option key={t} value={t}>
                  {TERM_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Course code">
            <input id={id('courseCode')} value={c.courseCode ?? ''} onChange={(e) => set({ courseCode: e.target.value })} placeholder="e.g. 0532" autoComplete="off" />
          </Field>
          <Field label="Section">
            <input id={id('section')} value={c.section ?? ''} onChange={(e) => set({ section: e.target.value })} placeholder="e.g. 04" autoComplete="off" />
          </Field>
          <Field label="Credits" hint={<Err msg={shown.credits} />}>
            <input
              id={id('credits')}
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={creditsText}
              placeholder="e.g. 5"
              aria-invalid={shown.credits ? true : undefined}
              onChange={(e) => {
                setCreditsText(e.target.value);
                set({ credits: e.target.value.trim() === '' ? undefined : Number(e.target.value) });
              }}
            />
          </Field>
        </div>
      </Card>

      <Card title="When">
        <div className="stack gap-12">
          {when}
          <ConflictWarning conflicts={conflicts} schedule={schedule} />
        </div>
      </Card>

      <Card title="Where">
        <div className="stack gap-12">
          <RoomPicker id={id('room')} schoolId={schoolId} value={c.room} onChange={(room) => set({ room })} />
          <AltRoomsEditor rows={c.altRooms ?? []} onChange={(altRooms) => set({ altRooms })} errors={shown} idPrefix={fid} schoolId={schoolId} dayChoices={cycleDays.length > 1 ? dayChoices : []} />
        </div>
      </Card>

      <Card title="Teacher">
        <div className="form-grid">
          <Field label="Name">
            <input id={id('teacher.name')} value={c.teacher.name} onChange={(e) => setTeacher({ name: e.target.value })} placeholder="e.g. Ms. Rivera" autoComplete="off" />
          </Field>
          <Field label="Email" hint={<Err msg={shown['teacher.email']} />}>
            <input id={id('teacher.email')} type="email" inputMode="email" value={c.teacher.email ?? ''} onChange={(e) => setTeacher({ email: e.target.value })} placeholder="name@wwprsd.org" autoComplete="off" aria-invalid={shown['teacher.email'] ? true : undefined} />
          </Field>
          <Field label="Phone" hint={<Err msg={shown['teacher.phone']} />}>
            <input id={id('teacher.phone')} type="tel" value={c.teacher.phone ?? ''} onChange={(e) => setTeacher({ phone: e.target.value })} placeholder="e.g. 609-716-5050 x1234" autoComplete="off" aria-invalid={shown['teacher.phone'] ? true : undefined} />
          </Field>
          <Field label="Website" hint={<Err msg={shown['teacher.website']} />}>
            <input id={id('teacher.website')} type="url" inputMode="url" value={c.teacher.website ?? ''} onChange={(e) => setTeacher({ website: e.target.value })} placeholder="sites.google.com/…" autoComplete="off" aria-invalid={shown['teacher.website'] ? true : undefined} />
          </Field>
          <Field label="Office / extra-help room">
            <input id={id('teacher.office')} value={c.teacher.office ?? ''} onChange={(e) => setTeacher({ office: e.target.value })} placeholder="e.g. Science office, 214" autoComplete="off" />
          </Field>
          <Field label="Office hours / extra help" wide>
            <textarea id={id('teacher.officeHours')} rows={2} value={c.teacher.officeHours ?? ''} onChange={(e) => setTeacher({ officeHours: e.target.value })} placeholder="e.g. Tue & Thu after school, 2:50–3:30" />
          </Field>
        </div>
      </Card>

      <Card title="Links">
        <LinksEditor links={c.links} onChange={(links) => set({ links })} errors={shown} idPrefix={fid} />
      </Card>

      <Card title="Course details">
        <div className="form-grid">
          <Field label="Current grade">
            <input id={id('grade')} value={c.grade ?? ''} onChange={(e) => set({ grade: e.target.value })} placeholder="e.g. A- or 94" autoComplete="off" />
          </Field>
          <Field label="Materials to bring" wide>
            <textarea id={id('materials')} rows={3} value={c.materials ?? ''} onChange={(e) => set({ materials: e.target.value })} placeholder="Binder, graphing calculator, lab goggles…" />
          </Field>
          <Field label="Grading policy" wide>
            <textarea id={id('gradingPolicy')} rows={3} value={c.gradingPolicy ?? ''} onChange={(e) => set({ gradingPolicy: e.target.value })} placeholder="Tests 50%, quizzes 25%, homework 15%, labs 10%…" />
          </Field>
          <Field label="Notes" wide>
            <textarea id={id('notes')} rows={4} value={c.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything else worth remembering" />
          </Field>
        </div>
      </Card>

      <Card title="More details">
        <p className="muted small cls-card-intro">Add any detail with a name and a value: your locker number, where you sit, the textbook’s ISBN, the Google Classroom code…</p>
        <CustomFieldsEditor fields={c.customFields} onChange={(customFields) => set({ customFields })} errors={shown} idPrefix={fid} />
      </Card>

      <div className="form-bar">
        {(saveError || errorCount > 0) && (
          <div className="banner banner-error form-bar-msg" role="alert">
            {saveError ?? (errorCount === 1 ? 'Fix the highlighted field to save.' : `Fix the ${errorCount} highlighted fields to save.`)}
          </div>
        )}
        <div className="form-bar-buttons">
          {onDelete && (
            <Button variant="danger" onClick={onDelete} disabled={saving}>
              Delete
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Add class' : 'Save'}
          </button>
        </div>
      </div>

      <Modal
        open={confirmDiscard || unsaved.blocked}
        onClose={keepEditing}
        title="Discard changes?"
        footer={
          <>
            <Button onClick={keepEditing}>Keep editing</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDiscard(false);
                if (unsaved.blocked) unsaved.proceed();
                else {
                  unsaved.allowLeave();
                  onCancel();
                }
              }}
            >
              Discard
            </Button>
          </>
        }
      >
        <p className="muted">{isNew ? 'This class hasn’t been added yet.' : 'Your changes to this class haven’t been saved.'}</p>
      </Modal>
    </form>
  );
}
