// Immutable edits for the schedule editor. Renames cascade to everything that refers to the id
// (bell slots, special days, the anchor) so a rename never leaves dangling references.
import type { Bell, BellSlot, CycleDay, SchoolSchedule, SlotKind } from '../../types';
import { fromMinutes, toMinutes } from '../../lib/dates';
import { isClockTime } from '../../lib/schedule';

export const SLOT_KINDS: { id: SlotKind; name: string }[] = [
  { id: 'class', name: 'Class' },
  { id: 'lunch', name: 'Lunch' },
  { id: 'homeroom', name: 'Homeroom' },
  { id: 'break', name: 'Break' },
  { id: 'other', name: 'Other' },
];

export const WEEKDAY_CYCLE: CycleDay[] = [
  { id: 'mon', name: 'Monday' },
  { id: 'tue', name: 'Tuesday' },
  { id: 'wed', name: 'Wednesday' },
  { id: 'thu', name: 'Thursday' },
  { id: 'fri', name: 'Friday' },
];

/** `base`, or `base-2`, `base-3`, ... whichever isn't taken */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const b = base.trim() || 'new';
  if (!set.has(b)) return b;
  for (let i = 2; ; i++) if (!set.has(`${b}-${i}`)) return `${b}-${i}`;
}

function mapBells(s: SchoolSchedule, fn: (b: Bell) => Bell): SchoolSchedule {
  return { ...s, bells: s.bells.map(fn) };
}

function mapSlots(s: SchoolSchedule, fn: (slots: BellSlot[]) => BellSlot[]): SchoolSchedule {
  return mapBells(s, (b) => ({ ...b, days: Object.fromEntries(Object.entries(b.days).map(([k, v]) => [k, fn(v)])) }));
}

// ----------------------------------------------------------------------------------- periods

export function periodUsage(s: SchoolSchedule, id: string): number {
  let n = 0;
  for (const b of s.bells) for (const slots of Object.values(b.days)) n += slots.filter((x) => x.period === id).length;
  return n;
}

export function renamePeriod(s: SchoolSchedule, from: string, to: string): SchoolSchedule {
  if (from === to) return s;
  const next = { ...s, periods: s.periods.map((p) => (p.id === from ? { ...p, id: to } : p)) };
  return mapSlots(next, (slots) => slots.map((x) => (x.period === from ? { ...x, period: to } : x)));
}

export function removePeriod(s: SchoolSchedule, id: string): SchoolSchedule {
  const next = { ...s, periods: s.periods.filter((p) => p.id !== id) };
  return mapSlots(next, (slots) => slots.filter((x) => x.period !== id));
}

export function addPeriod(s: SchoolSchedule): SchoolSchedule {
  const nums = s.periods.map((p) => Number(p.id)).filter((n) => Number.isInteger(n));
  const id = uniqueId(String(nums.length ? Math.max(...nums) + 1 : s.periods.length + 1), s.periods.map((p) => p.id));
  return { ...s, periods: [...s.periods, { id, name: /^\d+$/.test(id) ? `Period ${id}` : 'New period' }] };
}

// -------------------------------------------------------------------------------- cycle days

export function renameCycleDay(s: SchoolSchedule, from: string, to: string): SchoolSchedule {
  if (from === to) return s;
  const cal = s.calendar;
  return {
    ...s,
    cycle: { ...s.cycle, days: s.cycle.days.map((d) => (d.id === from ? { ...d, id: to } : d)) },
    bells: s.bells.map((b) => ({ ...b, days: Object.fromEntries(Object.entries(b.days).map(([k, v]) => [k === from ? to : k, v])) })),
    calendar: {
      ...cal,
      anchor: cal.anchor?.cycleDay === from ? { ...cal.anchor, cycleDay: to } : cal.anchor,
      specialDays: cal.specialDays.map((d) => (d.cycleDay === from ? { ...d, cycleDay: to } : d)),
    },
  };
}

export function removeCycleDay(s: SchoolSchedule, id: string): SchoolSchedule {
  const cal = s.calendar;
  return {
    ...s,
    cycle: { ...s.cycle, days: s.cycle.days.filter((d) => d.id !== id) },
    bells: s.bells.map((b) => ({ ...b, days: Object.fromEntries(Object.entries(b.days).filter(([k]) => k !== id)) })),
    calendar: {
      ...cal,
      anchor: cal.anchor?.cycleDay === id ? undefined : cal.anchor,
      specialDays: cal.specialDays.map((d) => (d.cycleDay === id ? { ...d, cycleDay: undefined } : d)),
    },
  };
}

export function addCycleDay(s: SchoolSchedule): SchoolSchedule {
  const n = s.cycle.days.length + 1;
  const id = uniqueId(String(n), s.cycle.days.map((d) => d.id));
  return { ...s, cycle: { ...s.cycle, days: [...s.cycle.days, { id, name: `Day ${id}` }] } };
}

export function moveItem<T>(list: T[], index: number, by: -1 | 1): T[] {
  const j = index + by;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[index], out[j]] = [out[j], out[index]];
  return out;
}

/**
 * Weekday mode with Monday-Friday cycle days. Times for other cycle days are dropped; a bell with
 * no all-days times keeps the old first cycle day's times for all days.
 */
export function toWeekdayCycle(s: SchoolSchedule): SchoolSchedule {
  const isWeekday = (id: string) => WEEKDAY_CYCLE.some((d) => d.id === id);
  const firstOld = s.cycle.days[0]?.id;
  return {
    ...s,
    cycle: { mode: 'weekday', days: WEEKDAY_CYCLE.map((d) => ({ ...d })) },
    bells: s.bells.map((b) => {
      const days = Object.fromEntries(Object.entries(b.days).filter(([k]) => k === '*' || isWeekday(k)));
      if (!days['*'] && firstOld && !isWeekday(firstOld) && b.days[firstOld]) days['*'] = b.days[firstOld];
      return { ...b, days };
    }),
    calendar: {
      ...s.calendar,
      anchor: undefined,
      specialDays: s.calendar.specialDays.map((d) => (d.cycleDay && !isWeekday(d.cycleDay) ? { ...d, cycleDay: undefined } : d)),
    },
  };
}

// ------------------------------------------------------------------------------------- bells

export function renameBell(s: SchoolSchedule, from: string, to: string): SchoolSchedule {
  if (from === to) return s;
  return {
    ...s,
    bells: s.bells.map((b) => (b.id === from ? { ...b, id: to } : b)),
    calendar: { ...s.calendar, specialDays: s.calendar.specialDays.map((d) => (d.bell === from ? { ...d, bell: to } : d)) },
  };
}

export function removeBell(s: SchoolSchedule, id: string): SchoolSchedule {
  return {
    ...s,
    bells: s.bells.filter((b) => b.id !== id),
    calendar: { ...s.calendar, specialDays: s.calendar.specialDays.map((d) => (d.bell === id ? { ...d, bell: undefined } : d)) },
  };
}

/** a copy of `from` (or an empty bell) with a fresh id, appended */
export function addBell(s: SchoolSchedule, from?: Bell): SchoolSchedule {
  const id = uniqueId(from ? `${from.id}-copy` : 'bell', s.bells.map((b) => b.id));
  const bell: Bell = from ? { id, name: `${from.name} (copy)`, days: structuredClone(from.days) } : { id, name: 'New bell', days: { '*': [] } };
  return { ...s, bells: [...s.bells, bell] };
}

export function makeRegular(s: SchoolSchedule, id: string): SchoolSchedule {
  const b = s.bells.find((x) => x.id === id);
  return b ? { ...s, bells: [b, ...s.bells.filter((x) => x !== b)] } : s;
}

export function updateBell(s: SchoolSchedule, id: string, patch: Partial<Bell>): SchoolSchedule {
  return mapBells(s, (b) => (b.id === id ? { ...b, ...patch } : b));
}

/** set (or with `undefined`, remove) the slots a bell has for a cycle day key */
export function setBellDay(s: SchoolSchedule, bellId: string, key: string, slots: BellSlot[] | undefined): SchoolSchedule {
  return mapBells(s, (b) => {
    if (b.id !== bellId) return b;
    const days = { ...b.days };
    if (slots) days[key] = slots;
    else delete days[key];
    return { ...b, days };
  });
}

/** a new slot after the last one: 5 minutes later, as long as the previous one */
export function nextSlot(slots: BellSlot[], periods: { id: string }[]): BellSlot {
  const timed = slots.filter((x) => isClockTime(x.start) && isClockTime(x.end));
  const last = timed.reduce<BellSlot | undefined>((a, x) => (!a || x.end > a.end ? x : a), undefined);
  const used = new Set(slots.map((x) => x.period));
  const period = periods.find((p) => !used.has(p.id))?.id ?? periods[0]?.id ?? '1';
  if (!last) return { period, start: '08:00', end: '08:45' };
  const len = Math.max(5, toMinutes(last.end) - toMinutes(last.start));
  const start = Math.min(toMinutes(last.end) + 5, 23 * 60);
  return { period, start: fromMinutes(start), end: fromMinutes(Math.min(start + len, 23 * 60 + 59)) };
}

// ------------------------------------------------------------------------------------- saving

const byDate = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** trims names, drops empty optional fields and sorts the calendar before saving */
export function prepareForSave(s: SchoolSchedule): SchoolSchedule {
  const cal = s.calendar;
  return {
    ...s,
    periods: s.periods.map((p) => ({ ...p, name: p.name.trim() })),
    cycle: { ...s.cycle, days: s.cycle.days.map((d) => ({ ...d, name: d.name.trim() })) },
    bells: s.bells.map((b) => ({
      ...b,
      name: b.name.trim(),
      days: Object.fromEntries(Object.entries(b.days).map(([k, v]) => [k, v.map((x) => ({ ...x, label: x.label?.trim() || undefined, kind: x.kind || undefined }))])),
    })),
    calendar: {
      ...cal,
      noSchool: cal.noSchool.map((d) => ({ ...d, name: d.name.trim(), end: d.end && d.end !== d.date ? d.end : undefined })).sort(byDate),
      specialDays: cal.specialDays
        .map((d) => ({ ...d, name: d.name?.trim() || undefined, bell: d.bell || undefined, cycleDay: d.cycleDay || undefined, advance: d.advance === false ? false : undefined }))
        .sort(byDate),
    },
  };
}
