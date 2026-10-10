import { describe, expect, it } from 'vitest';
import type { Assignment, ClassInfo, DayInfo, DayOverride, ISODate, SchoolSchedule } from '../types';
import { addDays, isWeekend } from './dates';
import { classesOnDay, normalizeSchedule, resolveDay } from './schedule';
import {
  ASSIGNMENT_TYPES,
  PRIORITIES,
  compareAssignments,
  defaultDueDate,
  doneOlderThan,
  dueGroup,
  dueSoonUntil,
  emptyAssignment,
  filterAssignments,
  groupAssignments,
  groupByClass,
  hasActiveFilters,
  isOverdue,
  isPastDue,
  makeLink,
  moveItem,
  nextMeetingDate,
  normalizeAssignment,
  normalizeUrl,
  isSafeUrl,
  rebaseEdits,
  relativeDue,
  setDone,
  shortDate,
  sortAssignments,
  sortDone,
  subtaskProgress,
  typeInfo,
  withCompletion,
} from './homework';

const T0 = new Date(2026, 9, 8, 12).getTime(); // Thu Oct 8 2026, noon
const TODAY = '2026-10-08';

let seq = 0;
function hw(p: Partial<Assignment> = {}): Assignment {
  seq++;
  return emptyAssignment({ id: 'a' + seq, title: 'Task ' + seq, dueDate: TODAY, ...p }, T0);
}

function cls(id: string, p: Partial<ClassInfo> = {}): ClassInfo {
  return {
    id,
    name: id.toUpperCase(),
    teacher: { name: 'T' },
    room: { label: '100' },
    periods: [],
    term: 'full',
    color: '#123456',
    links: [],
    customFields: [],
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

describe('constants', () => {
  it('lists every assignment type once with a label and emoji', () => {
    const ids = ASSIGNMENT_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(8);
    expect(ids).toEqual(['homework', 'test', 'quiz', 'project', 'essay', 'reading', 'lab', 'other']);
    for (const t of ASSIGNMENT_TYPES) {
      expect(t.label).toBeTruthy();
      expect(t.emoji).toBeTruthy();
    }
    expect(typeInfo('lab').label).toBe('Lab');
    expect(typeInfo('nonsense').id).toBe('other');
  });
  it('orders priorities low to high', () => {
    expect(PRIORITIES.map((p) => p.id)).toEqual(['low', 'medium', 'high']);
  });
});

describe('emptyAssignment', () => {
  it('fills in defaults', () => {
    const a = emptyAssignment({}, T0);
    expect(a.id).toMatch(/\w{8,}/);
    expect(a).toMatchObject({ classId: null, title: '', type: 'homework', priority: 'medium', status: 'todo', links: [], subtasks: [], createdAt: T0, updatedAt: T0 });
    expect(a.dueDate).toBe('2026-10-09');
  });
  it('gives each assignment its own id and arrays', () => {
    const a = emptyAssignment();
    const b = emptyAssignment();
    expect(a.id).not.toBe(b.id);
    expect(a.links).not.toBe(b.links);
    expect(a.subtasks).not.toBe(b.subtasks);
  });
  it('lets the caller override anything', () => {
    const a = emptyAssignment({ title: 'Lab report', type: 'lab', classId: 'chem', dueDate: '2026-10-20', priority: 'high' }, T0);
    expect(a).toMatchObject({ title: 'Lab report', type: 'lab', classId: 'chem', dueDate: '2026-10-20', priority: 'high' });
  });
});

describe('normalizeAssignment', () => {
  it('returns complete assignments unchanged', () => {
    const a = hw();
    expect(normalizeAssignment(a)).toBe(a);
  });
  it('repairs missing arrays and bad enums', () => {
    const broken = { id: 'x', dueDate: TODAY, createdAt: 1, updatedAt: 1, type: 'worksheet', priority: 'urgent' } as unknown as Assignment;
    expect(normalizeAssignment(broken)).toMatchObject({ title: '', classId: null, type: 'other', priority: 'medium', status: 'todo', links: [], subtasks: [] });
  });
});

describe('isOverdue / isPastDue', () => {
  it('is overdue after the due date', () => {
    expect(isOverdue(hw({ dueDate: '2026-10-07' }), TODAY)).toBe(true);
    expect(isOverdue(hw({ dueDate: '2025-12-31' }), TODAY)).toBe(true);
  });
  it('is not overdue on or before the due date without a time', () => {
    expect(isOverdue(hw({ dueDate: TODAY }), TODAY, 23 * 60 + 59)).toBe(false);
    expect(isOverdue(hw({ dueDate: '2026-10-09' }), TODAY)).toBe(false);
  });
  it('uses the due time on the due date', () => {
    const a = hw({ dueDate: TODAY, dueTime: '08:30' });
    expect(isOverdue(a, TODAY, 8 * 60 + 29)).toBe(false);
    expect(isOverdue(a, TODAY, 8 * 60 + 30)).toBe(true);
    expect(isOverdue(a, TODAY, 13 * 60)).toBe(true);
    // no clock given: only the date counts
    expect(isOverdue(a, TODAY)).toBe(false);
  });
  it('ignores the due time on other days', () => {
    expect(isOverdue(hw({ dueDate: '2026-10-09', dueTime: '08:00' }), TODAY, 23 * 60)).toBe(false);
  });
  it('is never overdue once done', () => {
    const a = hw({ dueDate: '2026-10-01', status: 'done' });
    expect(isOverdue(a, TODAY)).toBe(false);
    expect(isPastDue(a, TODAY)).toBe(true);
  });
  it('counts in-progress work as overdue', () => {
    expect(isOverdue(hw({ dueDate: '2026-10-01', status: 'in_progress' }), TODAY)).toBe(true);
  });
});

describe('sortAssignments', () => {
  it('sorts by date, then time (untimed last), then priority, then title', () => {
    const list = [
      hw({ id: 'later', dueDate: '2026-10-12', title: 'A' }),
      hw({ id: 'untimed', dueDate: TODAY, title: 'A' }),
      hw({ id: 'noon', dueDate: TODAY, dueTime: '12:00', title: 'A' }),
      hw({ id: 'morning', dueDate: TODAY, dueTime: '07:45', title: 'Z' }),
      hw({ id: 'low', dueDate: '2026-10-09', priority: 'low', title: 'A' }),
      hw({ id: 'high', dueDate: '2026-10-09', priority: 'high', title: 'Z' }),
      hw({ id: 'med-b', dueDate: '2026-10-09', priority: 'medium', title: 'b' }),
      hw({ id: 'med-a', dueDate: '2026-10-09', priority: 'medium', title: 'A' }),
    ];
    expect(sortAssignments(list).map((a) => a.id)).toEqual(['morning', 'noon', 'untimed', 'high', 'med-a', 'med-b', 'low', 'later']);
  });
  it('compares titles naturally and does not mutate the input', () => {
    const list = [hw({ title: 'Problem set 10' }), hw({ title: 'Problem set 9' })];
    const before = [...list];
    expect(sortAssignments(list).map((a) => a.title)).toEqual(['Problem set 9', 'Problem set 10']);
    expect(list).toEqual(before);
    expect(compareAssignments(list[0], list[0])).toBe(0);
  });
});

describe('dueGroup / groupAssignments', () => {
  it('buckets by days from today', () => {
    expect(dueGroup({ dueDate: '2026-10-01' }, TODAY)).toBe('overdue');
    expect(dueGroup({ dueDate: TODAY }, TODAY)).toBe('today');
    expect(dueGroup({ dueDate: TODAY, dueTime: '09:00' }, TODAY, 10 * 60)).toBe('overdue');
    expect(dueGroup({ dueDate: '2026-10-09' }, TODAY)).toBe('tomorrow');
    expect(dueGroup({ dueDate: '2026-10-10' }, TODAY)).toBe('week');
    expect(dueGroup({ dueDate: '2026-10-15' }, TODAY)).toBe('week');
    expect(dueGroup({ dueDate: '2026-10-16' }, TODAY)).toBe('later');
  });

  it('returns non-empty groups in order, each sorted, with done last', () => {
    const list = [
      hw({ id: 'later', dueDate: '2026-11-01' }),
      hw({ id: 'done-old', dueDate: '2026-10-01', status: 'done', completedAt: T0 - 5000 }),
      hw({ id: 'today-b', dueDate: TODAY, title: 'b' }),
      hw({ id: 'over', dueDate: '2026-10-06' }),
      hw({ id: 'today-a', dueDate: TODAY, title: 'a' }),
      hw({ id: 'done-new', dueDate: '2026-10-09', status: 'done', completedAt: T0 }),
      hw({ id: 'week', dueDate: '2026-10-13' }),
    ];
    const groups = groupAssignments(list, TODAY);
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'week', 'later', 'done']);
    expect(groups.map((g) => g.label)).toEqual(['Overdue', 'Today', 'This week', 'Later', 'Done']);
    expect(groups[1].items.map((a) => a.id)).toEqual(['today-a', 'today-b']);
    expect(groups[4].items.map((a) => a.id)).toEqual(['done-new', 'done-old']);
  });

  it('moves timed work to overdue once its time passes', () => {
    const a = hw({ dueDate: TODAY, dueTime: '10:00' });
    expect(groupAssignments([a], TODAY, { nowMinutes: 9 * 60 })[0].key).toBe('today');
    expect(groupAssignments([a], TODAY, { nowMinutes: 11 * 60 })[0].key).toBe('overdue');
  });

  it('keeps pinned done items in their due-date group', () => {
    const a = hw({ id: 'p', dueDate: '2026-10-09', status: 'done', completedAt: T0 });
    expect(groupAssignments([a], TODAY)[0].key).toBe('done');
    expect(groupAssignments([a], TODAY, { pinned: new Set(['p']) })[0].key).toBe('tomorrow');
  });

  it('returns nothing for an empty list', () => {
    expect(groupAssignments([], TODAY)).toEqual([]);
  });
});

describe('groupByClass', () => {
  const classes = [cls('bio'), cls('chem'), cls('old', { archived: true }), cls('art')];
  it('groups in class order with unclassed (and orphaned) work last', () => {
    const list = [hw({ id: '1', classId: 'chem' }), hw({ id: '2', classId: null }), hw({ id: '3', classId: 'bio' }), hw({ id: '4', classId: 'deleted' }), hw({ id: '5', classId: 'chem', dueDate: '2026-10-01' })];
    const g = groupByClass(list, classes);
    expect(g.map((x) => x.cls?.id ?? null)).toEqual(['bio', 'chem', null]);
    expect(g[1].items.map((a) => a.id)).toEqual(['5', '1']);
    expect(g[2].items.map((a) => a.id)).toEqual(['2', '4']);
  });
  it('can include active classes with nothing due, but not archived ones', () => {
    const g = groupByClass([hw({ classId: 'old' })], classes, true);
    expect(g.map((x) => x.cls?.id)).toEqual(['bio', 'chem', 'old', 'art']);
    expect(groupByClass([], classes, true).map((x) => x.cls?.id)).toEqual(['bio', 'chem', 'art']);
  });
});

describe('filterAssignments', () => {
  const classes = [cls('chem', { name: 'AP Chemistry' }), cls('eng', { name: 'English 10' })];
  const list = [
    hw({ id: 'a', classId: 'chem', type: 'lab', priority: 'high', title: 'Titration lab report', status: 'in_progress' }),
    hw({ id: 'b', classId: 'eng', type: 'essay', title: 'Gatsby essay', notes: 'Chapter 3 symbolism', status: 'done' }),
    hw({ id: 'c', classId: null, type: 'other', title: 'Permission slip', priority: 'low', subtasks: [{ id: 's', text: 'Get signature', done: false }] }),
    hw({ id: 'd', classId: 'chem', type: 'quiz', title: 'Stoichiometry quiz', links: [{ label: 'Khan practice', url: 'https://k.org' }] }),
  ];
  const ids = (f: Parameters<typeof filterAssignments>[1]) => filterAssignments(list, f, classes).map((a) => a.id);

  it('passes everything with no filters', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ classId: '', type: '', priority: '', status: '', q: '  ' })).toEqual(['a', 'b', 'c', 'd']);
  });
  it('filters by class, including "no class"', () => {
    expect(ids({ classId: 'chem' })).toEqual(['a', 'd']);
    expect(ids({ classId: null })).toEqual(['c']);
  });
  it('filters by type, priority and status', () => {
    expect(ids({ type: 'essay' })).toEqual(['b']);
    expect(ids({ priority: 'high' })).toEqual(['a']);
    expect(ids({ priority: 'medium' })).toEqual(['b', 'd']);
    expect(ids({ status: 'done' })).toEqual(['b']);
    expect(ids({ status: 'open' })).toEqual(['a', 'c', 'd']);
    expect(ids({ classId: 'chem', type: 'quiz' })).toEqual(['d']);
  });
  it('searches title, notes, subtasks, links, type and class name', () => {
    expect(ids({ q: 'LAB' })).toEqual(['a']);
    expect(ids({ q: 'symbolism' })).toEqual(['b']);
    expect(ids({ q: 'signature' })).toEqual(['c']);
    expect(ids({ q: 'khan' })).toEqual(['d']);
    expect(ids({ q: 'essay' })).toEqual(['b']);
    expect(ids({ q: 'chemistry' })).toEqual(['a', 'd']);
    expect(ids({ q: 'chemistry quiz' })).toEqual(['d']);
    expect(ids({ q: 'nothing-matches' })).toEqual([]);
  });
  it('reports whether any filter is active', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ classId: '', q: ' ' })).toBe(false);
    expect(hasActiveFilters({ classId: null })).toBe(true);
    expect(hasActiveFilters({ type: 'lab' })).toBe(true);
    expect(hasActiveFilters({ q: 'x' })).toBe(true);
  });
});

describe('nextMeetingDate', () => {
  // A/B rotation on weekdays: chem meets in period 1 every day, gym in period 2 on B days only
  const classes = [cls('chem', { periods: ['1'] }), cls('gym', { periods: ['2'], days: ['B'] }), cls('art', { periods: ['3'], archived: true })];
  const offDays = new Set(['2026-10-12']); // a Monday holiday
  const slots = [
    { period: '1', start: '08:00', end: '09:00' },
    { period: '2', start: '09:05', end: '10:05' },
    { period: '3', start: '10:10', end: '11:10' },
  ];
  // Thu Oct 8 = A, Fri Oct 9 = B, Tue Oct 13 = A, Wed Oct 14 = B ...
  const getDay = (date: ISODate): DayInfo => {
    if (isWeekend(date) || offDays.has(date)) return { date, isSchoolDay: false, slots: [], notes: [] };
    let n = 0;
    for (let d = '2026-10-08'; d < date; d = addDays(d, 1)) if (!isWeekend(d) && !offDays.has(d)) n++;
    const id = n % 2 === 0 ? 'A' : 'B';
    return { date, isSchoolDay: true, cycleDay: { id, name: 'Day ' + id }, slots, notes: [] };
  };

  it('finds the next school day the class meets, strictly after fromDate', () => {
    expect(nextMeetingDate('chem', '2026-10-08', getDay, classes)).toBe('2026-10-09');
    // Friday -> skips the weekend and the Monday holiday
    expect(nextMeetingDate('chem', '2026-10-09', getDay, classes)).toBe('2026-10-13');
  });
  it('respects cycle-day-limited classes', () => {
    expect(nextMeetingDate('gym', '2026-10-08', getDay, classes)).toBe('2026-10-09');
    expect(nextMeetingDate('gym', '2026-10-09', getDay, classes)).toBe('2026-10-14');
  });
  it('returns null for unknown, archived or never-meeting classes and within the window', () => {
    expect(nextMeetingDate('nope', TODAY, getDay, classes)).toBeNull();
    expect(nextMeetingDate('art', TODAY, getDay, classes)).toBeNull();
    expect(nextMeetingDate('gym', '2026-10-09', getDay, classes, 4)).toBeNull();
    expect(nextMeetingDate('gym', '2026-10-09', getDay, classes, 5)).toBe('2026-10-14');
  });
  it('returns null when the schedule has no school days (not loaded yet)', () => {
    const none = (date: ISODate): DayInfo => ({ date, isSchoolDay: false, reason: 'Loading schedule…', slots: [], notes: [] });
    expect(nextMeetingDate('chem', TODAY, none, classes)).toBeNull();
  });
  it('defaultDueDate falls back to tomorrow', () => {
    expect(defaultDueDate('gym', '2026-10-09', getDay, classes)).toBe('2026-10-14');
    expect(defaultDueDate(null, TODAY, getDay, classes)).toBe('2026-10-09');
    expect(defaultDueDate('nope', '2026-10-09', getDay, classes)).toBe('2026-10-10');
  });
});

describe('dueSoonUntil', () => {
  // weekdays are school days, except a Monday holiday on Oct 12
  const getDay = (date: ISODate): DayInfo => ({ date, isSchoolDay: !isWeekend(date) && date !== '2026-10-12', slots: [], notes: [] });

  it('covers the next `days` days when the next school day is within them', () => {
    expect(dueSoonUntil('2026-10-07', 2, getDay)).toBe('2026-10-09'); // Wed -> Fri
    expect(dueSoonUntil('2026-10-08', 2, getDay)).toBe('2026-10-10'); // Thu -> Sat
    expect(dueSoonUntil('2026-10-08', 0, getDay)).toBe('2026-10-09'); // just today, but Friday is the next school day
  });
  it('reaches the next school day across a weekend or a day off', () => {
    expect(dueSoonUntil('2026-10-09', 2, getDay)).toBe('2026-10-13'); // Fri -> Tue (Mon is off)
    expect(dueSoonUntil('2026-10-02', 2, getDay)).toBe('2026-10-05'); // Fri -> Mon
  });
  it('falls back to `days` days without a schedule or a school day in reach', () => {
    const none = (date: ISODate): DayInfo => ({ date, isSchoolDay: false, reason: 'Loading schedule…', slots: [], notes: [] });
    expect(dueSoonUntil('2026-10-09', 2, none)).toBe('2026-10-11');
    expect(dueSoonUntil('2026-10-09', 2, getDay, 2)).toBe('2026-10-11');
  });
});

describe('nextMeetingDate with the real 2026-27 calendars', () => {
  const files = import.meta.glob<SchoolSchedule>('../../public/schools/*/schedule.json', { eager: true, import: 'default' });
  const dayFn = (id: 'hsn' | 'cms', overrides: Record<ISODate, DayOverride> = {}) => {
    const s = normalizeSchedule(files[`../../public/schools/${id}/schedule.json`]);
    return (date: ISODate) => resolveDay(s, date, overrides);
  };

  // HSN rotates A-D; each period drops out one day: period 7 doesn't meet on A days, 6 not on B.
  const hsn = [cls('eng', { periods: ['1'] }), cls('chem', { periods: ['7'] }), cls('gym', { periods: ['6'] })];

  it('follows the HSN A/B/C/D rotation', () => {
    const getDay = dayFn('hsn');
    expect(getDay('2026-10-08').cycleDay?.id).toBe('A');
    expect(nextMeetingDate('eng', '2026-10-08', getDay, hsn)).toBe('2026-10-09'); // Fri, B
    expect(nextMeetingDate('chem', '2026-10-08', getDay, hsn)).toBe('2026-10-09'); // B has period 7
    expect(nextMeetingDate('gym', '2026-10-08', getDay, hsn)).toBe('2026-10-12'); // skips B Friday and the weekend
    expect(nextMeetingDate('chem', '2026-10-13', getDay, hsn)).toBe('2026-10-15'); // Wed is A, so Thu (B)
  });

  it('skips the NJEA days off', () => {
    const getDay = dayFn('hsn');
    expect(nextMeetingDate('eng', '2026-11-04', getDay, hsn)).toBe('2026-11-09');
    expect(nextMeetingDate('chem', '2026-11-04', getDay, hsn)).toBe('2026-11-10'); // Mon Nov 9 is an A day
  });

  it('dueSoonUntil reaches the first day back after NJEA and a weekend', () => {
    const getDay = dayFn('hsn');
    expect(dueSoonUntil('2026-10-09', 2, getDay)).toBe('2026-10-12');
    expect(dueSoonUntil('2026-11-04', 2, getDay)).toBe('2026-11-09');
  });

  it("honors the user's own day overrides (snow day)", () => {
    const getDay = dayFn('hsn', { '2026-10-09': { noSchool: true, name: 'Snow day' } });
    const got = nextMeetingDate('eng', '2026-10-08', getDay, hsn);
    expect(got && got > '2026-10-09').toBe(true);
    expect(classesOnDay(getDay(got!), hsn).some((m) => m.cls?.id === 'eng')).toBe(true);
  });

  it('handles CMS alternating-day classes', () => {
    const getDay = dayFn('cms');
    const cms = [cls('sci', { periods: ['3'] }), cls('art', { periods: ['5'], days: ['B'] })];
    expect(nextMeetingDate('sci', '2026-10-09', getDay, cms)).toBe('2026-10-12');
    expect(nextMeetingDate('art', '2026-10-08', getDay, cms)).toBe('2026-10-09');
    expect(nextMeetingDate('art', '2026-10-09', getDay, cms)).toBe('2026-10-13'); // Mon is A
  });
});

describe('done handling', () => {
  it('setDone stamps and clears completedAt', () => {
    const a = hw();
    const done = setDone(a, true, 123);
    expect(done).toMatchObject({ status: 'done', completedAt: 123 });
    expect(setDone(done, true, 456).completedAt).toBe(123);
    const undone = setDone(done, false);
    expect(undone.status).toBe('todo');
    expect('completedAt' in undone).toBe(false);
    expect(a.status).toBe('todo');
  });
  it('withCompletion keeps completedAt in step with status', () => {
    expect(withCompletion(hw({ status: 'done' }), 9).completedAt).toBe(9);
    expect(withCompletion(hw({ status: 'done', completedAt: 5 }), 9).completedAt).toBe(5);
    expect('completedAt' in withCompletion(hw({ status: 'in_progress', completedAt: 5 }))).toBe(false);
    const open = hw();
    expect(withCompletion(open)).toBe(open);
  });
  it('sortDone lists finished work newest first, falling back to updatedAt', () => {
    const list = [hw({ id: 'x', status: 'done', completedAt: 10 }), hw({ id: 'open' }), hw({ id: 'y', status: 'done', completedAt: 30 }), hw({ id: 'z', status: 'done', updatedAt: 20 })];
    expect(sortDone(list).map((a) => a.id)).toEqual(['y', 'z', 'x']);
  });
  it('doneOlderThan finds done work finished before the cutoff', () => {
    const day = 86400000;
    const list = [hw({ id: 'old', status: 'done', completedAt: T0 - 31 * day }), hw({ id: 'new', status: 'done', completedAt: T0 - 29 * day }), hw({ id: 'open', completedAt: T0 - 60 * day })];
    expect(doneOlderThan(list, 30, T0).map((a) => a.id)).toEqual(['old']);
  });
});

describe('subtaskProgress', () => {
  it('counts done subtasks', () => {
    expect(subtaskProgress(hw())).toEqual({ done: 0, total: 0 });
    expect(
      subtaskProgress(
        hw({
          subtasks: [
            { id: '1', text: 'a', done: true },
            { id: '2', text: 'b', done: false },
            { id: '3', text: 'c', done: true },
          ],
        }),
      ),
    ).toEqual({ done: 2, total: 3 });
  });
});

describe('relativeDue / shortDate', () => {
  it('names nearby days', () => {
    expect(relativeDue(TODAY, TODAY)).toBe('Today');
    expect(relativeDue('2026-10-09', TODAY)).toBe('Tomorrow');
    expect(relativeDue('2026-10-07', TODAY)).toBe('Yesterday');
    expect(relativeDue('2026-10-10', TODAY)).toBe('Sat');
    expect(relativeDue('2026-10-14', TODAY)).toBe('Wed');
    expect(relativeDue('2026-10-05', TODAY)).toBe('3 days ago');
  });
  it('falls back to a short date, with the year when it differs', () => {
    expect(relativeDue('2026-10-15', TODAY)).toBe('Oct 15');
    expect(relativeDue('2026-09-30', TODAY)).toBe('Sep 30');
    expect(relativeDue('2027-01-04', TODAY)).toBe('Jan 4, 2027');
    expect(shortDate('2026-12-25', TODAY)).toBe('Dec 25');
  });
});

describe('links and list helpers', () => {
  it('normalizes urls', () => {
    expect(normalizeUrl(' classroom.google.com ')).toBe('https://classroom.google.com');
    expect(normalizeUrl('http://x.org')).toBe('http://x.org');
    expect(normalizeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(normalizeUrl('')).toBe('');
    expect(isSafeUrl('https://x.org')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });
  it('makes links with a label from the url when none is given', () => {
    expect(makeLink('', 'docs.google.com/doc/')).toEqual({ label: 'docs.google.com/doc', url: 'https://docs.google.com/doc/' });
    expect(makeLink(' Rubric ', 'https://x.org')).toEqual({ label: 'Rubric', url: 'https://x.org' });
  });
  it('moves items up and down within bounds', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('rebaseEdits', () => {
  it('keeps changes made elsewhere to fields the form left alone', () => {
    const initial = hw({ notes: undefined });
    const draft = { ...initial, notes: 'Bring goggles' };
    const live = { ...initial, status: 'done' as const, completedAt: 123, updatedAt: 999 };
    expect(rebaseEdits(initial, draft, live)).toEqual({ ...live, notes: 'Bring goggles' });
  });
  it("uses the form's value for fields the user changed, even if they changed elsewhere too", () => {
    const initial = hw({ title: 'A', priority: 'low' });
    const out = rebaseEdits(initial, { ...initial, title: 'Mine' }, { ...initial, title: 'Theirs', priority: 'high' });
    expect(out.title).toBe('Mine');
    expect(out.priority).toBe('high');
  });
  it('clears fields the user emptied and takes arrays whole', () => {
    const initial = hw({ dueTime: '08:00', subtasks: [{ id: 's1', text: 'One', done: false }] });
    const draft = { ...initial, dueTime: undefined, subtasks: [...initial.subtasks, { id: 's2', text: 'Two', done: false }] };
    const live = { ...initial, subtasks: [{ id: 's1', text: 'One', done: true }] };
    const out = rebaseEdits(initial, draft, live);
    expect(out.dueTime).toBeUndefined();
    expect(out.subtasks.map((s) => s.id)).toEqual(['s1', 's2']);
  });
  it('merges nested objects field by field', () => {
    const initial = cls('chem', { teacher: { name: 'Rivera', email: 'r@x.org' }, archived: undefined });
    const draft = { ...initial, teacher: { ...initial.teacher, officeHours: 'Tue 2:50' } };
    const live = { ...initial, teacher: { ...initial.teacher, email: 'rivera@x.org' }, archived: true };
    expect(rebaseEdits(initial, draft, live)).toEqual({ ...live, teacher: { name: 'Rivera', email: 'rivera@x.org', officeHours: 'Tue 2:50' } });
  });
  it('returns the live copy when nothing was edited', () => {
    const initial = hw();
    const live = { ...initial, status: 'in_progress' as const };
    expect(rebaseEdits(initial, { ...initial }, live)).toEqual(live);
  });
});
