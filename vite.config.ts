/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const THEME = '#1f45a8';
const BACKGROUND = '#f5f6f8';
// BASE_PATH is set by the GitHub Pages workflow (e.g. /School-Day-Tracker/); '/' everywhere else.
// The manifest, service worker and icon paths below are all relative, so they follow it.
const BASE = process.env.BASE_PATH || '/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // the update prompt is src/components/UpdateToast.tsx (virtual:pwa-register/react)
      registerType: 'prompt',
      injectRegister: false,
      // the icons are already precached by globPatterns
      includeManifestIcons: false,
      devOptions: { enabled: false },
      manifest: {
        // The app's identity for installs. Unlike the other URLs here it's resolved against the
        // origin, not the manifest, so '.' would claim all of just-rice.github.io; this is the
        // app's own path (the same as start_url). Changing it later orphans existing installs.
        id: BASE,
        name: 'School Day Tracker',
        short_name: 'School Day',
        description: 'Your class schedule, homework and school maps with walking directions, for WW-P High School North and Community Middle School students.',
        lang: 'en-US',
        theme_color: THEME,
        background_color: BACKGROUND,
        display: 'standalone',
        start_url: '.',
        scope: '.',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // The app shell and the bell schedules (a few KB each). The first visit reads its school's
        // schedule before the service worker is running, so that fetch never reaches the runtime
        // cache below; precached, Today works offline from the next launch on. The maps (~400 KB
        // each) are cached at runtime below, so a student only downloads their own school's.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'schools/*/schedule.json'],
        // the Firebase SDK chunk is ~500 KB; leave room so it's never silently left out
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Firebase Hosting serves its auth helper pages under /__/; never answer those with the app
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
        // Take control as soon as it's installed, so school data first fetched after that (a map
        // opened later in this visit) is cached too. Updates still wait for the student to press
        // Reload (registerType 'prompt').
        clientsClaim: true,
        // Only same-origin requests are listed here. Firebase (Auth, Firestore on *.googleapis.com
        // and *.firebaseapp.com) is cross-origin and never matches, so it always goes to the
        // network and Firestore's own offline cache handles being offline.
        runtimeCaching: [
          {
            // The maps (a precached schedule.json is answered by the precache first). RegExp routes
            // only match cross-origin URLs from their first character, so this one is same-origin
            // only. It's a suffix match so it works under any base path.
            urlPattern: /\/schools\/[\w-]+\/[\w-]+\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'school-data',
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // the Firebase SDK alone is a ~550 KB chunk (130 KB gzipped)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Vendor code in its own chunks: it changes far less often than the app, so an app update
        // doesn't make phones download Firebase and React again.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](firebase|@firebase)[\\/]/.test(id)) return 'firebase';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
