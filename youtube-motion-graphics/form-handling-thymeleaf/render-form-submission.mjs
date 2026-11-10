// Renders form-submission.html (the "How form submission works" diagram) to video.
// Usage (from youtube-motion-graphics/):
//        node form-handling-thymeleaf/render-form-submission.mjs [--out out/form-submission.mp4] [--fps 60] [--workers 6]
//        node form-handling-thymeleaf/render-form-submission.mjs --stills 5000,20000   (PNGs at those clip times in ms)
// Output paths are relative to youtube-motion-graphics/ (out/ is gitignored).
// Frames are rendered in parallel by several headless Chrome pages, then encoded with ffmpeg.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: 'out/form-submission.mp4' },
    stills: { type: 'string' },
    fps: { type: 'string', default: '60' },
    workers: { type: 'string', default: '6' },
  },
});
const W = 1728, H = 1118;
const url = new URL(pathToFileURL(resolve(here, 'form-submission.html')));
url.searchParams.set('render', '');

const browser = await chromium.launch({ channel: 'chrome' });
async function openPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(url.href);
  await page.evaluate(() => window.ready);
  return page;
}

try {
  if (args.stills) {
    const page = await openPage();
    mkdirSync(resolve(root, 'out/stills'), { recursive: true });
    for (const ms of args.stills.split(',').map(Number)) {
      await page.evaluate((t) => window.seek(t), ms);
      const p = resolve(root, `out/stills/fs-${String(ms).padStart(5, '0')}.png`);
      await page.screenshot({ path: p });
      console.log(p);
    }
  } else {
    const fps = Number(args.fps);
    const probe = await openPage();
    const duration = await probe.evaluate(() => window.CLIP_DURATION);
    await probe.close();
    const frames = Math.ceil((duration / 1000) * fps);
    const dir = resolve(root, 'out/frames');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    let next = 0, done = 0;
    const worker = async () => {
      const page = await openPage();
      for (let i = next++; i < frames; i = next++) {
        await page.evaluate((t) => window.seek(t), (i * 1000) / fps);
        await page.screenshot({ path: join(dir, `f${String(i).padStart(6, '0')}.png`) });
        if (++done % fps === 0) process.stdout.write(`\rframe ${done}/${frames}`);
      }
    };
    await Promise.all(Array.from({ length: Number(args.workers) }, worker));

    const out = resolve(root, args.out);
    mkdirSync(dirname(out), { recursive: true });
    await new Promise((ok, fail) => spawn('ffmpeg', [
      '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', join(dir, 'f%06d.png'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-movflags', '+faststart', out,
    ], { stdio: 'inherit' }).on('close', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited with ${c}`)))));
    rmSync(dir, { recursive: true, force: true });
    console.log(`\rWrote ${out} (${frames} frames @ ${fps} fps)`);
  }
} finally {
  await browser.close();
}
