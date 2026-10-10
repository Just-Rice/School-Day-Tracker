// The most a signed-in account can store in one text field or list. These mirror the size checks
// in firestore.rules (limits.test.ts reads the rules to keep the two in step). Firestore refuses a
// write over a limit with a bare permission-denied, so FirestoreStore checks first and names the
// field instead, and backups are fitted to them on import. Local mode has no limits of its own.
//
// Text is measured in UTF-16 code units: String.length here, and string.size() in the rules.

export const CLASS_TEXT = { name: 300, courseCode: 100, section: 100, level: 20, term: 10, color: 32, icon: 32, materials: 50000, gradingPolicy: 50000, grade: 50, notes: 50000 } as const;
export const CLASS_LISTS = { periods: 50, days: 50, altRooms: 50, links: 100, customFields: 100 } as const;
export const ASSIGNMENT_TEXT = { title: 500, classId: 200, dueTime: 5, notes: 50000 } as const;
export const ASSIGNMENT_LISTS = { links: 100, subtasks: 300 } as const;
export const PROFILE_TEXT = { displayName: 100 } as const;
export const PROFILE_MAPS = { dayOverrides: 1000 } as const;

type Kind = 'class' | 'assignment' | 'profile';

const TEXT: Record<Kind, Record<string, number>> = { class: CLASS_TEXT, assignment: ASSIGNMENT_TEXT, profile: PROFILE_TEXT };
const LISTS: Record<Kind, Record<string, number>> = { class: CLASS_LISTS, assignment: ASSIGNMENT_LISTS, profile: {} };
const MAPS: Record<Kind, Record<string, number>> = { class: {}, assignment: {}, profile: PROFILE_MAPS };

/** what the fields are called in the forms, lower case */
const LABELS: Record<string, string> = {
  name: 'class name',
  courseCode: 'course code',
  section: 'section',
  level: 'level',
  term: 'term',
  color: 'color',
  icon: 'icon',
  materials: 'materials to bring',
  gradingPolicy: 'grading policy',
  grade: 'current grade',
  notes: 'notes',
  title: 'title',
  classId: 'class',
  dueTime: 'due time',
  displayName: 'name',
  periods: 'periods',
  days: 'days',
  altRooms: 'other rooms',
  links: 'links',
  customFields: 'details',
  subtasks: 'steps',
  dayOverrides: 'day changes',
};

export interface LimitProblem {
  field: string;
  /** e.g. 'current grade' */
  label: string;
  /** a text field (characters) or a list / map (entries) */
  list: boolean;
  size: number;
  max: number;
}

/** The first field of a class, assignment or profile (patch) that's over an account limit, or null. */
export function overAccountLimit(kind: Kind, d: object): LimitProblem | null {
  const v = d as Record<string, unknown>;
  const problem = (field: string, list: boolean, size: number, max: number) => (size > max ? { field, label: LABELS[field] ?? field, list, size, max } : null);
  for (const [field, max] of Object.entries(TEXT[kind])) {
    const x = v[field];
    const p = typeof x === 'string' ? problem(field, false, x.length, max) : null;
    if (p) return p;
  }
  for (const [field, max] of Object.entries(LISTS[kind])) {
    const x = v[field];
    const p = Array.isArray(x) ? problem(field, true, x.length, max) : null;
    if (p) return p;
  }
  for (const [field, max] of Object.entries(MAPS[kind])) {
    const x = v[field];
    const p = x && typeof x === 'object' ? problem(field, true, Object.keys(x).length, max) : null;
    if (p) return p;
  }
  return null;
}

const n = (x: number) => x.toLocaleString('en-US');
const PLURAL = new Set(['notes', 'materials to bring']);

/** e.g. 'the current grade is too long (55 characters; an account can keep up to 50)' */
export function describeLimitProblem(p: LimitProblem): string {
  return p.list
    ? `there are too many ${p.label} (${n(p.size)}; an account can keep up to ${n(p.max)})`
    : `the ${p.label} ${PLURAL.has(p.label) ? 'are' : 'is'} too long (${n(p.size)} characters; an account can keep up to ${n(p.max)})`;
}

/** An Error for a save that's over a limit, fit for the form's error message. */
export function limitError(p: LimitProblem): Error {
  const what = describeLimitProblem(p);
  return new Error(`This can’t be synced to your account: ${what}. ${p.list ? 'Remove some' : 'Shorten it'} and save again.`);
}
