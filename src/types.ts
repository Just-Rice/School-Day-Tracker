// Shared data model. Everything a user owns (profile, classes, assignments) is stored per user,
// in Firestore when signed in or in localStorage in local mode. School data (bell schedules,
// calendars, maps) is static JSON under public/schools/<id>/.

export type SchoolId = 'hsn' | 'cms' | 'other';

/** 'YYYY-MM-DD' in the user's local time zone */
export type ISODate = string;
/** 'HH:MM', 24-hour */
export type ClockTime = string;

// ---------------------------------------------------------------------------------------------
// Bell schedules and the school calendar (public/schools/<id>/schedule.json)
// ---------------------------------------------------------------------------------------------

export type SlotKind = 'class' | 'lunch' | 'homeroom' | 'break' | 'other';

/** One block of time in a bell schedule. A class meets in every slot whose `period` it lists. */
export interface BellSlot {
  /** period id, matching SchoolSchedule.periods[].id (e.g. '1', '2', 'L', 'HR') */
  period: string;
  /** shown instead of the period's name, e.g. 'Lunch A' */
  label?: string;
  start: ClockTime;
  end: ClockTime;
  kind?: SlotKind;
}

/** A bell schedule variant: regular day, delayed opening, early dismissal, ... */
export interface Bell {
  id: string;
  name: string;
  /** slots per cycle day id; '*' applies to any cycle day without its own entry */
  days: Record<string, BellSlot[]>;
}

export interface CycleDay {
  id: string;
  name: string;
}

export interface NoSchoolDay {
  /** first day off */
  date: ISODate;
  /** last day off, inclusive (omit for a single day) */
  end?: ISODate;
  name: string;
}

export interface SpecialDay {
  date: ISODate;
  name?: string;
  /** bell to use instead of the default (e.g. 'early') */
  bell?: string;
  /** force this cycle day; the rotation continues from it */
  cycleDay?: string;
  /** false: a school day that doesn't advance the rotation */
  advance?: boolean;
}

export interface SchoolCalendar {
  firstDay: ISODate;
  lastDay: ISODate;
  /** the cycle day on a known school day; defaults to the first cycle day on firstDay */
  anchor?: { date: ISODate; cycleDay: string };
  noSchool: NoSchoolDay[];
  specialDays: SpecialDay[];
}

export interface SchoolSchedule {
  schoolId: SchoolId;
  schoolYear: string;
  /**
   * 'rotation': cycle days advance one per school day (Day 1, Day 2, ... / A, B).
   * 'weekday': cycle day ids are 'mon'..'fri' and follow the calendar week.
   */
  cycle: { mode: 'rotation' | 'weekday'; days: CycleDay[] };
  periods: { id: string; name: string; kind?: SlotKind }[];
  /** bells[0] is the regular schedule */
  bells: Bell[];
  calendar: SchoolCalendar;
  source?: { urls: string[]; note?: string; verified: boolean; retrieved?: ISODate };
}

/** The resolved schedule for one date */
export interface DayInfo {
  date: ISODate;
  isSchoolDay: boolean;
  /** why there's no school (holiday name, 'Weekend', 'Summer') */
  reason?: string;
  cycleDay?: CycleDay;
  bell?: Bell;
  slots: BellSlot[];
  /** names of special/override notes for the day */
  notes: string[];
}

/** Per-user changes to a single date, e.g. a snow day or "today is actually Day 3" */
export interface DayOverride {
  noSchool?: boolean;
  name?: string;
  cycleDay?: string;
  bell?: string;
}

// ---------------------------------------------------------------------------------------------
// User data
// ---------------------------------------------------------------------------------------------

export interface Profile {
  displayName?: string;
  schoolId: SchoolId;
  /** e.g. 9-12 at HSN, 6-8 at CMS */
  grade?: number;
  theme: 'system' | 'light' | 'dark';
  clock: '12h' | '24h';
  /** the user's own copy of a bell schedule/calendar, used instead of the school's when set */
  customSchedule?: SchoolSchedule;
  /** keyed by ISODate */
  dayOverrides: Record<ISODate, DayOverride>;
  /** finished the first-run setup */
  onboarded: boolean;
  updatedAt?: number;
}

export interface Teacher {
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  /** office / extra help room */
  office?: string;
  officeHours?: string;
}

export interface ClassRoom {
  /** room key in the school map (see MapRoom.key), when the school has a map */
  mapKey?: string;
  /** what the user calls it: '214', 'A104', 'Gym' */
  label: string;
  /** free text for schools without a map: building, wing, floor */
  where?: string;
}

export interface LinkItem {
  label: string;
  url: string;
}

export interface CustomField {
  key: string;
  value: string;
}

export type Term = 'full' | 'S1' | 'S2' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type CourseLevel = 'CP' | 'Honors' | 'AP' | 'Accelerated' | 'Other';

export interface ClassInfo {
  id: string;
  name: string;
  courseCode?: string;
  section?: string;
  level?: CourseLevel;
  teacher: Teacher;
  room: ClassRoom;
  /** period ids the class meets in (SchoolSchedule.periods[].id) */
  periods: string[];
  /** cycle day ids it meets on; empty/undefined = every day its periods meet */
  days?: string[];
  /** a different room on some days (labs, gym) */
  altRooms?: { days: string[]; room: ClassRoom }[];
  term: Term;
  credits?: number;
  /** hex color */
  color: string;
  /** short emoji or symbol */
  icon?: string;
  links: LinkItem[];
  materials?: string;
  gradingPolicy?: string;
  /** current grade as the user writes it, e.g. 'A-' or '94' */
  grade?: string;
  notes?: string;
  customFields: CustomField[];
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type AssignmentType = 'homework' | 'test' | 'quiz' | 'project' | 'essay' | 'reading' | 'lab' | 'other';
export type Priority = 'low' | 'medium' | 'high';
export type AssignmentStatus = 'todo' | 'in_progress' | 'done';

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

export interface Assignment {
  id: string;
  /** null for assignments not tied to a class */
  classId: string | null;
  title: string;
  type: AssignmentType;
  dueDate: ISODate;
  dueTime?: ClockTime;
  priority: Priority;
  status: AssignmentStatus;
  notes?: string;
  links: LinkItem[];
  subtasks: Subtask[];
  estimatedMinutes?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------------------------
// School maps (public/schools/<id>/map.json, exported from the hsn-3d / cms-3d repos by
// tools/extract-school-map.mjs). Coordinates are the 3D model's world meters (x, z).
// ---------------------------------------------------------------------------------------------

export type Rect = [number, number, number, number]; // x0, z0, x1, z1

export interface MapRoomRaw {
  label: string;
  name: string;
  type: string;
  level: number;
  R: Rect;
  big?: boolean;
  /** walkable point just inside the room's door, where routes end */
  target?: [number, number];
  /** route length in meters from the main entrance */
  fromEntrance?: number;
  doors?: { axis: 'x' | 'z'; c: number; a: number; b: number }[];
}

export interface SchoolMapData {
  id: SchoolId;
  source: string;
  grid: { X0: number; Z0: number; CS: number; NX: number; NZ: number };
  levelH: number;
  /** per level, base64 bit-packed: bit i set = cell i is blocked */
  blocked: string[];
  /** base64 Int8 per level-0 cell: ground height in decimeters */
  heights: string;
  stairs: { id: string; a: [number, number]; b: [number, number]; cost: number; via: [number, number, number][] }[];
  rooms: MapRoomRaw[];
  /** per level: [axis, c, p, q]; axis 'z' = wall along z = c from x = p to q, 'x' = along x = c from z = p to q */
  walls: [('x' | 'z'), number, number, number][][];
  blocks: Rect[];
  /** footprint of the second floor */
  level1: Rect[];
  courtyards: Rect[];
  zones: { name: string; level: number; R: Rect }[];
  entrances: { name: string; main: boolean; x: number; z: number }[];
  /** outside the main entrance, where "from the front entrance" routes start */
  spawn: [number, number];
}

/** A map room with a stable key, as used by the app */
export interface MapRoom extends MapRoomRaw {
  /** unique within the school: the label when unique, otherwise label/name plus level and index */
  key: string;
  /** display title: 'Room 214', 'Media Center' */
  title: string;
}
