import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ClassInfo, ClassRoom, SchoolId, SchoolSchedule } from '../../types';
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

const cls = (id: string, name: string, period: string, mapKey?: string, mapSchool?: SchoolId): ClassInfo => ({
  id,
  name,
  periods: [period],
  teacher: { name: 'Ms. Lee' },
  room: { label: mapKey ?? 'Gym', mapKey, mapSchool },
  term: 'full',
  color: '#2563eb',
  links: [],
  customFields: [],
  createdAt: 0,
  updatedAt: 0,
});
const classes = [cls('m', 'Algebra II', '1', '214'), cls('e', 'English', '3', '108')];

function renderAt(date: string, h: number, m: number, schoolId: SchoolId = 'hsn', list = classes) {
  const day = resolveDay(schedule, date);
  const next = resolveDay(schedule, '2026-10-09');
  return render(
    <MemoryRouter>
      <NowCard day={day} meetings={classesOnDay(day, list)} schedule={schedule} today={date} minutes={h * 60 + m} clock="12h" schoolId={schoolId} upcoming={{ day: next, meetings: classesOnDay(next, list) }} />
    </MemoryRouter>,
  );
}

describe('directionsPath', () => {
  const room = (mapKey: string, mapSchool?: SchoolId): ClassRoom => ({ label: mapKey, mapKey, mapSchool });

  it('builds map links and skips rooms without a map key or where you already are', () => {
    expect(directionsPath(undefined, room('214'), 'hsn')).toBe('/map?from=entrance&to=214');
    expect(directionsPath(room('108'), room('A 1'), 'hsn')).toBe('/map?from=108&to=A+1');
    expect(directionsPath(room('214'), room('214'), 'hsn')).toBeNull();
    expect(directionsPath(undefined, { label: 'Gym' }, 'hsn')).toBeNull();
  });

  it("only uses rooms linked to the school's own map", () => {
    // 214 is a room at both schools: one picked at CMS isn't HSN's 214
    expect(directionsPath(undefined, room('214', 'cms'), 'hsn')).toBeNull();
    expect(directionsPath(undefined, room('214', 'cms'), 'cms')).toBe('/map?from=entrance&to=214');
    expect(directionsPath(room('108', 'cms'), room('214', 'hsn'), 'hsn')).toBe('/map?from=entrance&to=214');
    expect(directionsPath(room('214', 'cms'), room('214', 'hsn'), 'hsn')).toBe('/map?from=entrance&to=214');
    expect(directionsPath(room('108', 'hsn'), room('214', 'hsn'), 'hsn')).toBe('/map?from=108&to=214');
    // links from before rooms kept their school belong to the current one
    expect(directionsPath(room('108'), room('214'), 'cms')).toBe('/map?from=108&to=214');
    expect(directionsPath(undefined, room('214', 'hsn'), 'other')).toBeNull();
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
    renderAt('2026-10-08', 7, 30, 'other');
    expect(screen.queryByRole('link', { name: /Directions/ })).toBeNull();
  });

  it("doesn't send you to a room picked on another school's map", () => {
    const cmsMath = cls('m', 'Algebra II', '1', '214', 'cms');
    // the next class's room is CMS's 214, which isn't HSN's 214
    renderAt('2026-10-08', 7, 30, 'hsn', [cmsMath, cls('e', 'English', '3', '108', 'hsn')]);
    expect(screen.queryByRole('link', { name: /Directions/ })).toBeNull();
    // and you aren't in HSN's 214 during it: directions start at the entrance
    renderAt('2026-10-08', 10, 37, 'hsn', [cmsMath, cls('e', 'English', '3', '108', 'hsn')]);
    expect(screen.getByRole('link', { name: /from the entrance to Room 108/ })).toHaveAttribute('href', '/map?from=entrance&to=108');
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
