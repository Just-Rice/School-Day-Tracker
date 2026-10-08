import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ClassInfo, SchoolSchedule } from '../../types';
import { classesOnDay, resolveDay } from '../../lib/schedule';
import NowCard, { directionsPath } from './NowCard';
import DayTimeline from './DayTimeline';

const schedule: SchoolSchedule = {
  schoolId: 'hsn',
  schoolYear: '2026-2027',
  cycle: { mode: 'rotation', days: [{ id: 'A', name: 'A Day' }, { id: 'B', name: 'B Day' }] },
  periods: [
    { id: '1', name: 'Period 1' },
    { id: '2', name: 'Period 2' },
    { id: 'L', name: 'Lunch', kind: 'lunch' },
    { id: '3', name: 'Period 3' },
  ],
  bells: [
    {
      id: 'regular',
      name: 'Regular day',
      days: {
        '*': [
          { period: '1', start: '08:00', end: '09:00' },
          { period: '2', start: '09:05', end: '10:05' },
          { period: 'L', start: '10:05', end: '10:35' },
          { period: '3', start: '10:40', end: '11:40' },
        ],
      },
    },
  ],
  calendar: { firstDay: '2026-09-08', lastDay: '2027-06-18', noSchool: [{ date: '2026-10-12', name: 'Columbus Day' }], specialDays: [] },
};

const cls = (id: string, name: string, period: string, mapKey?: string): ClassInfo => ({
  id,
  name,
  periods: [period],
  teacher: { name: 'Ms. Lee' },
  room: { label: mapKey ?? 'Gym', mapKey },
  term: 'full',
  color: '#2563eb',
  links: [],
  customFields: [],
  createdAt: 0,
  updatedAt: 0,
});
const classes = [cls('m', 'Algebra II', '1', '214'), cls('e', 'English', '3', '108')];

function renderAt(date: string, h: number, m: number, hasMap = true) {
  const day = resolveDay(schedule, date);
  const next = resolveDay(schedule, '2026-10-09');
  return render(
    <MemoryRouter>
      <NowCard day={day} meetings={classesOnDay(day, classes)} schedule={schedule} today={date} minutes={h * 60 + m} clock="12h" hasMap={hasMap} upcoming={{ day: next, meetings: classesOnDay(next, classes) }} />
    </MemoryRouter>,
  );
}

describe('directionsPath', () => {
  it('builds map links and skips rooms without a map key or where you already are', () => {
    expect(directionsPath(undefined, { label: '214', mapKey: '214' })).toBe('/map?from=entrance&to=214');
    expect(directionsPath('108', { label: 'A 1', mapKey: 'A 1' })).toBe('/map?from=108&to=A+1');
    expect(directionsPath('214', { label: '214', mapKey: '214' })).toBeNull();
    expect(directionsPath(undefined, { label: 'Gym' })).toBeNull();
  });
});

describe('NowCard', () => {
  it('shows the current class, time left and the next slot', () => {
    renderAt('2026-10-08', 8, 48);
    expect(screen.getByText('Algebra II')).toBeInTheDocument();
    expect(screen.getByText(/in 12 min/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
    expect(screen.getByText('Period 2')).toBeInTheDocument();
    // period 2 has no class; directions go to the next class with a room on the map
    expect(screen.getByRole('link', { name: /Directions to Room 108/ })).toHaveAttribute('href', '/map?from=214&to=108');
  });

  it('shows passing time with a countdown', () => {
    renderAt('2026-10-08', 10, 37);
    expect(screen.getByText('Next: English')).toBeInTheDocument();
    expect(screen.getByText(/in 3 min/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Directions to Room 108/ })).toHaveAttribute('href', '/map?from=214&to=108');
  });

  it('counts down to the first class before school, with directions from the entrance', () => {
    renderAt('2026-10-08', 7, 30);
    expect(screen.getByText('Algebra II')).toBeInTheDocument();
    expect(screen.getByText(/in 30 min/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /from the entrance to Room 214/ })).toHaveAttribute('href', '/map?from=entrance&to=214');
  });

  it("says school's out and shows the next school day's first class", () => {
    renderAt('2026-10-08', 15, 0);
    expect(screen.getByText("School's out")).toBeInTheDocument();
    expect(screen.getByText(/Next school day · Tomorrow \(B Day\)/)).toBeInTheDocument();
    expect(screen.getByText(/First class at 8:00 AM in Room 214/)).toBeInTheDocument();
  });

  it('explains days off', () => {
    renderAt('2026-10-12', 9, 0);
    expect(screen.getByText('No school today')).toBeInTheDocument();
    expect(screen.getByText('Columbus Day')).toBeInTheDocument();
  });

  it('hides directions for schools without a map', () => {
    renderAt('2026-10-08', 7, 30, false);
    expect(screen.queryByRole('link', { name: /Directions/ })).toBeNull();
  });
});

describe('DayTimeline', () => {
  it('links classes, marks the current slot and dims past ones', () => {
    const day = resolveDay(schedule, '2026-10-08');
    render(
      <MemoryRouter>
        <DayTimeline meetings={classesOnDay(day, classes)} schedule={schedule} clock="24h" minutes={9 * 60 + 30} current={classesOnDay(day, classes)[1]} />
      </MemoryRouter>,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveClass('is-past');
    expect(screen.getByRole('link', { name: /Algebra II/ })).toHaveAttribute('href', '/classes/m');
    expect(screen.getByText('Lunch').closest('li')).toHaveClass('is-break');
    expect(screen.getByText('08:00')).toBeInTheDocument();
  });
});
