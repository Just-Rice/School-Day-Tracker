# School Day Tracker

**Open the app:** https://just-rice.github.io/School-Day-Tracker/

School Day Tracker keeps a student's whole school day in one place on their phone: which class is now and which is next (with a countdown), the week's rotation, every detail about each class (room, teacher, times, links, anything else), homework and tests, and an indoor map that gives walking directions to any room. It's built for students at **West Windsor-Plainsboro High School North** (HSN, grades 9–12) and **Community Middle School** (CMS, grades 6–8) in Plainsboro, NJ, whose bell schedules, rotations, calendars and floor plans are built in. Students at any other school can pick **Other** and set up their own bell schedule (there's just no map).

> Not an official WW-P district app. Always check school announcements for schedule changes.

## Features

- **Today**: what's happening now and what's next, with a live countdown to the bell, today's letter day, and homework due soon.
- **Week and rotation**: the whole week at a glance, the A/B/C/D (HSN) or A/B (CMS) rotation grid, the bell schedules (regular, 90-minute delayed opening, early dismissal, HSN's Z day) and the school calendar. Snow day or "today is actually a C day"? Override any single date.
- **Classes with every detail**: period(s), the days it meets, room (picked from the school map), a different room for lab days, teacher with email/phone/website/office hours, course code, section, level, term, credits, color and icon, links, materials, grading policy, your grade, notes, and **custom fields** for anything else.
- **Homework tracker**: homework, tests, quizzes, projects, essays, readings and labs with due date and time, priority, status, subtasks, links and time estimates. Due dates can default to the next time the class meets.
- **Indoor maps of HSN and CMS** on both floors: search any room, see your classes on the map, and get turn-by-turn walking directions ("Turn left into the 700s Hallway", "Take the Blue stairs up to the 2nd floor") from the front entrance, any other entrance, or between two rooms.
- **Sign in and sync**: sign in with Google or email and your schedule and homework follow you to every device (Firebase Auth + Firestore). Works offline and syncs when you're back online.
- **Local-only mode**: no account needed. Everything stays in your browser, and you can export/import a backup file. If you sign in later, the app offers to bring your local data along.
- **Installable and offline-capable** (PWA): add it to your home screen and it opens like an app, even with no signal in the building.
- **Dark mode**, a 12/24-hour clock, and a layout made for phones first.

## Quick start

You need [Node.js](https://nodejs.org/) 22 (what CI uses) and npm.

```sh
git clone https://github.com/Just-Rice/School-Day-Tracker.git
cd School-Day-Tracker
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (Vitest), once |
| `npm run test:watch` | Unit tests, re-run on save |
| `npm run typecheck` | TypeScript checks |
| `npm run build` | Typecheck + production build into `dist/` (with the service worker) |
| `npm run preview` | Serve the production build at http://localhost:4173 |
| `node tools/validate-schedules.mjs` | Check `public/schools/*/schedule.json` after editing one |
| `node tools/make-icons.mjs` | Re-render the PNG app icons from `public/icons/icon.svg` |

The service worker (offline mode, install prompt) only exists in production builds, so use `npm run build && npm run preview` to try those.

## Configuration

Accounts and sync need a (free) Firebase project. Copy `.env.example` to `.env.local` and fill in your Firebase web app config:

```sh
cp .env.example .env.local
```

```ini
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Restart `npm run dev` after changing it. **Leave the values empty (or skip the file) and the app runs in local-only mode**: everything works, data is saved in the browser, and there's no sign-in. [docs/firebase-setup.md](docs/firebase-setup.md) walks through creating the project step by step.

## Documentation

- [docs/firebase-setup.md](docs/firebase-setup.md): set up Firebase Auth and Firestore, deploy the security rules, troubleshooting sign-in
- [docs/deploy.md](docs/deploy.md): publish to GitHub Pages (automatic on push to `main`) or Firebase Hosting
- [docs/architecture.md](docs/architecture.md): how the code fits together: data model, storage, auth, the schedule engine, maps, routing, offline
- [docs/maps.md](docs/maps.md): how the indoor maps and directions work, regenerating `map.json` from the 3D models, adding a school
- [docs/schedules.md](docs/schedules.md): the HSN and CMS bell schedules, rotations and 2026-27 calendar, with sources, and how to fix them

## Project structure

```
src/
  main.tsx            entry point: renders <App /> and the PWA update toast
  App.tsx             providers + the route list (HashRouter)
  types.ts            the data model (profile, classes, assignments, schedules, maps)
  firebase.ts         Firebase init from VITE_FIREBASE_* (nothing runs without them)
  pages/              one component per screen: Today, Week, Schedule, Classes, Homework, Map, Settings, Login, Welcome
  components/         shared UI (ui.tsx, Layout.tsx) and per-feature parts: account/, classes/, homework/, map/, schedule/
  hooks/              useSchedule (the user's schedule with overrides), useNow
  lib/                pure logic with unit tests: schedule engine, dates, homework, classes, backups,
                      nav (route finding), directions (turn-by-turn text), mapData (room keys and search)
  data/               DataStore interface, LocalStore (localStorage), FirestoreStore, DataProvider (useData)
  auth/               AuthProvider (useAuth): Google + email sign-in, or local-only mode
  schools/            school list (names, colors, map orientation) and loaders for the JSON below
public/
  schools/<id>/       schedule.json (bells, rotation, calendar) and map.json (floor plans + walkable grid) for hsn, cms, other
  icons/              app icons (icon.svg is the source; PNGs are generated)
tools/
  extract-school-map.mjs   exports map.json from the HSN 3D / CMS 3D models
  validate-schedules.mjs   checks schedule.json files
  make-icons.mjs           renders the PNG icons
docs/                 the guides linked above
firestore.rules       who can read and write what (each user only their own data)
firebase.json         Firebase CLI config: rules, indexes, optional Hosting
.github/workflows/    ci.yml (checks on every push/PR), deploy.yml (GitHub Pages)
```

## Tech stack

- [Vite](https://vite.dev/) 6, [React](https://react.dev/) 19, [TypeScript](https://www.typescriptlang.org/) 5.9 (strict)
- [React Router](https://reactrouter.com/) 7 with hash routes, so deep links work on GitHub Pages
- [Firebase](https://firebase.google.com/) 12: Authentication (Google, email/password) and Cloud Firestore with its offline cache
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (Workbox) for the service worker and web app manifest
- [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) + jsdom for tests
- GitHub Actions for CI and deploying to GitHub Pages
- No UI framework: plain CSS with custom properties for theming and dark mode

## Data and privacy

- **Signed in:** your profile, classes and homework are stored in Firestore under `users/<your user id>`. The [security rules](firestore.rules) only let *you* read or write that, and deny everything else, so no other account (including other students) can see your data.
- **Local-only mode:** everything stays in your browser's localStorage on that device and is never sent anywhere. Clearing site data deletes it, so export a backup from Settings first if it matters.
- School data (bell schedules, calendars, maps) is public, static JSON that ships with the app.
- No ads, no analytics, no tracking. You can delete your data from Settings at any time.

## Credits

The indoor maps come from two walkable 3D models of the schools, rebuilt from the schools' printed floor plans:

- [HSN 3D](https://github.com/Just-Rice/hsn-3d) ([play it](https://just-rice.github.io/hsn-3d/))
- [CMS 3D](https://github.com/Just-Rice/cms-3d) ([play it](https://just-rice.github.io/cms-3d/))

Their room layouts, walkable navigation grids, stairwells and route finding (`nav.js`) are exported into this app's `map.json` files and ported to `src/lib/nav.ts`. Assets used by those projects: textures from [ambientCG](https://ambientcg.com), the sky and tree models from [Poly Haven](https://polyhaven.com), and the cars from Kenney's [Car Kit](https://kenney.nl/assets/car-kit), all CC0; satellite imagery for tracing from Esri World Imagery; elevation from USGS 3DEP LiDAR (public domain); building outlines cross-checked against [OpenStreetMap](https://www.openstreetmap.org/copyright) (© OpenStreetMap contributors). See the CREDITS.md files in each project's `assets/` folders.

Bell schedules and calendars are from WW-P's published schedules; sources are listed in [docs/schedules.md](docs/schedules.md).

## Status and roadmap

Working today: everything in the feature list, for the 2026-27 school year.

Ideas for later (contributions welcome):

- Notifications and reminders: "Class starts in 5 minutes", "Essay due tomorrow"
- Grade tracking per assignment and per marking period
- Sharing a schedule with friends to see which classes and lunches you share
- More schools (WW-P High School South, Grover, the elementary schools) and their maps
- A teacher directory with rooms and office hours
- Calendar export (.ics) of classes and due dates

Found a wrong bell time or a missing room? Open an issue, or see [docs/schedules.md](docs/schedules.md#how-to-fix-or-update-the-data) and [docs/maps.md](docs/maps.md).
