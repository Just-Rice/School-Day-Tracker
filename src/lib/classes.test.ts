import { describe, expect, it } from 'vitest';
import type { Assignment, ClassInfo, DayInfo, MapRoom, SchoolSchedule } from '../types';
import {
  CLASS_COLORS,
  classAssignments,
  cleanDays,
  daysWithoutMeetings,
  describeDays,
  describePeriods,
  duplicateClass,
  emptyClass,
  groupMeetingTimes,
  hostOf,
  isValidUrl,
  joinNames,
  matchesQuery,
  matchMapRoom,
  meetingSummary,
  nextMeeting,
  normalizeUrl,
  periodConflicts,
  pickColor,
  prepareClass,
  roomLabel,
  safeHref,
  sortByPeriod,
  suggestIcon,
  telHref,
  validateClass,
  withClassDefaults,
} from './classes';
import { meetingTimes, resolveDay } from './schedule';

const cls = (over: Partial<ClassInfo>): ClassInfo => emptyClass({ name: 'Class', ...over }, 1000);

// a small HSN-like drop schedule: 4 cycle days, period 4 dropped on D
const rot: SchoolSchedule = {
  schoolId: 'hsn',
  schoolYear: '2026-27',
  cycle: {
    mode: 'rotation',
    days: [
      { id: 'A', name: 'A Day' },
      { id: 'B', name: 'B Day' },
      { id: 'C', name: 'C Day' },
      { id: 'D', name: 'D Day' },
    ],
  },
  periods: [
    { id: '1', name: 'Period 1' },
    { id: '2', name: 'Period 2' },
    { id: '3', name: 'Period 3' },
    { id: '4', name: 'Period 4' },
    { id: 'L', name: 'Lunch', kind: 'lunch' },
  ],
  bells: [
    {
      id: 'regular',
      name: 'Regular',
      days: {
        A: [
          { period: '4', start: '07:40', end: '08:40' },
          { period: '1', start: '08:45', end: '09:45' },
          { period: 'L', start: '10:55', end: '11:36', kind: 'lunch' },
        ],
        B: [
          { period: '1', start: '07:40', end: '08:40' },
          { period: '4', start: '08:45', end: '09:45' },
        ],
        C: [
          { period: '1', start: '07:40', end: '08:40' },
          { period: '4', start: '08:45', end: '09:45' },
        ],
        D: [
          { period: '1', start: '07:40', end: '08:40' },
          { period: '2', start: '08:45', end: '09:45' },
        ],
      },
    },
  ],
  // Thu 2026-10-01 is the first day (A); Mon 2026-10-05 is D
  calendar: { firstDay: '2026-10-01', lastDay: '2027-06-18', noSchool: [], specialDays: [] },
};

const weekly: SchoolSchedule = {
  ...rot,
  schoolId: 'other',
  cycle: {
    mode: 'weekday',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) + 'day' })),
  },
  bells: [{ id: 'regular', name: 'Regular', days: { '*': [{ period: '1', start: '08:00', end: '08:50' }] } }],
};

describe('colors and icons', () => {
  it('has 10-12 distinct hex colors', () => {
    expect(CLASS_COLORS.length).toBeGreaterThanOrEqual(10);
    expect(CLASS_COLORS.length).toBeLessThanOrEqual(12);
    expect(new Set(CLASS_COLORS).size).toBe(CLASS_COLORS.length);
    for (const c of CLASS_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('picks the first unused color, ignoring archived classes', () => {
    expect(pickColor([])).toBe(CLASS_COLORS[0]);
    expect(pickColor([{ color: CLASS_COLORS[0] }, { color: CLASS_COLORS[1].toUpperCase() }])).toBe(CLASS_COLORS[2]);
    expect(pickColor([{ color: CLASS_COLORS[0], archived: true }])).toBe(CLASS_COLORS[0]);
    expect(pickColor(CLASS_COLORS.map((color) => ({ color })).concat({ color: CLASS_COLORS[0] }))).toBe(CLASS_COLORS[1]);
  });

  it('suggests an icon from the class name', () => {
    expect(suggestIcon('AP Chemistry')).toBe('🧪');
    expect(suggestIcon('Honors Biology')).toBe('🧬');
    expect(suggestIcon('Algebra II')).toBe('➗');
    expect(suggestIcon('Spanish 3')).toBe('🗣️');
    expect(suggestIcon('US History I')).toBe('🏛️');
    expect(suggestIcon('AP Computer Science A')).toBe('💻');
    expect(suggestIcon('AP Political Science')).toBe('🏛️');
    expect(suggestIcon('Physical Science')).toBe('🔬');
    expect(suggestIcon('Physical Education')).toBe('🏀');
    expect(suggestIcon('Zzz')).toBeUndefined();
    expect(suggestIcon('  ')).toBeUndefined();
  });
});

describe('emptyClass / duplicateClass / withClassDefaults', () => {
  it('creates a complete class with a fresh id', () => {
    const a = emptyClass({}, 5);
    const b = emptyClass({}, 5);
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ name: '', teacher: { name: '' }, room: { label: '' }, periods: [], term: 'full', links: [], customFields: [], createdAt: 5, updatedAt: 5 });
    expect(emptyClass({ name: 'Chem', periods: ['3'] }).periods).toEqual(['3']);
  });

  it('duplicates deeply with a new id and "(copy)"', () => {
    const src = cls({ name: 'Chem', links: [{ label: 'x', url: 'https://x.org' }], archived: true });
    const copy = duplicateClass(src, 99);
    expect(copy.id).not.toBe(src.id);
    expect(copy.name).toBe('Chem (copy)');
    expect(copy.archived).toBeUndefined();
    expect(copy.createdAt).toBe(99);
    copy.links[0].label = 'changed';
    expect(src.links[0].label).toBe('x');
  });

  it('fills missing fields of stored classes', () => {
    const c = withClassDefaults({ id: 'x', name: 'Bio' } as ClassInfo);
    expect(c.teacher.name).toBe('');
    expect(c.room.label).toBe('');
    expect(c.periods).toEqual([]);
    expect(c.links).toEqual([]);
    expect(c.customFields).toEqual([]);
    expect(c.color).toBe(CLASS_COLORS[0]);
    expect(c.term).toBe('full');
  });
});

describe('urls and phones', () => {
  it('normalizes and validates urls', () => {
    expect(normalizeUrl(' classroom.google.com/c/abc ')).toBe('https://classroom.google.com/c/abc');
    expect(normalizeUrl('http://a.org')).toBe('http://a.org');
    expect(isValidUrl('classroom.google.com')).toBe(true);
    expect(isValidUrl('https://www.wwprsd.org/hsn')).toBe(true);
    expect(isValidUrl('mailto:teacher@wwprsd.org')).toBe(true);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('abc')).toBe(false);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('ftp://files.example.com')).toBe(false);
  });

  it('only produces safe hrefs', () => {
    expect(safeHref('example.com/x')).toBe('https://example.com/x');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('')).toBeUndefined();
    expect(safeHref('mailto:a@b.co')).toBe('mailto:a@b.co');
  });

  it('builds tel: links', () => {
    expect(telHref('(609) 716-5050 x1234')).toBe('tel:6097165050');
    expect(telHref('+1 609 716 5050')).toBe('tel:+16097165050');
    expect(telHref('n/a')).toBeUndefined();
    expect(telHref(undefined)).toBeUndefined();
  });

  it('shows the host of a link', () => {
    expect(hostOf('https://www.khanacademy.org/math')).toBe('khanacademy.org');
    expect(hostOf('mailto:a@b.co')).toBe('a@b.co');
  });
});

describe('validateClass', () => {
  it('accepts a minimal class', () => {
    expect(validateClass(cls({ name: 'Chem' }))).toEqual({});
  });

  it('requires a name and a hex color', () => {
    const e = validateClass(cls({ name: '  ', color: 'blue' }));
    expect(e.name).toBeTruthy();
    expect(e.color).toBeTruthy();
  });

  it('checks teacher contact details', () => {
    const e = validateClass(cls({ teacher: { name: 'Ms. Lee', email: 'lee@', website: 'nope', phone: 'call me' } }));
    expect(Object.keys(e).sort()).toEqual(['teacher.email', 'teacher.phone', 'teacher.website']);
    expect(validateClass(cls({ teacher: { name: 'Ms. Lee', email: 'lee@wwprsd.org', website: 'sites.google.com/view/lee', phone: '609-716-5050' } }))).toEqual({});
  });

  it('checks credits', () => {
    expect(validateClass(cls({ credits: 5 }))).toEqual({});
    expect(validateClass(cls({ credits: -1 })).credits).toBeTruthy();
    expect(validateClass(cls({ credits: NaN })).credits).toBeTruthy();
  });

  it('checks link, custom field and alt room rows, ignoring empty rows', () => {
    const e = validateClass(
      cls({
        links: [
          { label: '', url: '' },
          { label: 'Classroom', url: '' },
          { label: '', url: 'bad url' },
          { label: '', url: 'khanacademy.org' },
        ],
        customFields: [
          { key: '', value: '' },
          { key: '', value: '42' },
          { key: 'Locker', value: '' },
        ],
        altRooms: [
          { days: [], room: { label: '' } },
          { days: ['A'], room: { label: '' } },
          { days: [], room: { label: 'B210' } },
        ],
      }),
    );
    expect(Object.keys(e).sort()).toEqual(['altRooms.1.room', 'altRooms.2.days', 'customFields.1.key', 'links.1.url', 'links.2.url']);
  });
});

describe('prepareClass', () => {
  it('trims, drops empties and normalizes', () => {
    const out = prepareClass(
      cls({
        name: '  AP Chem ',
        courseCode: ' ',
        icon: ' 🧪 ',
        teacher: { name: ' Ms. Lee ', email: ' ', website: 'lee.org' },
        room: { label: ' ', mapKey: 'A103', mapSchool: 'hsn' },
        periods: ['3', '3', ' '],
        days: ['C', 'A', 'C'],
        altRooms: [
          { days: [], room: { label: '' } },
          { days: ['A'], room: { label: ' B210 ', mapKey: 'B210', mapSchool: 'hsn', where: ' ' } },
        ],
        links: [
          { label: ' Classroom ', url: 'classroom.google.com' },
          { label: 'nothing', url: ' ' },
        ],
        customFields: [
          { key: ' Locker ', value: ' 1234 ' },
          { key: ' ', value: '' },
        ],
        notes: '\n',
        archived: false,
      }),
      ['A', 'B', 'C', 'D'],
    );
    expect(out.name).toBe('AP Chem');
    expect(out.courseCode).toBeUndefined();
    expect(out.icon).toBe('🧪');
    expect(out.teacher).toEqual({ name: 'Ms. Lee', email: undefined, phone: undefined, website: 'https://lee.org', office: undefined, officeHours: undefined });
    expect(out.room).toEqual({ label: '' });
    expect(out.periods).toEqual(['3']);
    expect(out.days).toEqual(['A', 'C']);
    // a map link keeps the school it was picked at
    expect(out.altRooms).toEqual([{ days: ['A'], room: { label: 'B210', mapKey: 'B210', mapSchool: 'hsn' } }]);
    expect(out.links).toEqual([{ label: 'Classroom', url: 'https://classroom.google.com' }]);
    expect(out.customFields).toEqual([{ key: 'Locker', value: '1234' }]);
    expect(out.notes).toBeUndefined();
    expect(out.archived).toBeUndefined();
  });

  it('stores "every day" as undefined days', () => {
    expect(cleanDays(['A', 'B', 'C', 'D'], ['A', 'B', 'C', 'D'])).toBeUndefined();
    expect(cleanDays([], ['A'])).toBeUndefined();
    expect(cleanDays(['B', 'A'])).toEqual(['B', 'A']);
    expect(cleanDays(['B', 'A'], ['A', 'B', 'C'])).toEqual(['A', 'B']);
  });
});

describe('sortByPeriod', () => {
  it('orders by first period in schedule order, then name', () => {
    const list = [
      cls({ name: 'Lunch thing', periods: ['L'] }),
      cls({ name: 'No period', periods: [] }),
      cls({ name: 'Zeta', periods: ['3'] }),
      cls({ name: 'Alpha', periods: ['3'] }),
      cls({ name: 'Double', periods: ['4', '1'] }),
      cls({ name: 'Custom', periods: ['X9'] }),
    ];
    const ids = ['1', '2', '3', '4', 'L'];
    expect(sortByPeriod(list, ids).map((c) => c.name)).toEqual(['Double', 'Alpha', 'Zeta', 'Lunch thing', 'Custom', 'No period']);
  });

  it('sorts free-text periods naturally without a schedule', () => {
    const list = [cls({ name: 'b', periods: ['10'] }), cls({ name: 'a', periods: ['2'] }), cls({ name: 'c', periods: [] })];
    expect(sortByPeriod(list, []).map((c) => c.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('periodConflicts', () => {
  const days = ['A', 'B', 'C', 'D'];
  const chem = cls({ id: 'chem', name: 'Chem', periods: ['3'] });
  const labA = cls({ id: 'lab', name: 'Lab', periods: ['3'], days: ['A'] });
  const art = cls({ id: 'art', name: 'Art', periods: ['3'], days: ['B', 'C'] });
  const old = cls({ id: 'old', name: 'Old', periods: ['3'], archived: true });
  const gym = cls({ id: 'gym', name: 'Gym', periods: ['5'] });
  const all = [chem, labA, art, old, gym];

  it('finds classes sharing a period on common days', () => {
    const r = periodConflicts(all, { id: 'new', periods: ['3'] }, days);
    expect(r.map((x) => [x.other.id, x.days])).toEqual([
      ['chem', undefined],
      ['lab', ['A']],
      ['art', ['B', 'C']],
    ]);
  });

  it('excludes itself, archived classes and non-overlapping days', () => {
    expect(periodConflicts(all, labA, days).map((x) => x.other.id)).toEqual(['chem']);
    expect(periodConflicts(all, { id: 'x', periods: ['3'], days: ['D'] }, days).map((x) => x.other.id)).toEqual(['chem']);
    expect(periodConflicts(all, { id: 'x', periods: ['6'] }, days)).toEqual([]);
  });

  it('treats a class picked for every day as every day', () => {
    const r = periodConflicts([labA], { id: 'x', periods: ['3'], days: ['A', 'B', 'C', 'D'] }, days);
    expect(r[0].days).toEqual(['A']);
  });

  it('reports shared periods', () => {
    const r = periodConflicts([cls({ id: 'd', periods: ['1', '2', '3'] })], { id: 'x', periods: ['3', '1'] }, days);
    expect(r[0].periods).toEqual(['3', '1']);
  });
});

describe('descriptions', () => {
  it('joins names folding a common word', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Period 3'])).toBe('Period 3');
    expect(joinNames(['Period 1', 'Period 3'])).toBe('Periods 1 & 3');
    expect(joinNames(['Day 1', 'Day 2', 'Day 4'])).toBe('Days 1, 2 & 4');
    expect(joinNames(['A Day', 'C Day'])).toBe('A & C Days');
    expect(joinNames(['Mon', 'Wed', 'Fri'])).toBe('Mon, Wed & Fri');
    expect(joinNames(['Period 3', 'Lunch'])).toBe('Period 3 & Lunch');
  });

  it('describes periods in schedule order', () => {
    expect(describePeriods(['L', '3'], rot)).toBe('Period 3 & Lunch');
    expect(describePeriods(['4', '1'], rot)).toBe('Periods 1 & 4');
    expect(describePeriods(['7'], null)).toBe('Period 7');
    expect(describePeriods([], rot)).toBe('');
  });

  it('describes days', () => {
    expect(describeDays(undefined, rot)).toBe('Every day');
    expect(describeDays(['C', 'A'], rot)).toBe('A & C Days');
    expect(describeDays(['A', 'B', 'C', 'D'], rot)).toBe('Every day');
    expect(describeDays(['wed', 'mon'], weekly)).toBe('Mon & Wed');
    expect(describeDays(['X'], rot)).toBe('X');
  });

  it('summarizes meetings', () => {
    expect(meetingSummary({ periods: ['3'] }, rot)).toBe('Period 3');
    expect(meetingSummary({ periods: ['3'], days: ['A', 'C'] }, rot)).toBe('Period 3 · A & C Days');
    expect(meetingSummary({ periods: [] }, rot)).toBe('');
  });

  it('groups days with the same times and finds drop days', () => {
    const c = { periods: ['4'] };
    const times = meetingTimes(rot, c);
    const groups = groupMeetingTimes(times, 4);
    expect(groups.map((g) => [g.days.map((d) => d.id), g.slots.map((s) => s.start), g.everyDay])).toEqual([
      [['A'], ['07:40'], false],
      [['B', 'C'], ['08:45'], false],
    ]);
    expect(daysWithoutMeetings(rot, c, times).map((d) => d.id)).toEqual(['D']);
    expect(daysWithoutMeetings(rot, { periods: ['4'], days: ['A'] }, meetingTimes(rot, { periods: ['4'], days: ['A'] }))).toEqual([]);

    const wk = groupMeetingTimes(meetingTimes(weekly, { periods: ['1'] }), 5);
    expect(wk).toHaveLength(1);
    expect(wk[0].everyDay).toBe(true);
  });
});

describe('nextMeeting', () => {
  const getDay = (d: string): DayInfo => resolveDay(rot, d);
  const c4 = cls({ periods: ['4'], room: { label: '214' }, altRooms: [{ days: ['B'], room: { label: 'Lab' } }] });

  it('finds the meeting in progress', () => {
    // Thu 2026-10-01 is an A day; period 4 runs 07:40-08:40
    const m = nextMeeting(c4, getDay, '2026-10-01', 8 * 60);
    expect(m).toMatchObject({ date: '2026-10-01', now: true, room: { label: '214' } });
  });

  it('skips past meetings and weekends, applying alt rooms', () => {
    // after A day's period 4 -> Fri 10/2 is B (period 4 at 08:45, in the lab)
    const m = nextMeeting(c4, getDay, '2026-10-01', 9 * 60);
    expect(m).toMatchObject({ date: '2026-10-02', now: false, room: { label: 'Lab' } });
    expect(m!.slot.start).toBe('08:45');
    // Sat 10/3 -> Mon 10/5 is C
    expect(nextMeeting(c4, getDay, '2026-10-03', 0)?.date).toBe('2026-10-05');
  });

  it('returns nothing for archived or period-less classes', () => {
    expect(nextMeeting({ ...c4, archived: true }, getDay, '2026-10-01', 0)).toBeUndefined();
    expect(nextMeeting(cls({}), getDay, '2026-10-01', 0)).toBeUndefined();
  });
});

describe('rooms, search and homework', () => {
  const room = (label: string, name: string, key = label || name, type = 'class'): MapRoom => ({ label, name, key, title: name, type, level: 0, R: [0, 0, 1, 1] });
  const rooms = [room('214', 'Room 214'), room('A103', 'Room A103'), room('', 'Media Center'), room('', 'Office', 'Office@1'), room('', 'Office', 'Office@1#2'), room('Stairs', 'Stairwell', 'Stairs', 'stair')];

  it('matches typed rooms to map rooms', () => {
    expect(matchMapRoom(rooms, '214')?.key).toBe('214');
    expect(matchMapRoom(rooms, 'room a103')?.key).toBe('A103');
    expect(matchMapRoom(rooms, 'media center')?.key).toBe('Media Center');
    expect(matchMapRoom(rooms, 'Office')).toBeUndefined();
    expect(matchMapRoom(rooms, 'Stairs')).toBeUndefined();
    expect(matchMapRoom(rooms, '999')).toBeUndefined();
    expect(matchMapRoom(rooms, ' ')).toBeUndefined();
  });

  it('formats room labels', () => {
    expect(roomLabel({ label: '214' })).toBe('Room 214');
    expect(roomLabel({ label: 'A103' })).toBe('Room A103');
    expect(roomLabel({ label: 'Gym' })).toBe('Gym');
    expect(roomLabel(undefined)).toBe('');
  });

  it('searches every detail', () => {
    const c = cls({ name: 'AP Chemistry', teacher: { name: 'Ms. Lee' }, room: { label: 'A103' }, periods: ['3'], customFields: [{ key: 'Locker', value: '4411' }] });
    expect(matchesQuery(c, '', rot)).toBe(true);
    expect(matchesQuery(c, 'chem lee', rot)).toBe(true);
    expect(matchesQuery(c, 'period 3', rot)).toBe(true);
    expect(matchesQuery(c, '4411', rot)).toBe(true);
    expect(matchesQuery(c, 'biology', rot)).toBe(false);
  });

  it('lists a class’s open assignments by due date', () => {
    const a = (id: string, over: Partial<Assignment>): Assignment => ({ id, classId: 'c1', title: id, type: 'homework', dueDate: '2026-10-10', priority: 'medium', status: 'todo', links: [], subtasks: [], createdAt: 0, updatedAt: 0, ...over });
    const r = classAssignments(
      [a('late', { dueDate: '2026-10-09', dueTime: '23:00' }), a('timed', { dueTime: '08:00' }), a('untimed', {}), a('done', { status: 'done' }), a('other', { classId: 'c2' }), a('early', { dueDate: '2026-10-09', dueTime: '07:00' })],
      'c1',
    );
    expect(r.open.map((x) => x.id)).toEqual(['early', 'late', 'timed', 'untimed']);
    expect(r.done).toBe(1);
  });
});
