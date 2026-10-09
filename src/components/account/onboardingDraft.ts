// The first-run choices, kept in sessionStorage while the student signs in (a Google redirect
// or a trip to /login would otherwise throw them away).
import type { SchoolId } from '../../types';

export interface OnboardingDraft {
  step: 1 | 2 | 3;
  schoolId: SchoolId;
  grade?: number;
  displayName: string;
}

const KEY = 'sdt:v1:onboarding';

export function loadDraft(): OnboardingDraft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<OnboardingDraft> | null;
    if (!d || !['hsn', 'cms', 'other'].includes(d.schoolId as string)) return null;
    return {
      step: d.step === 2 || d.step === 3 ? d.step : 1,
      schoolId: d.schoolId as SchoolId,
      grade: typeof d.grade === 'number' ? d.grade : undefined,
      displayName: typeof d.displayName === 'string' ? d.displayName : '',
    };
  } catch {
    return null;
  }
}

export function saveDraft(d: OnboardingDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // storage blocked: the draft just won't survive a reload
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
