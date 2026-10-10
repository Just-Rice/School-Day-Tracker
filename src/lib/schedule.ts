// The schedule engine: turns a SchoolSchedule (bells + calendar + cycle) and the user's day
// overrides into what happens on a given date. Everything here is pure so it can be tested and
// reused by any page; useSchedule() wires it to the user's profile.
import type { Bell, BellSlot, ClassInfo, ClassRoom, ClockTime, CycleDay, DayInfo, DayOverride, ISODate, SchoolSchedule, SlotKind, SpecialDay } from '../types';
import { addDays, daysBetween, formatTime, isWeekend, parseISODate, toISODate, toMinutes, weekday } from './dates';

/** cycle day ids used by 'weekday' mode, indexed like Date.getDay() */
export const WEEKDAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WEEKDAY_SHORT: Record<string, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

/** a school year never spans more than this; guards against typos like lastDay 2207-06-18 */
const MAX_SPAN_DAYS = 1100;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

export function isClockTime(s: unknown): s is ClockTime {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** whether a slot has a valid start and end time (a cleared time in the editor leaves '') */
export function hasTimes(slot: BellSlot): boolean {
  return isClockTime(slot.start) && isClockTime(slot.end);
}

const byStart = (a: BellSlot, b: BellSlot) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : 0);

export function sortSlots(slots: BellSlot[]): BellSlot[] {
  return [...slots].sort(byStart);
}

/**
 * Fills in missing arrays/objects so a hand-edited or partial schedule.json can't crash the UI.
 * Returns `s` itself when nothing is missing (keeps resolveDay's per-object cache warm).
 */
export function normalizeSchedule(s: SchoolSchedule): SchoolSchedule {
  const ok =
    Array.isArray(s.cycle?.days) &&
    Array.isArray(s.periods) &&
    Array.isArray(s.bells) &&
    s.bells.every((b) => b && typeof b.days === 'object' && b.days && Object.values(b.days).every(Array.isArray)) &&
    Array.isArray(s.calendar?.noSchool) &&
    Array.isArray(s.calendar?.specialDays);
  if (ok) return s;
  const bells = (Array.isArray(s.bells) ? s.bells : []).filter(Boolean).map((b, i) => ({
    ...b,
    id: b.id ?? `bell${i + 1}`,
    name: b.name ?? b.id ?? `Bell ${i + 1}`,
    days: Object.fromEntries(Object.entries(b.days && typeof b.days === 'object' ? b.days : {}).filter(([, v]) => Array.isArray(v))),
  }));
  return {
    ...s,
    cycle: { mode: s.cycle?.mode === 'weekday' ? 'weekday' : 'rotation', days: Array.isArray(s.cycle?.days) ? s.cycle.days : [] },
    periods: Array.isArray(s.periods) ? s.periods : [],
    bells,
    calendar: {
      ...(s.calendar ?? { firstDay: '', lastDay: '' }),
      noSchool: Array.isArray(s.calendar?.noSchool) ? s.calendar.noSchool : [],
      specialDays: Array.isArray(s.calendar?.specialDays) ? s.calendar.specialDays : [],
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Resolving a date
// ---------------------------------------------------------------------------------------------

interface DateStatus {
  school: boolean;
  reason?: string;
  /** index into cycle.days */
  cycle?: number;
}

interface Resolver {
  schedule: SchoolSchedule;
  overrides: Record<ISODate, DayOverride>;
  first: ISODate | null;
  status: DateStatus[];
  special: Map<ISODate, SpecialDay>;
  days: Map<ISODate, DayInfo>;
}

const EMPTY_OVERRIDES: Record<ISODate, DayOverride> = {};
const resolvers = new WeakMap<SchoolSchedule, Map<string, Resolver>>();
const overrideKeys = new WeakMap<object, string>();
const MAX_RESOLVERS_PER_SCHEDULE = 8;

/** a stable string for an overrides map; cached per object (profiles are never mutated in place) */
function overridesKey(o: Record<ISODate, DayOverride>): string {
  let k = overrideKeys.get(o);
  if (k === undefined) {
    k = JSON.stringify(
      Object.keys(o)
        .sort()
        .map((d) => [d, o[d]?.noSchool ?? null, o[d]?.name ?? null, o[d]?.cycleDay ?? null, o[d]?.bell ?? null]),
    );
    overrideKeys.set(o, k);
  }
  return k;
}

function getResolver(schedule: SchoolSchedule, overrides: Record<ISODate, DayOverride>): Resolver {
  let bySchedule = resolvers.get(schedule);
  if (!bySchedule) resolvers.set(schedule, (bySchedule = new Map()));
  const key = overridesKey(overrides);
  let r = bySchedule.get(key);
  if (!r) {
    r = buildResolver(schedule, overrides);
    if (bySchedule.size >= MAX_RESOLVERS_PER_SCHEDULE) bySchedule.delete(bySchedule.keys().next().value!);
    bySchedule.set(key, r);
  }
  return r;
}

/**
 * Precomputes school/no-school and the cycle day for every date of the school year (stretched to
 * take in make-up days the user added just before or after it).
 */
function buildResolver(schedule: SchoolSchedule, overrides: Record<ISODate, DayOverride>): Resolver {
  const cal = schedule.calendar;
  const special = new Map<ISODate, SpecialDay>();
  for (const d of cal?.specialDays ?? []) if (isISODate(d.date) && !special.has(d.date)) special.set(d.date, d);

  const valid = !!cal && isISODate(cal.firstDay) && isISODate(cal.lastDay) && cal.firstDay <= cal.lastDay;
  const resolver: Resolver = { schedule, overrides, first: null, status: [], special, days: new Map() };
  if (!valid) return resolver;
  const yearFirst = cal.firstDay;
  const yearLast = addDays(yearFirst, Math.min(daysBetween(yearFirst, cal.lastDay), MAX_SPAN_DAYS));
  // a make-up day (noSchool: false) outside the year, e.g. one added after the last day when the
  // emergency closing days run out, still counts
  let first = yearFirst;
  let last = yearLast;
  const makeUps = Object.keys(overrides)
    .filter((d) => overrides[d]?.noSchool === false && isISODate(d))
    .sort();
  for (const d of makeUps) if (d > last && daysBetween(first, d) <= MAX_SPAN_DAYS) last = d;
  for (const d of makeUps.reverse()) if (d < first && daysBetween(d, last) <= MAX_SPAN_DAYS) first = d;
  const span = daysBetween(first, last) + 1;
  const y0 = daysBetween(first, yearFirst);
  const y1 = daysBetween(first, yearLast);
  resolver.first = first;

  // Named no-school ranges, clamped to the year (first listed wins where they overlap)
  const off: (string | undefined)[] = new Array(span);
  for (const ns of cal.noSchool ?? []) {
    if (!isISODate(ns.date)) continue;
    const end = isISODate(ns.end) && ns.end >= ns.date ? ns.end : ns.date;
    const a = Math.max(y0, daysBetween(first, ns.date));
    const b = Math.min(y1, daysBetween(first, end));
    for (let i = a; i <= b; i++) off[i] ??= ns.name || 'No school';
  }

  const dates: ISODate[] = new Array(span);
  const status: DateStatus[] = new Array(span);
  // school days by the schedule alone, without the user's overrides
  const scheduled: boolean[] = new Array(span);
  let date = first;
  for (let i = 0; i < span; i++, date = addDays(date, 1)) {
    dates[i] = date;
    const inYear = i >= y0 && i <= y1;
    const calendarOff = inYear ? (off[i] ?? (isWeekend(date) ? 'Weekend' : undefined)) : 'Summer break';
    scheduled[i] = !calendarOff;
    const ov = overrides[date];
    let reason: string | undefined;
    // noSchool: false is a make-up day: school even on a weekend, a holiday or in the summer
    if (ov?.noSchool === false) reason = undefined;
    else if (ov?.noSchool === true && inYear) reason = ov.name || 'No school';
    else reason = calendarOff;
    status[i] = reason ? { school: false, reason } : { school: true };
  }
  resolver.status = status;

  const cycleDays = schedule.cycle?.days ?? [];
  const n = cycleDays.length;
  if (n === 0) return resolver;
  const indexOf = new Map(cycleDays.map((d, i) => [d.id, i]));
  const cycleIndex = (id: string | undefined) => (id === undefined ? undefined : indexOf.get(id));

  if (schedule.cycle.mode === 'weekday') {
    for (let i = 0; i < span; i++) {
      if (!status[i].school) continue;
      const d = dates[i];
      status[i].cycle = cycleIndex(overrides[d]?.cycleDay) ?? cycleIndex(special.get(d)?.cycleDay) ?? indexOf.get(WEEKDAY_IDS[weekday(d)]);
    }
    return resolver;
  }

  // Rotation: one cycle day per school day. Forced days (a user override, a special day, the
  // anchor) set the cycle day and the rotation continues from them.
  const anchor = cal.anchor;
  const anchorAt = anchor && isISODate(anchor.date) && indexOf.has(anchor.cycleDay) && anchor.date >= yearFirst && anchor.date <= yearLast ? daysBetween(first, anchor.date) : -1;
  /**
   * The forced cycle day of each school day in `school`. A special day's cycle day or the anchor
   * on a day off (e.g. a snow day) carries over to the next school day that isn't forced itself.
   */
  const forcedDays = (school: boolean[], withOverrides: boolean) => {
    const forced: (number | undefined)[] = new Array(span);
    let anchored = false;
    let carried: number | undefined;
    for (let i = 0; i < span; i++) {
      const sp = cycleIndex(special.get(dates[i])?.cycleDay);
      if (!school[i]) {
        carried = sp ?? carried;
        continue;
      }
      let a: number | undefined;
      if (anchorAt >= 0 && !anchored && i >= anchorAt && i <= y1) {
        a = cycleIndex(anchor!.cycleDay);
        anchored = true;
      }
      forced[i] = (withOverrides ? cycleIndex(overrides[dates[i]]?.cycleDay) : undefined) ?? sp ?? a ?? carried;
      carried = undefined;
    }
    return { forced, anchored };
  };
  const advances = (forced: (number | undefined)[], i: number) => forced[i] !== undefined || special.get(dates[i])?.advance !== false;
  const mod = (x: number) => ((x % n) + n) % n;

  // The schedule alone sets the cycle day of its first school day: counted backwards from the
  // first forced day when there's an anchor, otherwise the first cycle day.
  const base = forcedDays(scheduled, false);
  const baseSchool: number[] = [];
  for (let i = 0; i < span; i++) if (scheduled[i]) baseSchool.push(i);
  let start = 0;
  if (baseSchool.length) {
    const f = base.anchored ? baseSchool.findIndex((i) => base.forced[i] !== undefined) : 0;
    start = base.forced[baseSchool[f]] ?? 0;
    for (let p = f - 1; p >= 0; p--) if (advances(base.forced, baseSchool[p + 1])) start = mod(start - 1);
  }

  // The user's day changes only move their own date and the days after it (up to the next forced
  // day), never earlier ones: walk forward from the schedule's first school day. School days the
  // user added before it are counted backwards.
  const { forced } = forcedDays(status.map((st) => st.school), true);
  const school: number[] = [];
  for (let i = 0; i < span; i++) if (status[i].school) school.push(i);
  if (school.length === 0) return resolver;
  let s = school.findIndex((i) => i >= (baseSchool[0] ?? 0));
  if (s < 0) s = school.length - 1;
  const cyc: number[] = new Array(school.length);
  cyc[s] = forced[school[s]] ?? start;
  for (let p = s + 1; p < school.length; p++) cyc[p] = forced[school[p]] ?? (advances(forced, school[p]) ? mod(cyc[p - 1] + 1) : cyc[p - 1]);
  for (let p = s - 1; p >= 0; p--) cyc[p] = forced[school[p]] ?? (advances(forced, school[p + 1]) ? mod(cyc[p + 1] - 1) : cyc[p + 1]);
  school.forEach((i, p) => (status[i].cycle = cyc[p]));
  return resolver;
}

function findBell(schedule: SchoolSchedule, id: string | undefined): Bell | undefined {
  return id === undefined ? undefined : schedule.bells?.find((b) => b.id === id);
}

/**
 * What happens on `date`: whether there's school (and if not, why), the cycle day, the bell and
 * its slots in time order. Results are memoized per schedule + overrides, so treat them as
 * read-only and don't mutate the schedule or overrides objects after passing them in.
 */
export function resolveDay(schedule: SchoolSchedule, date: ISODate, overrides: Record<ISODate, DayOverride> = EMPTY_OVERRIDES): DayInfo {
  const r = getResolver(schedule, overrides);
  const hit = r.days.get(date);
  if (hit) return hit;
  const info = computeDay(r, date);
  r.days.set(date, info);
  return info;
}

function computeDay(r: Resolver, date: ISODate): DayInfo {
  const off = (reason: string): DayInfo => ({ date, isSchoolDay: false, reason, slots: [], notes: [] });
  if (!isISODate(date)) return off('Invalid date');
  if (!r.first) return off('No school calendar');
  const i = daysBetween(r.first, date);
  if (i < 0 || i >= r.status.length) return off('Summer break');
  const st = r.status[i];
  if (!st.school) return off(st.reason ?? 'No school');

  const { schedule } = r;
  const ov = r.overrides[date];
  const sp = r.special.get(date);
  const cycleDay = st.cycle !== undefined ? schedule.cycle.days[st.cycle] : undefined;
  const bell = findBell(schedule, ov?.bell) ?? findBell(schedule, sp?.bell) ?? schedule.bells?.[0];
  const slots = bell ? sortSlots(((cycleDay && bell.days[cycleDay.id]) ?? bell.days['*'] ?? []).filter(hasTimes)) : [];
  const notes: string[] = [];
  for (const n of [sp?.name, ov?.name]) if (n && !notes.includes(n)) notes.push(n);
  return { date, isSchoolDay: true, cycleDay, bell, slots, notes };
}

/** The first school day after `from` (exclusive), looking ahead at most `maxDays` days. */
export function nextSchoolDay(getDay: (d: ISODate) => DayInfo, from: ISODate, maxDays = 200): DayInfo | undefined {
  for (let k = 1; k <= maxDays; k++) {
    const d = getDay(addDays(from, k));
    if (d.isSchoolDay) return d;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Now / next
// ---------------------------------------------------------------------------------------------

export type NowState = 'before' | 'during' | 'passing' | 'after' | 'no-school';

export interface CurrentAndNext {
  current?: BellSlot;
  next?: BellSlot;
  /** minutes until `current` ends */
  minutesLeft?: number;
  /** minutes until `next` starts */
  minutesUntilNext?: number;
  state: NowState;
}

/** Where `minutes` (after midnight, may be fractional) falls in a day's slots. */
export function currentAndNext(day: DayInfo, minutes: number): CurrentAndNext {
  if (!day.isSchoolDay) return { state: 'no-school' };
  const slots = sortSlots(day.slots.filter(hasTimes));
  if (slots.length === 0) return { state: 'after' };

  // With overlapping slots (lunch waves inside a period) the one that started last is "current".
  let current: BellSlot | undefined;
  for (const s of slots) {
    const a = toMinutes(s.start);
    const b = toMinutes(s.end);
    if (a <= minutes && minutes < b && (!current || a > toMinutes(current.start) || (a === toMinutes(current.start) && b < toMinutes(current.end)))) current = s;
  }
  const next = slots.find((s) => s !== current && toMinutes(s.start) > minutes);
  const out: CurrentAndNext = { current, next, state: 'after' };
  if (current) out.minutesLeft = toMinutes(current.end) - minutes;
  if (next) out.minutesUntilNext = toMinutes(next.start) - minutes;
  if (current) out.state = 'during';
  else if (minutes < toMinutes(slots[0].start)) out.state = 'before';
  else if (next) out.state = 'passing';
  return out;
}

/** 0..1 through a slot */
export function slotProgress(slot: BellSlot, minutes: number): number {
  const a = toMinutes(slot.start);
  const b = toMinutes(slot.end);
  if (b <= a) return 0;
  return Math.min(1, Math.max(0, (minutes - a) / (b - a)));
}

// ---------------------------------------------------------------------------------------------
// Names and formatting
// ---------------------------------------------------------------------------------------------

export function periodName(schedule: SchoolSchedule | null | undefined, id: string): string {
  return schedule?.periods.find((p) => p.id === id)?.name ?? (/^\d+$/.test(id) ? `Period ${id}` : id);
}

/** 'Lunch A', 'Period 3', ... */
export function slotName(schedule: SchoolSchedule | null | undefined, slot: BellSlot): string {
  return slot.label || periodName(schedule, slot.period);
}

export function slotKind(schedule: SchoolSchedule | null | undefined, slot: BellSlot): SlotKind {
  return slot.kind ?? schedule?.periods.find((p) => p.id === slot.period)?.kind ?? 'class';
}

/** '8:00–8:52 AM', '11:30 AM–12:20 PM', or '08:00–08:52' */
export function formatTimeRange(start: ClockTime, end: ClockTime, clock: '12h' | '24h' = '12h'): string {
  if (clock === '24h') return `${start}–${end}`;
  const a = formatTime(start, '12h');
  const b = formatTime(end, '12h');
  if (a.slice(-2) === b.slice(-2)) return `${a.slice(0, -3)}–${b}`;
  return `${a}–${b}`;
}

/** 'Mon' for weekday cycle days, otherwise the cycle day's name */
export function shortCycleDayName(d: CycleDay): string {
  return WEEKDAY_SHORT[d.id] ?? d.name;
}

/** ['Day 1', 'Day 3'] -> 'Days 1, 3'; ['Mon', 'Wed'] -> 'Mon, Wed' */
export function joinDayNames(names: string[]): string {
  if (names.length < 2) return names.join('');
  const parts = names.map((n) => /^(\S+)\s+(\S+)$/.exec(n));
  const word = parts[0]?.[1];
  if (word && parts.every((m) => m && m[1] === word)) return `${word}s ${parts.map((m) => m![2]).join(', ')}`;
  return names.join(', ');
}

// ---------------------------------------------------------------------------------------------
// Classes on a day
// ---------------------------------------------------------------------------------------------

export interface Meeting {
  slot: BellSlot;
  /** undefined for slots no class is in (lunch, free periods) */
  cls?: ClassInfo;
  /** the room for this meeting (altRooms applied) */
  room?: ClassRoom;
}

/** whether `cls` meets in `slot` on a day with cycle day `cycleDayId` */
export function meetsIn(cls: ClassInfo, slot: BellSlot, cycleDayId: string | undefined): boolean {
  if (cls.archived || !cls.periods?.includes(slot.period)) return false;
  return !cls.days?.length || (cycleDayId !== undefined && cls.days.includes(cycleDayId));
}

/** the room `cls` is in on cycle day `cycleDayId` */
export function roomOn(cls: ClassInfo, cycleDayId: string | undefined): ClassRoom {
  const alt = cycleDayId === undefined ? undefined : cls.altRooms?.find((a) => a.days?.includes(cycleDayId));
  return alt?.room ?? cls.room;
}

/**
 * The day's slots in time order, each with the class that meets in it. When two classes share a
 * period, one limited to specific cycle days (a lab) wins over an every-day class.
 */
export function classesOnDay(day: DayInfo, classes: ClassInfo[]): Meeting[] {
  const cd = day.cycleDay?.id;
  return day.slots.map((slot) => {
    let cls: ClassInfo | undefined;
    for (const c of classes) {
      if (!meetsIn(c, slot, cd)) continue;
      if (!cls || (!cls.days?.length && c.days?.length)) cls = c;
    }
    return cls ? { slot, cls, room: roomOn(cls, cd) } : { slot };
  });
}

// ---------------------------------------------------------------------------------------------
// Class meeting times
// ---------------------------------------------------------------------------------------------

export interface MeetingTime {
  cycleDay: CycleDay;
  slots: BellSlot[];
}

const EVERY_DAY: CycleDay = { id: '*', name: 'Every day' };

/** For each cycle day of the regular bell (bells[0]), the slots `cls` meets in. */
export function meetingTimes(schedule: SchoolSchedule, cls: Pick<ClassInfo, 'periods' | 'days'>): MeetingTime[] {
  const bell = schedule.bells?.[0];
  if (!bell) return [];
  const days = schedule.cycle?.days?.length ? schedule.cycle.days : [EVERY_DAY];
  const out: MeetingTime[] = [];
  for (const d of days) {
    if (cls.days?.length && d !== EVERY_DAY && !cls.days.includes(d.id)) continue;
    const slots = sortSlots((bell.days[d.id] ?? bell.days['*'] ?? []).filter((s) => cls.periods.includes(s.period) && hasTimes(s)));
    if (slots.length) out.push({ cycleDay: d, slots });
  }
  return out;
}

/**
 * One line for a class's meeting times, grouping cycle days with the same times:
 * 'Every day · 8:00–8:52 AM', 'Days 1, 3 · 8:00–8:52 AM; Day 2 · 9:00–9:52 AM'.
 */
export function summarizeMeetingTimes(schedule: SchoolSchedule, cls: Pick<ClassInfo, 'periods' | 'days'>, clock: '12h' | '24h' = '12h'): string {
  const times = meetingTimes(schedule, cls);
  if (times.length === 0) return '';
  const groups = new Map<string, { days: CycleDay[]; slots: BellSlot[] }>();
  for (const t of times) {
    const key = t.slots.map((s) => `${s.start}-${s.end}`).join(',');
    const g = groups.get(key);
    if (g) g.days.push(t.cycleDay);
    else groups.set(key, { days: [t.cycleDay], slots: t.slots });
  }
  const total = schedule.cycle?.days?.length ?? 0;
  return [...groups.values()]
    .map((g) => {
      const all = g.days[0] === EVERY_DAY || (groups.size === 1 && g.days.length === total && total > 1);
      const days = all ? 'Every day' : joinDayNames(g.days.map(shortCycleDayName));
      return `${days} · ${g.slots.map((s) => formatTimeRange(s.start, s.end, clock)).join(' & ')}`;
    })
    .join('; ');
}

// ---------------------------------------------------------------------------------------------
// Rotation grid (cycle days x slots), for drop schedules
// ---------------------------------------------------------------------------------------------

export interface RotationRow {
  /** set when every cycle day's slot in this row has the same times */
  start?: ClockTime;
  end?: ClockTime;
  /** one cell per cycle day, in cycle order */
  cells: (BellSlot | undefined)[];
}

export function rotationRows(schedule: SchoolSchedule, bell: Bell | undefined = schedule.bells?.[0]): RotationRow[] {
  if (!bell) return [];
  const perDay = schedule.cycle.days.map((d) => sortSlots((bell.days[d.id] ?? bell.days['*'] ?? []).filter(hasTimes)));
  const rows = Math.max(0, ...perDay.map((s) => s.length));
  const out: RotationRow[] = [];
  for (let i = 0; i < rows; i++) {
    const cells = perDay.map((s) => s[i]);
    const present = cells.filter((c): c is BellSlot => !!c);
    const same = present.every((c) => c.start === present[0].start && c.end === present[0].end);
    out.push(same && present.length ? { start: present[0].start, end: present[0].end, cells } : { cells });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Calendar listing
// ---------------------------------------------------------------------------------------------

export interface CalendarEvent {
  date: ISODate;
  end?: ISODate;
  name: string;
  kind: 'no-school' | 'special';
  special?: SpecialDay;
}

/** No-school ranges and special days that haven't ended before `from`, in date order. */
export function upcomingCalendar(schedule: SchoolSchedule, from: ISODate): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const ns of schedule.calendar?.noSchool ?? []) {
    if (!isISODate(ns.date)) continue;
    const end = isISODate(ns.end) && ns.end > ns.date ? ns.end : undefined;
    if ((end ?? ns.date) >= from) out.push({ date: ns.date, end, name: ns.name || 'No school', kind: 'no-school' });
  }
  for (const sd of schedule.calendar?.specialDays ?? []) {
    if (!isISODate(sd.date) || sd.date < from) continue;
    const bell = findBell(schedule, sd.bell);
    const cyc = schedule.cycle.days.find((d) => d.id === sd.cycleDay);
    const name = sd.name || [bell?.name, cyc?.name].filter(Boolean).join(' · ') || 'Special schedule';
    out.push({ date: sd.date, name, kind: 'special', special: sd });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === b.kind ? 0 : a.kind === 'no-school' ? -1 : 1));
}

/** 'Snow day · No school', 'Day 3 · Early dismissal bell' */
export function describeOverride(o: DayOverride, schedule: SchoolSchedule | null | undefined): string {
  const parts: string[] = [];
  if (o.name) parts.push(o.name);
  if (o.noSchool === true) parts.push('No school');
  if (o.noSchool === false) parts.push('Make-up school day');
  if (o.noSchool !== true) {
    if (o.cycleDay) parts.push(schedule?.cycle.days.find((d) => d.id === o.cycleDay)?.name ?? o.cycleDay);
    const bell = o.bell && (schedule?.bells.find((b) => b.id === o.bell)?.name ?? o.bell);
    if (bell && bell !== o.name) parts.push(`${bell} bell`);
  }
  return parts.join(' · ') || 'No change';
}

/** an override with empty fields dropped; undefined when nothing is left */
export function cleanOverride(o: DayOverride): DayOverride | undefined {
  const out: DayOverride = {};
  if (o.noSchool !== undefined) out.noSchool = o.noSchool;
  if (o.name?.trim()) out.name = o.name.trim();
  if (o.noSchool !== true) {
    if (o.cycleDay) out.cycleDay = o.cycleDay;
    if (o.bell) out.bell = o.bell;
  }
  return Object.keys(out).length ? out : undefined;
}

// ---------------------------------------------------------------------------------------------
// Validation (for the editor)
// ---------------------------------------------------------------------------------------------

/** Human-readable problems with a schedule; empty when it looks fine. */
export function validateSchedule(s: SchoolSchedule): string[] {
  const out: string[] = [];
  const periods = s.periods ?? [];
  const cycleDays = s.cycle?.days ?? [];
  const bells = s.bells ?? [];
  const cal = s.calendar;

  const dupes = (ids: string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

  // periods
  if (periods.some((p) => !p.id.trim())) out.push('Every period needs an ID.');
  for (const id of dupes(periods.map((p) => p.id))) out.push(`Two periods share the ID "${id}".`);
  for (const p of periods) if (p.id.trim() && !p.name.trim()) out.push(`Period "${p.id}" needs a name.`);
  const periodIds = new Set(periods.map((p) => p.id));

  // cycle
  if (cycleDays.length === 0) out.push('Add at least one cycle day.');
  if (cycleDays.some((d) => !d.id.trim())) out.push('Every cycle day needs an ID.');
  for (const id of dupes(cycleDays.map((d) => d.id))) out.push(`Two cycle days share the ID "${id}".`);
  for (const d of cycleDays) if (d.id.trim() && !d.name.trim()) out.push(`Cycle day "${d.id}" needs a name.`);
  if (s.cycle?.mode === 'weekday') {
    const bad = cycleDays.filter((d) => !(WEEKDAY_IDS as readonly string[]).includes(d.id));
    if (bad.length) out.push(`In weekday mode, cycle day IDs must be mon, tue, wed, thu or fri (found ${bad.map((d) => `"${d.id}"`).join(', ')}).`);
  }
  const cycleIds = new Set(cycleDays.map((d) => d.id));
  const dayName = (id: string) => (id === '*' ? 'all days' : (cycleDays.find((d) => d.id === id)?.name ?? id));

  // bells
  if (bells.length === 0) out.push('Add at least one bell schedule.');
  for (const id of dupes(bells.map((b) => b.id))) out.push(`Two bell schedules share the ID "${id}".`);
  for (const b of bells) {
    const bn = b.name?.trim() || b.id || 'Unnamed bell';
    if (!b.id?.trim()) out.push(`Bell schedule "${bn}" needs an ID.`);
    if (!b.name?.trim()) out.push(`Bell schedule "${b.id}" needs a name.`);
    const keys = Object.keys(b.days ?? {});
    for (const k of keys) if (k !== '*' && !cycleIds.has(k)) out.push(`${bn}: times for unknown cycle day "${k}".`);
    if (!keys.includes('*')) {
      const missing = cycleDays.filter((d) => !keys.includes(d.id));
      if (missing.length) out.push(`${bn}: no times for ${missing.map((d) => d.name || d.id).join(', ')} (add times for all days or for each day).`);
    }
    for (const k of keys) {
      const where = `${bn}, ${dayName(k)}`;
      const slots = b.days[k] ?? [];
      for (const sl of slots) {
        const label = sl.label || periodName(s, sl.period);
        if (!periodIds.has(sl.period)) out.push(`${where}: unknown period "${sl.period}".`);
        if (!isClockTime(sl.start) || !isClockTime(sl.end)) out.push(`${where}: ${label} needs a start and end time.`);
        else if (toMinutes(sl.end) <= toMinutes(sl.start)) out.push(`${where}: ${label} ends before it starts.`);
      }
      const timed = sortSlots(slots.filter((sl) => isClockTime(sl.start) && isClockTime(sl.end) && sl.end > sl.start));
      for (let i = 1; i < timed.length; i++) {
        const a = timed[i - 1];
        const c = timed[i];
        if (c.start < a.end) out.push(`${where}: ${a.label || periodName(s, a.period)} (${a.start}–${a.end}) overlaps ${c.label || periodName(s, c.period)} (${c.start}–${c.end}).`);
      }
    }
  }
  const bellIds = new Set(bells.map((b) => b.id));

  // calendar
  if (!cal) {
    out.push('The schedule has no calendar.');
    return out;
  }
  const firstOk = isISODate(cal.firstDay);
  const lastOk = isISODate(cal.lastDay);
  if (!firstOk) out.push('Set the first day of school.');
  if (!lastOk) out.push('Set the last day of school.');
  const yearOk = firstOk && lastOk && cal.firstDay <= cal.lastDay;
  if (firstOk && lastOk && !yearOk) out.push('The last day of school is before the first day.');
  if (yearOk && daysBetween(cal.firstDay, cal.lastDay) > MAX_SPAN_DAYS) out.push('The school year is longer than three years; check the first and last day.');
  const inYear = (d: ISODate) => !yearOk || (d >= cal.firstDay && d <= cal.lastDay);

  if (cal.anchor) {
    if (!isISODate(cal.anchor.date)) out.push('The known cycle day needs a valid date.');
    else if (!inYear(cal.anchor.date)) out.push('The known cycle day is outside the school year.');
    else if (isWeekend(cal.anchor.date)) out.push('The known cycle day falls on a weekend.');
    if (!cycleIds.has(cal.anchor.cycleDay)) out.push(`The known cycle day "${cal.anchor.cycleDay}" isn't one of the cycle days.`);
  }
  for (const ns of cal.noSchool ?? []) {
    const n = ns.name?.trim() || 'A day off';
    if (!ns.name?.trim()) out.push(`A day off on ${ns.date || '(no date)'} needs a name.`);
    if (!isISODate(ns.date)) out.push(`${n}: set a valid date.`);
    else {
      if (ns.end !== undefined && ns.end !== '' && !isISODate(ns.end)) out.push(`${n}: the end date isn't valid.`);
      else if (isISODate(ns.end) && ns.end < ns.date) out.push(`${n}: ends before it starts.`);
      if (!inYear(ns.date) && !(isISODate(ns.end) && inYear(ns.end))) out.push(`${n} (${ns.date}) is outside the school year.`);
    }
  }
  const seen = new Set<string>();
  for (const sd of cal.specialDays ?? []) {
    const n = sd.name?.trim() || 'A special day';
    if (!isISODate(sd.date)) out.push(`${n}: set a valid date.`);
    else {
      if (seen.has(sd.date)) out.push(`Two special days on ${sd.date}; only the first is used.`);
      seen.add(sd.date);
      if (!inYear(sd.date)) out.push(`${n} (${sd.date}) is outside the school year.`);
    }
    if (sd.bell !== undefined && sd.bell !== '' && !bellIds.has(sd.bell)) out.push(`${n}: unknown bell schedule "${sd.bell}".`);
    if (sd.cycleDay !== undefined && sd.cycleDay !== '' && !cycleIds.has(sd.cycleDay)) out.push(`${n}: unknown cycle day "${sd.cycleDay}".`);
  }
  return out;
}
