import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import UpdateToast, { OFFLINE_READY_MS, UPDATE_CHECK_MS, watchForUpdates } from './UpdateToast';

// The real module registers a service worker; this stand-in starts in whatever state a test sets.
const sw = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  update: vi.fn(async (_reload?: boolean) => {}),
  options: undefined as RegisterSWOptions | undefined,
}));

vi.mock('virtual:pwa-register/react', async () => {
  const { useState } = await import('react');
  return {
    useRegisterSW(options?: RegisterSWOptions) {
      sw.options = options;
      return { needRefresh: useState(sw.needRefresh), offlineReady: useState(sw.offlineReady), updateServiceWorker: sw.update };
    },
  };
});

beforeEach(() => {
  sw.needRefresh = false;
  sw.offlineReady = false;
  sw.update.mockClear();
  sw.options = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UpdateToast', () => {
  it('shows nothing until the service worker has news', () => {
    render(<UpdateToast />);
    expect(screen.queryByRole('button')).toBeNull();
    // the live region is there from the start so later messages get announced
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('offers a reload when a new version is waiting', () => {
    sw.needRefresh = true;
    render(<UpdateToast />);
    expect(screen.getByText('A new version is available.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(sw.update).toHaveBeenCalledWith(true);
  });

  it('can put the update off', () => {
    sw.needRefresh = true;
    render(<UpdateToast />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText('A new version is available.')).toBeNull();
    expect(sw.update).not.toHaveBeenCalled();
  });

  it('says when the app is ready offline, then hides the note by itself', () => {
    vi.useFakeTimers();
    sw.offlineReady = true;
    render(<UpdateToast />);
    expect(screen.getByText('Ready to work offline.')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(OFFLINE_READY_MS - 1));
    expect(screen.getByText('Ready to work offline.')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Ready to work offline.')).toBeNull();
  });

  it('lets the offline note be closed right away', () => {
    sw.offlineReady = true;
    render(<UpdateToast />);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText('Ready to work offline.')).toBeNull();
  });

  it('prefers the update prompt over the offline note', () => {
    sw.needRefresh = true;
    sw.offlineReady = true;
    render(<UpdateToast />);
    expect(screen.getByText('A new version is available.')).toBeInTheDocument();
    expect(screen.queryByText('Ready to work offline.')).toBeNull();
  });

  it('asks to be told when the service worker registers', () => {
    render(<UpdateToast />);
    expect(typeof sw.options?.onRegisteredSW).toBe('function');
  });
});

describe('watchForUpdates', () => {
  const online = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
  const visibility = (value: DocumentVisibilityState) => vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(value);
  const registration = (extra: Partial<ServiceWorkerRegistration> = {}) => ({ installing: null, update: vi.fn(() => Promise.resolve()), ...extra }) as unknown as ServiceWorkerRegistration & { update: ReturnType<typeof vi.fn> };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.restoreAllMocks());

  it('checks for a new version on an interval', () => {
    online(true);
    const reg = registration();
    const stop = watchForUpdates(reg);
    expect(reg.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(UPDATE_CHECK_MS);
    expect(reg.update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UPDATE_CHECK_MS);
    expect(reg.update).toHaveBeenCalledTimes(2);
    stop();
    vi.advanceTimersByTime(UPDATE_CHECK_MS * 3);
    expect(reg.update).toHaveBeenCalledTimes(2);
  });

  it('checks when the app comes back to the foreground', () => {
    online(true);
    const vis = visibility('hidden');
    const reg = registration();
    const stop = watchForUpdates(reg);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).not.toHaveBeenCalled();
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).toHaveBeenCalledTimes(1);
    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  it('skips the check while offline or while an update is already installing', () => {
    const net = online(false);
    const reg = registration();
    const stop = watchForUpdates(reg, 1000);
    vi.advanceTimersByTime(1000);
    expect(reg.update).not.toHaveBeenCalled();
    stop();

    net.mockReturnValue(true);
    const busy = registration({ installing: {} as ServiceWorker });
    const stop2 = watchForUpdates(busy, 1000);
    vi.advanceTimersByTime(1000);
    expect(busy.update).not.toHaveBeenCalled();
    stop2();
  });

  it('shrugs off a failed check', async () => {
    online(true);
    const reg = registration({ update: vi.fn(() => Promise.reject(new Error('offline'))) });
    const stop = watchForUpdates(reg, 1000);
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(reg.update).toHaveBeenCalledTimes(1);
    stop();
  });
});
