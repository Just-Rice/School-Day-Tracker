import { describe, expect, it } from 'vitest';
import type { SchoolSchedule } from '../../types';
import { validateSchedule } from '../../lib/schedule';
import {
  addBell,
  addCycleDay,
  addPeriod,
  makeRegular,
  moveItem,
  nextSlot,
  periodUsage,
  prepareForSave,
  removeBell,
  removeCycleDay,
  removePeriod,
  renameBell,
  renameCycleDay,
  renamePeriod,
  setBellDay,
  toWeekdayCycle,
  uniqueId,
} from './editorOps';

function sched(): SchoolSchedule {
  return {
    schoolId: 'hsn',
    schoolYear: '2026-2027',
    cycle: {
      mode: 'rotation',
      days: [
        { id: 'A', name: 'A Day' },
        { id: 'B', name: 'B Day' },
      ],
    },
    periods: [
      { id: '1', name: 'Period 1' },
      { id: '2', name: 'Period 2' },
      { id: 'L', name: 'Lunch', kind: 'lunch' },
    ],
    bells: [
      {
        id: 'regular',
        name: 'Regular',
        days: {
          A: [
            { period: '1', start: '08:00', end: '08:50' },
            { period: 'L', start: '09:00', end: '09:30' },
          ],
          B: [{ period: '2', start: '08:00', end: '08:50' }],
        },
      },
      { id: 'early', name: 'Early', days: { '*': [{ period: '1', start: '08:00', end: '08:30' }] } },
    ],
    calendar: {
      firstDay: '2026-09-08',
      lastDay: '2027-06-18',
      anchor: { date: '2026-09-08', cycleDay: 'A' },
      noSchool: [],
      specialDays: [{ date: '2026-10-21', bell: 'early', cycleDay: 'B', name: 'Early' }],
    },
  };
}

describe('editorOps', () => {
  it('makes unique ids', () => {
    expect(uniqueId('early', ['regular'])).toBe('early');
    expect(uniqueId('early', ['early', 'early-2'])).toBe('early-3');
    expect(uniqueId(' ', [])).toBe('new');
  });

  it('renames a period everywhere and leaves the original untouched', () => {
    const s = sched();
    const r = renamePeriod(s, '1', 'P1');
    expect(r.periods[0].id).toBe('P1');
    expect(r.bells[0].days.A[0].period).toBe('P1');
    expect(r.bells[1].days['*'][0].period).toBe('P1');
    expect(s.bells[0].days.A[0].period).toBe('1');
    expect(validateSchedule(r)).toEqual([]);
  });

  it('removes a period and its slots', () => {
    const s = sched();
    expect(periodUsage(s, '1')).toBe(2);
    const r = removePeriod(s, '1');
    expect(r.periods.map((p) => p.id)).toEqual(['2', 'L']);
    expect(periodUsage(r, '1')).toBe(0);
    expect(r.bells[0].days.A).toHaveLength(1);
  });

  it('adds numbered periods', () => {
    expect(addPeriod(sched()).periods.at(-1)).toEqual({ id: '3', name: 'Period 3' });
  });

  it('renames a cycle day in bells, special days and the anchor', () => {
    const r = renameCycleDay(sched(), 'B', 'Bee');
    expect(r.cycle.days[1].id).toBe('Bee');
    expect(Object.keys(r.bells[0].days)).toEqual(['A', 'Bee']);
    expect(r.calendar.specialDays[0].cycleDay).toBe('Bee');
    expect(renameCycleDay(sched(), 'A', 'X').calendar.anchor?.cycleDay).toBe('X');
    expect(validateSchedule(r)).toEqual([]);
  });

  it('removes a cycle day and its references', () => {
    const r = removeCycleDay(sched(), 'A');
    expect(r.cycle.days.map((d) => d.id)).toEqual(['B']);
    expect(Object.keys(r.bells[0].days)).toEqual(['B']);
    expect(r.calendar.anchor).toBeUndefined();
    const r2 = removeCycleDay(sched(), 'B');
    expect(r2.calendar.specialDays[0].cycleDay).toBeUndefined();
  });

  it('adds cycle days and reorders lists', () => {
    expect(addCycleDay(sched()).cycle.days.at(-1)).toEqual({ id: '3', name: 'Day 3' });
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });

  it('switches to weekday mode keeping usable times', () => {
    const r = toWeekdayCycle(sched());
    expect(r.cycle.mode).toBe('weekday');
    expect(r.cycle.days.map((d) => d.id)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(Object.keys(r.bells[0].days)).toEqual(['*']);
    expect(r.bells[0].days['*'][0].period).toBe('1');
    expect(r.bells[1].days['*']).toHaveLength(1);
    expect(r.calendar.anchor).toBeUndefined();
    expect(r.calendar.specialDays[0].cycleDay).toBeUndefined();
    expect(validateSchedule(r)).toEqual([]);
  });

  it('renames and removes bells, clearing special-day references', () => {
    const r = renameBell(sched(), 'early', 'half');
    expect(r.bells[1].id).toBe('half');
    expect(r.calendar.specialDays[0].bell).toBe('half');
    const d = removeBell(sched(), 'early');
    expect(d.bells).toHaveLength(1);
    expect(d.calendar.specialDays[0].bell).toBeUndefined();
  });

  it('copies bells deeply and makes one regular', () => {
    const s = sched();
    const r = addBell(s, s.bells[0]);
    expect(r.bells[2]).toMatchObject({ id: 'regular-copy', name: 'Regular (copy)' });
    r.bells[2].days.A[0].start = '07:00';
    expect(s.bells[0].days.A[0].start).toBe('08:00');
    expect(addBell(s).bells[2]).toEqual({ id: 'bell', name: 'New bell', days: { '*': [] } });
    expect(makeRegular(s, 'early').bells.map((b) => b.id)).toEqual(['early', 'regular']);
  });

  it('sets and removes the slots of a cycle day', () => {
    const s = sched();
    const r = setBellDay(s, 'early', 'A', []);
    expect(r.bells[1].days.A).toEqual([]);
    expect(setBellDay(r, 'early', 'A', undefined).bells[1].days).toEqual({ '*': s.bells[1].days['*'] });
  });

  it('suggests the next slot', () => {
    const s = sched();
    expect(nextSlot(s.bells[0].days.A, s.periods)).toEqual({ period: '2', start: '09:35', end: '10:05' });
    expect(nextSlot([], s.periods)).toEqual({ period: '1', start: '08:00', end: '08:45' });
  });

  it('cleans up before saving', () => {
    const s = sched();
    s.periods[0].name = ' Period 1 ';
    s.bells[0].days.A[0].label = '  ';
    s.calendar.noSchool = [
      { date: '2026-11-02', end: '2026-11-02', name: 'B ' },
      { date: '2026-10-12', end: '', name: 'A' },
    ];
    s.calendar.specialDays = [{ date: '2026-10-21', bell: '', cycleDay: '', name: ' ', advance: true }];
    const r = prepareForSave(s);
    expect(r.periods[0].name).toBe('Period 1');
    expect(r.bells[0].days.A[0].label).toBeUndefined();
    expect(r.calendar.noSchool).toEqual([
      { date: '2026-10-12', end: undefined, name: 'A' },
      { date: '2026-11-02', end: undefined, name: 'B' },
    ]);
    expect(r.calendar.specialDays).toEqual([{ date: '2026-10-21', bell: undefined, cycleDay: undefined, name: undefined, advance: undefined }]);
  });
});
