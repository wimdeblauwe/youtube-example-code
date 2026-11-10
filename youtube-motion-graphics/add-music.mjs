// Turns a Wrap export into the video for YouTube: prepends the intro (with the intro music), brings the
// voice-over to YouTube loudness and puts the outro music under the last words.
//
//   node add-music.mjs --video "<Wrap export>.mp4" --intro out/intro-<slug>.mp4 --last-word 13:27.1
//
// See the "Music and final video" section of README.md. Requires ffmpeg and ffprobe.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = import.meta.dirname;
const INTRO_MUSIC = join(DIR, 'out/intro-music/e2-marimba-strum.wav');
const OUTRO_MUSIC = join(DIR, 'out/intro-music/o2-outro-amen.wav');
const OUTRO_STRUM = 4.0;     // seconds into the outro music where the final strum lands
const OUTRO_LENGTH = 7.5;
const BUILD = 2.9;           // the first 2.9 s of intro and outro music are the same material

// ---------- arguments ----------
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const num = (name, fallback) => (args[name] === undefined ? fallback : Number(args[name]));
const parseTime = (s) => String(s).split(':').reduce((total, part) => total * 60 + Number(part), 0);

if (!args.video || !args.intro) {
  console.error('Usage: node add-music.mjs --video <Wrap export.mp4> --intro <intro.mp4> [--last-word <m:ss.s>]\n' +
    '         [--out <file.mp4>] [--voice-lufs -14] [--music-lufs -17] [--outro-duck 12] [--crf 17]');
  process.exit(1);
}
const VOICE_LUFS = num('voice-lufs', -14);   // YouTube plays at about −14 LUFS
const MUSIC_LUFS = num('music-lufs', -17);   // intro music, and the final strum of the outro
const OUTRO_DUCK = num('outro-duck', 12);    // dB the outro music is lowered while you are still talking
const CRF = num('crf', 17);
const base = args.video.replace(/\.mp4$/i, '');
const out = args.out ?? `${base} - with intro and music.mp4`;
const outBase = out.replace(/\.mp4$/i, '');

// ---------- ffmpeg helpers ----------
function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) { console.error(r.stderr || r.error); process.exit(1); }
  return r;
}
const probe = (file, entries, stream = []) =>
  run('ffprobe', ['-v', 'error', ...stream, '-show_entries', entries, '-of', 'csv=p=0', file]).stdout.trim();
function lufs(file, { filter = '', from, length, audioOnly = true } = {}) {   // integrated loudness (EBU R128)
  const r = run('ffmpeg', ['-hide_banner', '-nostats', ...(from !== undefined ? ['-ss', from] : []),
    ...(length !== undefined ? ['-t', length] : []), '-i', file, ...(audioOnly ? ['-vn'] : []),
    '-af', `${filter ? filter + ',' : ''}ebur128`, '-f', 'null', '-']);
  return Number(r.stderr.split('Summary:').pop().match(/I:\s+(-?[\d.]+) LUFS/)[1]);
}
const lin = (db) => (10 ** (db / 20)).toFixed(4);
const db = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(1)} dB`;

// Compressor + limiter: the voice track of a Wrap export already peaks at 0 dBFS, so gain alone would clip.
const voiceChain = (gain) => 'aformat=channel_layouts=mono,acompressor=threshold=-27dB:ratio=3:attack=8:release=120:knee=6,' +
  `alimiter=level_in=${lin(gain)}:limit=0.79:attack=5:release=50:level=disabled`;

// ---------- 1. music ----------
console.log('Synthesizing the music …');
run('node', ['intro-music.mjs', 'e2', 'o2'], { cwd: DIR });
const introGain = MUSIC_LUFS - lufs(INTRO_MUSIC);
const outroGain = introGain + lufs(INTRO_MUSIC, { length: BUILD }) - lufs(OUTRO_MUSIC, { length: BUILD });

// ---------- 2. voice gain that reaches the loudness target ----------
const before = lufs(args.video);
let [g0, g1] = [12, 18], l0 = lufs(args.video, { filter: voiceChain(g0) }), l1 = lufs(args.video, { filter: voiceChain(g1) });
for (let i = 0; i < 5 && Math.abs(l1 - VOICE_LUFS) > 0.15; i++) {
  const g = Math.max(0, Math.min(34, g1 + (VOICE_LUFS - l1) * (g1 - g0) / (l1 - l0)));
  [g0, l0, g1] = [g1, l1, g]; l1 = lufs(args.video, { filter: voiceChain(g1) });
}
console.log(`Voice: ${before.toFixed(1)} LUFS → ${l1.toFixed(1)} LUFS (compressor + limiter, ${db(g1)})`);

// ---------- 3. build ----------
const [width, height, fps] = probe(args.video, 'stream=width,height,r_frame_rate', ['-select_streams', 'v:0']).split(',');
const videoLength = Number(probe(args.video, 'format=duration'));
const introLength = Number(probe(args.intro, 'format=duration'));

const inputs = ['-i', args.intro, '-i', args.video, '-i', INTRO_MUSIC];
const graph = [
  `[0:v]fps=${fps},scale=${width}:${height}:flags=lanczos,format=yuv420p,setsar=1[iv]`,
  '[1:v]format=yuv420p,setsar=1[mv]', '[iv][mv]concat=n=2:v=1:a=0[v]',
  `[2:a]volume=${lin(introGain)},apad=whole_dur=${introLength},atrim=0:${introLength}[intro]`,
  `[1:a]${voiceChain(g1)},aformat=channel_layouts=stereo[voice]`,
];
if (args['last-word'] !== undefined) {
  // The final strum lands right after the last word; everything before it plays quietly under the voice.
  const lastWord = parseTime(args['last-word']), start = lastWord + 0.05 - OUTRO_STRUM, room = videoLength - start;
  if (start < 0 || lastWord > videoLength) { console.error(`--last-word ${args['last-word']} does not fit in the video (${videoLength} s)`); process.exit(1); }
  const tail = videoLength - lastWord;
  if (tail < 1.5) console.warn(`Only ${tail.toFixed(1)} s of video after the last word: the final strum has little time to ring out (2 s or more is better).`);
  const bed = lin(outroGain - OUTRO_DUCK), full = lin(outroGain), rise = OUTRO_STRUM - 0.15;
  const fadeStart = Math.max(OUTRO_STRUM + 0.2, room - 1), fade = room < OUTRO_LENGTH ? `,afade=t=out:st=${fadeStart}:d=${Math.max(0.1, room - fadeStart)}` : '';
  inputs.push('-i', OUTRO_MUSIC);
  graph.push(
    `[3:a]volume='if(lt(t,${rise}),${bed},if(lt(t,${OUTRO_STRUM}),${bed}+(${full}-${bed})*(t-${rise})/0.15,${full}))':eval=frame${fade},adelay=${Math.round(start * 1000)}:all=1[outro]`,
    '[voice][outro]amix=inputs=2:duration=first:normalize=0[main]');
  console.log(`Outro music: starts at ${start.toFixed(1)} s, final strum at ${(lastWord + 0.05).toFixed(1)} s (export time)`);
} else {
  graph.push('[voice]anull[main]');
  console.log('No --last-word given: no outro music.');
}
graph.push('[intro][main]concat=n=2:v=0:a=1[a]');

console.log('Encoding …');
run('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', graph.join(';'), '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', CRF, '-pix_fmt', 'yuv420p',
  '-colorspace', 'bt709', '-color_trc', 'bt709', '-color_primaries', 'bt709',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', out]);

// ---------- 4. chapters and captions move along with the intro ----------
const pad = (n, len = 2) => String(n).padStart(len, '0');
const shiftCaption = (text) => text.replace(/(\d{2}):(\d{2}):(\d{2})([,.])(\d{3})/g, (_, h, m, s, sep, ms) => {
  const t = Math.round((h * 3600 + m * 60 + +s + ms / 1000 + introLength) * 1000);
  return `${pad(Math.floor(t / 3600000))}:${pad(Math.floor(t / 60000) % 60)}:${pad(Math.floor(t / 1000) % 60)}${sep}${pad(t % 1000, 3)}`;
});
const shiftChapters = (text) => text.replace(/^((?:\d+:)?\d+:\d{2})(?= )/gm, (stamp) => {
  const t = parseTime(stamp) === 0 ? 0 : parseTime(stamp) + Math.round(introLength);   // YouTube wants the first chapter at 0:00
  return t >= 3600 ? `${Math.floor(t / 3600)}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}` : `${Math.floor(t / 60)}:${pad(t % 60)}`;
});
for (const [ext, shift] of [['chapters.txt', shiftChapters], ['srt', shiftCaption], ['vtt', shiftCaption]]) {
  if (existsSync(`${base}.${ext}`)) writeFileSync(`${outBase}.${ext}`, shift(readFileSync(`${base}.${ext}`, 'utf8')));
}

// ---------- 5. check ----------
console.log(`Intro music: ${lufs(out, { length: introLength }).toFixed(1)} LUFS · voice: ${lufs(out, { from: introLength }).toFixed(1)} LUFS`);
console.log(`Wrote ${out} (${Number(probe(out, 'format=duration')).toFixed(1)} s)`);
