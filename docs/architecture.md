# Architecture

A tour of how School Day Tracker is put together, for anyone about to change it. It's a single-page React app with no backend of its own: static files on GitHub Pages, plus Firebase for accounts and sync when it's configured.

```
public/schools/<id>/schedule.json ──▶ useSchedule() ──▶ lib/schedule.ts ──┐
public/schools/<id>/map.json ───────▶ useSchoolMap() ─▶ lib/nav.ts ───────┤
                                                                          ▼
                      pages/*  (Today, Week, Schedule, Classes, Homework, Map, Settings)
                          │ useData()                              │ useAuth()
                          ▼                                        ▼
                    DataProvider ── DataStore                AuthProvider ──▶ Firebase Auth
                      ├─ FirestoreStore ──▶ Firestore users/{uid}/…          (signed in)
                      └─ LocalStore ──────▶ localStorage sdt:v1:local:*      (local-only / signed out)

service worker (Workbox): caches the app shell and the school JSON for offline use
```

## Data model

All shared types are in [`src/types.ts`](../src/types.ts). Two kinds of data:

**The user's own data**, stored per user:

- `Profile`: school (`'hsn' | 'cms' | 'other'`), grade, theme, 12/24-hour clock, per-date `dayOverrides` (snow days, "today is a C day"), an optional `customSchedule`, and whether onboarding is done.
- `ClassInfo`: one class with everything about it: periods, cycle days, room (`room.mapKey` links it to a map room), alternate rooms on some days, teacher, term, color/icon, links, materials, grading policy, grade, notes and free-form `customFields`.
- `Assignment`: homework, tests, projects... with `classId` (or `null`), due date/time, priority, status, subtasks and links.

**School data**, static JSON shipped with the app under `public/schools/<id>/`:

- `schedule.json` (`SchoolSchedule`): periods, the cycle (rotation days or weekdays), bell variants (`bells[0]` is the regular day) and the calendar (first/last day, days off, special days). Documented in [schedules.md](schedules.md); checked by `tools/validate-schedules.mjs`.
- `map.json` (`SchoolMapData`): floor plans and the walkable grid, see [maps.md](maps.md).

Dates are local `'YYYY-MM-DD'` strings and times `'HH:MM'` (24-hour); [`src/lib/dates.ts`](../src/lib/dates.ts) has the helpers. Never use `Date.toISOString()` for a date: it's UTC and gives tomorrow's date in the evening.

### Where it's stored

Firestore, when signed in (see [`firestore.rules`](../firestore.rules)):

```
users/{uid}                    the Profile fields at the top level, plus updatedAt
users/{uid}/classes/{id}       one ClassInfo per document (document id = ClassInfo.id)
users/{uid}/assignments/{id}   one Assignment per document
```

The rules only let `request.auth.uid == uid` read or write under `users/{uid}`, validate field types and sizes, and deny every other path.

localStorage, in local-only mode or when signed out (one JSON value per key):

```
sdt:v1:local:profile       Profile
sdt:v1:local:classes       ClassInfo[]
sdt:v1:local:assignments   Assignment[]
```

A few UI conveniences use their own keys (`sdt:v1:onboarding` for a half-finished welcome flow, `sdt:map:showClasses`, ...). They're per device and never synced.

## DataStore and DataProvider

[`src/data/store.ts`](../src/data/store.ts) defines the `DataStore` interface: subscribe to / save / delete the profile, classes and assignments. Subscriptions call back right away with the current value and again on every change, from this tab, another tab or another device. Two implementations:

- [`LocalStore`](../src/data/localStore.ts): localStorage, with the `storage` event for changes in other tabs.
- [`FirestoreStore`](../src/data/firestoreStore.ts): `onSnapshot` listeners on the user's documents. Firestore is initialized with a persistent, multi-tab offline cache ([`src/firebase.ts`](../src/firebase.ts)), so the app opens instantly and edits made offline sync later. Because a Firestore write promise only settles when the server confirms it (never, offline), saves resolve after a short grace period and late failures are reported as an error banner.

[`DataProvider`](../src/data/DataProvider.tsx) picks the store, `FirestoreStore` for a signed-in user and `LocalStore` otherwise, subscribes to all three collections and exposes them through **`useData()`**: `profile` (always complete, defaults filled in), `classes` (sorted by name), `assignments`, `loading`, `error`, and the save/delete functions. Pages never talk to Firestore or localStorage directly. `undefined` values are stripped before saving (`clean()` in store.ts) since neither Firestore nor JSON accepts them.

## Auth flow

[`AuthProvider`](../src/auth/AuthProvider.tsx) exposes **`useAuth()`**: `user`, `loading`, `firebaseEnabled` and sign-in/out functions.

- **No Firebase config** at build time (`VITE_FIREBASE_*` empty): a constant local-only state; Firebase is never initialized and its code is never run. `user` is always `null`.
- **With config**: `onAuthStateChanged` restores the session on load (`loading` until it does; persistence is localStorage → IndexedDB → memory). Google sign-in tries a popup first and falls back to a full-page redirect where popups can't open (iOS home-screen apps, in-app browsers); `getRedirectResult` finishes that on return. Email/password sign-up, sign-in and password reset are there too. Firebase error codes become friendly messages in `components/account/authErrors.ts`.

When `user` changes, `DataProvider` switches stores. After a first sign-in on a device that has local data, a banner offers to copy it into the account. Signing out goes back to the (separate) local data.

`Layout` sends anyone who hasn't finished onboarding (`profile.onboarded`) to `/welcome`, where they pick their school and grade and can sign in.

## Schedule engine

Pure functions in [`src/lib/schedule.ts`](../src/lib/schedule.ts), wired to the user by [`src/hooks/useSchedule.ts`](../src/hooks/useSchedule.ts).

- **`useSchedule()`** loads the profile's school `schedule.json` (or uses `profile.customSchedule` when it was made for the same school), applies `profile.dayOverrides` and returns `{ schedule, loading, error, getDay(date) }`. **`useNow(ms)`** re-renders on a timer for countdowns.
- **`resolveDay(schedule, date, overrides)`** returns a `DayInfo`: whether there's school (and if not, why: a holiday's name, "Weekend", an override), the cycle day, which bell applies and its slots in time order.
- **Rotation counting.** For a rotation schedule the cycle advances one day per *school* day, so it skips weekends, holidays and snow days. The resolver precomputes the whole year once per schedule + overrides (then memoizes): it marks every date school/no-school (overrides first, then the calendar's no-school ranges, then weekends), and walks the school days assigning cycle days. Forced days (a user override's `cycleDay`, a special day's `cycleDay`, the calendar `anchor`) set the cycle day and the rotation continues from there; days before the first forced day are counted backwards from it; a special day with `advance: false` repeats the previous letter. Weekday-mode schedules (`'other'`) just map Monday–Friday to `mon`..`fri`.
- **Bells.** `bells[0]` is the regular day; a special day or an override can name another bell (delayed opening, early dismissal). A bell's `days` has slots per cycle day id, with `'*'` for any day without its own entry.
- **Classes on a day.** `classesOnDay(day, classes)` matches each slot to the class that meets in that period on that cycle day (a class limited to certain days, like a lab, wins over an every-day class in the same period). `currentAndNext(day, minutes)` gives the Today page's now/next/passing state; `meetingTimes` / `summarizeMeetingTimes` describe when a class meets ("Every day · 7:40–8:52 AM", or per cycle day when the times differ).

Everything is unit-tested in `src/lib/schedule.test.ts`.

## Maps and directions

```
hsn-3d / cms-3d repos ──tools/extract-school-map.mjs──▶ public/schools/<id>/map.json
        (three.js game, run in headless Chromium)               │
                                                                ▼
          useSchoolMap() (lib/mapData.ts): rooms + stable keys + search
                                                                │
          components/map/routeClient.ts ──▶ lib/navWorker.ts (Web Worker) ──▶ lib/nav.ts
                                                                │  A* over the 0.5 m walkable grid,
                                                                │  both floors linked by stair portals
                                                                ▼
          lib/directions.ts: route polyline ──▶ "Turn left into the 700s Hallway", "Take the Blue stairs up"
                                                                │
          pages/MapPage.tsx + components/map/* : SVG floor plan, pan/zoom, route line, step list
```

- The 3D models already contain each school's rooms, walls, stairwells and a navigation grid. The extractor loads a model in headless Chromium and dumps that data, so the 2-D map and the 3D game always agree. Details and how to re-run it: [maps.md](maps.md).
- [`lib/mapData.ts`](../src/lib/mapData.ts) gives every room a stable `key`, which is what `ClassInfo.room.mapKey` stores, and powers room search.
- [`lib/nav.ts`](../src/lib/nav.ts) is a TypeScript port of the games' `nav.js`: A* on 0.5 m cells, 8-connected without cutting corners, blocked across steep level-0 height changes, with each stairwell as a portal between floor 1 and floor 2. On top of nav.js it charges extra for walking outdoors (routes stay inside when there's an indoor way), precomputes distances from the front entrance as an A* landmark, and straightens the grid's zigzags.
- Building a school's grid takes a few hundred milliseconds, so it runs in a Web Worker (`navWorker.ts`), with a main-thread fallback where workers aren't available.
- [`lib/directions.ts`](../src/lib/directions.ts) cleans the route polyline into straight runs and turns each corner into a step, named after the hallway zone it turns into or a landmark room, with left/right computed in the map's orientation (HSN is drawn north-up, CMS in its floor plan's orientation; see `SchoolMeta.mapOrientation` in `src/schools/index.ts`).
- [`MapPage`](../src/pages/MapPage.tsx) draws the floors as SVG. Everything the user picks is in the URL (`#/map?to=<room key>&from=<entrance | entrance:<i> | room key>&floor=<1|2>`), so Today and the class pages deep-link to a route.

## Routing

[`src/App.tsx`](../src/App.tsx) uses a **`HashRouter`**, so URLs look like `https://just-rice.github.io/School-Day-Tracker/#/homework`. GitHub Pages can't rewrite unknown paths to `index.html`, and with hash routes it never has to.

| Route | Page |
| --- | --- |
| `#/` | Today: now/next, today's classes, homework due |
| `#/week` | The week, day by day, and the rotation grid |
| `#/schedule` | Bell schedules, calendar, day overrides, custom schedule editor |
| `#/classes`, `#/classes/new`, `#/classes/:id`, `#/classes/:id/edit` | Classes list, add, details, edit |
| `#/homework`, `#/homework/new`, `#/homework/:id` | Homework list, add, edit |
| `#/map` | Indoor map and directions |
| `#/settings` | Account, profile, appearance, backups, about |
| `#/login` | Sign in / create account (outside the main layout) |
| `#/welcome` | First-run onboarding (outside the main layout) |

Everything except `/login` and `/welcome` renders inside `Layout`: sidebar on wide screens, bottom tab bar on phones. Unknown routes redirect to Today.

## PWA and offline

[vite-plugin-pwa](https://vite-pwa-org.netlify.app/) generates the web app manifest and a Workbox service worker at build time (config in [`vite.config.ts`](../vite.config.ts)):

- **Precached** (downloaded on install, served cache-first): the app shell, meaning every JS, CSS, HTML, SVG, PNG and font file in the build. Navigations fall back to `index.html`, so the app opens offline.
- **Runtime cached**: `schools/*/*.json` with stale-while-revalidate. The big `map.json` files (~400 KB each) aren't precached, so students only download their own school's map, and once used it works offline and refreshes in the background.
- **Not touched**: Firebase traffic (`*.googleapis.com`, `*.firebaseapp.com`, Firebase Hosting's `/__/` pages). Firestore has its own offline cache.
- **Updates** use `registerType: 'prompt'`: a new version waits until the student taps **Reload** in the toast from [`src/components/UpdateToast.tsx`](../src/components/UpdateToast.tsx) (rendered next to `<App />` in `src/main.tsx`). An open app checks for updates hourly and when it returns to the foreground.
- The manifest uses relative `start_url` / `scope` and icon paths, and Vite's `base` comes from `BASE_PATH`, so it works under `/School-Day-Tracker/` on Pages and at `/` anywhere else.
- The service worker is only built in production; `npm run dev` doesn't register one. Try it with `npm run build && npm run preview`.

Icons: `public/icons/icon.svg` is the source; `node tools/make-icons.mjs` renders the 192/512 px icons, the maskable icon (artwork inside the safe zone on a full-bleed background) and the 180 px Apple touch icon.

## Tests and CI

Unit tests live next to the code (`*.test.ts(x)`, Vitest + jsdom + Testing Library): the schedule engine, route finding and directions, classes, homework, backups, the Firestore mapping, sign-in and onboarding, and UI pieces such as the Now card and the update toast. [ci.yml](../.github/workflows/ci.yml) runs typecheck, tests, build and the schedule validator on every push and pull request; [deploy.yml](../.github/workflows/deploy.yml) publishes `main` to GitHub Pages ([deploy.md](deploy.md)).
