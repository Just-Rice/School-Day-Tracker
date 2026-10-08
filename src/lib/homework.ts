// Homework logic: defaults, due-date grouping, sorting, filtering and "due next class". Pure so
// the pages stay thin and everything here can be unit tested.
import type { Assignment, AssignmentStatus, AssignmentType, ClassInfo, DayInfo, ISODate, LinkItem, Priority, Subtask } from '../types';
import { addDays, daysBetween, parseISODate, todayISO, toMinutes } from './dates';
import { newId } from './id';
import { classesOnDay } from './schedule';

export const ASSIGNMENT_TYPES: readonly { id: AssignmentType; label: string; emoji: string }[] = [
  { id: 'homework', label: 'Homework', emoji: '📝' },
  { id: 'test', label: 'Test', emoji: '🎯' },
  { id: 'quiz', label: 'Quiz', emoji: '❓' },
  { id: 'project', label: 'Project', emoji: '🛠️' },
  { id: 'essay', label: 'Essay', emoji: '✍️' },
  { id: 'reading', label: 'Reading', emoji: '📖' },
  { id: 'lab', label: 'Lab', emoji: '🧪' },
  { id: 'other', label: 'Other', emoji: '📌' },
];

/** low to high, the order they read in a picker */
export const PRIORITIES: readonly { id: Priority; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

export const STATUSES: readonly { id: AssignmentStatus; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function typeInfo(t: AssignmentType | string | undefined) {
  return ASSIGNMENT_TYPES.find((x) => x.id === t) ?? ASSIGNMENT_TYPES[ASSIGNMENT_TYPES.length - 1];
}

export function isAssignmentType(t: unknown): t is AssignmentType {
  return ASSIGNMENT_TYPES.some((x) => x.id === t);
}

export function isPriority(p: unknown): p is Priority {
  return PRIORITIES.some((x) => x.id === p);
}

export function isStatus(s: unknown): s is AssignmentStatus {
  return STATUSES.some((x) => x.id === s);
}

export function emptyAssignment(partial: Partial<Assignment> = {}, now: number = Date.now()): Assignment {
  return {
    id: newId(),
    classId: null,
    title: '',
    type: 'homework',
    dueDate: addDays(todayISO(new Date(now)), 1),
    priority: 'medium',
    status: 'todo',
    links: [],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/**
 * Fills in anything a stored assignment might be missing (older data, other devices, hand
 * edits) so the UI can rely on the arrays and enums being there.
 */
export function normalizeAssignment(a: Assignment): Assignment {
  const ok =
    Array.isArray(a.links) && Array.isArray(a.subtasks) && isAssignmentType(a.type) && isPriority(a.priority) && isStatus(a.status) && typeof a.title === 'string' && a.classId !== undefined;
  if (ok) return a;
  return {
    ...a,
    title: typeof a.title === 'string' ? a.title : '',
    classId: a.classId ?? null,
    type: isAssignmentType(a.type) ? a.type : 'other',
    priority: isPriority(a.priority) ? a.priority : 'medium',
    status: isStatus(a.status) ? a.status : 'todo',
    links: Array.isArray(a.links) ? a.links : [],
    subtasks: Array.isArray(a.subtasks) ? a.subtasks : [],
  };
}

/** past its due date (or, on the due date, past its due time); ignores status */
export function isPastDue(a: Pick<Assignment, 'dueDate' | 'dueTime'>, today: ISODate, nowMinutes?: number): boolean {
  if (a.dueDate < today) return true;
  if (a.dueDate > today || !a.dueTime || nowMinutes === undefined) return false;
  return toMinutes(a.dueTime) <= nowMinutes;
}

/** unfinished and past due. Without a due time, an assignment is due by the end of its day. */
export function isOverdue(a: Pick<Assignment, 'dueDate' | 'dueTime' | 'status'>, today: ISODate, nowMinutes?: number): boolean {
  return a.status !== 'done' && isPastDue(a, today, nowMinutes);
}

/** by due date, then due time (untimed last: due "by end of day"), high priority first, then title */
export function compareAssignments(a: Assignment, b: Assignment): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  const ta = a.dueTime ?? '99:99';
  const tb = b.dueTime ?? '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  const p = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
  if (p) return p;
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
}

export function sortAssignments(list: readonly Assignment[]): Assignment[] {
  return [...list].sort(compareAssignments);
}

/** when it was finished; older data may only have updatedAt */
export function completedTime(a: Assignment): number {
  return a.completedAt ?? a.updatedAt ?? 0;
}

/** done assignments, most recently finished first */
export function sortDone(list: readonly Assignment[]): Assignment[] {
  return list.filter((a) => a.status === 'done').sort((a, b) => completedTime(b) - completedTime(a) || compareAssignments(a, b));
}

/** done assignments finished more than `days` days before `now` */
export function doneOlderThan(list: readonly Assignment[], days: number, now: number = Date.now()): Assignment[] {
  const cutoff = now - days * 86400000;
  return list.filter((a) => a.status === 'done' && completedTime(a) < cutoff);
}

export type GroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'done';

export interface AssignmentGroup {
  key: GroupKey;
  label: string;
  items: Assignment[];
}

const GROUP_LABELS: Record<GroupKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  done: 'Done',
};
const GROUP_ORDER: GroupKey[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'done'];

/** which due-date group an assignment falls in, ignoring its status */
export function dueGroup(a: Pick<Assignment, 'dueDate' | 'dueTime'>, today: ISODate, nowMinutes?: number): Exclude<GroupKey, 'done'> {
  if (isPastDue(a, today, nowMinutes)) return 'overdue';
  const n = daysBetween(today, a.dueDate);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n <= 7) return 'week';
  return 'later';
}

/**
 * Groups assignments by when they're due: Overdue, Today, Tomorrow, This week (the rest of the
 * next 7 days), Later, and finally Done (most recent first). Only non-empty groups are returned.
 * `pinned` ids stay in their due-date group even when done, so a just-checked row doesn't jump
 * away before the user can uncheck it.
 */
export function groupAssignments(list: readonly Assignment[], today: ISODate, opts: { nowMinutes?: number; pinned?: ReadonlySet<string> } = {}): AssignmentGroup[] {
  const buckets = new Map<GroupKey, Assignment[]>();
  for (const a of list) {
    const key: GroupKey = a.status === 'done' && !opts.pinned?.has(a.id) ? 'done' : dueGroup(a, today, opts.nowMinutes);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(a);
  }
  return GROUP_ORDER.filter((k) => buckets.has(k)).map((key) => ({
    key,
    label: GROUP_LABELS[key],
    items: key === 'done' ? sortDone(buckets.get(key)!) : sortAssignments(buckets.get(key)!),
  }));
}

export interface ClassGroup {
  /** null: assignments without a class (or whose class was deleted) */
  cls: ClassInfo | null;
  items: Assignment[];
}

/**
 * One section per class, in the order of `classes`, then "no class". Archived classes only appear
 * when they have assignments; with `includeEmpty` active classes without any are listed too.
 */
export function groupByClass(list: readonly Assignment[], classes: readonly ClassInfo[], includeEmpty = false): ClassGroup[] {
  const known = new Set(classes.map((c) => c.id));
  const byClass = new Map<string | null, Assignment[]>();
  for (const a of list) {
    const k = a.classId && known.has(a.classId) ? a.classId : null;
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k)!.push(a);
  }
  const out: ClassGroup[] = [];
  for (const c of classes) {
    const items = byClass.get(c.id);
    if (items || (includeEmpty && !c.archived)) out.push({ cls: c, items: sortAssignments(items ?? []) });
  }
  const none = byClass.get(null);
  if (none) out.push({ cls: null, items: sortAssignments(none) });
  return out;
}

export interface AssignmentFilters {
  /** undefined or '': any class; null: only assignments without a class */
  classId?: string | null;
  type?: AssignmentType | '';
  priority?: Priority | '';
  /** 'open': anything not done */
  status?: AssignmentStatus | 'open' | '';
  q?: string;
}

export function hasActiveFilters(f: AssignmentFilters): boolean {
  return (f.classId !== undefined && f.classId !== '') || !!f.type || !!f.priority || !!f.status || !!f.q?.trim();
}

/**
 * Every given filter must match. `q` is split into words that must each appear (case-insensitive)
 * in the title, notes, subtasks, link labels, type, or, when `classes` is given, the class name.
 */
export function filterAssignments(list: readonly Assignment[], f: AssignmentFilters, classes: readonly ClassInfo[] = []): Assignment[] {
  const words = (f.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const className = new Map(classes.map((c) => [c.id, c.name]));
  return list.filter((a) => {
    if (f.classId === null ? a.classId !== null : f.classId && a.classId !== f.classId) return false;
    if (f.type && a.type !== f.type) return false;
    if (f.priority && a.priority !== f.priority) return false;
    if (f.status === 'open' ? a.status === 'done' : f.status && a.status !== f.status) return false;
    if (!words.length) return true;
    const hay = [
      a.title,
      a.notes ?? '',
      typeInfo(a.type).label,
      ...(a.subtasks ?? []).map((s) => s.text),
      ...(a.links ?? []).map((l) => l.label),
      (a.classId && className.get(a.classId)) || '',
    ]
      .join('\n')
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * The first school day AFTER `fromDate` on which `classId` meets, looking at most `maxDays` days
 * ahead; null if it doesn't meet in that window (or the schedule isn't loaded yet).
 */
export function nextMeetingDate(
  classId: string,
  fromDate: ISODate,
  getDay: (d: ISODate) => DayInfo,
  classes: readonly ClassInfo[],
  maxDays = 21,
): ISODate | null {
  if (!classes.some((c) => c.id === classId)) return null;
  const list = classes as ClassInfo[];
  for (let k = 1; k <= maxDays; k++) {
    const date = addDays(fromDate, k);
    const day = getDay(date);
    if (!day.isSchoolDay || !day.slots?.length) continue;
    if (classesOnDay(day, list).some((m) => m.cls?.id === classId)) return date;
  }
  return null;
}

/** The default due date for new homework: the class's next meeting, else tomorrow. */
export function defaultDueDate(classId: string | null | undefined, today: ISODate, getDay: (d: ISODate) => DayInfo, classes: readonly ClassInfo[]): ISODate {
  return (classId && nextMeetingDate(classId, today, getDay, classes)) || addDays(today, 1);
}

export function subtaskProgress(a: Pick<Assignment, 'subtasks'>): { done: number; total: number } {
  const list = a.subtasks ?? [];
  return { done: list.filter((s) => s.done).length, total: list.length };
}

/** Marks an assignment done (stamping completedAt) or reopens it. */
export function setDone(a: Assignment, done: boolean, now: number = Date.now()): Assignment {
  if (done) return { ...a, status: 'done', completedAt: a.status === 'done' && a.completedAt ? a.completedAt : now };
  const out: Assignment = { ...a, status: 'todo' };
  delete out.completedAt;
  return out;
}

/** keeps completedAt consistent with status before saving an edited assignment */
export function withCompletion(a: Assignment, now: number = Date.now()): Assignment {
  if (a.status === 'done') return a.completedAt ? a : { ...a, completedAt: now };
  if (a.completedAt === undefined) return a;
  const out = { ...a };
  delete out.completedAt;
  return out;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Oct 21' (with the year when it isn't `today`'s year) */
export function shortDate(date: ISODate, today: ISODate): string {
  const d = parseISODate(date);
  const s = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return date.slice(0, 4) === today.slice(0, 4) ? s : `${s}, ${d.getFullYear()}`;
}

/** 'Today', 'Tomorrow', 'Fri' (within the coming week), 'Yesterday', '3 days ago', else 'Oct 21' */
export function relativeDue(date: ISODate, today: ISODate): string {
  const n = daysBetween(today, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return WEEKDAYS[parseISODate(date).getDay()];
  if (n < -1 && n > -7) return `${-n} days ago`;
  return shortDate(date, today);
}

/** adds https:// when the user typed a bare domain */
export function normalizeUrl(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  return 'https://' + u.replace(/^\/+/, '');
}

/** only http(s)/mailto links are rendered as clickable */
export function isSafeUrl(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url.trim());
}

export function makeLink(label: string, url: string): LinkItem {
  const u = normalizeUrl(url);
  return { label: label.trim() || u.replace(/^https?:\/\//i, '').replace(/\/$/, ''), url: u };
}

export function makeSubtask(text: string): Subtask {
  return { id: newId(), text: text.trim(), done: false };
}

/** a copy with item `i` moved by `delta` places (unchanged when the move is out of range) */
export function moveItem<T>(list: readonly T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
