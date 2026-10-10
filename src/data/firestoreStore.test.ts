import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assignment, ClassInfo, Profile } from '../types';

// A tiny in-memory stand-in for the Firestore SDK: paths instead of references, and spies for
// every call, so the store's wiring can be checked without a network or a Firebase project.
const fs = vi.hoisted(() => {
  const DELETE = { __sentinel: 'delete' };
  type Ref = { path: string };
  type Batch = { set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> };
  const batches: Batch[] = [];
  const snapshots = new Map<string, { next: (s: unknown) => void; error?: (e: unknown) => void }>();
  return {
    DELETE,
    batches,
    snapshots,
    doc: (parent: Partial<Ref>, ...segs: string[]): Ref => ({ path: [parent.path, ...segs].filter(Boolean).join('/') }),
    collection: (parent: Partial<Ref>, ...segs: string[]): Ref => ({ path: [parent.path, ...segs].filter(Boolean).join('/') }),
    deleteField: () => DELETE,
    setDoc: vi.fn(async (..._a: unknown[]) => {}),
    deleteDoc: vi.fn(async (..._a: unknown[]) => {}),
    getDocs: vi.fn(async (ref: Ref) => ({ docs: [{ ref: { path: ref.path + '/x1' } }, { ref: { path: ref.path + '/x2' } }] })),
    onSnapshot: vi.fn((ref: Ref, next: (s: unknown) => void, error?: (e: unknown) => void) => {
      snapshots.set(ref.path, { next, error });
      return () => snapshots.delete(ref.path);
    }),
    writeBatch: vi.fn(() => {
      const b: Batch = { set: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) };
      batches.push(b);
      return b;
    }),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: fs.doc,
  collection: fs.collection,
  deleteField: fs.deleteField,
  setDoc: fs.setDoc,
  deleteDoc: fs.deleteDoc,
  getDocs: fs.getDocs,
  onSnapshot: fs.onSnapshot,
  writeBatch: fs.writeBatch,
}));
vi.mock('../firebase', () => ({ getDb: () => ({}) }));

import { BATCH_LIMIT, chunk, copyLocalDataToAccount, createFirestoreStore, deleteAllUserData, friendlyFirestoreError, friendlySaveError, fromFirestoreProfile, settleWrite, toFirestoreProfile } from './firestoreStore';

const DEL = Symbol('delete');

function makeClass(id: string, extra: Partial<ClassInfo> = {}): ClassInfo {
  return {
    id,
    name: 'Chemistry',
    teacher: { name: 'Ms. Lee', email: undefined },
    room: { label: '214' },
    periods: ['3'],
    term: 'full',
    color: '#1f77b4',
    links: [],
    customFields: [],
    createdAt: 1,
    updatedAt: 2,
    ...extra,
  };
}

function makeAssignment(id: string): Assignment {
  return { id, classId: null, title: 'Read ch. 3', type: 'reading', dueDate: '2026-10-09', priority: 'medium', status: 'todo', links: [], subtasks: [], createdAt: 1, updatedAt: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  fs.batches.length = 0;
  fs.snapshots.clear();
});

describe('toFirestoreProfile', () => {
  it('writes only the given fields, replacing each one whole, and stamps updatedAt', () => {
    const { data, fields } = toFirestoreProfile({ dayOverrides: { '2026-10-09': { noSchool: true } }, clock: '24h' }, DEL, 123);
    expect(data).toEqual({ clock: '24h', dayOverrides: { '2026-10-09': { noSchool: true } }, updatedAt: 123 });
    expect(fields.sort()).toEqual(['clock', 'dayOverrides', 'updatedAt']);
  });

  it('keeps an emptied dayOverrides map as {} so the old keys get dropped', () => {
    const { data, fields } = toFirestoreProfile({ dayOverrides: {} }, DEL, 1);
    expect(data.dayOverrides).toEqual({});
    expect(fields).toContain('dayOverrides');
  });

  it('turns a key that is present but undefined into a delete', () => {
    const { data, fields } = toFirestoreProfile({ customSchedule: undefined, grade: undefined }, DEL, 1);
    expect(data.customSchedule).toBe(DEL);
    expect(data.grade).toBe(DEL);
    expect(fields).toEqual(expect.arrayContaining(['customSchedule', 'grade']));
  });

  it('does not touch fields that are absent', () => {
    const { data } = toFirestoreProfile({ theme: 'dark' }, DEL, 1);
    expect('customSchedule' in data).toBe(false);
    expect('dayOverrides' in data).toBe(false);
  });

  it('drops undefined deep inside values and ignores unknown keys', () => {
    const p = { displayName: 'Ana', junk: 1, customSchedule: { schoolId: 'hsn', source: { urls: [], note: undefined, verified: false } } } as unknown as Partial<Profile>;
    const { data, fields } = toFirestoreProfile(p, DEL, 1);
    expect(fields).not.toContain('junk');
    expect(data.customSchedule).toEqual({ schoolId: 'hsn', source: { urls: [], verified: false } });
  });

  it('ignores an incoming updatedAt in favor of now', () => {
    expect(toFirestoreProfile({ updatedAt: 5 }, DEL, 9).data).toEqual({ updatedAt: 9 });
  });
});

describe('fromFirestoreProfile', () => {
  it('returns null for a missing document', () => {
    expect(fromFirestoreProfile(undefined)).toBeNull();
  });
  it('keeps profile fields and drops anything else', () => {
    expect(fromFirestoreProfile({ schoolId: 'cms', onboarded: true, updatedAt: 4, extra: 'x', grade: null })).toEqual({ schoolId: 'cms', onboarded: true, updatedAt: 4 });
  });
});

describe('settleWrite', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves as soon as the server confirms', async () => {
    const done = vi.fn();
    void settleWrite(Promise.resolve(), 5000).then(done);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalled();
  });

  it('rejects with a friendly error when the server refuses in time', async () => {
    const err = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    await expect(settleWrite(Promise.reject(err), 5000)).rejects.toThrow(/doesn’t have access/);
  });

  it('resolves after the grace period while offline and reports a later failure', async () => {
    let fail!: (e: unknown) => void;
    const pending = new Promise((_, reject) => (fail = reject));
    const late = vi.fn();
    const done = vi.fn();
    void settleWrite(pending, 100, late).then(done);
    await vi.advanceTimersByTimeAsync(99);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
    fail({ code: 'unauthenticated' });
    await vi.advanceTimersByTimeAsync(0);
    expect(late).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/signed out/) }));
  });
});

describe('friendlyFirestoreError', () => {
  it('maps known codes and passes other errors through', () => {
    expect(friendlyFirestoreError({ code: 'unavailable' }).message).toMatch(/back online/);
    const e = new Error('boom');
    expect(friendlyFirestoreError(e)).toBe(e);
    expect(friendlyFirestoreError('weird').message).toMatch(/syncing/);
  });

  it('does not tell someone whose save was refused to sign out', () => {
    expect(friendlySaveError({ code: 'permission-denied' }).message).toMatch(/didn’t accept this change/);
    expect(friendlySaveError({ code: 'permission-denied' }).message).not.toMatch(/sign/i);
    expect(friendlySaveError({ code: 'unavailable' }).message).toMatch(/back online/);
  });
});

describe('chunk', () => {
  it('splits into batches under the Firestore limit', () => {
    const parts = chunk(Array.from({ length: 1000 }, (_, i) => i));
    expect(parts.map((p) => p.length)).toEqual([BATCH_LIMIT, BATCH_LIMIT, 1000 - 2 * BATCH_LIMIT]);
    expect(chunk([])).toEqual([]);
  });
});

describe('createFirestoreStore', () => {
  it('saves the profile with mergeFields and a delete sentinel for cleared fields', async () => {
    const store = createFirestoreStore('u1');
    await store.saveProfile({ customSchedule: undefined, dayOverrides: {} });
    const [ref, data, opts] = fs.setDoc.mock.calls[0] as [{ path: string }, Record<string, unknown>, { mergeFields: string[] }];
    expect(ref.path).toBe('users/u1');
    expect(data.customSchedule).toBe(fs.DELETE);
    expect(data.dayOverrides).toEqual({});
    expect(typeof data.updatedAt).toBe('number');
    expect(opts.mergeFields.sort()).toEqual(['customSchedule', 'dayOverrides', 'updatedAt']);
  });

  it('saves classes and assignments as whole documents without undefined values', async () => {
    const store = createFirestoreStore('u1');
    await store.saveClass(makeClass('c1'));
    await store.saveAssignment(makeAssignment('a1'));
    const [cRef, cData, cOpts] = fs.setDoc.mock.calls[0] as [{ path: string }, ClassInfo, unknown];
    expect(cRef.path).toBe('users/u1/classes/c1');
    expect(cData.teacher).toEqual({ name: 'Ms. Lee' });
    expect(cOpts).toBeUndefined();
    expect((fs.setDoc.mock.calls[1][0] as { path: string }).path).toBe('users/u1/assignments/a1');
  });

  it('refuses data over the account limits before writing it, naming the field', async () => {
    const store = createFirestoreStore('u1');
    await expect(store.saveClass(makeClass('c1', { grade: 'A- (91.6%) after the unit 2 retake on Oct 3, see notes!' }))).rejects.toThrow(
      'This can’t be synced to your account: the current grade is too long (55 characters; an account can keep up to 50). Shorten it and save again.',
    );
    await expect(store.saveAssignment({ ...makeAssignment('a1'), notes: 'y'.repeat(60000) })).rejects.toThrow(/notes are too long \(60,000 characters/);
    await expect(store.saveProfile({ displayName: 'n'.repeat(101) })).rejects.toThrow(/name is too long/);
    // nothing reached the cache, so nothing rolls back later
    expect(fs.setDoc).not.toHaveBeenCalled();
    await store.saveClass(makeClass('c1', { grade: 'g'.repeat(50) }));
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
  });

  it('deletes documents by id', async () => {
    const store = createFirestoreStore('u1');
    await store.deleteClass('c9');
    await store.deleteAssignment('a9');
    expect(fs.deleteDoc.mock.calls.map((c) => (c[0] as { path: string }).path)).toEqual(['users/u1/classes/c9', 'users/u1/assignments/a9']);
  });

  it('maps snapshots, using the document id as the item id', () => {
    const store = createFirestoreStore('u1');
    const onProfile = vi.fn();
    const onClasses = vi.fn();
    store.subscribeProfile(onProfile);
    store.subscribeClasses(onClasses);
    fs.snapshots.get('users/u1')!.next({ data: () => undefined });
    expect(onProfile).toHaveBeenCalledWith(null);
    fs.snapshots.get('users/u1')!.next({ data: () => ({ schoolId: 'hsn', onboarded: true }) });
    expect(onProfile).toHaveBeenLastCalledWith({ schoolId: 'hsn', onboarded: true });
    fs.snapshots.get('users/u1/classes')!.next({ docs: [{ id: 'real', data: () => ({ ...makeClass('stale') }) }] });
    expect(onClasses.mock.calls[0][0][0].id).toBe('real');
  });

  it('passes friendly snapshot errors to onError and unsubscribes', () => {
    const store = createFirestoreStore('u1');
    const onError = vi.fn();
    const unsub = store.subscribeAssignments(vi.fn(), onError);
    fs.snapshots.get('users/u1/assignments')!.error!({ code: 'permission-denied' });
    expect(onError.mock.calls[0][0].message).toMatch(/access/);
    // the listener itself failed (and stopped), as opposed to a late save
    expect(onError.mock.calls[0][1]).toBe('listen');
    unsub();
    expect(fs.snapshots.has('users/u1/assignments')).toBe(false);
  });

  it('reports a write that fails after it was let through to live subscribers', async () => {
    vi.useFakeTimers();
    try {
      const store = createFirestoreStore('u1');
      const onError = vi.fn();
      const unsubs = [store.subscribeProfile(vi.fn(), onError), store.subscribeClasses(vi.fn(), onError)];
      const failLater = async () => {
        let fail!: (e: unknown) => void;
        fs.setDoc.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)));
        const saved = store.saveClass(makeClass('c1'));
        await vi.advanceTimersByTimeAsync(3000);
        await saved;
        fail({ code: 'permission-denied' });
        await vi.advanceTimersByTimeAsync(0);
      };
      await failLater();
      // one callback shared by two subscriptions is told once, as a failed save
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/didn’t accept this change/) }), 'save');
      unsubs[0]();
      unsubs[0]();
      // the other subscription still uses the same callback
      await failLater();
      expect(onError).toHaveBeenCalledTimes(2);
      unsubs[1]();
      await failLater();
      expect(onError).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('bulk operations', () => {
  it('copies local data in batches of at most BATCH_LIMIT writes', async () => {
    const classes = Array.from({ length: 500 }, (_, i) => makeClass('c' + i));
    const assignments = [makeAssignment('a1')];
    await copyLocalDataToAccount('u1', { profile: { dayOverrides: { '2026-10-09': { noSchool: true } } }, classes, assignments });
    expect(fs.batches).toHaveLength(2);
    expect(fs.batches[0].set).toHaveBeenCalledTimes(BATCH_LIMIT);
    expect(fs.batches[1].set).toHaveBeenCalledTimes(502 - BATCH_LIMIT);
    const [ref, data, opts] = fs.batches[0].set.mock.calls[0];
    expect(ref.path).toBe('users/u1');
    expect(data.dayOverrides).toEqual({ '2026-10-09': { noSchool: true } });
    expect(opts.mergeFields).toContain('dayOverrides');
    expect(fs.batches.every((b) => b.commit.mock.calls.length === 1)).toBe(true);
  });

  it('names a local class that is too big for the account instead of failing the whole copy blindly', async () => {
    const copy = copyLocalDataToAccount('u1', { profile: null, classes: [makeClass('c1'), makeClass('c2', { name: 'AP Chem', courseCode: 'x'.repeat(101) })], assignments: [makeAssignment('a1')] });
    await expect(copy).rejects.toThrow(/^Couldn’t copy the class “AP Chem” to your account: the course code is too long \(101 characters; an account can keep up to 100\)\. Sign out, shorten it/);
    expect(fs.batches).toHaveLength(0);
  });

  it('skips the profile when there is nothing to copy', async () => {
    await copyLocalDataToAccount('u1', { profile: {}, classes: [makeClass('c1')], assignments: [] });
    expect(fs.batches[0].set).toHaveBeenCalledTimes(1);
    expect(fs.batches[0].set.mock.calls[0][0].path).toBe('users/u1/classes/c1');
  });

  it('deletes every class, assignment and the profile', async () => {
    await deleteAllUserData('u1');
    const deleted = fs.batches.flatMap((b) => b.delete.mock.calls.map((c) => c[0].path));
    expect(deleted).toEqual(['users/u1/classes/x1', 'users/u1/classes/x2', 'users/u1/assignments/x1', 'users/u1/assignments/x2', 'users/u1']);
  });
});
