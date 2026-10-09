// Backup files: everything a user owns as one JSON file they can download and import again
// (into this device, another device or an account). parseBackup is strict about shapes and
// lenient about details: it keeps every usable item, drops unknown fields, and explains what
// it skipped.
import type {
  Assignment,
  AssignmentStatus,
  AssignmentType,
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
  Subtask,
  Teacher,
  Term,
} from '../types';
import { clean } from '../data/store';
import { toISODate } from './dates';

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

/** a trimmed string capped at max chars, or undefined when empty / not a string */
function text(v: unknown, max = 500): string | undefined {
  if (!isStr(v)) return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}
/** like text() but keeps line breaks and doesn't require content */
function longText(v: unknown, max = 20000): string | undefined {
  return isStr(v) && v.trim() ? v.slice(0, max) : undefined;
}
function strList(v: unknown, max = 50): string[] {
  return Array.isArray(v)
    ? v
        .filter(isStr)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max)
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

function links(v: unknown): LinkItem[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).flatMap((l) => {
    const url = text(l.url, 2000);
    return url ? [{ label: text(l.label, 200) ?? '', url }] : [];
  });
}

function customFields(v: unknown): CustomField[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).flatMap((f) => {
    const key = text(f.key, 100);
    return key ? [{ key, value: isStr(f.value) ? f.value.slice(0, 2000) : '' }] : [];
  });
}

function room(v: unknown): ClassRoom {
  const r = isObj(v) ? v : {};
  return { label: text(r.label, 100) ?? '', mapKey: text(r.mapKey, 200), where: text(r.where, 300) };
}

function teacher(v: unknown): Teacher {
  const t = isObj(v) ? v : {};
  return {
    name: text(t.name, 200) ?? '',
    email: text(t.email, 320),
    phone: text(t.phone, 50),
    website: text(t.website, 2000),
    office: text(t.office, 200),
    officeHours: text(t.officeHours, 500),
  };
}

function timestamp(v: unknown, fallback: number): number {
  return isNum(v) && v > 0 ? v : fallback;
}

/** a usable class, or null when it lacks an id or a name */
export function sanitizeClass(v: unknown, now: number = Date.now()): ClassInfo | null {
  if (!isObj(v)) return null;
  const id = text(v.id, 200);
  const name = text(v.name, 200);
  if (!id || !name || id.includes('/')) return null;
  const createdAt = timestamp(v.createdAt, now);
  return clean({
    id,
    name,
    courseCode: text(v.courseCode, 50),
    section: text(v.section, 50),
    level: oneOf(LEVELS, v.level) ? v.level : undefined,
    teacher: teacher(v.teacher),
    room: room(v.room),
    periods: strList(v.periods),
    days: Array.isArray(v.days) ? strList(v.days) : undefined,
    altRooms: Array.isArray(v.altRooms) ? v.altRooms.filter(isObj).map((a) => ({ days: strList(a.days), room: room(a.room) })) : undefined,
    term: oneOf(TERMS, v.term) ? v.term : 'full',
    credits: isNum(v.credits) ? v.credits : undefined,
    color: isStr(v.color) && HEX.test(v.color) ? v.color : DEFAULT_COLOR,
    icon: text(v.icon, 16),
    links: links(v.links),
    materials: longText(v.materials),
    gradingPolicy: longText(v.gradingPolicy),
    grade: text(v.grade, 20),
    notes: longText(v.notes),
    customFields: customFields(v.customFields),
    archived: v.archived === true ? true : undefined,
    createdAt,
    updatedAt: timestamp(v.updatedAt, createdAt),
  });
}

function subtasks(v: unknown): Subtask[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).flatMap((s, i) => {
    const t = text(s.text, 500);
    return t ? [{ id: text(s.id, 100) ?? `s${i + 1}`, text: t, done: s.done === true }] : [];
  });
}

/** a usable assignment, or null when it lacks an id, a title or a valid due date */
export function sanitizeAssignment(v: unknown, now: number = Date.now()): Assignment | null {
  if (!isObj(v)) return null;
  const id = text(v.id, 200);
  const title = text(v.title, 300);
  if (!id || !title || id.includes('/') || !isStr(v.dueDate) || !ISO_DATE.test(v.dueDate)) return null;
  const createdAt = timestamp(v.createdAt, now);
  const status: AssignmentStatus = oneOf(STATUSES, v.status) ? v.status : 'todo';
  return clean({
    id,
    classId: text(v.classId, 200) ?? null,
    title,
    type: oneOf(TYPES, v.type) ? v.type : 'homework',
    dueDate: v.dueDate,
    dueTime: isStr(v.dueTime) && CLOCK.test(v.dueTime) ? v.dueTime : undefined,
    priority: oneOf(PRIORITIES, v.priority) ? v.priority : 'medium',
    status,
    notes: longText(v.notes),
    links: links(v.links),
    subtasks: subtasks(v.subtasks),
    estimatedMinutes: isNum(v.estimatedMinutes) && v.estimatedMinutes > 0 ? Math.round(v.estimatedMinutes) : undefined,
    completedAt: status === 'done' && isNum(v.completedAt) ? v.completedAt : undefined,
    createdAt,
    updatedAt: timestamp(v.updatedAt, createdAt),
  });
}

function dayOverride(v: unknown): DayOverride | undefined {
  if (!isObj(v)) return undefined;
  const o = clean<DayOverride>({
    noSchool: typeof v.noSchool === 'boolean' ? v.noSchool : undefined,
    name: text(v.name, 100),
    cycleDay: text(v.cycleDay, 50),
    bell: text(v.bell, 50),
  });
  return Object.keys(o).length ? o : undefined;
}

/** only the outline is checked here; the schedule engine normalizes the details */
function looksLikeSchedule(v: unknown): v is SchoolSchedule {
  return (
    isObj(v) &&
    isObj(v.cycle) &&
    Array.isArray(v.cycle.days) &&
    Array.isArray(v.periods) &&
    Array.isArray(v.bells) &&
    v.bells.length > 0 &&
    v.bells.every((b) => isObj(b) && isStr(b.id) && isObj(b.days)) &&
    isObj(v.calendar) &&
    (v.schoolId === undefined || oneOf(SCHOOL_IDS, v.schoolId))
  );
}

export function sanitizeProfile(v: unknown, warnings: string[] = []): Profile | null {
  if (!isObj(v)) return null;
  const dayOverrides: Record<string, DayOverride> = {};
  if (isObj(v.dayOverrides)) {
    for (const [date, o] of Object.entries(v.dayOverrides)) {
      const ok = ISO_DATE.test(date) ? dayOverride(o) : undefined;
      if (ok) dayOverrides[date] = ok;
    }
  }
  let customSchedule: SchoolSchedule | undefined;
  if (v.customSchedule !== undefined && v.customSchedule !== null) {
    if (looksLikeSchedule(v.customSchedule)) customSchedule = clean(v.customSchedule);
    else warnings.push('The custom bell schedule in the file was damaged, so it was left out.');
  }
  return clean({
    displayName: text(v.displayName, 80),
    schoolId: oneOf(SCHOOL_IDS, v.schoolId) ? v.schoolId : 'hsn',
    grade: isNum(v.grade) && Number.isInteger(v.grade) && v.grade >= 1 && v.grade <= 12 ? v.grade : undefined,
    theme: oneOf(['system', 'light', 'dark'] as const, v.theme) ? v.theme : 'system',
    clock: oneOf(['12h', '24h'] as const, v.clock) ? v.clock : '12h',
    customSchedule,
    dayOverrides,
    onboarded: v.onboarded === false ? false : true,
    updatedAt: isNum(v.updatedAt) ? v.updatedAt : undefined,
  });
}

function items<T extends { id: string }>(v: unknown, what: [one: string, many: string], sanitize: (x: unknown) => T | null, warnings: string[]): T[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    warnings.push(`The ${what[1]} in the file weren’t a list, so they were skipped.`);
    return [];
  }
  const out: T[] = [];
  const seen = new Set<string>();
  let bad = 0;
  for (const x of v) {
    const ok = sanitize(x);
    if (!ok || seen.has(ok.id)) bad++;
    else {
      seen.add(ok.id);
      out.push(ok);
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
  const now = Date.now();
  const classes = items(raw.classes, ['class', 'classes'], (x) => sanitizeClass(x, now), warnings);
  const assignments = items(raw.assignments, ['assignment', 'assignments'], (x) => sanitizeAssignment(x, now), warnings);
  const profile = raw.profile === undefined || raw.profile === null ? null : sanitizeProfile(raw.profile, warnings);
  if (raw.profile !== undefined && raw.profile !== null && !profile) warnings.push('The settings in the file couldn’t be read and were skipped.');

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
