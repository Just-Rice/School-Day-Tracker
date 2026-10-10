// The data jobs behind Settings → Data and the "copy this device's data" banner.
import type { Assignment, ClassInfo, Profile } from '../../types';
import type { DataStore } from '../../data/store';
import { localStore } from '../../data/localStore';
import { copyLocalDataToAccount } from '../../data/firestoreStore';
import { changedByMerge, planImport, planProfile, profileMergeFields, type BackupData } from '../../lib/backup';
import { stampMapSchool } from '../../lib/mapData';

export interface CurrentData {
  profile: Profile;
  classes: ClassInfo[];
  assignments: Assignment[];
}

export interface ImportResult {
  saved: number;
  deleted: number;
  profileChanged: boolean;
}

/**
 * Applies a parsed backup through the active store (local or account). Uses the store directly,
 * not DataProvider's save functions, so items keep their own updatedAt and later merges stay
 * accurate.
 */
export async function applyImport(store: DataStore, current: CurrentData, incoming: BackupData, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const plan = planImport(current, incoming, mode);
  const profile = planProfile(current.profile, incoming.profile, mode);
  if (profile) await store.saveProfile(profile);
  await Promise.all([
    ...plan.saveClasses.map((c) => store.saveClass(c)),
    ...plan.saveAssignments.map((a) => store.saveAssignment(a)),
    ...plan.deleteClasses.map((id) => store.deleteClass(id)),
    ...plan.deleteAssignments.map((id) => store.deleteAssignment(id)),
  ]);
  return {
    saved: plan.saveClasses.length + plan.saveAssignments.length,
    deleted: plan.deleteClasses.length + plan.deleteAssignments.length,
    profileChanged: !!profile,
  };
}

/** What copying this device's local data into the signed-in account would write. */
export function planDeviceCopy(local: ReturnType<typeof localStore.snapshot>, current: CurrentData) {
  // the account may be at another school: room links from before rooms kept their map's school
  // are on this device's school's map
  const from = local.profile?.schoolId;
  const classes = from ? local.classes.map((c) => stampMapSchool(c, from)) : local.classes;
  return {
    profile: profileMergeFields(local.profile, current.profile),
    classes: changedByMerge(current.classes, classes),
    assignments: changedByMerge(current.assignments, local.assignments),
  };
}

/** Copies this device's local data into users/{uid}; returns how many items were written. */
export async function copyDeviceToAccount(uid: string, current: CurrentData): Promise<{ classes: number; assignments: number }> {
  const plan = planDeviceCopy(localStore.snapshot(), current);
  await copyLocalDataToAccount(uid, plan);
  return { classes: plan.classes.length, assignments: plan.assignments.length };
}

/**
 * Whether to offer copying this device's local data into the account right after sign-in:
 * only into an empty account (so it never looks like the account lost something), and only
 * when there's something to copy and the student hasn't said no.
 */
export function shouldOfferDeviceCopy(s: { accountStore: boolean; loading: boolean; accountItems: number; localItems: number; dismissed: boolean }): boolean {
  return s.accountStore && !s.loading && !s.dismissed && s.accountItems === 0 && s.localItems > 0;
}

/** "N classes and M assignments" without the zero parts */
export function countPhrase(classes: number, assignments: number): string {
  const parts: string[] = [];
  if (classes) parts.push(`${classes} ${classes === 1 ? 'class' : 'classes'}`);
  if (assignments) parts.push(`${assignments} ${assignments === 1 ? 'assignment' : 'assignments'}`);
  return parts.join(' and ') || 'nothing new';
}
