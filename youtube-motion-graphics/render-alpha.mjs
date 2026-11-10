// Renders a transparent overlay page to ProRes 4444 with alpha, for Wrap's Animations bin.
// Usage: node render-alpha.mjs --page form-handling-thymeleaf/dependencies-highlight.html [--out out/x.mov] [--fps 60]
//        node render-alpha.mjs --page form-handling-thymeleaf/dependencies-highlight.html --stills 600,2500 [--bg]
// The page must define window.ready, window.seek(ms) and window.CLIP_DURATION.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    page: { type: 'string' }, out: { type: 'string' }, stills: { type: 'string' }, bg: { type: 'boolean' },
    fps: { type: 'string', default: '60' }, workers: { type: 'string', default: '6' },
    width: { type: 'string', default: '1920' }, height: { type: 'string', default: '1080' },
  },
});
const name = basename(args.page, '.html');
const url = new URL(pathToFileURL(resolve(here, args.page)));
url.searchParams.set('render', '');
if (args.bg) url.searchParams.set('bg', '');
const viewport = { width: Number(args.width), height: Number(args.height) };

const browser = await chromium.launch({ channel: 'chrome' });
const open = async () => {
  const p = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await p.goto(url.href);
  await p.evaluate(() => window.ready);
  return p;
};
try {
  if (args.stills) {
    const p = await open();
    mkdirSync(resolve(here, 'out/stills'), { recursive: true });
    for (const ms of args.stills.split(',').map(Number)) {
      await p.evaluate((t) => window.seek(t), ms);
      const f = resolve(here, `out/stills/${name}-${ms}.png`);
      await p.screenshot({ path: f, omitBackground: !args.bg });
      console.log(f);
    }
  } else {
    const fps = Number(args.fps);
    const probe = await open();
    const frames = Math.ceil((await probe.evaluate(() => window.CLIP_DURATION)) / 1000 * fps);
    await probe.close();
    const dir = resolve(here, `out/frames-${name}`);
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    let next = 0;
    await Promise.all(Array.from({ length: Number(args.workers) }, async () => {
      const p = await open();
      for (let i = next++; i < frames; i = next++) {
        await p.evaluate((t) => window.seek(t), (i * 1000) / fps);
        await p.screenshot({ path: join(dir, `f${String(i).padStart(6, '0')}.png`), omitBackground: true });
      }
    }));
    const out = resolve(here, args.out ?? `out/${name}.mov`);
    await new Promise((ok, fail) => spawn('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(fps),
      '-i', join(dir, 'f%06d.png'), '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
      '-alpha_bits', '16', '-vendor', 'apl0', out], { stdio: 'inherit' })
      .on('close', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited with ${c}`)))));
    rmSync(dir, { recursive: true, force: true });
    console.log(`Wrote ${out} (${frames} frames @ ${fps} fps)`);
  }
} finally {
  await browser.close();
}
