# Setting up Firebase (accounts and sync)

School Day Tracker works without any setup: with no Firebase config it runs in **local-only mode** and keeps everything in the browser. To let students sign in and sync between their phone and laptop, connect it to a Firebase project. It takes about 15 minutes and the free plan is plenty.

You'll do this once:

1. [Create a Firebase project](#1-create-a-firebase-project)
2. [Add a web app and copy its config](#2-add-a-web-app-and-copy-its-config)
3. [Turn on Google and email sign-in](#3-turn-on-google-and-emailpassword-sign-in)
4. [Authorize the site's domain](#4-authorize-the-sites-domain)
5. [Create the Firestore database](#5-create-the-firestore-database)
6. [Deploy the security rules](#6-deploy-the-security-rules)
7. [Try it](#7-try-it)

## 1. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com/) and sign in with a Google account.
2. Click **Create a project** (or **Add project**), name it, e.g. `school-day-tracker`.
3. Google Analytics isn't used by the app; you can turn it off.
4. Note the **project ID** it shows (e.g. `school-day-tracker-1a2b3`); you'll need it later.

## 2. Add a web app and copy its config

1. On the project's home page click the **Web** icon (`</>`) under "Get started by adding Firebase to your app" (or **Project settings** (gear icon) → **General** → **Your apps** → **Add app** → Web).
2. Give it a nickname (e.g. `web`). You don't need to tick "Also set up Firebase Hosting" (you can add Hosting later, see [deploy.md](deploy.md)).
3. Click **Register app**. Firebase shows a `firebaseConfig` object. Copy its values into `.env.local` in the repo (start from the example: `cp .env.example .env.local`):

   | `firebaseConfig` field | `.env.local` / GitHub variable |
   | --- | --- |
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

   Skip the "npm install firebase" / script tag step Firebase suggests: the app already includes the SDK. You can find this config again later under **Project settings** → **General** → **Your apps**.

4. Add the same six values to GitHub so the deployed site gets them: in the repo go to **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**, once for each name in the right-hand column above. Use *variables*, not secrets.

> **Is it safe to put the API key in a public repo variable?** Yes. The Firebase web config is public by design: it's compiled into the JavaScript that every visitor downloads, so hiding it wouldn't hide anything. It only identifies your project. What actually protects the data is the Firestore security rules (step 6), which only let a signed-in student read and write their own documents, plus the list of authorized domains (step 4). See Google's note on [Firebase API keys](https://firebase.google.com/docs/projects/api-keys).

The app only turns on accounts when at least the API key, auth domain, project ID and app ID are set. Vite bakes these values in at build time, so after changing `.env.local` restart `npm run dev`, and after changing the GitHub variables re-run the deploy workflow.

## 3. Turn on Google and Email/Password sign-in

1. In the console, open **Build** → **Authentication** and click **Get started**.
2. On the **Sign-in method** tab:
   - **Google** → **Enable**, choose a **support email** (shown on Google's consent screen) → **Save**.
   - **Email/Password** → enable the first switch (Email/Password). Leave "Email link (passwordless sign-in)" off → **Save**.

Password reset emails work out of the box. You can change their wording under **Authentication** → **Templates**.

## 4. Authorize the site's domain

Firebase only lets sign-in run on domains you list.

1. **Authentication** → **Settings** tab → **Authorized domains** → **Add domain**.
2. Add `just-rice.github.io` (just the host name: no `https://`, no path). If you deploy a fork, add `<your-username>.github.io` instead; if you use a custom domain, add that.

`localhost` (for `npm run dev`) and your project's own `<project-id>.firebaseapp.com` and `<project-id>.web.app` are already on the list.

## 5. Create the Firestore database

1. **Build** → **Firestore Database** → **Create database**.
2. If asked for an edition, pick **Standard**.
3. **Location**: `nam5 (United States)` (multi-region) or `us-east1 (South Carolina)`, both close to New Jersey. The location can't be changed later.
4. Choose **Start in production mode** (everything is locked until the rules from the next step are deployed) → **Create**.

The app creates everything it needs by itself. Each student's data ends up in:

```
users/{uid}                    their profile and settings
users/{uid}/classes/{id}       one document per class
users/{uid}/assignments/{id}   one document per homework / test / project
```

## 6. Deploy the security rules

The rules in [`firestore.rules`](../firestore.rules) let a signed-in user read and write only `users/<their own uid>` and its `classes` and `assignments`, check the shape and size of what's written, and deny everything else. Deploy them with the Firebase CLI:

```sh
npm i -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc     # then replace "your-firebase-project-id" with your project ID
firebase deploy --only firestore:rules,firestore:indexes
```

(`firebase use --add` is another way to pick the project.) Re-run the last command whenever `firestore.rules` changes. You can also paste the rules into **Firestore Database** → **Rules** in the console, but deploying from the repo keeps them in sync with the code.

## 7. Try it

```sh
npm run dev
```

Open http://localhost:5173, go to **Settings** (or the Welcome screen) and sign in with Google or create an email account. Add a class, then open the app on another device or in another browser and sign in with the same account: the class shows up there within a second or two. In the console, **Firestore Database** → **Data** shows the new `users/<uid>` document.

## Costs: the free Spark plan is plenty

The free **Spark** plan needs no credit card. Its Cloud Firestore quota is 1 GiB of storage, 50,000 document reads, 20,000 writes and 20,000 deletes **per day**. A student's data is a few dozen small documents, reads come mostly from the device's offline cache, and a day of normal use is on the order of a hundred reads and a handful of writes, so a few hundred students fit comfortably. Google and email/password sign-in are free. If a quota is ever hit, Firestore pauses until the next day (the app keeps working from its offline cache); nothing is charged on Spark. Current numbers: [firebase.google.com/pricing](https://firebase.google.com/pricing).

## Troubleshooting

**"This website isn't allowed to use sign-in yet" (`auth/unauthorized-domain`)**
The domain you're on isn't in **Authentication** → **Settings** → **Authorized domains**. Add the host name exactly as it appears in the address bar (e.g. `just-rice.github.io`, or `192.168.1.20` if you're testing from a phone on your network).

**"This sign-in method isn't turned on" (`auth/operation-not-allowed`)**
Enable Google or Email/Password in **Authentication** → **Sign-in method** (step 3).

**The sign-in pop-up is blocked, or nothing happens on an iPhone**
The pop-up can't open in some places: blocked pop-ups, iOS home-screen apps, and in-app browsers (Instagram, Snapchat...). The app notices and switches to a full-page redirect to Google automatically. If you come back from Google still signed out on iPhone Safari, that's Safari blocking third-party storage between your site and `<project-id>.firebaseapp.com`. Options:
- use **email and password**, which never leaves the page;
- or host the app on Firebase Hosting and set `VITE_FIREBASE_AUTH_DOMAIN` to the Hosting domain (`<project-id>.web.app`), so the sign-in helper runs on the same site (see [deploy.md](deploy.md#alternative-firebase-hosting) and Google's [redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices)).

**The deployed site still says "Saved on this device" and has no sign-in button**
The build didn't get the config. Check that the six `VITE_FIREBASE_*` repository *variables* (not secrets) exist with exactly those names, then re-run **Actions** → **Deploy to GitHub Pages** → **Run workflow**. Locally: check `.env.local` and restart `npm run dev`.

**"Missing or insufficient permissions"**
The rules weren't deployed (production mode denies everything until they are), or they were deployed to a different project. Run `firebase deploy --only firestore:rules,firestore:indexes` again and check `.firebaserc` names the same project ID as `VITE_FIREBASE_PROJECT_ID`.

**"Invalid API key" (`auth/invalid-api-key`)**
A typo in `VITE_FIREBASE_API_KEY`, or the key was restricted in Google Cloud. If you add HTTP-referrer restrictions to the key (optional), include your site (`https://just-rice.github.io/*`), `http://localhost:5173/*` and `https://<project-id>.firebaseapp.com/*`, which the Google sign-in helper runs on.

**Changes don't sync / "client is offline"**
Firestore keeps working offline and syncs when the connection is back; the edits aren't lost. If it never syncs, check that the device can reach `firestore.googleapis.com` (some school networks and ad blockers block it).
