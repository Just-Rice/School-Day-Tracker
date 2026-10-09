// Renders public/icons/icon.svg into the PNG app icons the web manifest and iOS need:
//
//   node tools/make-icons.mjs
//
//   icon-192.png, icon-512.png    the icon as drawn (rounded corners, transparent outside)
//   icon-maskable-512.png         full-bleed brand blue with the artwork inside the safe zone,
//                                 for Android launchers that crop icons to their own shape
//   apple-touch-icon-180.png      full-bleed too: iOS rounds the corners itself and would
//                                 otherwise fill the transparent corners with black
//
// Uses Playwright's Chromium (not a project dependency): a local install if there is one,
// otherwise the global one (npm root -g). Edit icon.svg, run this, and commit the PNGs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'public', 'icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
// the icon's own background, so the full-bleed variants match it exactly
const BRAND = svg.match(/<rect[^>]*fill="(#[0-9a-fA-F]{3,8})"/)?.[1] ?? '#1f45a8';

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 1, bleed: false },
  { file: 'icon-512.png', size: 512, scale: 1, bleed: false },
  // ~12% padding on each side keeps the artwork inside the maskable safe circle (radius 40%)
  { file: 'icon-maskable-512.png', size: 512, scale: 0.76, bleed: true },
  { file: 'apple-touch-icon-180.png', size: 180, scale: 1, bleed: true },
];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  const globalRoot = process.env.NPM_GLOBAL || execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(path.join(globalRoot, 'x.js'))('playwright'));
}

const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const browser = await chromium.launch();
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
    const px = Math.round(icon.size * icon.scale);
    await page.setContent(
      `<!doctype html><html><body style="margin:0">
        <div style="width:${icon.size}px;height:${icon.size}px;display:grid;place-items:center;background:${icon.bleed ? BRAND : 'transparent'}">
          <img src="${src}" width="${px}" height="${px}" alt="">
        </div>
      </body></html>`,
    );
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    await page.screenshot({ path: path.join(dir, icon.file), omitBackground: !icon.bleed, clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
    await page.close();
    console.log(`${icon.file} (${icon.size}x${icon.size})`);
  }
} finally {
  await browser.close();
}
