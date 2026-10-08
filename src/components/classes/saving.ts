/**
 * Waits for a save until it settles or `ms` pass, whichever is first. Offline cloud writes can
 * stay pending until the device reconnects; the UI moves on and the data layer reports a late
 * failure in the app's error banner.
 */
export function settleSoon(p: Promise<unknown>, ms = 1500): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    p.then(
      () => {
        clearTimeout(t);
        resolve();
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
