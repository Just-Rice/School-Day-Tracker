import { describe, expect, it } from 'vitest';
import type { ClassInfo, DayInfo, DayOverride, ISODate, SchoolSchedule } from '../types';
import { addDays } from './dates';
import {
  classesOnDay,
  cleanOverride,
  currentAndNext,
  describeOverride,
  formatTimeRange,
  isClockTime,
  isISODate,
  joinDayNames,
  meetingTimes,
  nextSchoolDay,
  normalizeSchedule,
  resolveDay,
  rotationRows,
  slotKind,
  slotName,
  slotProgress,
  summarizeMeetingTimes,
  upcomingCalendar,
  validateSchedule,
} from './schedule';

// 2026-09-08 is a Tuesday.
function rotation(): SchoolSchedule {
  return {
    schoolId: 'hsn',
    schoolYear: '2026-2027',
    cycle: {
      mode: 'rotation',
      days: [
        { id: 'D1', name: 'Day 1' },
        { id: 'D2', name: 'Day 2' },
        { id: 'D3', name: 'Day 3' },
        { id: 'D4', name: 'Day 4' },
      ],
    },
    periods: [
      { id: '1', name: 'Period 1' },
      { id: '2', name: 'Period 2' },
      { id: '3', name: 'Period 3' },
      { id: 'L', name: 'Lunch', kind: 'lunch' },
    ],
    bells: [
      {
        id: 'regular',
        name: 'Regular day',
        days: {
          D1: [
            { period: '3', start: '10:25', end: '11:15' },
            { period: '1', start: '08:00', end: '08:50' },
            { period: 'L', start: '09:50', end: '10:20' },
            { period: '2', start: '08:55', end: '09:45' },
          ],
          D2: [
            { period: '2', start: '08:00', end: '08:50' },
            { period: '3', start: '08:55', end: '09:45' },
            { period: 'L', label: 'Lunch B', start: '09:50', end: '10:20' },
          ],
          '*': [
            { period: '1', start: '08:00', end: '08:50' },
            { period: '2', start: '08:55', end: '09:45' },
            { period: '3', start: '09:50', end: '10:40' },
          ],
        },
      },
      {
        id: 'early',
        name: 'Early dismissal',
        days: {
          '*': [
            { period: '1', start: '08:00', end: '08:30' },
            { period: '2', start: '08:35', end: '09:05' },
            { period: '3', start: '09:10', end: '09:40' },
          ],
        },
      },
    ],
    calendar: {
      firstDay: '2026-09-08',
      lastDay: '2027-06-18',
      noSchool: [
        { date: '2026-09-21', name: 'Yom Kippur' },
        { date: '2026-11-25', end: '2026-11-27', name: 'Thanksgiving break' },
        { date: '2026-12-24', end: '2027-01-01', name: 'Winter break' },
      ],
      specialDays: [],
    },
    source: { urls: [], verified: true },
  };
}

function weekdaySchedule(): SchoolSchedule {
  return {
    schoolId: 'other',
    schoolYear: '2026-2027',
    cycle: {
      mode: 'weekday',
      days: [
        { id: 'mon', name: 'Monday' },
        { id: 'tue', name: 'Tuesday' },
        { id: 'wed', name: 'Wednesday' },
        { id: 'thu', name: 'Thursday' },
        { id: 'fri', name: 'Friday' },
      ],
    },
    periods: [
      { id: '1', name: 'Period 1' },
      { id: '2', name: 'Period 2' },
    ],
    bells: [
      {
        id: 'regular',
        name: 'Regular day',
        days: {
          wed: [{ period: '1', start: '09:00', end: '09:40' }],
          '*': [
            { period: '1', start: '08:00', end: '08:50' },
            { period: '2', start: '08:55', end: '09:45' },
          ],
        },
      },
    ],
    calendar: { firstDay: '2026-09-01', lastDay: '2027-06-18', noSchool: [], specialDays: [] },
  };
}

/** cycle day ids of the next `count` school days starting at `from` */
function cycleRun(s: SchoolSchedule, from: ISODate, count: number, overrides?: Record<ISODate, DayOverride>): string[] {
  const out: string[] = [];
  for (let d = from; out.length < count; d = addDays(d, 1)) {
    const day = resolveDay(s, d, overrides);
    if (day.isSchoolDay) out.push(day.cycleDay?.id ?? '?');
  }
  return out;
}

function cls(p: Partial<ClassInfo> & { id: string; periods: string[] }): ClassInfo {
  return {
    name: p.id,
    teacher: { name: 'T' },
    room: { label: '100' },
    term: 'full',
    color: '#123456',
    links: [],
    customFields: [],
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

describe('isISODate / isClockTime', () => {
  it('accepts only real dates and 24-hour times', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-2-3')).toBe(false);
    expect(isISODate(undefined)).toBe(false);
    expect(isClockTime('08:05')).toBe(true);
    expect(isClockTime('23:59')).toBe(true);
    expect(isClockTime('24:00')).toBe(false);
    expect(isClockTime('8:05')).toBe(false);
  });
});

describe('normalizeSchedule', () => {
  it('returns complete schedules untouched', () => {
    const s = rotation();
    expect(normalizeSchedule(s)).toBe(s);
  });

  it('fills in missing parts so nothing crashes', () => {
    const partial = { schoolId: 'hsn', schoolYear: '2026-2027', bells: [{ id: 'r', days: { '*': [{ period: '1', start: '08:00', end: '08:50' }], A: null } }], calendar: { firstDay: '2026-09-08', lastDay: '2027-06-18' } } as unknown as SchoolSchedule;
    const n = normalizeSchedule(partial);
    expect(n.cycle).toEqual({ mode: 'rotation', days: [] });
    expect(n.periods).toEqual([]);
    expect(n.bells[0]).toMatchObject({ id: 'r', name: 'r' });
    expect(Object.keys(n.bells[0].days)).toEqual(['*']);
    expect(n.calendar).toMatchObject({ noSchool: [], specialDays: [] });
    expect(resolveDay(n, '2026-09-08').slots).toHaveLength(1);
    expect(validateSchedule(n)).toContain('Add at least one cycle day.');
  });
});

describe('resolveDay: school or not', () => {
  const s = rotation();

  it('has no school on weekends', () => {
    const d = resolveDay(s, '2026-09-12');
    expect(d).toMatchObject({ isSchoolDay: false, reason: 'Weekend', slots: [] });
    expect(d.cycleDay).toBeUndefined();
  });

  it('is summer break outside the school year', () => {
    expect(resolveDay(s, '2026-09-07').reason).toBe('Summer break');
    expect(resolveDay(s, '2027-06-21').reason).toBe('Summer break');
    expect(resolveDay(s, '2026-07-04').isSchoolDay).toBe(false);
    expect(resolveDay(s, '2027-06-18').isSchoolDay).toBe(true);
  });

  it('uses the names of no-school days and ranges, including weekends inside a range', () => {
    expect(resolveDay(s, '2026-09-21')).toMatchObject({ isSchoolDay: false, reason: 'Yom Kippur' });
    expect(resolveDay(s, '2026-11-25').reason).toBe('Thanksgiving break');
    expect(resolveDay(s, '2026-11-27').reason).toBe('Thanksgiving break');
    expect(resolveDay(s, '2026-11-24').isSchoolDay).toBe(true);
    expect(resolveDay(s, '2026-12-26').reason).toBe('Winter break');
    expect(resolveDay(s, '2027-01-04').isSchoolDay).toBe(true);
  });

  it('honors user no-school overrides', () => {
    expect(resolveDay(s, '2026-10-08', { '2026-10-08': { noSchool: true, name: 'Snow day' } })).toMatchObject({ isSchoolDay: false, reason: 'Snow day' });
    expect(resolveDay(s, '2026-10-08', { '2026-10-08': { noSchool: true } }).reason).toBe('No school');
  });

  it('treats noSchool: false as a make-up school day, even on a weekend', () => {
    const d = resolveDay(s, '2026-09-12', { '2026-09-12': { noSchool: false, name: 'Make-up day' } });
    expect(d.isSchoolDay).toBe(true);
    expect(d.notes).toEqual(['Make-up day']);
    expect(d.cycleDay?.id).toBe('D1'); // Fri 9/11 was D4
    expect(resolveDay(s, '2026-09-14', { '2026-09-12': { noSchool: false } }).cycleDay?.id).toBe('D2');
  });

  it('reports an invalid date or a missing calendar instead of throwing', () => {
    expect(resolveDay(s, 'nope').reason).toBe('Invalid date');
    const broken = { ...rotation(), calendar: { ...rotation().calendar, firstDay: '' } };
    expect(resolveDay(broken, '2026-10-08')).toMatchObject({ isSchoolDay: false, reason: 'No school calendar' });
  });
});

describe('resolveDay: rotation', () => {
  it('starts on the first cycle day on the first day and skips weekends and days off', () => {
    const s = rotation();
    expect(cycleRun(s, '2026-09-08', 10)).toEqual(['D1', 'D2', 'D3', 'D4', 'D1', 'D2', 'D3', 'D4', 'D1', 'D2']);
    // 9/18 is the 9th school day (D1), 9/21 is off, 9/22 continues with D2
    expect(resolveDay(s, '2026-09-18').cycleDay?.id).toBe('D1');
    expect(resolveDay(s, '2026-09-22').cycleDay?.id).toBe('D2');
  });

  it('starts on the next school day when the first day is a weekend', () => {
    const s = rotation();
    s.calendar.firstDay = '2026-09-05'; // a Saturday
    expect(resolveDay(s, '2026-09-05').reason).toBe('Weekend');
    expect(resolveDay(s, '2026-09-07').cycleDay?.id).toBe('D1');
    expect(resolveDay(s, '2026-09-08').cycleDay?.id).toBe('D2');
  });

  it('counts forwards and backwards from an anchor', () => {
    const s = rotation();
    s.calendar.anchor = { date: '2026-09-15', cycleDay: 'D4' };
    expect(cycleRun(s, '2026-09-08', 8)).toEqual(['D3', 'D4', 'D1', 'D2', 'D3', 'D4', 'D1', 'D2']);
  });

  it('moves an anchor that falls on a day off to the next school day', () => {
    const s = rotation();
    s.calendar.anchor = { date: '2026-09-21', cycleDay: 'D3' };
    expect(resolveDay(s, '2026-09-22').cycleDay?.id).toBe('D3');
    expect(resolveDay(s, '2026-09-18').cycleDay?.id).toBe('D2');
  });

  it('ignores an anchor outside the year or with an unknown cycle day', () => {
    const s = rotation();
    s.calendar.anchor = { date: '2026-08-01', cycleDay: 'D3' };
    expect(resolveDay(s, '2026-09-08').cycleDay?.id).toBe('D1');
    const t = rotation();
    t.calendar.anchor = { date: '2026-09-10', cycleDay: 'X' };
    expect(resolveDay(t, '2026-09-08').cycleDay?.id).toBe('D1');
  });

  it('shifts the rotation when the user marks a snow day', () => {
    const s = rotation();
    const ov = { '2026-09-10': { noSchool: true, name: 'Snow day' } };
    expect(cycleRun(s, '2026-09-08', 4, ov)).toEqual(['D1', 'D2', 'D3', 'D4']);
    expect(resolveDay(s, '2026-09-11', ov).cycleDay?.id).toBe('D3');
  });

  it('continues the rotation from a forced special day', () => {
    const s = rotation();
    s.calendar.specialDays = [{ date: '2026-09-10', cycleDay: 'D1', name: 'Rotation reset' }];
    expect(cycleRun(s, '2026-09-08', 5)).toEqual(['D1', 'D2', 'D1', 'D2', 'D3']);
    expect(resolveDay(s, '2026-09-10').notes).toEqual(['Rotation reset']);
  });

  it('continues the rotation from a user cycle-day override ("today is Day 3")', () => {
    const s = rotation();
    const ov = { '2026-09-14': { cycleDay: 'D3' } };
    expect(cycleRun(s, '2026-09-08', 7, ov)).toEqual(['D1', 'D2', 'D3', 'D4', 'D3', 'D4', 'D1']);
  });

  it('counts backwards from a special day that comes before the anchor', () => {
    const s = rotation();
    s.calendar.anchor = { date: '2026-09-17', cycleDay: 'D1' };
    s.calendar.specialDays = [{ date: '2026-09-10', cycleDay: 'D4' }];
    // 9/8, 9/9 count back from 9/10 (D4); 9/11..9/16 count on from it; 9/17 is the anchor
    expect(cycleRun(s, '2026-09-08', 9)).toEqual(['D2', 'D3', 'D4', 'D1', 'D2', 'D3', 'D4', 'D1', 'D2']);
  });

  it('keeps the previous cycle day on advance: false days', () => {
    const s = rotation();
    s.calendar.specialDays = [{ date: '2026-09-10', advance: false, name: 'Assembly' }];
    expect(cycleRun(s, '2026-09-08', 5)).toEqual(['D1', 'D2', 'D2', 'D3', 'D4']);
  });

  it('handles advance: false days before the anchor', () => {
    const s = rotation();
    s.calendar.anchor = { date: '2026-09-11', cycleDay: 'D1' };
    s.calendar.specialDays = [{ date: '2026-09-09', advance: false }];
    expect(cycleRun(s, '2026-09-08', 4)).toEqual(['D3', 'D3', 'D4', 'D1']);
  });

  it('has no cycle day when the schedule defines none', () => {
    const s = rotation();
    s.cycle.days = [];
    const d = resolveDay(s, '2026-09-08');
    expect(d.isSchoolDay).toBe(true);
    expect(d.cycleDay).toBeUndefined();
    expect(d.slots.map((x) => x.period)).toEqual(['1', '2', '3']);
  });
});

describe('resolveDay: weekday mode', () => {
  it('uses the weekday as the cycle day', () => {
    const s = weekdaySchedule();
    expect(resolveDay(s, '2026-10-08').cycleDay).toEqual({ id: 'thu', name: 'Thursday' });
    expect(resolveDay(s, '2026-10-12').cycleDay?.id).toBe('mon');
  });

  it('lets overrides and special days force a different weekday', () => {
    const s = weekdaySchedule();
    s.calendar.specialDays = [{ date: '2026-10-13', cycleDay: 'wed', name: 'Wednesday schedule' }];
    expect(resolveDay(s, '2026-10-13').slots).toEqual([{ period: '1', start: '09:00', end: '09:40' }]);
    expect(resolveDay(s, '2026-10-08', { '2026-10-08': { cycleDay: 'fri' } }).cycleDay?.id).toBe('fri');
    // doesn't shift other days
    expect(resolveDay(s, '2026-10-09', { '2026-10-08': { cycleDay: 'fri' } }).cycleDay?.id).toBe('fri');
    expect(resolveDay(s, '2026-10-12', { '2026-10-08': { cycleDay: 'fri' } }).cycleDay?.id).toBe('mon');
  });
});

describe('resolveDay: bells, slots and notes', () => {
  it('uses the regular bell and the cycle day slots, sorted by start', () => {
    const d = resolveDay(rotation(), '2026-09-08');
    expect(d.bell?.id).toBe('regular');
    expect(d.slots.map((x) => x.period)).toEqual(['1', '2', 'L', '3']);
    expect(d.notes).toEqual([]);
  });

  it("falls back to the bell's '*' slots", () => {
    expect(resolveDay(rotation(), '2026-09-10').slots.map((x) => x.start)).toEqual(['08:00', '08:55', '09:50']);
  });

  it('prefers override bell over special-day bell over the regular bell, ignoring unknown ids', () => {
    const s = rotation();
    s.calendar.specialDays = [{ date: '2026-09-09', bell: 'early', name: 'Early dismissal' }];
    expect(resolveDay(s, '2026-09-09').bell?.id).toBe('early');
    expect(resolveDay(s, '2026-09-09').slots[0]).toEqual({ period: '1', start: '08:00', end: '08:30' });
    expect(resolveDay(s, '2026-09-09').notes).toEqual(['Early dismissal']);
    expect(resolveDay(s, '2026-09-09', { '2026-09-09': { bell: 'regular', name: 'Back to normal' } }).bell?.id).toBe('regular');
    expect(resolveDay(s, '2026-09-09', { '2026-09-09': { bell: 'nope' } }).bell?.id).toBe('early');
    expect(resolveDay(s, '2026-09-10', { '2026-09-10': { bell: 'nope' } }).bell?.id).toBe('regular');
    expect(resolveDay(s, '2026-09-09', { '2026-09-09': { name: 'Pep rally' } }).notes).toEqual(['Early dismissal', 'Pep rally']);
  });

  it('has no slots when there are no bells', () => {
    const s = rotation();
    s.bells = [];
    expect(resolveDay(s, '2026-09-08')).toMatchObject({ isSchoolDay: true, slots: [] });
  });

  it('memoizes per schedule and overrides', () => {
    const s = rotation();
    const ov = { '2026-09-09': { noSchool: true } };
    expect(resolveDay(s, '2026-09-08')).toBe(resolveDay(s, '2026-09-08'));
    expect(resolveDay(s, '2026-09-10', ov)).toBe(resolveDay(s, '2026-09-10', { '2026-09-09': { noSchool: true } }));
    expect(resolveDay(s, '2026-09-10', ov).cycleDay?.id).toBe('D2');
    expect(resolveDay(s, '2026-09-10').cycleDay?.id).toBe('D3');
  });

  it('is fast for a whole year of dates', () => {
    const s = rotation();
    const t = performance.now();
    for (let i = 0; i < 365; i++) resolveDay(s, addDays('2026-09-01', i), { '2027-03-01': { noSchool: true } });
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe('nextSchoolDay', () => {
  it('finds the next school day after a date', () => {
    const s = rotation();
    const get = (d: ISODate) => resolveDay(s, d);
    expect(nextSchoolDay(get, '2026-09-11')?.date).toBe('2026-09-14');
    expect(nextSchoolDay(get, '2026-09-18')?.date).toBe('2026-09-22');
    expect(nextSchoolDay(get, '2027-06-18')).toBeUndefined();
  });
});

describe('currentAndNext', () => {
  const day = resolveDay(rotation(), '2026-09-08'); // 8:00-8:50, 8:55-9:45, L 9:50-10:20, 10:25-11:15
  const at = (h: number, m: number) => currentAndNext(day, h * 60 + m);

  it('is before school before the first slot', () => {
    expect(at(7, 30)).toMatchObject({ state: 'before', next: { period: '1' }, minutesUntilNext: 30 });
    expect(at(7, 30).current).toBeUndefined();
  });

  it('is during a slot, with minutes left and the next slot', () => {
    expect(at(8, 0)).toMatchObject({ state: 'during', current: { period: '1' }, next: { period: '2' }, minutesLeft: 50, minutesUntilNext: 55 });
    expect(at(10, 0)).toMatchObject({ state: 'during', current: { period: 'L' }, minutesLeft: 20 });
    expect(at(11, 0)).toMatchObject({ state: 'during', current: { period: '3' } });
    expect(at(11, 0).next).toBeUndefined();
  });

  it('is passing time between slots', () => {
    expect(at(8, 52)).toMatchObject({ state: 'passing', next: { period: '2' }, minutesUntilNext: 3 });
    expect(at(8, 50).state).toBe('passing');
  });

  it('is after school after the last slot', () => {
    expect(at(11, 15)).toEqual({ state: 'after', current: undefined, next: undefined });
    expect(at(15, 0).state).toBe('after');
  });

  it('is no-school on days off', () => {
    expect(currentAndNext(resolveDay(rotation(), '2026-09-12'), 600)).toEqual({ state: 'no-school' });
  });

  it('picks the slot that started last when slots overlap', () => {
    const d: DayInfo = {
      date: '2026-09-08',
      isSchoolDay: true,
      notes: [],
      slots: [
        { period: '5', start: '11:00', end: '12:00' },
        { period: 'L', start: '11:30', end: '12:00', kind: 'lunch' },
        { period: '6', start: '12:05', end: '13:00' },
      ],
    };
    expect(currentAndNext(d, 11 * 60 + 40)).toMatchObject({ state: 'during', current: { period: 'L' }, next: { period: '6' } });
    expect(currentAndNext(d, 11 * 60 + 10)).toMatchObject({ current: { period: '5' }, next: { period: 'L' } });
  });

  it('works with fractional minutes', () => {
    expect(at(8, 49.5).minutesLeft).toBeCloseTo(0.5);
  });
});

describe('slotProgress', () => {
  it('is the fraction through a slot, clamped', () => {
    const slot = { period: '1', start: '08:00', end: '08:50' };
    expect(slotProgress(slot, 8 * 60 + 25)).toBeCloseTo(0.5);
    expect(slotProgress(slot, 7 * 60)).toBe(0);
    expect(slotProgress(slot, 9 * 60)).toBe(1);
  });
});

describe('names and formatting', () => {
  const s = rotation();
  it('names slots by label, then period name', () => {
    expect(slotName(s, { period: 'L', label: 'Lunch B', start: '09:50', end: '10:20' })).toBe('Lunch B');
    expect(slotName(s, { period: '2', start: '08:00', end: '08:50' })).toBe('Period 2');
    expect(slotName(s, { period: '9', start: '08:00', end: '08:50' })).toBe('Period 9');
    expect(slotName(null, { period: 'HR', start: '08:00', end: '08:50' })).toBe('HR');
  });

  it('gets the slot kind from the slot, then the period', () => {
    expect(slotKind(s, { period: 'L', start: '09:50', end: '10:20' })).toBe('lunch');
    expect(slotKind(s, { period: '1', start: '09:50', end: '10:20' })).toBe('class');
    expect(slotKind(s, { period: '1', start: '09:50', end: '10:20', kind: 'homeroom' })).toBe('homeroom');
  });

  it('formats time ranges compactly', () => {
    expect(formatTimeRange('08:00', '08:52')).toBe('8:00–8:52 AM');
    expect(formatTimeRange('11:30', '12:20')).toBe('11:30 AM–12:20 PM');
    expect(formatTimeRange('13:00', '13:45', '12h')).toBe('1:00–1:45 PM');
    expect(formatTimeRange('08:00', '08:52', '24h')).toBe('08:00–08:52');
  });

  it('joins day names', () => {
    expect(joinDayNames(['Day 1'])).toBe('Day 1');
    expect(joinDayNames(['Day 1', 'Day 3'])).toBe('Days 1, 3');
    expect(joinDayNames(['Mon', 'Wed'])).toBe('Mon, Wed');
    expect(joinDayNames(['A Day', 'Day 2'])).toBe('A Day, Day 2');
  });
});

describe('classesOnDay', () => {
  const s = rotation();
  const d1 = resolveDay(s, '2026-09-08');
  const d2 = resolveDay(s, '2026-09-09');

  it('puts each class in its periods, with free slots left empty', () => {
    const m = classesOnDay(d1, [cls({ id: 'math', periods: ['1'] }), cls({ id: 'eng', periods: ['3'] })]);
    expect(m.map((x) => [x.slot.period, x.cls?.id])).toEqual([
      ['1', 'math'],
      ['2', undefined],
      ['L', undefined],
      ['3', 'eng'],
    ]);
    expect(m[0].room).toEqual({ label: '100' });
    expect(m[1].room).toBeUndefined();
  });

  it('honors cycle days and archived classes', () => {
    const classes = [cls({ id: 'art', periods: ['2'], days: ['D2'] }), cls({ id: 'old', periods: ['1'], archived: true })];
    expect(classesOnDay(d1, classes).every((x) => !x.cls)).toBe(true);
    expect(classesOnDay(d2, classes).find((x) => x.slot.period === '2')?.cls?.id).toBe('art');
  });

  it('prefers a class limited to cycle days over an every-day class in the same period', () => {
    const classes = [cls({ id: 'chem', periods: ['2'] }), cls({ id: 'lab', periods: ['2'], days: ['D2'] })];
    expect(classesOnDay(d1, classes).find((x) => x.slot.period === '2')?.cls?.id).toBe('chem');
    expect(classesOnDay(d2, classes).find((x) => x.slot.period === '2')?.cls?.id).toBe('lab');
  });

  it('uses alternate rooms on their cycle days', () => {
    const c = cls({ id: 'bio', periods: ['2'], altRooms: [{ days: ['D2'], room: { label: 'Lab 3', mapKey: 'L3' } }] });
    expect(classesOnDay(d1, [c]).find((x) => x.cls)?.room).toEqual({ label: '100' });
    expect(classesOnDay(d2, [c]).find((x) => x.cls)?.room).toEqual({ label: 'Lab 3', mapKey: 'L3' });
  });

  it('is empty on days off', () => {
    expect(classesOnDay(resolveDay(s, '2026-09-12'), [cls({ id: 'm', periods: ['1'] })])).toEqual([]);
  });
});

describe('meetingTimes / summarizeMeetingTimes', () => {
  it('lists the slots per cycle day of the regular bell', () => {
    const t = meetingTimes(rotation(), { periods: ['3'] });
    expect(t.map((x) => [x.cycleDay.id, x.slots.map((s) => s.start)])).toEqual([
      ['D1', ['10:25']],
      ['D2', ['08:55']],
      ['D3', ['09:50']],
      ['D4', ['09:50']],
    ]);
  });

  it('honors the class cycle days', () => {
    expect(meetingTimes(rotation(), { periods: ['1'], days: ['D1', 'D4'] }).map((x) => x.cycleDay.id)).toEqual(['D1', 'D4']);
    // period 1 doesn't meet on D2
    expect(meetingTimes(rotation(), { periods: ['1'] }).map((x) => x.cycleDay.id)).toEqual(['D1', 'D3', 'D4']);
  });

  it('summarizes, grouping days with the same times', () => {
    expect(summarizeMeetingTimes(rotation(), { periods: ['3'] })).toBe('Day 1 · 10:25–11:15 AM; Day 2 · 8:55–9:45 AM; Days 3, 4 · 9:50–10:40 AM');
    expect(summarizeMeetingTimes(rotation(), { periods: ['1'] }, '24h')).toBe('Days 1, 3, 4 · 08:00–08:50');
    expect(summarizeMeetingTimes(rotation(), { periods: ['1', '2'], days: ['D3'] })).toBe('Day 3 · 8:00–8:50 AM & 8:55–9:45 AM');
    expect(summarizeMeetingTimes(rotation(), { periods: ['9'] })).toBe('');
  });

  it('says every day when all cycle days match', () => {
    expect(summarizeMeetingTimes(weekdaySchedule(), { periods: ['2'] })).toBe('Mon, Tue, Thu, Fri · 8:55–9:45 AM');
    const s = weekdaySchedule();
    delete s.bells[0].days.wed;
    expect(summarizeMeetingTimes(s, { periods: ['2'] })).toBe('Every day · 8:55–9:45 AM');
    s.cycle.days = [];
    expect(summarizeMeetingTimes(s, { periods: ['2'] })).toBe('Every day · 8:55–9:45 AM');
  });
});

describe('rotationRows', () => {
  it('lines up cycle days by slot position, with shared times when they match', () => {
    const rows = rotationRows(rotation());
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ start: '08:00', end: '08:50' });
    expect(rows[0].cells.map((c) => c?.period)).toEqual(['1', '2', '1', '1']);
    expect(rows[2].start).toBeUndefined(); // 9:50-10:20 vs 9:50-10:40
    expect(rows[3].cells.map((c) => c?.period)).toEqual(['3', undefined, undefined, undefined]);
    expect(rows[3]).toMatchObject({ start: '10:25', end: '11:15' });
  });
});

describe('upcomingCalendar', () => {
  it('lists no-school ranges and special days from a date, in order', () => {
    const s = rotation();
    s.calendar.specialDays = [
      { date: '2026-11-24', bell: 'early' },
      { date: '2026-09-09', name: 'Past' },
      { date: '2026-12-01', cycleDay: 'D2' },
    ];
    const ev = upcomingCalendar(s, '2026-11-26');
    expect(ev.map((e) => [e.date, e.name, e.kind])).toEqual([
      ['2026-11-25', 'Thanksgiving break', 'no-school'],
      ['2026-12-01', 'Day 2', 'special'],
      ['2026-12-24', 'Winter break', 'no-school'],
    ]);
    expect(ev[0].end).toBe('2026-11-27');
    expect(upcomingCalendar(s, '2026-11-01')[0]).toMatchObject({ date: '2026-11-24', name: 'Early dismissal' });
  });
});

describe('describeOverride / cleanOverride', () => {
  const s = rotation();
  it('describes day changes', () => {
    expect(describeOverride({ noSchool: true, name: 'Snow day' }, s)).toBe('Snow day · No school');
    expect(describeOverride({ cycleDay: 'D3', bell: 'early' }, s)).toBe('Day 3 · Early dismissal bell');
    expect(describeOverride({ noSchool: false }, s)).toBe('Make-up school day');
    expect(describeOverride({ name: 'Early dismissal', bell: 'early' }, s)).toBe('Early dismissal');
    expect(describeOverride({ bell: 'gone' }, null)).toBe('gone bell');
    expect(describeOverride({}, s)).toBe('No change');
  });

  it('drops empty fields, and cycle/bell on days off', () => {
    expect(cleanOverride({ name: '  ', cycleDay: '', bell: '' })).toBeUndefined();
    expect(cleanOverride({ name: ' Snow day ', noSchool: true, bell: 'early' })).toEqual({ name: 'Snow day', noSchool: true });
    expect(cleanOverride({ cycleDay: 'D2' })).toEqual({ cycleDay: 'D2' });
  });
});

describe('validateSchedule', () => {
  it('accepts a good schedule', () => {
    expect(validateSchedule(rotation())).toEqual([]);
    expect(validateSchedule(weekdaySchedule())).toEqual([]);
  });

  it('finds overlapping and backwards slots and unknown periods', () => {
    const s = rotation();
    s.bells[0].days['*'] = [
      { period: '1', start: '08:00', end: '08:50' },
      { period: '2', start: '08:45', end: '09:30' },
      { period: '3', start: '10:00', end: '09:00' },
      { period: 'X', start: '11:00', end: '11:30' },
      { period: '1', start: '', end: '12:00' },
    ];
    const p = validateSchedule(s);
    expect(p).toContain('Regular day, all days: Period 1 (08:00–08:50) overlaps Period 2 (08:45–09:30).');
    expect(p).toContain('Regular day, all days: Period 3 ends before it starts.');
    expect(p).toContain('Regular day, all days: unknown period "X".');
    expect(p).toContain('Regular day, all days: Period 1 needs a start and end time.');
  });

  it('finds bad dates and references in the calendar', () => {
    const s = rotation();
    s.calendar.lastDay = '2026-06-01';
    s.calendar.noSchool.push({ date: '2026-13-01', name: 'Bad' }, { date: '2026-10-10', end: '2026-10-01', name: 'Backwards' }, { date: '2026-10-02', name: '' });
    s.calendar.specialDays.push({ date: '2026-10-05', bell: 'nope', cycleDay: 'D9', name: 'Odd' });
    s.calendar.anchor = { date: '2026-10-03', cycleDay: 'D7' };
    const p = validateSchedule(s);
    expect(p).toContain('The last day of school is before the first day.');
    expect(p).toContain('Bad: set a valid date.');
    expect(p).toContain('Backwards: ends before it starts.');
    expect(p).toContain('A day off on 2026-10-02 needs a name.');
    expect(p).toContain('Odd: unknown bell schedule "nope".');
    expect(p).toContain('Odd: unknown cycle day "D9".');
    expect(p).toContain('The known cycle day falls on a weekend.');
    expect(p).toContain('The known cycle day "D7" isn\'t one of the cycle days.');
  });

  it('flags dates outside the school year and duplicate special days', () => {
    const s = rotation();
    s.calendar.noSchool.push({ date: '2027-08-01', name: 'Summer thing' });
    s.calendar.specialDays.push({ date: '2026-10-05', name: 'A' }, { date: '2026-10-05', name: 'B' });
    const p = validateSchedule(s);
    expect(p).toContain('Summer thing (2027-08-01) is outside the school year.');
    expect(p).toContain('Two special days on 2026-10-05; only the first is used.');
  });

  it('checks ids, names, cycle days and missing times', () => {
    const s = rotation();
    s.periods.push({ id: '1', name: 'Dup' }, { id: 'Z', name: '' });
    s.cycle.days.push({ id: 'D1', name: 'Again' });
    s.bells.push({ id: 'early', name: '', days: { D9: [] } });
    const p = validateSchedule(s);
    expect(p).toContain('Two periods share the ID "1".');
    expect(p).toContain('Period "Z" needs a name.');
    expect(p).toContain('Two cycle days share the ID "D1".');
    expect(p).toContain('Two bell schedules share the ID "early".');
    expect(p).toContain('Bell schedule "early" needs a name.');
    expect(p).toContain('early: times for unknown cycle day "D9".');
    expect(p.some((x) => x.startsWith('early: no times for Day 1'))).toBe(true);
  });

  it('requires weekday ids in weekday mode', () => {
    const s = rotation();
    s.cycle.mode = 'weekday';
    expect(validateSchedule(s)[0]).toMatch(/weekday mode/);
  });
});
