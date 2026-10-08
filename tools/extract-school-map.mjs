// Exports a school's floor plan and walkable grid from its 3D model repo (hsn-3d / cms-3d)
// into public/schools/<id>/map.json for the tracker's 2-D map and route finder.
//
//   node tools/extract-school-map.mjs <path-to-3d-repo> <school-id> [out-file]
//
// The 3D game is loaded in headless Chromium (Playwright) exactly as its own tests do, and the
// data is read from window.__game once the school is built. three.js is served from
// THREE_DIR (default: node_modules/three next to this repo); it must be three@0.169.0.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const [repoArg, id, outArg] = process.argv.slice(2);
if (!repoArg || !id) {
  console.error('usage: node tools/extract-school-map.mjs <path-to-3d-repo> <school-id> [out-file]');
  process.exit(1);
}
const root = path.resolve(repoArg);
const out = path.resolve(outArg || path.join(here, '..', 'public', 'schools', id, 'map.json'));
const threeDir = path.resolve(process.env.THREE_DIR || path.join(here, '..', 'node_modules', 'three'));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  // fall back to a globally installed Playwright
  const globalRoot = process.env.NPM_GLOBAL || execSync('npm root -g').toString().trim();
  const req = createRequire(path.join(globalRoot, 'x.js'));
  ({ chromium } = req('playwright'));
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
await page.addInitScript(() => {
  try {
    for (const p of ['cms3d:', 'wwpn3d:', 'hsn3d:']) { localStorage.setItem(p + 'quality', '"low"'); localStorage.setItem(p + 'help', 'false'); }
  } catch {}
});
await page.route('**/lightmaps/**', (r) => r.fulfill({ status: 404, body: '' }));
await page.route('https://cdn.jsdelivr.net/npm/three@0.169.0/**', (r) => {
  const rel = new URL(r.request().url()).pathname.replace('/npm/three@0.169.0/', '');
  r.fulfill({ body: fs.readFileSync(path.join(threeDir, rel)), contentType: 'text/javascript' });
});
await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForFunction(() => window.__game && !document.querySelector('#go').disabled, null, { timeout: 900000 });

const data = await page.evaluate(() => {
  const g = window.__game, info = g.info, nav = g.nav;
  const r2 = (v) => Math.round(v * 100) / 100;
  const R = (r) => r.map(r2);
  // grid geometry, recovered from the nav grid itself
  const N = nav.blocked[0].length;
  const [ax, az] = nav.center(0), [bx] = nav.center(1);
  const CS = r2(bx - ax);
  let NX = 1;
  while (NX < N && Math.abs(nav.center(NX)[1] - az) < 1e-6) NX++;
  const grid = { X0: r2(ax - CS / 2), Z0: r2(az - CS / 2), CS, NX, NZ: N / NX };
  const pack = (arr) => {
    const bytes = new Uint8Array(Math.ceil(arr.length / 8));
    for (let i = 0; i < arr.length; i++) if (arr[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  };
  // level-0 ground height in decimeters (raked theatre floors, stage steps); 0 almost everywhere
  const hs = new Int8Array(N);
  for (let i = 0; i < N; i++) hs[i] = Math.max(-127, Math.min(127, Math.round(nav.h[i] * 10)));
  let hstr = '';
  for (let i = 0; i < N; i++) hstr += String.fromCharCode(hs[i] & 0xff);
  const stairs = info.stairs.filter((s) => s.navA !== undefined).map((s) => ({
    id: s.id,
    a: nav.center(s.navA).map(r2),
    b: nav.center(s.navB - N).map(r2),
    cost: r2(s.D * 2 + s.W),
    via: (s.via || []).map((p) => p.map(r2)),
  }));
  // the walk in front of the main entrance (HSN's debug hooks don't expose ext.spawn)
  let spawn = g.spawn;
  if (!spawn) {
    const e = info.entrances.find((q) => q.main);
    spawn = e.axis === 'z' ? [e.mid, e.c + e.out * 3] : [e.c + e.out * 3, e.mid];
  }
  const rooms = [];
  for (const rm of info.rooms) {
    const entry = { label: rm.label || '', name: rm.name || '', type: rm.type, level: rm.level, R: R(rm.R), big: !!rm.big };
    if (rm.type !== 'stair') {
      g.teleport([spawn[0], 0, spawn[1]], 0);
      const p = g.routeToRoom(rm);
      if (p && p.points.length) {
        const last = p.points[p.points.length - 1];
        entry.target = [r2(last.x), r2(last.z)];
        entry.fromEntrance = Math.round(p.length);
      }
    }
    if (rm.doorList) entry.doors = rm.doorList.map((d) => ({ axis: d.axis, c: r2(d.c), a: r2(d.a), b: r2(d.b) }));
    rooms.push(entry);
  }
  return {
    grid,
    levelH: r2(g.levelH),
    blocked: nav.blocked.map(pack),
    heights: btoa(hstr),
    stairs,
    rooms,
    walls: info.mapWalls.map((lv) => lv.map(([axis, c, p, q]) => [axis, r2(c), r2(p), r2(q)])),
    blocks: info.blockRects.map((b) => R(b.r)),
    level1: (info.level1Rects || []).map(R),
    courtyards: (info.courtyards || [info.courtyard]).filter(Boolean).map(R),
    zones: (info.zones || []).map((z) => ({ name: z.name, level: z.level ?? 0, R: R(z.R) })),
    // doors in the outside wall: axis 'z' is the wall plane z = c, so the door's middle is at x = mid
    entrances: (info.entrances || []).map((e) => ({ name: e.name, main: !!e.main, x: r2(e.axis === 'z' ? e.mid : e.c), z: r2(e.axis === 'z' ? e.c : e.mid) })),
    spawn: spawn.map(r2),
  };
});
await browser.close();
server.close();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ id, source: path.basename(root), ...data }));
const routed = data.rooms.filter((r) => r.target).length;
console.log(`${id}: ${data.rooms.length} rooms (${routed} routed), grid ${data.grid.NX}x${data.grid.NZ} @ ${data.grid.CS} m, ${data.stairs.length} stairs -> ${out}`);
