# Indoor maps and walking directions

The Map page draws both floors of High School North and Community Middle School, finds any room, and gives turn-by-turn walking directions from the front entrance, another entrance, or another room. This page explains where that data comes from, how to regenerate it when the buildings change, and how to add a school.

## Where the maps come from

The floor plans aren't drawn by hand for this app. They come from two walkable 3D models of the schools:

- [HSN 3D](https://github.com/Just-Rice/hsn-3d) ([play](https://just-rice.github.io/hsn-3d/)) and
- [CMS 3D](https://github.com/Just-Rice/cms-3d) ([play](https://just-rice.github.io/cms-3d/)),

which rebuild each school from its printed floor-plan handout. Each room is a rectangle with doors in the model's `src/layout.js`, and the game builds a walkable navigation grid over both floors for its own "Find a room" feature (`src/nav.js`).

[`tools/extract-school-map.mjs`](../tools/extract-school-map.mjs) opens a model in headless Chromium (Playwright), waits until the school is built, and reads everything the 2-D map needs from the game's debug hooks (`window.__game`): rooms, walls, footprints, hallway zones, entrances, stairwells and the navigation grid. For every room it also asks the game for a route from the front entrance, which gives the point just inside the room's door where routes end. The result is one JSON file per school:

```
hsn-3d / cms-3d ──extract-school-map.mjs──▶ public/schools/<id>/map.json (~400 KB)
```

Because the app and the 3D game use the same data, a room is in the same place and a route takes the same hallways in both.

## How the app uses map.json

1. **Loading.** `useSchoolMap(schoolId)` ([`src/lib/mapData.ts`](../src/lib/mapData.ts)) fetches `schools/<id>/map.json` (cached by the service worker after the first visit, so the map works offline) and gives every room a stable `key` and a display `title` (`buildRooms`). `searchRooms` matches labels (`214`, `A104`), names (`Media Center`) and titles.
2. **Drawing.** [`components/map/FloorPlan.tsx`](../src/components/map/FloorPlan.tsx) draws a floor as SVG: the building footprint (`blocks`, or `level1` upstairs), `courtyards`, rooms colored by `type`, stairwells, `walls` and room labels. World coordinates are turned into map coordinates by `toMap()` in [`src/lib/directions.ts`](../src/lib/directions.ts) according to `SchoolMeta.mapOrientation` in [`src/schools/index.ts`](../src/schools/index.ts): HSN is drawn north-up (its world +x points north), CMS in its floor plan's own orientation (plan-up is 15° east of north; the compass shows it).
3. **Routing.** [`src/lib/nav.ts`](../src/lib/nav.ts) rebuilds the game's navigation grid from `grid`, `blocked`, `heights` and `stairs` and runs A*: 0.5 m cells, 8 directions without cutting corners, no stepping across steep height changes on the ground floor (the raked theatre floor, stage steps), and each stairwell is a portal between floor 1 and floor 2 costing its walking length. The app's version also makes outdoor cells cost double (routes stay indoors when there's an indoor way), uses the front entrance as an A* landmark, and straightens the grid's 45° zigzags. It runs in a Web Worker ([`src/lib/navWorker.ts`](../src/lib/navWorker.ts)).
4. **Directions.** [`src/lib/directions.ts`](../src/lib/directions.ts) cleans the route into straight runs and turns each corner into a step: "Walk 40 m (130 ft) down the Main Hall", "Turn left into the 700s Hallway", "Take the Blue stairs up to the 2nd floor", "Room 214 is on your right". Hallway names come from `zones`, landmarks from big or one-of-a-kind rooms, stair names from the stair `id`s.

Routes start at `spawn` (just outside the main entrance) for "from the front entrance", at a point just inside another entrance, or at a room's `target` for "from my last class", and end at the destination room's `target`.

## What's in map.json

The TypeScript shape is `SchoolMapData` in [`src/types.ts`](../src/types.ts). Coordinates are the 3D model's world meters on the ground plane, `(x, z)`; rectangles are `[x0, z0, x1, z1]`; `level` is `0` for the 1st floor and `1` for the 2nd.

| Field | Meaning |
| --- | --- |
| `id`, `source` | School id (`hsn`, `cms`) and the 3D repo it came from |
| `grid` | The navigation grid: origin `X0`, `Z0`, cell size `CS` (0.5 m), `NX` × `NZ` cells per floor. Cell `i` is at column `i % NX`, row `floor(i / NX)` |
| `levelH` | Height of one floor in meters (4.8 at HSN, 4.27 at CMS) |
| `blocked` | One base64 string per floor, bit-packed: bit `i & 7` of byte `i >> 3` set = cell `i` is not walkable (wall, furniture, outside the floor) |
| `heights` | Base64 of one signed byte per ground-floor cell: the floor height in decimeters (0 almost everywhere; the theatre and stage differ) |
| `stairs` | Stairwells: `id` (named in directions: `Blue`, `NW`...), `a` = the ground-floor cell where you enter, `b` = the 2nd-floor cell where you come out, `cost` = walking length in meters, `via` = `[x, z, y]` points of the walk up the flights, for drawing |
| `rooms` | Every room: `label` (`214`, `A104`, or empty), `name` (`Room 214`, `Media Center`), `type` (`class`, `lab`, `office`, `lav`, `stair`, `gym`, `media`...), `level`, `R` (its rectangle), `big` (large space), `target` (walkable point just inside the door; routes end here), `fromEntrance` (route length from the front entrance in meters), `doors` (`axis` of the wall it's in, the wall's coordinate `c`, and the door's extent `a`..`b` along the wall) |
| `walls` | Per floor, wall segments for drawing: `['z', c, p, q]` is a wall along `z = c` from `x = p` to `q`; `['x', c, p, q]` along `x = c` from `z = p` to `q` |
| `blocks` | The building's ground-floor footprint as rectangles (also what counts as "indoors" for routing) |
| `level1` | The 2nd floor's footprint |
| `courtyards` | Open-air courtyards inside the footprint |
| `zones` | Named areas, mostly hallways (`Main Hall`, `700s Hallway`, `Lobby`, `Commons`), with their `level` and rectangle |
| `entrances` | Outside doors: `name`, `main` (the front entrance), and the door's middle `x`, `z` on the wall line |
| `spawn` | A point just outside the main entrance, where "from the front entrance" routes start |

## Regenerating map.json

Do this when a 3D repo fixes or moves rooms. You need Node 18+, a copy of the 3D repo, three.js **0.169.0** (the version the game loads from a CDN; the script serves it locally) and Playwright with Chromium.

```sh
# 1. The 3D model, next to this repo
cd ..
git clone https://github.com/Just-Rice/hsn-3d.git        # or cms-3d
cd School-Day-Tracker

# 2. three.js 0.169.0 in a scratch folder (keeps this repo's package.json clean)
npm i --prefix /tmp/three three@0.169.0

# 3. Playwright and its Chromium, once
npm i -g playwright
playwright install chromium

# 4. Extract (prints a one-line summary when done)
THREE_DIR=/tmp/three/node_modules/three node tools/extract-school-map.mjs ../hsn-3d hsn
THREE_DIR=/tmp/three/node_modules/three node tools/extract-school-map.mjs ../cms-3d cms
```

Instead of steps 2–3 you can install both into this repo without saving them: `npm i --no-save three@0.169.0 playwright && npx playwright install chromium`, then leave out `THREE_DIR` (it defaults to `node_modules/three`). The next `npm ci` removes them again.

Expect output like `hsn: 164 rooms (154 routed), grid 516x400 @ 0.5 m, 5 stairs -> .../public/schools/hsn/map.json`. The game renders with software WebGL, so building the school can take a few minutes. The rooms that aren't "routed" should be just the stairwells (routes go through them, not to them); any other room missing from the count has no door the game can reach, and routes to it end at its middle. A third argument writes somewhere else instead: `node tools/extract-school-map.mjs ../hsn-3d hsn /tmp/hsn-map.json`.

> **CMS: one fix isn't in cms-3d yet.** The committed `public/schools/cms/map.json` was exported with room 611 corrected in `cms-3d/src/layout.js` (line 124: `R('611', [745, 600, 840, 667], ...)` instead of `[745, 582, 840, 667]`). On the floor plan 611 has a cut-off corner; the full rectangle pokes into the junction of the 500s, 400s and 600s hallways and closes it, so without the fix only 55 of 209 CMS rooms can be reached indoors and directions send students around the outside of the building (Room 408: 367 m instead of 136 m). Make that one-line change in cms-3d (or in your clone) before re-exporting; the test "reaches every room without leaving the building" fails if it's missing.

Then check the result before committing:

1. **Room keys** (next section): make sure no key that students may have saved disappeared.
2. `npm test` and `npm run dev`, then on the Map page: search a few rooms, route to a room upstairs from the front entrance and between two rooms, and switch floors.
3. Commit `public/schools/<id>/map.json`.

## Room keys: keep them stable

When a student picks a classroom from the map, the class stores the room's **key** in `ClassInfo.room.mapKey`, in their account. `buildRooms` in [`src/lib/mapData.ts`](../src/lib/mapData.ts) makes the key from the room itself:

- the `label` when it's unique in the school: `214`, `A104`;
- otherwise the label, name or type plus the floor, and a counter for repeats: `Restroom@1`, `Storage@1#2`.

So **renaming or relabeling a room, adding a room with the same label, or reordering duplicate rooms changes keys**, and every class pointing at an old key loses its link to the map (it keeps its text label, but the map can't find the room until the student picks it again). When a 3D repo changes room labels, compare the keys before and after. Save this as `room-keys.ts` in the repo root (don't commit it) and run it with the `vite-node` that comes with Vitest:

```ts
// npx vite-node room-keys.ts old-map.json public/schools/hsn/map.json
import { readFileSync } from 'node:fs';
import { buildRooms } from './src/lib/mapData';

const [before, after] = process.argv.slice(2).map((f) => new Set(buildRooms(JSON.parse(readFileSync(f, 'utf8'))).map((r) => r.key)));
console.log('gone:', [...before].filter((k) => !after.has(k)));
console.log('new:', [...after].filter((k) => !before.has(k)));
```

(`git show HEAD:public/schools/hsn/map.json > old-map.json` gets the committed version.) Keys under "gone" that are real classrooms need a decision: keep the old label in the 3D repo, or accept that students re-pick that room.

## Adding another school

1. **Build a model.** The extractor reads the HSN 3D engine's debug hooks (`window.__game` with `info`, `nav`, `levelH`, `spawn`, `teleport()`, `routeToRoom()`), so the new school needs a 3D repo built on that engine. Start from a copy of `cms-3d` (itself a copy of `hsn-3d`) and lay out the building's rooms, doors, stairwells, hallway zones and entrances in its `src/layout.js` from a floor plan.
2. **Extract it:** `node tools/extract-school-map.mjs ../<new>-3d <id>` writes `public/schools/<id>/map.json`.
3. **Bell schedule:** add `public/schools/<id>/schedule.json` (copy `other/schedule.json` as a start; see [schedules.md](schedules.md)) and run `node tools/validate-schedules.mjs`.
4. **Register the id** everywhere schools are listed:
   - `SchoolId` in [`src/types.ts`](../src/types.ts);
   - a `SchoolMeta` entry in `SCHOOLS` and `SCHOOL_LIST` in [`src/schools/index.ts`](../src/schools/index.ts): name, short name, grades, color, `hasMap: true`, `model3d`, `floorNames`, and `mapOrientation` / `northDeg` (use `'plan'` and measure the angle to north if world +x isn't north);
   - the `schoolId` list in [`firestore.rules`](../firestore.rules) (then redeploy the rules), `SCHOOL_IDS` in `src/lib/backup.ts` and `tools/validate-schedules.mjs`, and the checks in `src/components/account/onboardingDraft.ts`.
5. Run `npm run typecheck && npm test`, try the map and directions, and update the README.
