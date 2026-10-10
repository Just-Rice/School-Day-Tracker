import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SchoolSchedule } from '../../types';
import ScheduleEditor from './ScheduleEditor';

const initial: SchoolSchedule = {
  schoolId: 'other',
  schoolYear: '2026-2027',
  cycle: { mode: 'rotation', days: [{ id: 'A', name: 'A Day' }, { id: 'B', name: 'B Day' }] },
  periods: [
    { id: '1', name: 'Period 1' },
    { id: '2', name: 'Period 2' },
  ],
  bells: [
    {
      id: 'regular',
      name: 'Regular day',
      days: {
        '*': [
          { period: '1', start: '08:00', end: '08:50' },
          { period: '2', start: '08:55', end: '09:45' },
        ],
      },
    },
  ],
  calendar: { firstDay: '2026-09-08', lastDay: '2027-06-18', noSchool: [], specialDays: [] },
};

function setup() {
  const onSave = vi.fn(async () => {});
  render(<ScheduleEditor initial={initial} today="2026-10-09" ask={vi.fn()} onSave={onSave} onCancel={vi.fn()} />);
  const saveButtons = () => screen.getAllByRole('button', { name: 'Save' });
  return { onSave, saveButtons };
}

describe('ScheduleEditor', () => {
  it("can't save with a blank start or end time", () => {
    const { onSave, saveButtons } = setup();
    fireEvent.change(screen.getByLabelText('Period 1 start'), { target: { value: '' } });
    for (const b of saveButtons()) expect(b).toBeDisabled();
    expect(screen.getAllByText('Fill in every start and end time to save').length).toBeGreaterThan(0);
    fireEvent.click(saveButtons()[0]);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Period 1 start'), { target: { value: '08:05' } });
    for (const b of saveButtons()) expect(b).toBeEnabled();
  });

  it('passes the ids renamed while editing to onSave', () => {
    const { onSave, saveButtons } = setup();
    const id = screen.getByLabelText('ID of Period 1');
    fireEvent.change(id, { target: { value: 'P1' } });
    fireEvent.blur(id);
    fireEvent.click(saveButtons()[0]);
    expect(onSave).toHaveBeenCalledTimes(1);
    const [saved, renames] = onSave.mock.calls[0] as unknown as [SchoolSchedule, unknown];
    expect(saved.periods[0].id).toBe('P1');
    expect(saved.bells[0].days['*'][0].period).toBe('P1');
    expect(renames).toEqual({ period: { '1': 'P1' }, cycleDay: {}, bell: {} });
  });
});
