// The shipped school data must load cleanly in the app's own engine.
import fs from 'node:fs';
import path from 'node:path';
import type { SchoolSchedule } from '../types';
import { resolveDay, validateSchedule } from './schedule';
import { addDays } from './dates';

const dir = path.resolve(__dirname, '../../public/schools');

describe.each(['hsn', 'cms', 'other'])('%s schedule.json', (id) => {
  const s = JSON.parse(fs.readFileSync(path.join(dir, id, 'schedule.json'), 'utf8')) as SchoolSchedule;

  it('has no validation problems', () => {
    expect(validateSchedule(s)).toEqual([]);
  });

  it('gives every school day a cycle day and class slots', () => {
    let schoolDays = 0;
    for (let d = s.calendar.firstDay; d <= s.calendar.lastDay; d = addDays(d, 1)) {
      const day = resolveDay(s, d);
      if (!day.isSchoolDay) continue;
      schoolDays++;
      expect(day.cycleDay, d).toBeDefined();
      expect(day.slots.length, d).toBeGreaterThan(0);
    }
    expect(schoolDays).toBeGreaterThan(170);
  });
});
