// Backup files: everything a user owns as one JSON file they can download and import again
// (into this device, another device or an account). parseBackup is strict about shapes and
// lenient about details: it keeps every usable item, drops unknown fields, fits text to what an
// account can store, and explains what it skipped or shortened.
import type {
  Assignment,
  AssignmentStatus,
  AssignmentType,
  BellSlot,
  ClassInfo,
  ClassRoom,
  CourseLevel,
  CustomField,
  DayOverride,
  LinkItem,
  Priority,
  Profile,
  SchoolId,
  SchoolSchedule,
  SlotKind,
  Subtask,
  Teacher,
  Term,
} from '../types';
import { ASSIGNMENT_LISTS, ASSIGNMENT_TEXT, CLASS_LISTS, CLASS_TEXT, PROFILE_MAPS, PROFILE_TEXT } from '../data/limits';
import { clean } from '../data/store';
import { toISODate } from './dates';
import { isClockTime } from './schedule';

export const BACKUP_APP = 'school-day-tracker';
export const BACKUP_VERSION = 1;
/** refuse anything bigger than this before even parsing it */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export interface BackupData {
  profile: Profile | null;
  classes: ClassInfo[];
  assignments: Assignment[];
}

export interface Backup extends BackupData {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
}

export interface ParsedBackup extends BackupData {
  exportedAt?: string;
  /** things that were dropped, in plain words (empty when everything came through) */
  warnings: string[];
}

export function makeBackup(data: BackupData, now: Date = new Date()): Backup {
  return clean({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    profile: data.profile,
    classes: data.classes,
    assignments: data.assignments,
  });
}

export function backupFileName(now: Date = new Date()): string {
  return `school-day-tracker-backup-${toISODate(now)}.json`;
}

/** Saves the backup as a .json download. */
export function downloadBackup(backup: Backup, fileName: string = backupFileName()): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // let the download start before the URL goes away
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------------------------
// Parsing and validation
// ---------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => isStr(v) && (list as readonly string[]).includes(v);

/** called with what had to be shortened, e.g. 'notes' */
type Cut = (what: string) => void;
const noCut: Cut = () => {};

// Caps for text an account doesn't limit itself (it sits inside a map there, like the teacher's
// details); they only stop absurd files. Fields an account does limit use ../data/limits.
const LINE = 1000;
const URL_MAX = 8000;
const LONG = 50000;

/** a trimmed string capped at max chars, or undefined when empty / not a string */
function text(v: unknown, max = 500, cut?: () => void): string | undefined {
  if (!isStr(v)) return undefined;
  const t = v.trim();
  if (t.length > max) cut?.();
  return t ? t.slice(0, max) : undefined;
}
/** like text() but keeps line breaks and doesn't require content */
function longText(v: unknown, max = LONG, cut?: () => void): string | undefined {
  if (!isStr(v) || !v.trim()) return undefined;
  if (v.length > max) cut?.();
  return v.slice(0, max);
}
/** the first max of a list, reporting the rest */
function upTo<T>(list: T[], max: number, cut?: () => void): T[] {
  if (list.length > max) cut?.();
  return list.slice(0, max);
}
function strList(v: unknown, max = 50, cut?: () => void): string[] {
  return Array.isArray(v)
    ? upTo(
        v
          .filter(isStr)
          .map((s) => s.trim())
          .filter(Boolean),
        max,
        cut,
      )
    : [];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const SCHOOL_IDS: readonly SchoolId[] = ['hsn', 'cms', 'other'];
const TERMS: readonly Term[] = ['full', 'S1', 'S2', 'Q1', 'Q2', 'Q3', 'Q4'];
const LEVELS: readonly CourseLevel[] = ['CP', 'Honors', 'AP', 'Accelerated', 'Other'];
const TYPES: readonly AssignmentType[] = ['homework', 'test', 'quiz', 'project', 'essay', 'reading', 'lab', 'other'];
const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high'];
const STATUSES: readonly AssignmentStatus[] = ['todo', 'in_progress', 'done'];
const DEFAULT_COLOR = '#4b5563';

function links(v: unknown, max: number, cut: Cut): LinkItem[] {
  if (!Array.isArray(v)) return [];
  const c = () => cut('links');
  const out = v.filter(isObj).flatMap((l) => {
    const url = text(l.url, URL_MAX, c);
    return url ? [{ label: text(l.label, LINE, c) ?? '', url }] : [];
  });
  return upTo(out, max, c);
}

function customFields(v: unknown, cut: Cut): CustomField[] {
  if (!Array.isArray(v)) return [];
  const c = () => cut('details');
  const out = v.filter(isObj).flatMap((f) => {
    const key = text(f.key, LINE, c);
    if (key && isStr(f.value) && f.value.length > LONG) c();
    return key ? [{ key, value: isStr(f.value) ? f.value.slice(0, LONG) : '' }] : [];
  });
  return upTo(out, CLASS_LISTS.customFields, c);
}

function room(v: unknown, cut: () => void): ClassRoom {
  const r = isObj(v) ? v : {};
  return { label: text(r.label, LINE, cut) ?? '', mapKey: text(r.mapKey, 200), where: text(r.where, LINE, cut) };
}

function teacher(v: unknown, cut: Cut): Teacher {
  const t = isObj(v) ? v : {};
  const c = () => cut('teacher');
  return {
    name: text(t.name, LINE, c) ?? '',
    email: text(t.email, LINE, c),
    phone: text(t.phone, LINE, c),
    website: text(t.website, URL_MAX, c),
    office: text(t.office, LINE, c),
    officeHours: longText(t.officeHours, LONG, c)?.trim(),
  };
}

function timestamp(v: unknown, fallback: number): number {
  return isNum(v) && v > 0 ? v : fallback;
}

/**
 * A usable class, or null when it lacks an id or a name. Text and lists are fitted to what an
 * account can store (see ../data/limits); `cut` hears about anything that was shortened.
 */
export function sanitizeClass(v: unknown, now: number = Date.now(), cut: Cut = noCut): ClassInfo | null {
  if (!isObj(v)) return null;
  const id = text(v.id, 200);
  const name = text(v.name, CLASS_TEXT.name, () => cut('name'));
  if (!id || !name || id.includes('/')) return null;
  const createdAt = timestamp(v.createdAt, now);
  const t = (x: unknown, max: number, what: string) => text(x, max, () => cut(what));
  const long = (x: unknown, max: number, what: string) => longText(x, max, () => cut(what));
  const altRooms = Array.isArray(v.altRooms) ? v.altRooms.filter(isObj).map((a) => ({ days: strList(a.days), room: room(a.room, () => cut('other rooms')) })) : undefined;
  return clean({
    id,
    name,
    courseCode: t(v.courseCode, CLASS_TEXT.courseCode, 'course code'),
    section: t(v.section, CLASS_TEXT.section, 'section'),
    level: oneOf(LEVELS, v.level) ? v.level : undefined,
    teacher: teacher(v.teacher, cut),
    room: room(v.room, () => cut('room')),
    periods: strList(v.periods, CLASS_LISTS.periods, () => cut('periods')),
    days: Array.isArray(v.days) ? strList(v.days, CLASS_LISTS.days, () => cut('days')) : undefined,
    altRooms: altRooms && upTo(altRooms, CLASS_LISTS.altRooms, () => cut('other rooms')),
    term: oneOf(TERMS, v.term) ? v.term : 'full',
    credits: isNum(v.credits) ? v.credits : undefined,
    color: isStr(v.color) && HEX.test(v.color) ? v.color : DEFAULT_COLOR,
    icon: t(v.icon, 16, 'icon'),
    links: links(v.links, CLASS_LISTS.links, cut),
    materials: long(v.materials, CLASS_TEXT.materials, 'materials'),
    gradingPolicy: long(v.gradingPolicy, CLASS_TEXT.gradingPolicy, 'grading policy'),
    grade: t(v.grade, CLASS_TEXT.grade, 'current grade'),
    notes: long(v.notes, CLASS_TEXT.notes, 'notes'),
    customFields: customFields(v.customFields, cut),
    archived: v.archived === true ? true : undefined,
    createdAt,
    updatedAt: timestamp(v.updatedAt, createdAt),
  });
}

function subtasks(v: unknown, cut: () => void): Subtask[] {
  if (!Array.isArray(v)) return [];
  const out = v.filter(isObj).flatMap((s, i) => {
    const t = text(s.text, LINE, cut);
    return t ? [{ id: text(s.id, 100) ?? `s${i + 1}`, text: t, done: s.done === true }] : [];
  });
  return upTo(out, ASSIGNMENT_LISTS.subtasks, cut);
}

/** a usable assignment, or null when it lacks an id, a title or a valid due date (see sanitizeClass) */
export function sanitizeAssignment(v: unknown, now: number = Date.now(), cut: Cut = noCut): Assignment | null {
  if (!isObj(v)) return null;
  const id = text(v.id, 200);
  const title = text(v.title, ASSIGNMENT_TEXT.title, () => cut('title'));
  if (!id || !title || id.includes('/') || !isStr(v.dueDate) || !ISO_DATE.test(v.dueDate)) return null;
  const createdAt = timestamp(v.createdAt, now);
  const status: AssignmentStatus = oneOf(STATUSES, v.status) ? v.status : 'todo';
  return clean({
    id,
    classId: text(v.classId, ASSIGNMENT_TEXT.classId) ?? null,
    title,
    type: oneOf(TYPES, v.type) ? v.type : 'homework',
    dueDate: v.dueDate,
    dueTime: isStr(v.dueTime) && CLOCK.test(v.dueTime) ? v.dueTime : undefined,
    priority: oneOf(PRIORITIES, v.priority) ? v.priority : 'medium',
    status,
    notes: longText(v.notes, ASSIGNMENT_TEXT.notes, () => cut('notes')),
    links: links(v.links, ASSIGNMENT_LISTS.links, cut),
    subtasks: subtasks(v.subtasks, () => cut('steps')),
    estimatedMinutes: isNum(v.estimatedMinutes) && v.estimatedMinutes > 0 ? Math.round(v.estimatedMinutes) : undefined,
    completedAt: status === 'done' && isNum(v.completedAt) ? v.completedAt : undefined,
    createdAt,
    updatedAt: timestamp(v.updatedAt, createdAt),
  });
}

function dayOverride(v: unknown, cut: () => void): DayOverride | undefined {
  if (!isObj(v)) return undefined;
  const o = clean<DayOverride>({
    noSchool: typeof v.noSchool === 'boolean' ? v.noSchool : undefined,
    name: text(v.name, LINE, cut),
    cycleDay: text(v.cycleDay, 50),
    bell: text(v.bell, 50),
  });
  return Object.keys(o).length ? o : undefined;
}

/** the outline of a schedule; customSchedule() checks the details */
function looksLikeSchedule(v: unknown): v is SchoolSchedule {
  return (
    isObj(v) &&
    isObj(v.cycle) &&
    Array.isArray(v.cycle.days) &&
    Array.isArray(v.periods) &&
    Array.isArray(v.bells) &&
    v.bells.length > 0 &&
    isObj(v.calendar) &&
    (v.schoolId === undefined || oneOf(SCHOOL_IDS, v.schoolId))
  );
}

const SLOT_KINDS: readonly SlotKind[] = ['class', 'lunch', 'homeroom', 'break', 'other'];

/**
 * A custom bell schedule rebuilt with the right types throughout, so a hand-edited file can't
 * break the pages that show it (a bell time written 740 instead of "07:40", a stray null, a
 * missing field). What the schedule editor itself can save is kept as it is: the editor reports
 * problems like a blank first day or an unknown period but saves them, and the engine copes. Only
 * parts the app couldn't use are left out, counted in `dropped`. Undefined when no bell is left.
 */
function customSchedule(v: unknown, dropped: { n: number }): SchoolSchedule | undefined {
  if (!looksLikeSchedule(v)) return undefined;
  const keep = <T>(list: unknown, f: (x: unknown) => T | undefined): T[] =>
    (Array.isArray(list) ? list : []).flatMap((x) => {
      const ok = f(x);
      if (ok === undefined) dropped.n++;
      return ok === undefined ? [] : [ok];
    });
  const str = (x: unknown) => (isStr(x) ? x : undefined);
  const named = (x: unknown) => (isObj(x) && isStr(x.id) ? { id: x.id, name: str(x.name) ?? x.id } : undefined);
  const kind = (x: unknown) => (oneOf(SLOT_KINDS, x) ? x : undefined);
  // the editor doesn't save a slot without both times, and the pages need them
  const slot = (x: unknown): BellSlot | undefined =>
    isObj(x) && isStr(x.period) && isClockTime(x.start) && isClockTime(x.end) ? clean({ period: x.period, label: str(x.label), start: x.start, end: x.end, kind: kind(x.kind) }) : undefined;

  const cycleDays = keep(v.cycle.days, named);
  const periods = keep(v.periods, (x) => {
    const p = named(x);
    return p && clean({ ...p, kind: kind((x as Obj).kind) });
  });
  const bells = keep(v.bells, (x) => {
    const b = named(x);
    if (!b || !isObj((x as Obj).days)) return undefined;
    const days: Record<string, BellSlot[]> = {};
    for (const [day, slots] of Object.entries((x as Obj).days as Obj)) {
      if (Array.isArray(slots)) days[day] = keep(slots, slot);
      else dropped.n++;
    }
    return { ...b, days };
  });
  if (!bells.length) return undefined;
  const cal = v.calendar as unknown as Obj;
  const noSchool = keep(cal.noSchool, (x) => (isObj(x) && isStr(x.date) ? clean({ date: x.date, end: str(x.end), name: str(x.name) ?? '' }) : undefined));
  const specialDays = keep(cal.specialDays, (x) =>
    isObj(x) && isStr(x.date)
      ? clean({ date: x.date, name: str(x.name), bell: str(x.bell), cycleDay: str(x.cycleDay), advance: typeof x.advance === 'boolean' ? x.advance : undefined })
      : undefined,
  );
  const anchor = isObj(cal.anchor) && isStr(cal.anchor.date) && isStr(cal.anchor.cycleDay) ? { date: cal.anchor.date, cycleDay: cal.anchor.cycleDay } : undefined;
  if (cal.anchor !== undefined && !anchor) dropped.n++;
  const src = isObj(v.source) ? v.source : undefined;
  return clean({
    schoolId: oneOf(SCHOOL_IDS, v.schoolId) ? v.schoolId : undefined,
    schoolYear: str(v.schoolYear) ?? '',
    cycle: { mode: v.cycle.mode === 'weekday' ? 'weekday' : 'rotation', days: cycleDays },
    periods,
    bells,
    calendar: { firstDay: str(cal.firstDay) ?? '', lastDay: str(cal.lastDay) ?? '', anchor, noSchool, specialDays },
    source: src && {
      urls: strList(src.urls).filter((u) => /^https?:\/\//i.test(u)),
      note: str(src.note),
      verified: src.verified === true,
      retrieved: str(src.retrieved),
    },
  } as SchoolSchedule);
}

export function sanitizeProfile(v: unknown, warnings: string[] = [], cut: Cut = noCut): Profile | null {
  if (!isObj(v)) return null;
  const dayOverrides: Record<string, DayOverride> = {};
  if (isObj(v.dayOverrides)) {
    const dates = Object.entries(v.dayOverrides);
    for (const [date, o] of upTo(dates, PROFILE_MAPS.dayOverrides, () => cut('day changes'))) {
      const ok = ISO_DATE.test(date) ? dayOverride(o, () => cut('day changes')) : undefined;
      if (ok) dayOverrides[date] = ok;
    }
  }
  let schedule: SchoolSchedule | undefined;
  if (v.customSchedule !== undefined && v.customSchedule !== null) {
    const dropped = { n: 0 };
    schedule = customSchedule(v.customSchedule, dropped);
    if (!schedule) warnings.push('The custom bell schedule in the file was damaged, so it was left out.');
    else if (dropped.n)
      warnings.push(`${dropped.n} ${dropped.n === 1 ? 'part' : 'parts'} of the custom bell schedule (bell times, days off…) couldn’t be read and ${dropped.n === 1 ? 'was' : 'were'} left out. Check it on the Bell schedule page.`);
  }
  return clean({
    displayName: text(v.displayName, PROFILE_TEXT.displayName, () => cut('name')),
    schoolId: oneOf(SCHOOL_IDS, v.schoolId) ? v.schoolId : 'hsn',
    grade: isNum(v.grade) && Number.isInteger(v.grade) && v.grade >= 1 && v.grade <= 12 ? v.grade : undefined,
    theme: oneOf(['system', 'light', 'dark'] as const, v.theme) ? v.theme : 'system',
    clock: oneOf(['12h', '24h'] as const, v.clock) ? v.clock : '12h',
    customSchedule: schedule,
    dayOverrides,
    onboarded: v.onboarded === false ? false : true,
    updatedAt: isNum(v.updatedAt) ? v.updatedAt : undefined,
  });
}

/** collects what was shortened, item by item, e.g. '“Chemistry” (current grade, notes)' */
function shortenings() {
  const list: string[] = [];
  return {
    list,
    /** a Cut for one item, and a way to file it under the item's name once that's known */
    item() {
      const what: string[] = [];
      return {
        cut: (w: string) => void (what.includes(w) || what.push(w)),
        done: (name: string) => void (what.length && list.push(`${name} (${what.join(', ')})`)),
      };
    },
  };
}

function items<T extends { id: string }>(
  v: unknown,
  what: [one: string, many: string],
  sanitize: (x: unknown, cut: Cut) => T | null,
  nameOf: (t: T) => string,
  warnings: string[],
  shortened: ReturnType<typeof shortenings>,
): T[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    warnings.push(`The ${what[1]} in the file weren’t a list, so they were skipped.`);
    return [];
  }
  const out: T[] = [];
  const seen = new Set<string>();
  let bad = 0;
  for (const x of v) {
    const one = shortened.item();
    const ok = sanitize(x, one.cut);
    if (!ok || seen.has(ok.id)) bad++;
    else {
      seen.add(ok.id);
      out.push(ok);
      one.done(nameOf(ok));
    }
  }
  if (bad) warnings.push(`${bad} ${bad === 1 ? what[0] : what[1]} couldn’t be read and ${bad === 1 ? 'was' : 'were'} skipped.`);
  return out;
}

/** Reads a backup file's text. Throws an Error with a message fit for the user when it can't. */
export function parseBackup(textContent: string): ParsedBackup {
  if (textContent.length > MAX_BACKUP_BYTES) throw new Error('That file is too big to be a School Day Tracker backup.');
  let raw: unknown;
  try {
    raw = JSON.parse(textContent.replace(/^﻿/, ''));
  } catch {
    throw new Error('That file isn’t a School Day Tracker backup (it isn’t valid JSON).');
  }
  if (!isObj(raw)) throw new Error('That file isn’t a School Day Tracker backup.');
  if (raw.app !== BACKUP_APP) throw new Error('That file isn’t a School Day Tracker backup. Choose a file named like school-day-tracker-backup-….json.');
  if (!isNum(raw.version) || raw.version < 1) throw new Error('This backup file is damaged (its version is missing).');
  if (raw.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app. Update the app (reload the page) and try again.');

  const warnings: string[] = [];
  const shortened = shortenings();
  const now = Date.now();
  const classes = items(raw.classes, ['class', 'classes'], (x, cut) => sanitizeClass(x, now, cut), (c) => `“${c.name}”`, warnings, shortened);
  const assignments = items(raw.assignments, ['assignment', 'assignments'], (x, cut) => sanitizeAssignment(x, now, cut), (a) => `“${a.title}”`, warnings, shortened);
  const settings = shortened.item();
  const profile = raw.profile === undefined || raw.profile === null ? null : sanitizeProfile(raw.profile, warnings, settings.cut);
  if (profile) settings.done('your settings');
  if (raw.profile !== undefined && raw.profile !== null && !profile) warnings.push('The settings in the file couldn’t be read and were skipped.');
  const s = shortened.list;
  if (s.length) {
    const shown = s.length > 6 ? [...s.slice(0, 5), `${s.length - 5} more`] : s;
    warnings.push(`Some text or lists were longer than the app can keep, so they were shortened: ${shown.join(', ')}.`);
  }

  if (!profile && !classes.length && !assignments.length) throw new Error('This backup is empty: there are no classes, assignments or settings in it.');
  return { profile, classes, assignments, exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : undefined, warnings };
}

// ---------------------------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------------------------

interface Versioned {
  id: string;
  updatedAt: number;
}

/** current + incoming by id; when both have an item, the one edited more recently wins (ties keep current) */
export function mergeById<T extends Versioned>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((x) => [x.id, x]));
  for (const x of incoming) {
    const cur = byId.get(x.id);
    if (!cur || (x.updatedAt ?? 0) > (cur.updatedAt ?? 0)) byId.set(x.id, x);
  }
  return [...byId.values()];
}

/** the incoming items a merge would write: new ids, or newer than the current copy */
export function changedByMerge<T extends Versioned>(current: T[], incoming: T[]): T[] {
  const byId = new Map(current.map((x) => [x.id, x]));
  const merged = new Map(mergeById(current, incoming).map((x) => [x.id, x]));
  return incoming.filter((x) => merged.get(x.id) === x && byId.get(x.id) !== x);
}

export interface ImportPlan<C extends Versioned = ClassInfo, A extends Versioned = Assignment> {
  saveClasses: C[];
  deleteClasses: string[];
  saveAssignments: A[];
  deleteAssignments: string[];
}

/**
 * What to save and delete to apply a backup. 'merge' keeps everything here and adds or updates
 * from the file (newer edit wins); 'replace' makes this device/account match the file exactly.
 */
export function planImport(current: { classes: ClassInfo[]; assignments: Assignment[] }, incoming: BackupData, mode: 'merge' | 'replace'): ImportPlan {
  if (mode === 'merge') {
    return {
      saveClasses: changedByMerge(current.classes, incoming.classes),
      deleteClasses: [],
      saveAssignments: changedByMerge(current.assignments, incoming.assignments),
      deleteAssignments: [],
    };
  }
  const keepC = new Set(incoming.classes.map((c) => c.id));
  const keepA = new Set(incoming.assignments.map((a) => a.id));
  return {
    saveClasses: incoming.classes,
    deleteClasses: current.classes.filter((c) => !keepC.has(c.id)).map((c) => c.id),
    saveAssignments: incoming.assignments,
    deleteAssignments: current.assignments.filter((a) => !keepA.has(a.id)).map((a) => a.id),
  };
}

/**
 * What of another profile (a backup's, or this device's when moving into an account) is worth
 * adding to the current one: only things it doesn't have yet. The current school, name and
 * settings win; day overrides are combined (current wins on the same date). Empty when there's
 * nothing to add.
 */
export function profileMergeFields(incoming: Partial<Profile> | null | undefined, current: Partial<Profile>): Partial<Profile> {
  if (!incoming) return {};
  const out: Partial<Profile> = {};
  const sameSchool = !current.schoolId || !incoming.schoolId || current.schoolId === incoming.schoolId;
  if (!current.displayName && incoming.displayName) out.displayName = incoming.displayName;
  if (current.grade === undefined && incoming.grade !== undefined && sameSchool) out.grade = incoming.grade;
  if (!current.customSchedule && incoming.customSchedule && sameSchool) out.customSchedule = incoming.customSchedule;
  const cur = current.dayOverrides ?? {};
  const add = Object.keys(incoming.dayOverrides ?? {}).filter((d) => !(d in cur));
  if (sameSchool && add.length) out.dayOverrides = { ...incoming.dayOverrides, ...cur };
  return out;
}

/**
 * The saveProfile() patch that applies a backup's profile. 'replace' lists every field, with
 * undefined for the ones the backup doesn't have, so stores delete them (see DataStore.saveProfile).
 */
export function planProfile(current: Profile, incoming: Profile | null, mode: 'merge' | 'replace'): Partial<Profile> | null {
  if (!incoming) return null;
  if (mode === 'merge') {
    const p = profileMergeFields(incoming, current);
    return Object.keys(p).length ? p : null;
  }
  return {
    displayName: incoming.displayName,
    schoolId: incoming.schoolId,
    grade: incoming.grade,
    theme: incoming.theme,
    clock: incoming.clock,
    customSchedule: incoming.customSchedule,
    dayOverrides: incoming.dayOverrides ?? {},
    onboarded: true,
  };
}

/** short summary like '7 classes, 23 assignments' */
export function describeCounts(d: { classes: unknown[]; assignments: unknown[] }): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return `${n(d.classes.length, 'class', 'classes')}, ${n(d.assignments.length, 'assignment', 'assignments')}`;
}
