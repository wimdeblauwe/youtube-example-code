// Renders intro.html frame by frame with headless Chrome and pipes the frames into ffmpeg.
// Usage: node render.mjs --title "Form handling with *Thymeleaf*" [--out out/file.mp4] [--still 5000]
//        [--fps 60] [--duration 5000] [--scale 2] [--name-size 48] [--header-lift 32] [--title-shift 20]
// Frames are rendered at --scale × 1080p and downscaled with lanczos (supersampling) for sharper output.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    title: { type: 'string' },
    out: { type: 'string' },
    still: { type: 'string' }, // write a single PNG at this time (ms) instead of a video
    fps: { type: 'string', default: '60' },
    duration: { type: 'string', default: '5000' },
    scale: { type: 'string', default: '2' },
    'name-size': { type: 'string' },
    'header-lift': { type: 'string' },
    'title-shift': { type: 'string' },
  },
});
if (!args.title) {
  console.error('Missing --title, e.g. --title "Form handling with *Thymeleaf*"');
  process.exit(1);
}

const slug = args.title.replace(/\*/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out = resolve(args.out ?? `out/intro-${slug}${args.still ? `-${args.still}ms.png` : '.mp4'}`);
mkdirSync(dirname(out), { recursive: true });

const fps = Number(args.fps);
const duration = Number(args.duration);
const url = new URL(pathToFileURL(resolve(here, 'intro.html')));
url.searchParams.set('title', args.title);
url.searchParams.set('duration', String(duration));
for (const [arg, param] of [['name-size', 'nameSize'], ['header-lift', 'headerLift'], ['title-shift', 'titleShift']]) {
  if (args[arg] !== undefined) url.searchParams.set(param, args[arg]);
}
url.searchParams.set('render', '');

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: args.still ? 1 : Number(args.scale) });
  await page.goto(url.href);
  await page.evaluate(() => window.introReady);

  if (args.still) {
    await page.evaluate((ms) => window.seek(ms), Number(args.still));
    await page.screenshot({ path: out });
    console.log(`Wrote ${out}`);
  } else {
    const ffmpeg = spawn('ffmpeg', [
      '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-vf', 'scale=1920:1080:flags=lanczos',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-movflags', '+faststart', out,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok, fail) => ffmpeg.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`)))));

    const frames = Math.round((duration / 1000) * fps);
    for (let i = 0; i < frames; i++) {
      await page.evaluate((ms) => window.seek(ms), (i * 1000) / fps);
      const png = await page.screenshot({ type: 'png' });
      if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
      if (i % fps === 0) process.stdout.write(`\rframe ${i}/${frames}`);
    }
    ffmpeg.stdin.end();
    await done;
    console.log(`\rWrote ${out} (${frames} frames @ ${fps} fps)`);
  }
} finally {
  await browser.close();
}
