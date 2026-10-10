import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assignment, ClassInfo, Profile } from '../../types';
import { LocalStore } from '../../data/localStore';
import { applyImport, countPhrase, planDeviceCopy, shouldOfferDeviceCopy } from './dataOps';

// dataOps imports firestoreStore, which imports the Firebase SDK; keep it inert here
vi.mock('../../data/firestoreStore', () => ({ copyLocalDataToAccount: vi.fn() }));

const cls = (id: string, updatedAt = 1): ClassInfo => ({
  id,
  name: id,
  teacher: { name: '' },
  room: { label: '' },
  periods: [],
  term: 'full',
  color: '#123456',
  links: [],
  customFields: [],
  createdAt: 1,
  updatedAt,
});
const hw = (id: string, updatedAt = 1): Assignment => ({
  id,
  classId: null,
  title: id,
  type: 'homework',
  dueDate: '2026-10-10',
  priority: 'medium',
  status: 'todo',
  links: [],
  subtasks: [],
  createdAt: 1,
  updatedAt,
});
const profile = (p: Partial<Profile> = {}): Profile => ({ schoolId: 'hsn', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true, ...p });

function read(store: LocalStore) {
  return store.snapshot();
}

describe('applyImport', () => {
  let store: LocalStore;
  beforeEach(() => {
    localStorage.clear();
    store = new LocalStore('test');
  });

  it('merges by id and keeps the items’ own timestamps', async () => {
    await store.saveProfile(profile({ displayName: 'Me' }));
    await store.saveClass(cls('a', 5));
    const current = { profile: profile({ displayName: 'Me' }), classes: [cls('a', 5)], assignments: [] };
    const res = await applyImport(store, current, { profile: profile({ grade: 10 }), classes: [cls('a', 9), cls('b', 3)], assignments: [hw('h', 4)] }, 'merge');
    expect(res).toEqual({ saved: 3, deleted: 0, profileChanged: true });
    const after = read(store);
    expect(after.classes.map((c) => [c.id, c.updatedAt]).sort()).toEqual([
      ['a', 9],
      ['b', 3],
    ]);
    expect(after.assignments[0].updatedAt).toBe(4);
    expect(after.profile?.displayName).toBe('Me');
    expect(after.profile?.grade).toBe(10);
  });

  it('replace makes the data match the file, clearing missing profile fields', async () => {
    await store.saveProfile(profile({ displayName: 'Me', grade: 11 }));
    await store.saveClass(cls('old'));
    await store.saveAssignment(hw('old'));
    const current = { profile: profile({ displayName: 'Me', grade: 11 }), classes: [cls('old')], assignments: [hw('old')] };
    const res = await applyImport(store, current, { profile: profile({ schoolId: 'cms' }), classes: [cls('new')], assignments: [] }, 'replace');
    expect(res.deleted).toBe(2);
    const after = read(store);
    expect(after.classes.map((c) => c.id)).toEqual(['new']);
    expect(after.assignments).toEqual([]);
    expect(after.profile?.schoolId).toBe('cms');
    expect(after.profile && 'grade' in after.profile).toBe(false);
    expect(after.profile && 'displayName' in after.profile).toBe(false);
  });
});

describe('planDeviceCopy', () => {
  it('copies only what the account lacks or has older', () => {
    const plan = planDeviceCopy(
      { profile: profile({ customSchedule: undefined, dayOverrides: { '2026-11-01': { noSchool: true } } }), classes: [cls('a', 9), cls('b', 1)], assignments: [hw('h')] },
      { profile: profile(), classes: [cls('b', 5)], assignments: [] },
    );
    expect(plan.classes.map((c) => c.id)).toEqual(['a']);
    expect(plan.assignments.map((a) => a.id)).toEqual(['h']);
    expect(plan.profile).toEqual({ dayOverrides: { '2026-11-01': { noSchool: true } } });
  });

  it("keeps this device's room links on its own school's map", () => {
    const linked = (id: string, room: ClassInfo['room']) => ({ ...cls(id), room });
    const plan = planDeviceCopy(
      { profile: profile({ schoolId: 'cms' }), classes: [linked('a', { label: '214', mapKey: '214' }), linked('b', { label: 'Gym', mapKey: 'Gym', mapSchool: 'hsn' })], assignments: [] },
      { profile: profile({ schoolId: 'hsn' }), classes: [], assignments: [] },
    );
    // the account is at HSN: a link from before rooms kept their school is still CMS's 214
    expect(plan.classes.map((c) => c.room)).toEqual([
      { label: '214', mapKey: '214', mapSchool: 'cms' },
      { label: 'Gym', mapKey: 'Gym', mapSchool: 'hsn' },
    ]);
  });
});

describe('countPhrase', () => {
  it('reads naturally', () => {
    expect(countPhrase(1, 0)).toBe('1 class');
    expect(countPhrase(2, 1)).toBe('2 classes and 1 assignment');
    expect(countPhrase(0, 0)).toBe('nothing new');
  });
});

describe('shouldOfferDeviceCopy', () => {
  const base = { accountStore: true, loading: false, accountItems: 0, localItems: 3, dismissed: false };
  it('offers to fill an empty account from this device', () => {
    expect(shouldOfferDeviceCopy(base)).toBe(true);
  });
  it('stays quiet otherwise', () => {
    expect(shouldOfferDeviceCopy({ ...base, accountStore: false })).toBe(false);
    expect(shouldOfferDeviceCopy({ ...base, loading: true })).toBe(false);
    expect(shouldOfferDeviceCopy({ ...base, accountItems: 1 })).toBe(false);
    expect(shouldOfferDeviceCopy({ ...base, localItems: 0 })).toBe(false);
    expect(shouldOfferDeviceCopy({ ...base, dismissed: true })).toBe(false);
  });
});

describe('LocalStore.saveProfile', () => {
  it('deletes a field passed explicitly as undefined, like the Firestore store', async () => {
    localStorage.clear();
    const store = new LocalStore('test');
    await store.saveProfile(profile({ grade: 9, customSchedule: { schoolId: 'hsn' } as Profile['customSchedule'] }));
    await store.saveProfile({ customSchedule: undefined, dayOverrides: {} });
    const p = store.snapshot().profile!;
    expect('customSchedule' in p).toBe(false);
    expect(p.grade).toBe(9);
    expect(p.dayOverrides).toEqual({});
  });
});
