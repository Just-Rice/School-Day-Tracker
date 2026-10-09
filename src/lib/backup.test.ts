import { describe, expect, it } from 'vitest';
import type { Assignment, ClassInfo, Profile } from '../types';
import {
  BACKUP_APP,
  BACKUP_VERSION,
  backupFileName,
  changedByMerge,
  describeCounts,
  makeBackup,
  mergeById,
  parseBackup,
  planImport,
  planProfile,
  profileMergeFields,
  sanitizeAssignment,
  sanitizeClass,
} from './backup';

const cls = (id: string, updatedAt = 1, extra: Partial<ClassInfo> = {}): ClassInfo => ({
  id,
  name: 'Class ' + id,
  teacher: { name: 'T' },
  room: { label: '101' },
  periods: ['1'],
  term: 'full',
  color: '#123456',
  links: [],
  customFields: [],
  createdAt: 1,
  updatedAt,
  ...extra,
});

const hw = (id: string, updatedAt = 1, extra: Partial<Assignment> = {}): Assignment => ({
  id,
  classId: null,
  title: 'HW ' + id,
  type: 'homework',
  dueDate: '2026-10-10',
  priority: 'medium',
  status: 'todo',
  links: [],
  subtasks: [],
  createdAt: 1,
  updatedAt,
  ...extra,
});

const profile = (extra: Partial<Profile> = {}): Profile => ({ schoolId: 'hsn', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true, ...extra });

describe('makeBackup / backupFileName', () => {
  it('wraps the data with app, version and time, without undefined values', () => {
    const b = makeBackup({ profile: profile({ grade: undefined }), classes: [cls('a')], assignments: [] }, new Date('2026-10-08T12:00:00Z'));
    expect(b.app).toBe(BACKUP_APP);
    expect(b.version).toBe(BACKUP_VERSION);
    expect(b.exportedAt).toBe('2026-10-08T12:00:00.000Z');
    expect('grade' in (b.profile as object)).toBe(false);
    expect(b.classes).toHaveLength(1);
  });

  it('names the file by local date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 30))).toBe('school-day-tracker-backup-2026-01-05.json');
  });
});

describe('parseBackup', () => {
  const file = (o: Record<string, unknown>) => JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: 'x', ...o });

  it('round-trips a backup', () => {
    const data = { profile: profile({ grade: 10, displayName: 'Ana', dayOverrides: { '2026-12-01': { noSchool: true, name: 'Snow day' } } }), classes: [cls('a', 5)], assignments: [hw('h', 6, { classId: 'a', subtasks: [{ id: 's', text: 'Do it', done: true }] })] };
    const parsed = parseBackup(JSON.stringify(makeBackup(data)));
    expect(parsed.profile).toEqual(data.profile);
    expect(parsed.classes).toEqual(data.classes);
    expect(parsed.assignments).toEqual(data.assignments);
    expect(parsed.warnings).toEqual([]);
  });

  it('rejects things that are not backups with a friendly message', () => {
    expect(() => parseBackup('not json')).toThrow(/isn’t valid JSON/);
    expect(() => parseBackup('[1,2]')).toThrow(/isn’t a School Day Tracker backup/);
    expect(() => parseBackup(JSON.stringify({ app: 'other', version: 1 }))).toThrow(/isn’t a School Day Tracker backup/);
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP }))).toThrow(/damaged/);
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, version: 99, classes: [cls('a')] }))).toThrow(/newer version/);
    expect(() => parseBackup(file({ classes: [], assignments: [] }))).toThrow(/empty/);
  });

  it('accepts a UTF-8 byte order mark', () => {
    expect(parseBackup('﻿' + file({ classes: [cls('a')] })).classes).toHaveLength(1);
  });

  it('skips unusable items, duplicates and junk, and says so', () => {
    const parsed = parseBackup(
      file({
        classes: [cls('a'), { id: 'b' }, 'junk', cls('a'), { ...cls('c'), name: '  ' }, { ...cls('d/e') }],
        assignments: [hw('h'), { ...hw('bad'), dueDate: 'tomorrow' }],
      }),
    );
    expect(parsed.classes.map((c) => c.id)).toEqual(['a']);
    expect(parsed.assignments.map((a) => a.id)).toEqual(['h']);
    expect(parsed.warnings).toEqual(['5 classes couldn’t be read and were skipped.', '1 assignment couldn’t be read and was skipped.']);
  });

  it('warns when a section is not a list', () => {
    const parsed = parseBackup(file({ classes: { a: 1 }, assignments: [hw('h')] }));
    expect(parsed.classes).toEqual([]);
    expect(parsed.warnings[0]).toMatch(/classes in the file weren’t a list/);
  });

  it('drops a damaged custom schedule but keeps the rest of the profile', () => {
    const parsed = parseBackup(file({ profile: { ...profile(), customSchedule: { bells: 'nope' } } }));
    expect(parsed.profile?.customSchedule).toBeUndefined();
    expect(parsed.profile?.schoolId).toBe('hsn');
    expect(parsed.warnings[0]).toMatch(/custom bell schedule/);
  });

  it('keeps a well-formed custom schedule', () => {
    const customSchedule = { schoolId: 'hsn', schoolYear: '2026-27', cycle: { mode: 'rotation', days: [{ id: 'A', name: 'A' }] }, periods: [], bells: [{ id: 'r', name: 'Regular', days: { '*': [] } }], calendar: { firstDay: '2026-09-01', lastDay: '2027-06-20', noSchool: [], specialDays: [] } };
    const parsed = parseBackup(file({ profile: { ...profile(), customSchedule } }));
    expect(parsed.profile?.customSchedule).toEqual(customSchedule);
  });
});

describe('sanitizeClass', () => {
  it('fills defaults, fixes bad values and drops unknown fields', () => {
    const c = sanitizeClass({ id: 'x', name: ' Bio ', teacher: 'Mr. B', room: null, periods: ['1', 2, ''], term: 'Q9', color: 'red', links: [{ url: 'https://a.b' }, { label: 'no url' }], hacker: true, createdAt: -1 }, 50);
    expect(c).toEqual({ id: 'x', name: 'Bio', teacher: { name: '' }, room: { label: '' }, periods: ['1'], term: 'full', color: '#4b5563', links: [{ label: '', url: 'https://a.b' }], customFields: [], createdAt: 50, updatedAt: 50 });
  });

  it('caps very long text', () => {
    expect(sanitizeClass({ id: 'x', name: 'n'.repeat(1000) })!.name).toHaveLength(200);
  });
});

describe('sanitizeAssignment', () => {
  it('requires id, title and a due date', () => {
    expect(sanitizeAssignment({ id: 'a', title: 't' })).toBeNull();
    expect(sanitizeAssignment({ id: 'a', dueDate: '2026-01-01' })).toBeNull();
    expect(sanitizeAssignment({ title: 't', dueDate: '2026-01-01' })).toBeNull();
  });

  it('normalizes enums, times and completion', () => {
    const a = sanitizeAssignment({ id: 'a', title: 't', dueDate: '2026-01-01', dueTime: '25:00', type: 'boss', priority: 'urgent', status: 'todo', completedAt: 5, classId: '' }, 7)!;
    expect(a).toEqual({ id: 'a', classId: null, title: 't', type: 'homework', dueDate: '2026-01-01', priority: 'medium', status: 'todo', links: [], subtasks: [], createdAt: 7, updatedAt: 7 });
  });
});

describe('mergeById / changedByMerge', () => {
  it('adds new items and lets the newer edit win', () => {
    const cur = [cls('a', 5), cls('b', 5)];
    const inc = [cls('a', 9, { name: 'newer' }), cls('b', 1, { name: 'older' }), cls('c', 1)];
    const merged = mergeById(cur, inc);
    expect(merged.map((c) => [c.id, c.name])).toEqual([
      ['a', 'newer'],
      ['b', 'Class b'],
      ['c', 'Class c'],
    ]);
    expect(changedByMerge(cur, inc).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('keeps the current item on a tie', () => {
    const cur = [cls('a', 5)];
    expect(mergeById(cur, [cls('a', 5, { name: 'x' })])[0]).toBe(cur[0]);
    expect(changedByMerge(cur, [cls('a', 5, { name: 'x' })])).toEqual([]);
  });
});

describe('planImport', () => {
  const current = { classes: [cls('a', 5), cls('old', 5)], assignments: [hw('h', 5)] };
  const incoming = { profile: null, classes: [cls('a', 9), cls('new', 1)], assignments: [hw('h', 1)] };

  it('merge: saves new and newer items, deletes nothing', () => {
    const plan = planImport(current, incoming, 'merge');
    expect(plan.saveClasses.map((c) => c.id)).toEqual(['a', 'new']);
    expect(plan.saveAssignments).toEqual([]);
    expect(plan.deleteClasses).toEqual([]);
    expect(plan.deleteAssignments).toEqual([]);
  });

  it('replace: saves everything from the file and deletes what is not in it', () => {
    const plan = planImport(current, { ...incoming, assignments: [] }, 'replace');
    expect(plan.saveClasses.map((c) => c.id)).toEqual(['a', 'new']);
    expect(plan.deleteClasses).toEqual(['old']);
    expect(plan.deleteAssignments).toEqual(['h']);
  });
});

describe('profileMergeFields / planProfile', () => {
  it('only fills in what the current profile lacks', () => {
    const cur = profile({ displayName: 'Me', dayOverrides: { '2026-10-01': { noSchool: true } } });
    const inc = profile({ displayName: 'Other', grade: 9, dayOverrides: { '2026-10-01': { cycleDay: 'B' }, '2026-10-02': { noSchool: true } } });
    expect(profileMergeFields(inc, cur)).toEqual({ grade: 9, dayOverrides: { '2026-10-01': { noSchool: true }, '2026-10-02': { noSchool: true } } });
  });

  it('does not bring school-specific settings across schools', () => {
    const inc = profile({ schoolId: 'cms', grade: 7, dayOverrides: { '2026-10-02': { noSchool: true } } });
    expect(profileMergeFields(inc, profile({ schoolId: 'hsn' }))).toEqual({});
  });

  it('returns nothing to add when there is no other profile', () => {
    expect(profileMergeFields(null, profile())).toEqual({});
    expect(planProfile(profile(), null, 'replace')).toBeNull();
    expect(planProfile(profile(), profile(), 'merge')).toBeNull();
  });

  it('replace lists every field so missing ones get cleared', () => {
    const p = planProfile(profile({ grade: 10, displayName: 'Me' }), profile({ schoolId: 'cms', onboarded: false }), 'replace')!;
    expect(p.schoolId).toBe('cms');
    expect(p.onboarded).toBe(true);
    expect('grade' in p && p.grade === undefined).toBe(true);
    expect('displayName' in p && p.displayName === undefined).toBe(true);
    expect('customSchedule' in p).toBe(true);
  });
});

describe('describeCounts', () => {
  it('pluralizes', () => {
    expect(describeCounts({ classes: [1], assignments: [] })).toBe('1 class, 0 assignments');
    expect(describeCounts({ classes: [1, 2], assignments: [1] })).toBe('2 classes, 1 assignment');
  });
});
