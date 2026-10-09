# Deploying

The app is a static site: `npm run build` produces `dist/` (HTML, JS, CSS, icons, the school JSON files, the web app manifest and the service worker), and any static host can serve it. Two hosts are set up:

- **GitHub Pages** (the main one): deploys automatically on every push to `main`. Live at **https://just-rice.github.io/School-Day-Tracker/**
- **Firebase Hosting** (optional alternative): one command from your computer.

Routes are hash URLs (`.../#/map?to=214`), so neither host needs server-side rewrites for deep links to work.

## GitHub Pages

### One-time setup

1. In the GitHub repo: **Settings** → **Pages** → **Build and deployment** → **Source**: choose **GitHub Actions**.
2. For sign-in and sync, add the Firebase web config as repository variables: **Settings** → **Secrets and variables** → **Actions** → **Variables** → **New repository variable** for each of
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
   They're variables rather than secrets because the Firebase web config is public by design (it's in the JavaScript every visitor downloads); the data is protected by the Firestore rules. Without them the site deploys fine in local-only mode. [firebase-setup.md](firebase-setup.md) explains where the values come from.
3. In Firebase, add `just-rice.github.io` to **Authentication** → **Settings** → **Authorized domains**.

### Deploying

Push (or merge a pull request) to `main`. The [Deploy to GitHub Pages](../.github/workflows/deploy.yml) workflow then:

1. installs dependencies with `npm ci`,
2. runs the unit tests and `tools/validate-schedules.mjs` (a failing test or a broken schedule file stops the deploy),
3. builds with `BASE_PATH=/School-Day-Tracker/` (from the repository name) and the `VITE_FIREBASE_*` variables, stamping the version shown in **Settings** → **About** as `<package version>+<commit>`,
4. copies `dist/index.html` to `dist/404.html`, so a mistyped link lands on the app instead of a GitHub error page,
5. uploads `dist/` and publishes it to the `github-pages` environment.

Watch it under the repo's **Actions** tab; it takes about two minutes. To redeploy without a new commit (for example after changing a repository variable): **Actions** → **Deploy to GitHub Pages** → **Run workflow**.

The `github-pages` environment only accepts deployments from `main` by default (**Settings** → **Environments** → **github-pages** → deployment branches), which is what you want.

### The base path

Pages serves a project site from `https://<owner>.github.io/<repo>/`, so every URL in the build has to start with `/<repo>/`. Vite takes that from the `BASE_PATH` environment variable (see `vite.config.ts`); the manifest, service worker, icons and the school JSON files all follow it. The workflow sets it from the repository name, so a fork or a renamed repo just works.

With a **custom domain** (Settings → Pages → Custom domain), the site lives at the root instead: add a repository variable `BASE_PATH` with the value `/`, re-run the workflow, and add the domain to Firebase's authorized domains.

To check a Pages-style build locally:

```sh
BASE_PATH=/School-Day-Tracker/ npm run build
BASE_PATH=/School-Day-Tracker/ npm run preview    # http://localhost:4173/School-Day-Tracker/
```

### Rolling back

Open an earlier successful run of **Deploy to GitHub Pages** in the Actions tab and click **Re-run all jobs**: it rebuilds and publishes that run's commit. (Or revert the bad commit on `main`, which deploys the fix the normal way.)

## Checks on every push: CI

[ci.yml](../.github/workflows/ci.yml) runs on every push to any branch and on every pull request: `npm run typecheck`, `npm test`, `npm run build` and `node tools/validate-schedules.mjs`. A red X on a pull request means one of these failed; open the run to see which.

## How updates reach students (the service worker)

The app is a PWA: the first visit installs a service worker that caches the app itself (JS, CSS, HTML, icons) so it opens instantly and works offline. School data (`schools/<id>/schedule.json`, `map.json`) is cached the first time it's used and refreshed in the background on later visits.

After a deploy, the next time a student opens the app the new version downloads in the background and a toast says **"A new version is available"** with a **Reload** button. Nothing reloads by itself, so nobody loses a half-typed assignment. An app left open checks for updates every hour and whenever it comes back to the foreground. If they tap "Later", the new version starts the next time the app is fully closed and reopened.

That means a deploy isn't visible the instant the workflow finishes: reload once to fetch it, then press **Reload** in the toast. To start fresh while testing, open DevTools → **Application** → **Service workers** → **Unregister** (and **Storage** → **Clear site data**).

## Alternative: Firebase Hosting

[`firebase.json`](../firebase.json) already has a Hosting config: it serves `dist/`, sends every unknown path to `index.html`, caches the hashed files in `assets/` forever and makes sure the HTML, manifest and service worker are always revalidated, so updates show up promptly.

```sh
npm i -g firebase-tools          # once
firebase login                   # once
cp .firebaserc.example .firebaserc   # once; put your project ID in it
npm run build                    # BASE_PATH unset: the site is served from the root
firebase deploy --only hosting
```

The site goes live at `https://<project-id>.web.app` (and `.firebaseapp.com`), both already authorized for sign-in. For local builds the Firebase config comes from `.env.local`.

Bonus: on Firebase Hosting you can set `VITE_FIREBASE_AUTH_DOMAIN=<project-id>.web.app`. Google sign-in then runs on the same site as the app, which avoids Safari's third-party storage blocking when the redirect sign-in is used (iPhone home-screen apps). The service worker never intercepts Firebase's `/__/` helper pages.

Preview a change on a temporary URL without touching the live site:

```sh
npm run build && firebase hosting:channel:deploy preview
```

It prints a URL like `https://<project-id>--preview-abc123.web.app`. To sign in there, add that host to Firebase's authorized domains too.

Roll back from the console: **Hosting** → **Release history** → **Rollback**.
