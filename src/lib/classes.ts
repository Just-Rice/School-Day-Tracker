// Class helpers for the classes pages: defaults, validation, cleanup before saving, ordering,
// period conflicts and short descriptions ("Periods 3 & 4 · A & C Days"). All pure.
import type { Assignment, BellSlot, ClassInfo, ClassRoom, CourseLevel, CycleDay, DayInfo, ISODate, MapRoom, SchoolSchedule, Term } from '../types';
import { newId } from './id';
import { addDays, toMinutes } from './dates';
import { meetsIn, periodName, roomOn, shortCycleDayName, sortSlots, type MeetingTime } from './schedule';

// ---------------------------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------------------------

/** Mid-tone colors that read as a dot or bar on both the light and the dark surface. */
export const CLASS_COLOR_OPTIONS = [
  { hex: '#2f6fdf', name: 'Blue' },
  { hex: '#e03e3e', name: 'Red' },
  { hex: '#ee7d00', name: 'Orange' },
  { hex: '#c99a06', name: 'Gold' },
  { hex: '#2f9e44', name: 'Green' },
  { hex: '#0f9a8a', name: 'Teal' },
  { hex: '#1593c4', name: 'Sky' },
  { hex: '#6559d6', name: 'Indigo' },
  { hex: '#a23fbf', name: 'Purple' },
  { hex: '#d6337a', name: 'Pink' },
  { hex: '#9a6a3a', name: 'Brown' },
  { hex: '#66758a', name: 'Slate' },
] as const;

export const CLASS_COLORS: readonly string[] = CLASS_COLOR_OPTIONS.map((c) => c.hex);

export function colorName(hex: string): string | undefined {
  return CLASS_COLOR_OPTIONS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name;
}

/** The first palette color no active class uses yet (or the least used one). */
export function pickColor(classes: Pick<ClassInfo, 'color' | 'archived'>[]): string {
  const uses = new Map(CLASS_COLORS.map((c) => [c, 0]));
  for (const c of classes) {
    const k = (c.color ?? '').toLowerCase();
    if (!c.archived && uses.has(k)) uses.set(k, uses.get(k)! + 1);
  }
  let best = CLASS_COLORS[0];
  for (const c of CLASS_COLORS) if (uses.get(c)! < uses.get(best)!) best = c;
  return best;
}

export interface IconSuggestion {
  icon: string;
  label: string;
  /** class names this icon fits, for suggestIcon() */
  match?: RegExp;
}

// Order matters for suggestIcon(): the first match wins, so specific subjects come first.
export const ICON_SUGGESTIONS: IconSuggestion[] = [
  { icon: '🧪', label: 'Chemistry', match: /chem/i },
  { icon: '🧬', label: 'Biology', match: /bio|anatomy|genetic|life sci/i },
  { icon: '⚛️', label: 'Physics', match: /physics/i },
  { icon: '🌱', label: 'Environmental science', match: /enviro|ecolog|earth|geolog/i },
  { icon: '🔬', label: 'Science', match: /(?<!(computer|political|social|library) )scien|\blab\b|forensic/i },
  { icon: '📊', label: 'Statistics', match: /statist|data/i },
  { icon: '📐', label: 'Geometry', match: /geometr|trig/i },
  { icon: '➗', label: 'Math', match: /math|algebra|calc|precalc|pre-calc/i },
  { icon: '💻', label: 'Computer science', match: /comput|coding|program|\bcs\b|software|web/i },
  { icon: '🤖', label: 'Robotics & engineering', match: /robot|engineer/i },
  { icon: '🔧', label: 'Technology', match: /tech|wood|metal|manufactur/i },
  { icon: '📖', label: 'English & literature', match: /english|literat|\bela\b|reading/i },
  { icon: '✍️', label: 'Writing', match: /writ|composition|creative/i },
  { icon: '📰', label: 'Journalism', match: /journal|newspaper|yearbook|media/i },
  { icon: '🗣️', label: 'World language', match: /spanish|french|german|chinese|mandarin|japanese|latin|hindi|italian|korean|language|\besl\b/i },
  { icon: '🌍', label: 'World history & geography', match: /world|global|geograph/i },
  { icon: '🏛️', label: 'US history & government', match: /histor|government|civics|politic|social stud|law/i },
  { icon: '💰', label: 'Economics & finance', match: /econ|financ|account/i },
  { icon: '💼', label: 'Business', match: /business|marketing|entrepreneur/i },
  { icon: '🧠', label: 'Psychology', match: /psych|sociolog|philosoph/i },
  { icon: '🎨', label: 'Art', match: /\bart\b|drawing|paint|ceramic|sculpt|design/i },
  { icon: '📷', label: 'Photography & film', match: /photo|film|video/i },
  { icon: '🎻', label: 'Orchestra', match: /orchestra|string/i },
  { icon: '🥁', label: 'Band', match: /band|percussion|jazz/i },
  { icon: '🎤', label: 'Choir', match: /choir|chorus|vocal/i },
  { icon: '🎵', label: 'Music', match: /music/i },
  { icon: '🎭', label: 'Theater', match: /theat|drama|acting/i },
  { icon: '🏀', label: 'Physical education', match: /\bpe\b|phys(ical)? ed|gym|sport|fitness/i },
  { icon: '🩺', label: 'Health', match: /health|medic/i },
  { icon: '🍳', label: 'Culinary', match: /culinar|cook|food|nutrition/i },
  { icon: '📚', label: 'Study hall', match: /study|homeroom|\bwin\b|advisory/i },
];

/** An emoji that fits the class name ('AP Chemistry' -> '🧪'), if any. */
export function suggestIcon(name: string): string | undefined {
  if (!name.trim()) return undefined;
  return ICON_SUGGESTIONS.find((s) => s.match?.test(name))?.icon;
}

export const COURSE_LEVELS: CourseLevel[] = ['CP', 'Honors', 'Accelerated', 'AP', 'Other'];

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  CP: 'College Prep (CP)',
  Honors: 'Honors',
  Accelerated: 'Accelerated',
  AP: 'AP',
  Other: 'Other',
};

/** chip colors per level; CP and Other use the neutral chip */
export const LEVEL_COLORS: Partial<Record<CourseLevel, string>> = {
  Honors: '#2f6fdf',
  Accelerated: '#0f9a8a',
  AP: '#a23fbf',
};

export const TERMS: Term[] = ['full', 'S1', 'S2', 'Q1', 'Q2', 'Q3', 'Q4'];

export const TERM_LABELS: Record<Term, string> = {
  full: 'Full year',
  S1: 'Semester 1',
  S2: 'Semester 2',
  Q1: 'Quarter 1',
  Q2: 'Quarter 2',
  Q3: 'Quarter 3',
  Q4: 'Quarter 4',
};

// ---------------------------------------------------------------------------------------------
// Creating and copying
// ---------------------------------------------------------------------------------------------

export function emptyClass(init: Partial<ClassInfo> = {}, now: number = Date.now()): ClassInfo {
  return {
    id: newId(),
    name: '',
    teacher: { name: '' },
    room: { label: '' },
    periods: [],
    term: 'full',
    color: CLASS_COLORS[0],
    links: [],
    customFields: [],
    createdAt: now,
    updatedAt: now,
    ...init,
  };
}

/**
 * Fills in anything a stored class might be missing (older data, other devices) so the pages
 * can read every field without checks.
 */
export function withClassDefaults(c: ClassInfo): ClassInfo {
  return {
    ...c,
    name: c.name ?? '',
    teacher: { ...c.teacher, name: c.teacher?.name ?? '' },
    room: { ...c.room, label: c.room?.label ?? '' },
    periods: Array.isArray(c.periods) ? c.periods : [],
    term: c.term ?? 'full',
    color: c.color || CLASS_COLORS[0],
    links: Array.isArray(c.links) ? c.links : [],
    customFields: Array.isArray(c.customFields) ? c.customFields : [],
  };
}

/** A deep copy with a new id, named '<name> (copy)' and not archived. */
export function duplicateClass(c: ClassInfo, now: number = Date.now()): ClassInfo {
  const copy = JSON.parse(JSON.stringify(c)) as ClassInfo;
  delete copy.archived;
  return { ...copy, id: newId(), name: `${c.name} (copy)`, createdAt: now, updatedAt: now };
}

// ---------------------------------------------------------------------------------------------
// Validation and cleanup
// ---------------------------------------------------------------------------------------------

/** field path -> message, e.g. { name: '...', 'links.2.url': '...' } */
export type ClassErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;

/** 'classroom.google.com/c/x' -> 'https://classroom.google.com/c/x' */
export function normalizeUrl(s: string): string {
  const t = s.trim();
  if (!t || SCHEME_RE.test(t)) return t;
  return 'https://' + t.replace(/^\/+/, '');
}

/** a web (or mailto:) address that a link can safely point to */
export function isValidUrl(s: string): boolean {
  const t = normalizeUrl(s);
  if (!t || /\s/.test(t)) return false;
  try {
    const u = new URL(t);
    if (u.protocol === 'mailto:') return EMAIL_RE.test(decodeURIComponent(u.pathname));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.hostname === 'localhost' || /\.[a-z\d-]{2,}$/i.test(u.hostname) || /^\d+(\.\d+){3}$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** href for stored links; undefined for anything that isn't http(s)/mailto/tel (e.g. javascript:) */
export function safeHref(s: string | undefined): string | undefined {
  if (!s?.trim()) return undefined;
  try {
    const u = new URL(normalizeUrl(s));
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export function telHref(phone: string | undefined): string | undefined {
  const digits = phone?.split(/x|ext/i)[0].replace(/[^\d+]/g, '');
  return digits && digits.replace(/\D/g, '').length >= 3 ? `tel:${digits}` : undefined;
}

/** 'classroom.google.com' for display next to a link */
export function hostOf(url: string): string {
  try {
    const u = new URL(normalizeUrl(url));
    return u.protocol === 'mailto:' ? u.pathname : u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const blank = (s: string | undefined) => !s?.trim();

/** Problems that block saving, keyed by field path. Empty object = OK. */
export function validateClass(c: ClassInfo): ClassErrors {
  const e: ClassErrors = {};
  if (blank(c.name)) e.name = 'Give the class a name.';
  else if (c.name.trim().length > 120) e.name = 'Keep the name under 120 characters.';
  if (!HEX_RE.test(c.color ?? '')) e.color = 'Pick a color.';
  if (c.icon && c.icon.trim().length > 12) e.icon = 'Keep the icon short: an emoji or a few letters.';
  if (c.credits !== undefined && (!Number.isFinite(c.credits) || c.credits < 0 || c.credits > 30)) e.credits = 'Credits should be a number from 0 to 30.';

  const t = c.teacher ?? { name: '' };
  if (!blank(t.email) && !EMAIL_RE.test(t.email!.trim())) e['teacher.email'] = 'That doesn’t look like an email address.';
  if (!blank(t.website) && !isValidUrl(t.website!)) e['teacher.website'] = 'That doesn’t look like a web address.';
  if (!blank(t.phone) && !telHref(t.phone)) e['teacher.phone'] = 'That doesn’t look like a phone number.';

  (c.links ?? []).forEach((l, i) => {
    if (blank(l.url) && blank(l.label)) return;
    if (blank(l.url)) e[`links.${i}.url`] = 'Add the link’s address.';
    else if (!isValidUrl(l.url)) e[`links.${i}.url`] = 'That doesn’t look like a web address.';
  });

  (c.customFields ?? []).forEach((f, i) => {
    if (blank(f.key) && !blank(f.value)) e[`customFields.${i}.key`] = 'Name this detail.';
  });

  (c.altRooms ?? []).forEach((a, i) => {
    const hasRoom = !blank(a.room?.label);
    const hasDays = (a.days ?? []).length > 0;
    if (hasRoom && !hasDays) e[`altRooms.${i}.days`] = 'Pick the days this room is used.';
    if (hasDays && !hasRoom) e[`altRooms.${i}.room`] = 'Enter the room.';
  });
  return e;
}

const opt = (s: string | undefined) => (s?.trim() ? s.trim() : undefined);
const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

export function cleanRoom(r: ClassRoom | undefined): ClassRoom {
  const label = r?.label?.trim() ?? '';
  const out: ClassRoom = { label };
  if (label && r?.mapKey) out.mapKey = r.mapKey;
  const where = opt(r?.where);
  if (where) out.where = where;
  return out;
}

/** cycle day ids, or undefined for "every day" (none picked, or all of them) */
export function cleanDays(days: string[] | undefined, cycleDayIds: string[] = []): string[] | undefined {
  const d = uniq(days ?? []);
  if (d.length === 0) return undefined;
  if (cycleDayIds.length && cycleDayIds.every((id) => d.includes(id))) return undefined;
  if (cycleDayIds.length) d.sort((a, b) => cycleDayIds.indexOf(a) - cycleDayIds.indexOf(b));
  return d;
}

/**
 * The class as it should be stored: strings trimmed, empty optional fields and empty rows
 * dropped, URLs given a scheme, "all days" stored as undefined. Run validateClass first.
 */
export function prepareClass(c: ClassInfo, cycleDayIds: string[] = []): ClassInfo {
  const t = c.teacher ?? { name: '' };
  const website = opt(t.website);
  const altRooms = (c.altRooms ?? [])
    .filter((a) => !blank(a.room?.label) || (a.days ?? []).length > 0)
    .map((a) => ({ days: uniq(a.days ?? []), room: cleanRoom(a.room) }));
  return {
    ...c,
    name: c.name.trim(),
    courseCode: opt(c.courseCode),
    section: opt(c.section),
    icon: opt(c.icon),
    credits: c.credits !== undefined && Number.isFinite(c.credits) ? c.credits : undefined,
    teacher: {
      name: t.name?.trim() ?? '',
      email: opt(t.email),
      phone: opt(t.phone),
      website: website && normalizeUrl(website),
      office: opt(t.office),
      officeHours: opt(t.officeHours),
    },
    room: cleanRoom(c.room),
    periods: uniq(c.periods ?? []),
    days: cleanDays(c.days, cycleDayIds),
    altRooms: altRooms.length ? altRooms : undefined,
    links: (c.links ?? []).filter((l) => !blank(l.url)).map((l) => ({ label: l.label?.trim() ?? '', url: normalizeUrl(l.url) })),
    materials: opt(c.materials),
    gradingPolicy: opt(c.gradingPolicy),
    grade: opt(c.grade),
    notes: opt(c.notes),
    customFields: (c.customFields ?? []).filter((f) => !blank(f.key)).map((f) => ({ key: f.key.trim(), value: f.value?.trim() ?? '' })),
    archived: c.archived || undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// Ordering, conflicts, search
// ---------------------------------------------------------------------------------------------

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Classes by their first period in schedule order (unknown periods after, none last), then name. */
export function sortByPeriod<T extends Pick<ClassInfo, 'periods' | 'name'>>(classes: T[], periodIds: string[]): T[] {
  const order = new Map(periodIds.map((id, i) => [id, i]));
  const first = (c: T): [number, string] => {
    let best: [number, string] = [Infinity, ''];
    for (const p of c.periods ?? []) {
      const i = order.get(p) ?? order.size;
      if (i < best[0] || (i === best[0] && collator.compare(p, best[1]) < 0)) best = [i, p];
    }
    return best;
  };
  const keyed = classes.map((c) => ({ c, k: first(c) }));
  keyed.sort((a, b) => a.k[0] - b.k[0] || collator.compare(a.k[1], b.k[1]) || collator.compare(a.c.name, b.c.name));
  return keyed.map((x) => x.c);
}

export interface PeriodConflict {
  other: ClassInfo;
  /** the shared period ids */
  periods: string[];
  /** the cycle day ids both meet on; undefined = every day */
  days?: string[];
}

/** a class's meeting days limited to known cycle days; undefined = every day */
function effectiveDays(days: string[] | undefined, cycleDayIds: string[]): string[] | undefined {
  if (!days?.length) return undefined;
  if (!cycleDayIds.length) return days;
  const known = days.filter((d) => cycleDayIds.includes(d));
  return known.length === cycleDayIds.length ? undefined : known;
}

/** Other active classes that share a period with `c` on at least one common day. */
export function periodConflicts(classes: ClassInfo[], c: Pick<ClassInfo, 'id' | 'periods' | 'days'>, cycleDayIds: string[] = []): PeriodConflict[] {
  const mine = effectiveDays(c.days, cycleDayIds);
  const out: PeriodConflict[] = [];
  for (const other of classes) {
    if (other.id === c.id || other.archived) continue;
    const periods = (c.periods ?? []).filter((p) => other.periods?.includes(p));
    if (!periods.length) continue;
    const theirs = effectiveDays(other.days, cycleDayIds);
    const days = mine === undefined ? theirs : theirs === undefined ? mine : mine.filter((d) => theirs.includes(d));
    if (days !== undefined && days.length === 0) continue;
    out.push({ other, periods: uniq(periods), days });
  }
  return out;
}

/** every word of `q` appears somewhere in the class's details */
export function matchesQuery(c: ClassInfo, q: string, schedule?: SchoolSchedule | null): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [
    c.name,
    c.courseCode,
    c.section,
    c.level,
    c.term && TERM_LABELS[c.term],
    c.teacher?.name,
    c.teacher?.email,
    c.room?.label,
    c.room?.where,
    ...(c.altRooms ?? []).map((a) => a.room?.label),
    ...(c.periods ?? []).map((p) => periodName(schedule, p)),
    describeDays(c.days, schedule),
    ...(c.customFields ?? []).flatMap((f) => [f.key, f.value]),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

// ---------------------------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------------------------

function plural(word: string): string {
  return /(s|sh|ch|x|z)$/i.test(word) ? word + 'es' : word + 's';
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;
}

/**
 * Joins names, folding a shared first or last word:
 * ['Period 1', 'Period 3'] -> 'Periods 1 & 3', ['A Day', 'C Day'] -> 'A & C Days',
 * ['Mon', 'Wed', 'Fri'] -> 'Mon, Wed & Fri'.
 */
export function joinNames(names: string[]): string {
  if (names.length < 2) return names.join('');
  const parts = names.map((n) => n.trim().split(/\s+/));
  if (parts.every((p) => p.length === 2)) {
    if (parts.every((p) => p[0] === parts[0][0])) return `${plural(parts[0][0])} ${list(parts.map((p) => p[1]))}`;
    if (parts.every((p) => p[1] === parts[0][1])) return `${list(parts.map((p) => p[0]))} ${plural(parts[0][1])}`;
  }
  return list(names);
}

/** period ids in the schedule's order (unknown ids after, naturally sorted) */
export function orderPeriods(ids: string[], schedule?: SchoolSchedule | null): string[] {
  const order = new Map((schedule?.periods ?? []).map((p, i) => [p.id, i]));
  return [...new Set(ids)].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || collator.compare(a, b));
}

/** 'Period 3', 'Periods 3 & 4', 'Lunch' */
export function describePeriods(ids: string[] | undefined, schedule?: SchoolSchedule | null): string {
  return joinNames(orderPeriods(ids ?? [], schedule).map((id) => periodName(schedule, id)));
}

export function cycleDayName(id: string, schedule?: SchoolSchedule | null, short = false): string {
  const d = schedule?.cycle?.days?.find((x) => x.id === id);
  if (!d) return id;
  return short || schedule?.cycle.mode === 'weekday' ? shortCycleDayName(d) : d.name;
}

/** 'Every day', 'A & C Days', 'Mon, Wed & Fri' */
export function describeDays(days: string[] | undefined, schedule?: SchoolSchedule | null): string {
  if (!days?.length) return 'Every day';
  const ids = schedule?.cycle?.days?.map((d) => d.id) ?? [];
  if (ids.length && ids.every((id) => days.includes(id))) return 'Every day';
  const rank = (id: string) => (ids.includes(id) ? ids.indexOf(id) : ids.length);
  const ordered = [...days].sort((a, b) => rank(a) - rank(b) || collator.compare(a, b));
  return joinNames(ordered.map((id) => cycleDayName(id, schedule)));
}

/** 'Period 3', or 'Period 3 · A & C Days' for a class that only meets on some days */
export function meetingSummary(c: Pick<ClassInfo, 'periods' | 'days'>, schedule?: SchoolSchedule | null): string {
  const p = describePeriods(c.periods, schedule);
  const d = c.days?.length ? describeDays(c.days, schedule) : '';
  return [p, d === 'Every day' ? '' : d].filter(Boolean).join(' · ');
}

export interface MeetingGroup {
  days: CycleDay[];
  slots: BellSlot[];
  /** the group covers every cycle day */
  everyDay: boolean;
}

/** Folds cycle days with identical times into one row (meetingTimes() gives one per day). */
export function groupMeetingTimes(times: MeetingTime[], totalDays: number): MeetingGroup[] {
  const groups = new Map<string, MeetingGroup>();
  for (const t of times) {
    const key = t.slots.map((s) => `${s.period}@${s.start}-${s.end}`).join(',');
    const g = groups.get(key);
    if (g) g.days.push(t.cycleDay);
    else groups.set(key, { days: [t.cycleDay], slots: t.slots, everyDay: false });
  }
  for (const g of groups.values()) g.everyDay = g.days.some((d) => d.id === '*') || (totalDays > 1 && g.days.length === totalDays);
  return [...groups.values()];
}

/**
 * Cycle days the class should meet on (its days, or all) where the regular bell has none of
 * its periods, e.g. the drop day of a rotating schedule.
 */
export function daysWithoutMeetings(schedule: SchoolSchedule, c: Pick<ClassInfo, 'periods' | 'days'>, times: MeetingTime[]): CycleDay[] {
  if (!c.periods?.length) return [];
  const met = new Set(times.map((t) => t.cycleDay.id));
  if (met.has('*')) return [];
  return (schedule.cycle?.days ?? []).filter((d) => (!c.days?.length || c.days.includes(d.id)) && !met.has(d.id));
}

// ---------------------------------------------------------------------------------------------
// Next meeting, rooms, homework
// ---------------------------------------------------------------------------------------------

export interface NextMeeting {
  date: ISODate;
  day: DayInfo;
  slot: BellSlot;
  room: ClassRoom;
  /** the class is in session right now */
  now: boolean;
}

/** The class's current or next meeting from `today` at `minutes` past midnight. */
export function nextMeeting(c: ClassInfo, getDay: (d: ISODate) => DayInfo, today: ISODate, minutes: number, maxDays = 28): NextMeeting | undefined {
  if (c.archived || !c.periods?.length) return undefined;
  for (let k = 0; k <= maxDays; k++) {
    const date = addDays(today, k);
    const day = getDay(date);
    if (!day.isSchoolDay) continue;
    const cd = day.cycleDay?.id;
    for (const slot of sortSlots(day.slots)) {
      if (!meetsIn(c, slot, cd)) continue;
      if (k === 0 && toMinutes(slot.end) <= minutes) continue;
      return { date, day, slot, room: roomOn(c, cd), now: k === 0 && toMinutes(slot.start) <= minutes };
    }
  }
  return undefined;
}

/**
 * The map room a typed room name refers to: an exact label/key match ('214', 'room 214'),
 * else a unique name match ('Media Center'). Undefined when there's none or it's ambiguous.
 */
export function matchMapRoom(rooms: MapRoom[], text: string): MapRoom | undefined {
  const t = text.trim().toLowerCase().replace(/^room\s+/, '');
  if (!t) return undefined;
  const usable = rooms.filter((r) => r.type !== 'stair');
  const byLabel = usable.filter((r) => r.key.toLowerCase() === t || r.label.toLowerCase() === t);
  if (byLabel.length === 1) return byLabel[0];
  if (byLabel.length > 1) return byLabel.find((r) => r.key.toLowerCase() === t);
  const byName = usable.filter((r) => r.name.toLowerCase() === t || r.title.toLowerCase() === t);
  return byName.length === 1 ? byName[0] : undefined;
}

/** 'Room 214' for numbered rooms, otherwise the label as written ('Gym') */
export function roomLabel(room: ClassRoom | undefined): string {
  const l = room?.label?.trim();
  if (!l) return '';
  return /^[A-Z]?\d/i.test(l) ? `Room ${l}` : l;
}

const dueKey = (a: Assignment) => `${a.dueDate ?? ''} ${a.dueTime ?? '99:99'}`;

/** A class's unfinished assignments by due date (overdue first) and how many are done. */
export function classAssignments(assignments: Assignment[], classId: string): { open: Assignment[]; done: number } {
  const mine = assignments.filter((a) => a.classId === classId);
  const open = mine.filter((a) => a.status !== 'done').sort((a, b) => (dueKey(a) < dueKey(b) ? -1 : dueKey(a) > dueKey(b) ? 1 : 0));
  return { open, done: mine.length - open.length };
}
