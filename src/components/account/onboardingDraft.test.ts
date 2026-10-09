import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, draftFromProfile, loadDraft, saveDraft } from './onboardingDraft';

beforeEach(() => sessionStorage.clear());

describe('onboarding draft', () => {
  it('survives a trip to the sign-in page', () => {
    saveDraft({ step: 3, schoolId: 'cms', grade: 7, displayName: 'Ana' });
    expect(loadDraft()).toEqual({ step: 3, schoolId: 'cms', grade: 7, displayName: 'Ana' });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('ignores damaged drafts', () => {
    sessionStorage.setItem('sdt:v1:onboarding', '{"schoolId":"nope"}');
    expect(loadDraft()).toBeNull();
    sessionStorage.setItem('sdt:v1:onboarding', 'not json');
    expect(loadDraft()).toBeNull();
    sessionStorage.setItem('sdt:v1:onboarding', '{"schoolId":"hsn","step":9,"grade":"x"}');
    expect(loadDraft()).toEqual({ step: 1, schoolId: 'hsn', grade: undefined, displayName: '' });
  });
});

describe('draftFromProfile', () => {
  it('starts from a finished local setup', () => {
    expect(draftFromProfile({ schoolId: 'cms', grade: 8, displayName: 'Ana', onboarded: true })).toEqual({ step: 1, schoolId: 'cms', grade: 8, displayName: 'Ana' });
  });
  it('ignores missing or unfinished profiles', () => {
    expect(draftFromProfile(null)).toBeNull();
    expect(draftFromProfile({ schoolId: 'cms', onboarded: false })).toBeNull();
  });
});
