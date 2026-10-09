import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapRoom } from '../../types';
import RoomSearch from './RoomSearch';
import DirectionsList from './DirectionsList';

const room = (key: string, name: string, type = 'class', level = 0): MapRoom => ({ key, label: /^\d/.test(key) ? key : '', name, title: /^\d/.test(key) ? `Room ${key}` : name, type, level, R: [0, 0, 1, 1] });
const rooms = [room('214', 'Room 214', 'class', 1), room('210', 'Room 210', 'class', 1), room('108', 'Room 108'), room('Media Center', 'Media Center', 'media')];

describe('RoomSearch', () => {
  it('lists matches as a listbox and picks with the keyboard', () => {
    const onPick = vi.fn();
    render(<RoomSearch rooms={rooms} floorNames={['1st floor', '2nd floor']} label="Search rooms" onPick={onPick} />);
    const input = screen.getByRole('combobox', { name: 'Search rooms' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '21' } });
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Room 210Classroom · 2nd floor', 'Room 214Classroom · 2nd floor']);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(rooms[0]);
    expect(input).toHaveValue('');
  });

  it("finds rooms by the user's class names", () => {
    const onPick = vi.fn();
    render(<RoomSearch rooms={rooms} floorNames={['1st floor', '2nd floor']} label="Search rooms" classNames={new Map([['108', ['English 10']]])} onPick={onPick} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'english' } });
    const option = screen.getByRole('option');
    expect(option).toHaveTextContent('Room 108');
    expect(option).toHaveTextContent('English 10');
    fireEvent.click(option);
    expect(onPick).toHaveBeenCalledWith(rooms[2]);
  });

  it('says when nothing matches', () => {
    render(<RoomSearch rooms={rooms} floorNames={['1st floor']} label="Search rooms" onPick={() => {}} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText(/No rooms match/)).toBeInTheDocument();
  });
});

describe('DirectionsList', () => {
  it('shows the time, distance and steps, marks floor changes, and reports taps', () => {
    const onStep = vi.fn();
    const steps = [
      { kind: 'start' as const, level: 0, text: 'Enter through the Front entrance', at: { x: 0, z: 0 } },
      { kind: 'stairs' as const, level: 0, text: 'Take the W stairs up to the 2nd floor', at: { x: 1, z: 0 } },
      { kind: 'turn' as const, level: 1, text: 'Turn left and walk 20 m (70 ft)', distance: 20, at: { x: 2, z: 0 } },
      { kind: 'arrive' as const, level: 1, text: 'Room 214 is on your left', at: { x: 3, z: 0 } },
    ];
    render(<DirectionsList directions={{ steps, totalMeters: 153, minutes: 2 }} floorNames={['1st floor', '2nd floor']} onStep={onStep} />);
    expect(screen.getByText('2 min walk')).toBeInTheDocument();
    expect(screen.getByText(/150 m \(490 ft\)/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('2nd floor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Turn left/ }));
    expect(onStep).toHaveBeenCalledWith(steps[2]);
  });
});
