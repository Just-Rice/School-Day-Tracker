// LocalStore merges partial writes the same way FirestoreStore does.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Assignment, Profile } from '../types';
import { LocalStore } from './localStore';

const hw = (p: Partial<Assignment> = {}): Assignment => ({
  id: 'a1', classId: 'c1', title: 'Read ch. 4', type: 'reading', dueDate: '2026-10-14', priority: 'medium', status: 'todo', links: [], subtasks: [], createdAt: 1, updatedAt: 1, ...p,
});

describe('LocalStore', () => {
  beforeEach(() => localStorage.clear());

  const read = <T,>(s: LocalStore, k: 'assignments' | 'profile') => s.snapshot()[k] as T;

  it('writes only the changed fields of an existing item', async () => {
    const s = new LocalStore('t1');
    await s.saveAssignment(hw());
    // another tab renames it and moves the due date...
    await s.saveAssignment(hw({ title: 'Read ch. 4 and 5', dueDate: '2026-10-16', updatedAt: 2 }), ['title', 'dueDate', 'updatedAt']);
    // ...while this one, holding the old copy, only ticks it done
    await s.saveAssignment(hw({ status: 'done', completedAt: 3, updatedAt: 3 }), ['status', 'completedAt', 'updatedAt']);
    expect(read<Assignment[]>(s, 'assignments')).toEqual([hw({ title: 'Read ch. 4 and 5', dueDate: '2026-10-16', status: 'done', completedAt: 3, updatedAt: 3 })]);
  });

  it('removes a changed field missing from the new value', async () => {
    const s = new LocalStore('t2');
    await s.saveAssignment(hw({ status: 'done', completedAt: 5 }));
    await s.saveAssignment(hw({ status: 'todo' }), ['status', 'completedAt']);
    expect(read<Assignment[]>(s, 'assignments')[0]).not.toHaveProperty('completedAt');
  });

  it('saves day changes per date when told which dates changed', async () => {
    const s = new LocalStore('t3');
    await s.saveProfile({ dayOverrides: { '2026-10-20': { bell: 'early' } } });
    // a stale copy that never saw 10-20 adds a snow day on 10-14
    await s.saveProfile({ dayOverrides: { '2026-10-14': { noSchool: true } } }, ['2026-10-14']);
    expect(read<Profile>(s, 'profile').dayOverrides).toEqual({ '2026-10-20': { bell: 'early' }, '2026-10-14': { noSchool: true } });
    // removing one date leaves the other
    await s.saveProfile({ dayOverrides: {} }, ['2026-10-20']);
    expect(read<Profile>(s, 'profile').dayOverrides).toEqual({ '2026-10-14': { noSchool: true } });
  });
});
