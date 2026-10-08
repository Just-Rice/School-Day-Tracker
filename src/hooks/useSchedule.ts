// CONTRACT (other features import this; keep the signatures):
//   useSchedule() -> ScheduleState for the signed-in user's school (or their custom schedule),
//   with their day overrides applied.
//   useNow(intervalMs) -> a Date that re-renders the component every intervalMs.
//   classesOnDay(day, classes) -> the class meetings of a DayInfo, in time order.
// The schedule feature replaces the placeholder logic below.
import { useEffect, useState } from 'react';
import type { BellSlot, ClassInfo, ClassRoom, DayInfo, ISODate, SchoolSchedule } from '../types';

export interface ScheduleState {
  /** the schedule in effect: profile.customSchedule ?? the school's schedule.json */
  schedule: SchoolSchedule | null;
  loading: boolean;
  error: string | null;
  /** resolved day for a date (cycle day, bell, slots), with the user's overrides */
  getDay(date: ISODate): DayInfo;
}

export interface Meeting {
  slot: BellSlot;
  /** undefined for slots no class is in (lunch, free periods) */
  cls?: ClassInfo;
  /** the room for this meeting (altRooms applied) */
  room?: ClassRoom;
}

export function useSchedule(): ScheduleState {
  return {
    schedule: null,
    loading: false,
    error: null,
    getDay: (date) => ({ date, isSchoolDay: false, reason: 'Schedule not loaded', slots: [], notes: [] }),
  };
}

export function useNow(intervalMs = 15000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function classesOnDay(day: DayInfo, classes: ClassInfo[]): Meeting[] {
  return day.slots.map((slot) => {
    const cls = classes.find((c) => !c.archived && c.periods.includes(slot.period) && (!c.days?.length || (day.cycleDay && c.days.includes(day.cycleDay.id))));
    return { slot, cls, room: cls?.room };
  });
}
