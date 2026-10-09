import type { SchoolId } from '../../types';
import { SCHOOLS } from '../../schools';

/** grade choices for a school; schools without a known range get middle and high school */
export function gradeOptions(id: SchoolId): number[] {
  const [lo, hi] = SCHOOLS[id]?.grades ?? [6, 12];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** the grade if the school has it, else undefined (e.g. grade 11 after switching to CMS) */
export function gradeFor(id: SchoolId, grade: number | undefined): number | undefined {
  return grade !== undefined && gradeOptions(id).includes(grade) ? grade : undefined;
}

export function gradeLabel(g: number): string {
  const suffix = g % 100 >= 11 && g % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][g % 10] ?? 'th');
  return `${g}${suffix} grade`;
}
