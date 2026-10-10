// Today's "Homework due" card on a Friday: the next school day is Monday.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assignment, Profile, SchoolSchedule } from '../types';

const h = vi.hoisted(() => ({ assignments: [] as Assignment[] }));
const PROFILE: Profile = { schoolId: 'other', theme: 'system', clock: '12h', dayOverrides: {}, onboarded: true };
vi.mock('../data/DataProvider', () => ({
  useData: () => ({ profile: PROFILE, classes: [], assignments: h.assignments, saveAssignment: async () => {} }),
}));

const SCHEDULE: SchoolSchedule = {
  schoolId: 'other',
  schoolYear: '2026-2027',
  cycle: { mode: 'weekday', days: ['mon', 'tue', 'wed', 'thu', 'fri'].map((id) => ({ id, name: id })) },
  periods: [{ id: '1', name: 'Period 1' }],
  bells: [{ id: 'regular', name: 'Regular day', days: { '*': [{ period: '1', start: '08:00', end: '08:50' }] } }],
  calendar: { firstDay: '2026-09-01', lastDay: '2027-06-18', noSchool: [{ date: '2026-11-25', end: '2026-11-27', name: 'Thanksgiving' }], specialDays: [] },
};
vi.mock('../schools', async (load) => ({ ...(await load<typeof import('../schools')>()), loadSchoolSchedule: async () => SCHEDULE }));

import HomeworkDueCard from './HomeworkDueCard';

const hw = (id: string, title: string, dueDate: string): Assignment => ({
  id,
  classId: null,
  title,
  type: 'test',
  dueDate,
  priority: 'high',
  status: 'todo',
  links: [],
  subtasks: [],
  createdAt: 1,
  updatedAt: 1,
});

function renderAt(now: Date) {
  vi.setSystemTime(now);
  render(
    <MemoryRouter>
      <HomeworkDueCard days={2} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('HomeworkDueCard', () => {
  it("shows Monday's work on a Friday", async () => {
    h.assignments = [hw('a', 'Unit 2 test', '2026-10-12'), hw('b', 'Essay draft', '2026-10-14')];
    renderAt(new Date(2026, 9, 9, 10)); // Fri Oct 9
    expect(await screen.findByText('Unit 2 test')).toBeInTheDocument();
    expect(screen.queryByText('Essay draft')).not.toBeInTheDocument();
  });

  it('says how far it looked when nothing is due', async () => {
    h.assignments = [hw('b', 'Essay draft', '2026-10-14')];
    renderAt(new Date(2026, 9, 9, 10));
    expect(await screen.findByText(/Nothing due through Monday/)).toBeInTheDocument();
  });

  it('reaches the first day back after a break', async () => {
    h.assignments = [hw('a', 'Lab report', '2026-11-30')];
    renderAt(new Date(2026, 10, 24, 10)); // Tue before Thanksgiving break
    expect(await screen.findByText('Lab report')).toBeInTheDocument();
  });

  it('keeps the usual two days midweek', async () => {
    h.assignments = [hw('a', 'Quiz', '2026-10-08'), hw('b', 'Reading', '2026-10-09')];
    renderAt(new Date(2026, 9, 6, 10)); // Tue Oct 6: through Thu Oct 8
    expect(await screen.findByText('Quiz')).toBeInTheDocument();
    expect(screen.queryByText('Reading')).not.toBeInTheDocument();
  });
});
