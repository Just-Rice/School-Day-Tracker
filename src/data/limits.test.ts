import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSIGNMENT_LISTS, ASSIGNMENT_TEXT, CLASS_LISTS, CLASS_TEXT, describeLimitProblem, limitError, overAccountLimit, PROFILE_MAPS, PROFILE_TEXT } from './limits';

const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');

/** the size limits one of the rules' validX functions checks, by field */
function ruleLimits(fn: string, re: RegExp): Record<string, number> {
  const start = rules.indexOf(`function ${fn}(`);
  expect(start).toBeGreaterThan(-1);
  const body = rules.slice(start, rules.indexOf('\n    }', start));
  return Object.fromEntries([...body.matchAll(re)].map((m) => [m[1], Number(m[2])]));
}
const STR = /(?:optStr|reqStr)\(d, '(\w+)', (\d+)\)/g;
const LIST = /optList\(d, '(\w+)', (\d+)\)/g;
const SIZE = /d\.(\w+)\.size\(\) <= (\d+)/g;

describe('account limits', () => {
  it('match firestore.rules', () => {
    expect(ruleLimits('validClass', STR)).toEqual(CLASS_TEXT);
    expect(ruleLimits('validClass', LIST)).toEqual(CLASS_LISTS);
    expect({ ...ruleLimits('validAssignment', STR), ...ruleLimits('validAssignment', SIZE) }).toEqual(ASSIGNMENT_TEXT);
    expect(ruleLimits('validAssignment', LIST)).toEqual(ASSIGNMENT_LISTS);
    expect(ruleLimits('validProfile', STR)).toEqual(PROFILE_TEXT);
    expect(ruleLimits('validProfile', SIZE)).toEqual(PROFILE_MAPS);
  });

  it('finds the first text field or list over a limit', () => {
    expect(overAccountLimit('class', { name: 'Chemistry', grade: 'A-', notes: 'x'.repeat(50000), links: [] })).toBeNull();
    expect(overAccountLimit('class', { name: 'Chemistry', grade: 'A- (91.6%) after the unit 2 retake on Oct 3, see notes!' })).toEqual({ field: 'grade', label: 'current grade', list: false, size: 55, max: 50 });
    expect(overAccountLimit('class', { name: 'x', links: new Array(101).fill({ label: '', url: 'https://a.b' }) })).toMatchObject({ field: 'links', list: true, size: 101 });
    expect(overAccountLimit('assignment', { title: 'Essay', classId: null, notes: 'y'.repeat(60000) })).toMatchObject({ field: 'notes', size: 60000, max: 50000 });
    expect(overAccountLimit('assignment', { title: 'Essay', subtasks: new Array(301).fill({}) })).toMatchObject({ field: 'subtasks', label: 'steps' });
    // a profile patch: only what's in it is checked
    expect(overAccountLimit('profile', { theme: 'dark' })).toBeNull();
    expect(overAccountLimit('profile', { displayName: 'n'.repeat(101) })).toMatchObject({ field: 'displayName' });
    const dayOverrides = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`d${i}`, { noSchool: true }]));
    expect(overAccountLimit('profile', { dayOverrides })).toMatchObject({ field: 'dayOverrides', label: 'day changes', list: true });
  });

  it('counts characters the way the rules do (UTF-16 code units)', () => {
    expect(overAccountLimit('class', { grade: '😀'.repeat(25) })).toBeNull();
    expect(overAccountLimit('class', { grade: '😀'.repeat(26) })).toMatchObject({ size: 52 });
  });

  it('describes the problem in plain words', () => {
    const p = overAccountLimit('class', { notes: 'x'.repeat(60000) })!;
    expect(describeLimitProblem(p)).toBe('the notes are too long (60,000 characters; an account can keep up to 50,000)');
    expect(limitError(overAccountLimit('class', { grade: 'g'.repeat(55) })!).message).toBe(
      'This can’t be synced to your account: the current grade is too long (55 characters; an account can keep up to 50). Shorten it and save again.',
    );
    expect(limitError(overAccountLimit('assignment', { links: new Array(120).fill(0) })!).message).toMatch(/there are too many links \(120; .*\)\. Remove some and save again\./);
  });
});
