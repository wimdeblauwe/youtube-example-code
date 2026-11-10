// Synthesizes the intro and outro music (pure Node, no dependencies).
//
//   node intro-music.mjs            → out/intro-music/<option>.wav for every option (48 kHz stereo)
//   node intro-music.mjs e2 o2      → only the ones in use: e2 = intro (5 s), o2 = outro (7.5 s)
//
// The other options are the alternatives that were tried. The files are peak-normalized to −3 dBFS;
// set the level when mixing them into a video.
//
// The music is timed to the intro animation (120 BPM, one beat = 0.5 s):
//   0.0 s diamond spins in · 1.0 s name wipes in · 1.95 s coin flip · 3.0 s title lands
import { mkdirSync, writeFileSync } from 'node:fs';

const SR = 48000;
const DURATION = 5.0;        // length of the intro
const RENDER = 10.0;         // render longer so reverb tails are computed, then fade + trim
const N = Math.round(SR * RENDER);
const TAU = Math.PI * 2;

// ---------- helpers ----------
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const n = (name) => { const [, p, o] = name.match(/^([A-G][#b]?)(-?\d)$/); return 12 * (+o + 1) + NOTE[p]; };

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rel = (i, len, sec) => Math.min(1, (len - i) / (sec * SR));

// ---------- voices (all return a mono Float32Array) ----------
function epiano(m, dur, vel = 0.8) {
  const len = Math.round(dur * SR), o = new Float32Array(len), f = hz(m), w = TAU * f / SR;
  const tineRatio = f * 14 < 9000 ? 14 : 7;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const a = Math.min(1, t / 0.004) * Math.exp(-t * (1.5 + f / 700)) * rel(i, len, 0.08);
    const idx = vel * 1.5 * Math.exp(-t * 5) + 0.2;
    const tine = 0.2 * vel * Math.exp(-t * 20) * Math.sin(w * i * tineRatio);
    o[i] = (0.8 * Math.sin(w * i + idx * Math.sin(w * i)) + tine) * a * vel;
  }
  return o;
}

function pad(m, dur, { att = 0.8, release = 1.0, cut = 1200, seed = 1 } = {}) {
  const len = Math.round(dur * SR), o = new Float32Array(len), r = rng(seed + m);
  for (const cents of [-8, 0, 8]) {
    const f = hz(m) * 2 ** (cents / 1200);
    for (let h = 1; h <= 12 && h * f < 12000; h++) {
      const amp = (1 / h) / (1 + (h * f / cut) ** 2) / 3, w = TAU * f * h / SR, ph = r() * TAU;
      for (let i = 0; i < len; i++) o[i] += amp * Math.sin(w * i + ph);
    }
  }
  for (let i = 0; i < len; i++) {
    const a = Math.min(1, i / (att * SR)), rl = rel(i, len, release);
    o[i] *= a * a * (3 - 2 * a) * rl * rl * (3 - 2 * rl);
  }
  return o;
}

function pluck(m, dur, { bright = 1 } = {}) {
  const len = Math.round(dur * SR), o = new Float32Array(len), f = hz(m);
  const H = Math.max(1, Math.min(20, Math.floor(9000 / f)));
  for (let h = 1; h <= H; h++) {
    const w = TAU * f * h / SR, d = 2.5 + h * 2.4 / bright;
    for (let i = 0; i < len; i++) o[i] += Math.sin(w * i) / h * Math.exp(-i / SR * d);
  }
  for (let i = 0; i < len; i++) o[i] *= Math.min(1, i / (0.002 * SR)) * rel(i, len, 0.05) * 0.6;
  return o;
}

function bell(m, dur, vel = 1) {
  const len = Math.round(dur * SR), o = new Float32Array(len), f = hz(m);
  for (const [ratio, amp, d] of [[1, 1, 2.0], [2.0, 0.45, 3.2], [3.0, 0.2, 5], [4.2, 0.16, 7], [5.4, 0.09, 9]]) {
    if (ratio * f > 16000) continue;
    const w = TAU * f * ratio / SR;
    for (let i = 0; i < len; i++) o[i] += amp * Math.sin(w * i) * Math.exp(-i / SR * d);
  }
  for (let i = 0; i < len; i++) o[i] *= Math.min(1, i / (0.003 * SR)) * rel(i, len, 0.1) * vel * 0.5;
  return o;
}

function bass(m, dur) {
  const len = Math.round(dur * SR), o = new Float32Array(len), w = TAU * hz(m) / SR;
  for (let i = 0; i < len; i++) {
    const t = i / SR, a = Math.min(1, t / 0.005) * Math.exp(-t * 3.5) * rel(i, len, 0.03);
    o[i] = Math.tanh(1.6 * (Math.sin(w * i) + 0.3 * Math.sin(2 * w * i))) * a * 0.7;
  }
  return o;
}

function kick(vel = 1) {
  const len = Math.round(0.45 * SR), o = new Float32Array(len); let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR; ph += TAU * (46 + 95 * Math.exp(-t * 32)) / SR;
    o[i] = Math.sin(ph) * Math.exp(-t * 9) * Math.min(1, t / 0.001) * rel(i, len, 0.05) * vel;
  }
  return o;
}

function boom(dur = 2.5, f0 = 40) {
  const len = Math.round(dur * SR), o = new Float32Array(len); let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR; ph += TAU * (f0 + 55 * Math.exp(-t * 16)) / SR;
    o[i] = Math.tanh(1.5 * Math.sin(ph)) * Math.exp(-t * 2.2) * Math.min(1, t / 0.002) * rel(i, len, 0.2);
  }
  return o;
}

function svfNoise(dur, { from, to, q = 0.7, seed = 7, shape }) {  // band-passed noise, cutoff sweeps from→to
  const len = Math.round(dur * SR), o = new Float32Array(len), r = rng(seed); let low = 0, band = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len, fc = from * (to / from) ** p, f = 2 * Math.sin(Math.PI * fc / SR);
    low += f * band; const high = (r() * 2 - 1) - low - q * band; band += f * high;
    o[i] = band * shape(p, i / SR);
  }
  return o;
}
const riser = (dur, seed) => svfNoise(dur, { from: 500, to: 7000, seed, shape: (p) => p ** 2.5 * Math.min(1, (1 - p) * dur / 0.012) });
const whoosh = (dur, seed) => svfNoise(dur, { from: 900, to: 6000, seed, shape: (p) => Math.sin(Math.PI * p) ** 2 });
const hat = (seed, vel = 1) => svfNoise(0.07, { from: 7900, to: 7900, q: 0.4, seed, shape: (p, t) => Math.exp(-t * 75) * Math.min(1, t / 0.001) * vel });
const snap = (seed) => svfNoise(0.18, { from: 1900, to: 1700, q: 0.5, seed, shape: (p, t) => Math.exp(-t * 34) * Math.min(1, t / 0.001) });

// ---------- mixer + effects ----------
class Mix {
  constructor() { this.L = new Float32Array(N); this.R = new Float32Array(N); this.sL = new Float32Array(N); this.sR = new Float32Array(N); }
  put(sig, t0, { gain = 1, pan = 0, send = 0 } = {}) {
    const a = (pan + 1) * Math.PI / 4, gl = Math.cos(a) * gain, gr = Math.sin(a) * gain, off = Math.round(t0 * SR);
    for (let i = 0; i < sig.length && off + i < N; i++) {
      if (off + i < 0) continue;
      this.L[off + i] += sig[i] * gl; this.R[off + i] += sig[i] * gr;
      this.sL[off + i] += sig[i] * gl * send; this.sR[off + i] += sig[i] * gr * send;
    }
  }
  add(other, gain = 1) { for (const k of ['L', 'R', 'sL', 'sR']) for (let i = 0; i < N; i++) this[k][i] += other[k][i] * gain; }
}

function pingPong(mix, time, feedback, wet) {      // tempo delay on a whole bus
  const d = Math.round(time * SR), L = mix.L.slice(), R = mix.R.slice();
  const eL = new Float32Array(N), eR = new Float32Array(N);
  for (let i = d; i < N; i++) { eL[i] = (L[i - d] + R[i - d]) * 0.5 + eR[i - d] * feedback; eR[i] = eL[i - d] * feedback; }
  // eL fires first, eR one repeat later
  for (let i = 0; i < N; i++) {
    const r = i >= d ? eR[i] / feedback : 0;
    mix.L[i] += eL[i] * wet; mix.R[i] += r * wet * feedback; mix.sL[i] += eL[i] * wet * 0.5; mix.sR[i] += r * wet * feedback * 0.5;
  }
}

function reverb(inL, inR, { room = 0.86, damp = 0.35, predelay = 0.02 } = {}) {   // Freeverb
  const k = SR / 44100, pd = Math.round(predelay * SR), out = [new Float32Array(N), new Float32Array(N)];
  const mono = new Float32Array(N); let hp = 0;
  for (let i = 0; i < N; i++) {                      // keep the lows out of the reverb
    const x = (inL[i] + inR[i]) * 0.5; hp += (x - hp) * (TAU * 220 / SR); mono[i] = (x - hp) * 0.03;
  }
  for (let ch = 0; ch < 2; ch++) {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((t) => ({ b: new Float32Array(Math.round((t + ch * 23) * k)), i: 0, s: 0 }));
    const aps = [556, 441, 341, 225].map((t) => ({ b: new Float32Array(Math.round((t + ch * 23) * k)), i: 0 }));
    for (let i = pd; i < N; i++) {
      const x = mono[i - pd]; let y = 0;
      for (const c of combs) {
        const o = c.b[c.i]; c.s = o * (1 - damp) + c.s * damp; c.b[c.i] = x + c.s * room;
        if (++c.i === c.b.length) c.i = 0; y += o;
      }
      for (const a of aps) {
        const bo = a.b[a.i], o = bo - y; a.b[a.i] = y + bo * 0.5;
        if (++a.i === a.b.length) a.i = 0; y = o;
      }
      out[ch][i] = y;
    }
  }
  return out;
}

function master(mix, { wet = 1, room, damp, duration = DURATION, fade = 0.7 } = {}) {
  const [wL, wR] = reverb(mix.sL, mix.sR, { room, damp });
  const len = Math.round(duration * SR), L = new Float32Array(len), R = new Float32Array(len);
  const fadeFrom = (duration - fade) * SR; let peak = 0, hL = 0, hR = 0;
  for (let i = 0; i < len; i++) {
    let l = mix.L[i] + wL[i] * wet, r = mix.R[i] + wR[i] * wet;
    hL += (l - hL) * (TAU * 28 / SR); hR += (r - hR) * (TAU * 28 / SR); l -= hL; r -= hR;   // DC / rumble filter
    const p = i < fadeFrom ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (i - fadeFrom) / (len - fadeFrom));
    L[i] = l * p; R[i] = r * p; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 10 ** (-3 / 20) / peak;                  // normalize to −3 dBFS peak
  for (let i = 0; i < len; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}

function wav([L, R]) {
  const len = L.length, buf = Buffer.alloc(44 + len * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + len * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(len * 4, 40);
  for (let i = 0; i < len; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  return buf;
}

const chord = (mix, voice, notes, t0, opts = {}, spread = 0.6) =>
  notes.forEach((name, i) => mix.put(voice(n(name)), t0, { ...opts, pan: notes.length > 1 ? -spread + 2 * spread * i / (notes.length - 1) : 0 }));

// ---------- option A: warm keys ----------
// Electric piano arpeggio over a soft pad, D major: Bm – G – A – D. Calm, friendly, "crafted".
function warmKeys() {
  const m = new Mix();
  const pads = [[0, ['B2', 'F#3', 'D4', 'A4']], [1, ['G2', 'D3', 'B3', 'F#4']], [2, ['A2', 'E3', 'C#4', 'E4']]];
  for (const [t, notes] of pads) chord(m, (x) => pad(x, 1.5, { att: 0.35, release: 0.6, cut: 900 }), notes, t - 0.1, { gain: 0.5, send: 0.6 });
  chord(m, (x) => pad(x, 3.2, { att: 0.12, release: 1.6, cut: 1100 }), ['D2', 'A2', 'D3', 'F#3', 'A3', 'E4'], 2.95, { gain: 0.55, send: 0.6 });

  const arp = ['B3', 'F#4', 'B4', 'D5', 'G4', 'B4', 'D5', 'F#5', 'A4', 'C#5', 'E5', 'A5'];
  arp.forEach((name, i) => m.put(epiano(n(name), 1.6, 0.55 + 0.03 * i), i * 0.25, { gain: 0.5, pan: i % 2 ? 0.35 : -0.35, send: 0.5 }));

  m.put(bell(n('F#6'), 1.5, 0.5), 1.0, { gain: 0.35, pan: 0.3, send: 0.9 });         // name wipe
  m.put(whoosh(0.45, 3), 1.6, { gain: 0.05, send: 0.8 });                            // coin flip
  m.put(bell(n('A6'), 1.5, 0.5), 1.95, { gain: 0.3, pan: -0.3, send: 0.9 });
  chord(m, (x) => epiano(x, 3, 0.85), ['D3', 'A3', 'D4', 'F#4', 'A4', 'E5'], 3.0, { gain: 0.5, send: 0.55 });   // title lands
  m.put(epiano(n('D2'), 3, 0.8), 3.0, { gain: 0.6 });
  m.put(bell(n('D6'), 2, 0.8), 3.0, { gain: 0.4, send: 0.9 });
  m.put(bell(n('A6'), 2, 0.5), 3.25, { gain: 0.25, pan: 0.4, send: 0.9 });
  return master(m, { wet: 1, room: 0.86, damp: 0.4 });
}

// ---------- option B: upbeat pluck ----------
// Plucky 16ths with a light beat and a riser into the title, A major: F#m – D – E – A. Energetic, "tech".
function upbeatPluck() {
  const m = new Mix(), plucks = new Mix();
  const pattern = [
    ['F#4', 'A4', 'C#5', 'A4', 'F#5', 'C#5', 'A4', 'C#5'],
    ['D4', 'F#4', 'A4', 'F#4', 'D5', 'A4', 'F#4', 'A4'],
    ['E4', 'G#4', 'B4', 'G#4', 'B4', 'E5', 'G#5', 'B5'],
  ].flat();
  pattern.forEach((name, i) => plucks.put(pluck(n(name), 0.5, { bright: 1.1 + i / 30 }), i * 0.125,
    { gain: 0.42 * (i % 2 ? 0.8 : 1), pan: i % 4 < 2 ? -0.3 : 0.3, send: 0.3 }));
  pingPong(plucks, 0.375, 0.4, 0.3);
  m.add(plucks);

  [['F#2', 0], ['D2', 1], ['E2', 2]].forEach(([name, t]) => { for (let k = 0; k < 4; k++) m.put(bass(n(name), 0.24), t + k * 0.25, { gain: 0.5 }); });
  for (const t of [0, 0.75, 1.0, 1.75, 2.0, 2.75]) m.put(kick(), t, { gain: 0.75 });
  for (const t of [0.5, 1.5, 2.5]) m.put(snap(t * 10), t, { gain: 0.28, send: 0.6 });
  for (let i = 0; i < 12; i++) m.put(hat(i + 20, i % 2 ? 1 : 0.5), 0.125 + i * 0.25, { gain: 0.11, pan: 0.2 });
  [[0, ['F#3', 'C#4', 'A4']], [1, ['D3', 'A3', 'F#4']], [2, ['E3', 'B3', 'G#4']]]
    .forEach(([t, notes]) => chord(m, (x) => pad(x, 1.3, { att: 0.2, release: 0.4, cut: 1400 }), notes, t - 0.05, { gain: 0.3, send: 0.4 }));

  m.put(bell(n('C#6'), 1.2, 0.5), 1.0, { gain: 0.25, pan: 0.3, send: 0.8 });        // name wipe
  m.put(whoosh(0.4, 5), 1.62, { gain: 0.06, send: 0.6 });                           // coin flip
  m.put(riser(1.0, 11), 2.0, { gain: 0.1, send: 0.5 });                             // into the title

  m.put(kick(), 3.0, { gain: 0.85 });                                               // title lands
  m.put(boom(1.6), 3.0, { gain: 0.3 });
  m.put(bass(n('A1'), 1.8), 3.0, { gain: 0.5 });
  chord(m, (x) => pluck(x, 2.2, { bright: 1.6 }), ['A3', 'E4', 'A4', 'C#5', 'E5', 'B5'], 3.0, { gain: 0.36, send: 0.6 });
  chord(m, (x) => pad(x, 3, { att: 0.05, release: 1.6, cut: 1600 }), ['A2', 'E3', 'C#4', 'B4'], 3.0, { gain: 0.4, send: 0.5 });
  m.put(bell(n('E6'), 2, 0.7), 3.0, { gain: 0.3, send: 0.9 });
  return master(m, { wet: 0.9, room: 0.8, damp: 0.45 });
}

// ---------- option C: cinematic logo ----------
// Slow, spacious: swelling pad, sparse bells, a riser and a deep hit on the title, D minor → F: Dm – Bb – F.
function cinematic() {
  const m = new Mix();
  m.put(boom(2.2), 0, { gain: 0.35 });
  chord(m, (x) => pad(x, 2.5, { att: 1.0, release: 0.7, cut: 800 }), ['D2', 'A2', 'D3', 'F3', 'E4'], 0, { gain: 0.6, send: 0.7 });
  chord(m, (x) => pad(x, 1.5, { att: 0.5, release: 0.5, cut: 1000 }), ['Bb1', 'Bb2', 'F3', 'A3', 'D4'], 1.8, { gain: 0.6, send: 0.7 });
  chord(m, (x) => pad(x, 3.4, { att: 0.06, release: 1.8, cut: 1300 }), ['F1', 'F2', 'C3', 'F3', 'A3', 'G4', 'C5'], 3.0, { gain: 0.6, send: 0.7 });

  [['A4', 1.0, -0.3], ['D5', 1.5, 0.3], ['F5', 1.95, -0.2], ['G5', 2.5, 0.2]]
    .forEach(([name, t, pan], i) => m.put(bell(n(name), 2, 0.6 + i * 0.08), t, { gain: 0.42, pan, send: 1 }));
  m.put(whoosh(0.5, 9), 1.55, { gain: 0.07, send: 0.9 });                           // coin flip
  m.put(riser(1.2, 13), 1.8, { gain: 0.13, send: 0.8 });                            // into the title

  m.put(boom(2.6), 3.0, { gain: 0.7 });                                             // title lands
  m.put(kick(), 3.0, { gain: 0.5 });
  m.put(bell(n('A5'), 2.2, 1), 3.0, { gain: 0.42, pan: -0.25, send: 1 });
  m.put(bell(n('C6'), 2.2, 0.9), 3.0, { gain: 0.36, pan: 0.25, send: 1 });
  m.put(bell(n('F6'), 2, 0.5), 3.5, { gain: 0.22, send: 1 });
  chord(m, (x) => epiano(x, 3, 0.7), ['F3', 'C4', 'A4'], 3.0, { gain: 0.3, send: 0.7 });
  return master(m, { wet: 1.3, room: 0.9, damp: 0.3 });
}

// ---------- extra voices for the upbeat variations ----------
function marimba(m, dur, vel = 1) {
  const len = Math.round(dur * SR), o = new Float32Array(len), f = hz(m);
  for (const [ratio, amp, d] of [[1, 1, 7], [4, 0.3, 24], [10, 0.08, 50]]) {
    if (ratio * f > 14000) continue;
    const w = TAU * f * ratio / SR;
    for (let i = 0; i < len; i++) o[i] += amp * Math.sin(w * i) * Math.exp(-i / SR * d);
  }
  for (let i = 0; i < len; i++) o[i] *= Math.min(1, i / (0.0015 * SR)) * rel(i, len, 0.05) * vel * 0.7;
  return o;
}
const openHat = (seed) => svfNoise(0.22, { from: 7900, to: 7900, q: 0.4, seed, shape: (p, t) => Math.exp(-t * 16) * Math.min(1, t / 0.001) * (1 - p) });

// Shared landing on the title (3.0 s): kick + boom + bass + plucked chord + pad + bell.
function landing(m, { bassNote, chordNotes, padNotes, bellNote }) {
  m.put(kick(), 3.0, { gain: 0.85 });
  m.put(boom(1.6), 3.0, { gain: 0.3 });
  m.put(bass(n(bassNote), 1.8), 3.0, { gain: 0.5 });
  chord(m, (x) => pluck(x, 2.2, { bright: 1.6 }), chordNotes, 3.0, { gain: 0.36, send: 0.6 });
  chord(m, (x) => pad(x, 3, { att: 0.05, release: 1.6, cut: 1600 }), padNotes, 3.0, { gain: 0.4, send: 0.5 });
  m.put(bell(n(bellNote), 2, 0.7), 3.0, { gain: 0.3, send: 0.9 });
}

// ---------- option D: syncopated bounce ----------
// Four-on-the-floor kick, offbeat bass and hats, a 3+3+2 pluck riff. G major: Em – C – D – G. Dance-y, confident.
function bounce() {
  const m = new Mix(), plucks = new Mix();
  const riff = [['B4', 'E5', 'G5'], ['C5', 'E5', 'G5'], ['D5', 'F#5', 'A5']];
  riff.forEach((notes, bar) => notes.forEach((name, k) => {
    const t = bar + [0, 0.375, 0.75][k];
    plucks.put(pluck(n(name), 0.45, { bright: 1.3 }), t, { gain: 0.45, pan: k === 1 ? 0.3 : -0.3, send: 0.3 });
    plucks.put(pluck(n(name) - 12, 0.45, { bright: 1 }), t, { gain: 0.3, send: 0.2 });
  }));
  plucks.put(pluck(n('B5'), 0.4, { bright: 1.5 }), 2.875, { gain: 0.4, pan: 0.3, send: 0.4 });   // pickup into the title
  pingPong(plucks, 0.25, 0.35, 0.3);
  m.add(plucks);

  for (let k = 0; k < 6; k++) m.put(kick(), k * 0.5, { gain: 0.75 });
  [['E2', 0], ['C2', 1], ['D2', 2]].forEach(([name, t]) => { for (const off of [0.25, 0.75]) m.put(bass(n(name), 0.22), t + off, { gain: 0.55 }); });
  for (let k = 0; k < 6; k++) m.put(openHat(k + 40), 0.25 + k * 0.5, { gain: 0.07, pan: 0.2 });
  for (const t of [0.5, 1.5, 2.5]) m.put(snap(t * 10), t, { gain: 0.26, send: 0.6 });
  [[0, ['E3', 'B3', 'G4']], [1, ['C3', 'G3', 'E4']], [2, ['D3', 'A3', 'F#4']]]
    .forEach(([t, notes]) => chord(m, (x) => pad(x, 1.3, { att: 0.2, release: 0.4, cut: 1400 }), notes, t - 0.05, { gain: 0.28, send: 0.4 }));

  m.put(bell(n('B5'), 1.2, 0.5), 1.0, { gain: 0.25, pan: 0.3, send: 0.8 });         // name wipe
  m.put(whoosh(0.4, 5), 1.62, { gain: 0.06, send: 0.6 });                           // coin flip
  m.put(riser(1.0, 11), 2.0, { gain: 0.1, send: 0.5 });
  landing(m, { bassNote: 'G1', chordNotes: ['G3', 'D4', 'G4', 'B4', 'D5', 'A5'], padNotes: ['G2', 'D3', 'B3', 'A4'], bellNote: 'D6' });
  return master(m, { wet: 0.9, room: 0.8, damp: 0.45 });
}

// Alternative endings for the marimba build (what happens when the title lands at 3.0 s).
// All but `original` share a low end that is tuned to E (the original boom was not, and beat against the bass).
function lowE(m) {
  m.put(kick(), 3.0, { gain: 0.8 });
  m.put(boom(1.6, hz(n('E1'))), 3.0, { gain: 0.3 });
  m.put(bass(n('E2'), 1.8), 3.0, { gain: 0.4 });
}
const softPad = (m, notes, t = 3.0, dur = 3) => chord(m, (x) => pad(x, dur, { att: 0.05, release: Math.min(1.6, dur / 2), cut: 1400 }), notes, t, { gain: 0.38, send: 0.5 });
const marimbaEndings = {
  // add9 chord on plucks + marimba, bell on top
  original(m) {
    landing(m, { bassNote: 'E1', chordNotes: ['E3', 'B3', 'E4', 'G#4', 'B4', 'F#5'], padNotes: ['E2', 'B2', 'G#3', 'F#4'], bellNote: 'B5' });
    chord(m, (x) => marimba(x, 1.5, 1), ['E4', 'B4', 'E5', 'G#5'], 3.0, { gain: 0.4, send: 0.6 });
  },
  // 1: plain E major, nothing added: the "obvious" resolution
  cleanTriad(m) {
    lowE(m);
    chord(m, (x) => marimba(x, 1.8, 1), ['E3', 'B3', 'E4', 'G#4', 'B4', 'E5'], 3.0, { gain: 0.42, send: 0.6 });
    chord(m, (x) => pluck(x, 2.2, { bright: 1.2 }), ['E3', 'B3', 'G#4', 'E5'], 3.0, { gain: 0.26, send: 0.6 });
    softPad(m, ['E2', 'B2', 'G#3', 'E4']);
    m.put(marimba(n('E6'), 1.5, 0.7), 3.0, { gain: 0.3, send: 0.8 });
  },
  // 2: marimba only, rolled upwards like a strum; lighter, no synth stab
  strum(m) {
    lowE(m);
    ['E3', 'B3', 'E4', 'G#4', 'B4', 'E5', 'G#5', 'B5'].forEach((name, i) =>
      m.put(marimba(n(name), 2, 0.8 + i * 0.03), 3.0 + i * 0.028, { gain: 0.42, pan: -0.5 + i / 7, send: 0.65 }));
    softPad(m, ['E2', 'B2', 'G#3']);
  },
  // 3: open fifths (E + B, no third): neutral, modern, punchy
  openFifth(m) {
    lowE(m);
    chord(m, (x) => pluck(x, 2.2, { bright: 1.8 }), ['E3', 'B3', 'E4', 'B4', 'E5'], 3.0, { gain: 0.32, send: 0.6 });
    chord(m, (x) => marimba(x, 1.8, 1), ['E4', 'B4', 'E5', 'B5'], 3.0, { gain: 0.4, send: 0.6 });
    softPad(m, ['E2', 'B2', 'E3', 'B3']);
    m.put(marimba(n('E6'), 1.5, 0.8), 3.0, { gain: 0.3, send: 0.8 });
  },
  // 4: no chord; the arpeggio lands on a high E and trickles back down
  melodicTail(m) {
    lowE(m);
    chord(m, (x) => marimba(x, 1.8, 1), ['E4', 'E5', 'E6'], 3.0, { gain: 0.45, send: 0.6 }, 0.3);
    softPad(m, ['E2', 'B2', 'G#3', 'E4']);
    ['B5', 'G#5', 'E5', 'B4', 'E5'].forEach((name, i) =>
      m.put(marimba(n(name), 1.2, 0.8 - i * 0.1), 3.25 + i * 0.25, { gain: 0.42, pan: i % 2 ? -0.35 : 0.35, send: 0.7 }));
  },
  // 5: suspended chord on the title that resolves half a second later
  susResolve(m) {
    lowE(m);
    chord(m, (x) => marimba(x, 1.2, 1), ['E3', 'B3', 'E4', 'A4', 'B4', 'E5'], 3.0, { gain: 0.42, send: 0.6 });
    softPad(m, ['E2', 'B2', 'A3', 'E4'], 3.0, 0.75);
    chord(m, (x) => marimba(x, 1.6, 0.9), ['G#4', 'B4', 'E5', 'G#5'], 3.5, { gain: 0.4, send: 0.65 });
    softPad(m, ['E2', 'B2', 'G#3', 'E4'], 3.45, 2.5);
  },
};

// ---------- option E: marimba build ----------
// Starts sparse and builds: marimba arpeggio climbing from 8ths to 16ths, the beat joins at 1.0 s, a roll and a
// riser lead into the title. E major: C#m – A – B – E. Playful, organic.
function marimbaBuild(ending = marimbaEndings.original, masterOpts = {}) {
  const m = new Mix(), mar = new Mix();
  ['C#4', 'G#4', 'C#5', 'E5'].forEach((name, i) => mar.put(marimba(n(name), 0.6, 0.7), i * 0.25, { gain: 0.5, pan: i % 2 ? 0.3 : -0.3, send: 0.45 }));
  ['A3', 'C#4', 'E4', 'A4', 'C#5', 'E5', 'A5', 'E5', 'B3', 'D#4', 'F#4', 'B4', 'D#5', 'F#5', 'B5', 'D#6']
    .forEach((name, i) => mar.put(marimba(n(name), 0.5, 0.7 + i * 0.02), 1 + i * 0.125,
      { gain: 0.5 * (i % 2 ? 0.8 : 1), pan: i % 4 < 2 ? -0.35 : 0.35, send: 0.4 }));
  pingPong(mar, 0.375, 0.35, 0.25);
  m.add(mar);

  [['C#2', 0, 0.35], ['A1', 1, 0.5], ['B1', 2, 0.5]].forEach(([name, t, gain]) => m.put(bass(n(name), 0.95), t, { gain }));
  for (const t of [1.0, 1.5, 2.0, 2.5]) m.put(kick(), t, { gain: 0.7 });
  for (let i = 0; i < 16; i++) m.put(hat(i + 60, i % 2 ? 0.5 : 1), 1 + i * 0.125, { gain: 0.07 + i * 0.003, pan: -0.2 });
  [2.5, 2.625, 2.75, 2.8125, 2.875, 2.9375].forEach((t, i) => m.put(snap(i + 80), t, { gain: 0.1 + i * 0.035, send: 0.5 }));   // roll
  chord(m, (x) => pad(x, 1.4, { att: 0.6, release: 0.4, cut: 1000 }), ['C#3', 'G#3', 'E4'], 0, { gain: 0.3, send: 0.5 });
  [[1, ['A2', 'E3', 'C#4']], [2, ['B2', 'F#3', 'D#4']]]
    .forEach(([t, notes]) => chord(m, (x) => pad(x, 1.3, { att: 0.2, release: 0.4, cut: 1400 }), notes, t - 0.05, { gain: 0.3, send: 0.4 }));

  m.put(bell(n('E6'), 1.2, 0.5), 1.0, { gain: 0.22, pan: 0.3, send: 0.8 });         // name wipe
  m.put(whoosh(0.4, 5), 1.62, { gain: 0.06, send: 0.6 });                           // coin flip
  m.put(riser(1.2, 11), 1.8, { gain: 0.11, send: 0.5 });
  ending(m);
  return master(m, { wet: 0.9, room: 0.8, damp: 0.45, ...masterOpts });
}

// ---------- outro ideas, based on the marimba build with the strum ending (e2) ----------
const E_DOWN = ['B5', 'G#5', 'E5', 'B4', 'G#4', 'E4', 'B3', 'E3'];
function finalStrum(m, t) {                          // slow downward strum on E, low and long: "the end"
  m.put(kick(), t, { gain: 0.6 });
  m.put(boom(2.6, hz(n('E1'))), t, { gain: 0.35 });
  m.put(bass(n('E2'), 2.5), t, { gain: 0.4 });
  E_DOWN.forEach((name, i) => m.put(marimba(n(name), 3, 0.9 - i * 0.02), t + i * 0.045, { gain: 0.44, pan: 0.5 - i / 7, send: 0.75 }));
  chord(m, (x) => pad(x, 3.6, { att: 0.08, release: 2.4, cut: 1200 }), ['E2', 'B2', 'G#3', 'E4'], t, { gain: 0.4, send: 0.6 });
}

// Outro 1, "mirror": the intro played backwards in spirit. Opens with the intro's upward strum, the arpeggio
// now falls and thins out (the beat drops away), and it closes on a slow downward strum. E – A – B – E.
function outroMirror() {
  const m = new Mix(), mar = new Mix();
  marimbaEndings.strum(m);                           // at 3.0 s …
  const s = new Mix(); s.add(m); m.L.fill(0); m.R.fill(0); m.sL.fill(0); m.sR.fill(0);
  for (const k of ['L', 'R', 'sL', 'sR']) m[k].set(s[k].subarray(3 * SR, N - 0), 0);   // … moved to 0.0 s
  ['B5', 'G#5', 'E5', 'B4', 'G#5', 'E5', 'B4', 'G#4', 'A5', 'E5', 'C#5', 'A4', 'E5', 'C#5', 'A4', 'E4']
    .forEach((name, i) => mar.put(marimba(n(name), 0.5, 0.95 - i * 0.02), 0.5 + i * 0.125,
      { gain: 0.5 * (i % 2 ? 0.8 : 1), pan: i % 4 < 2 ? -0.35 : 0.35, send: 0.4 }));
  ['F#5', 'D#5', 'B4', 'F#4'].forEach((name, i) => mar.put(marimba(n(name), 0.7, 0.6), 2.5 + i * 0.25, { gain: 0.45, pan: i % 2 ? 0.3 : -0.3, send: 0.5 }));
  pingPong(mar, 0.375, 0.35, 0.25);
  m.add(mar);
  for (const t of [0.5, 1.0, 1.5, 2.0]) m.put(kick(), t, { gain: 0.65 });
  for (let i = 0; i < 16; i++) m.put(hat(i + 60, i % 2 ? 0.5 : 1), 0.5 + i * 0.125, { gain: 0.1 - i * 0.004, pan: -0.2 });
  m.put(bass(n('A1'), 0.95), 1.5, { gain: 0.45 }); m.put(bass(n('B1'), 0.95), 2.5, { gain: 0.4 });
  chord(m, (x) => pad(x, 1.2, { att: 0.2, release: 0.4, cut: 1400 }), ['A2', 'E3', 'C#4'], 1.45, { gain: 0.3, send: 0.4 });
  chord(m, (x) => pad(x, 1.2, { att: 0.2, release: 0.4, cut: 1200 }), ['B2', 'F#3', 'D#4'], 2.45, { gain: 0.3, send: 0.4 });
  finalStrum(m, 3.5);
  m.put(marimba(n('E6'), 1.5, 0.6), 4.5, { gain: 0.3, send: 0.9 });
  return master(m, { wet: 1, room: 0.86, damp: 0.4, duration: 7.5, fade: 2 });
}

// Outro 2, "amen": exactly the intro, but the strum at 3.0 s lands on A instead of E and only then settles
// on a slow, low E strum (IV → I, the classic closing cadence).
function outroAmen() {
  return marimbaBuild((m) => {
    m.put(kick(), 3.0, { gain: 0.8 });
    m.put(bass(n('A1') + 12, 0.95), 3.0, { gain: 0.45 });
    ['A3', 'E4', 'A4', 'C#5', 'E5', 'A5', 'C#6'].forEach((name, i) =>
      m.put(marimba(n(name), 1.4, 0.8 + i * 0.03), 3.0 + i * 0.028, { gain: 0.42, pan: -0.5 + i / 6, send: 0.65 }));
    chord(m, (x) => pad(x, 1.1, { att: 0.05, release: 0.4, cut: 1400 }), ['A2', 'E3', 'C#4'], 3.0, { gain: 0.38, send: 0.5 });
    finalStrum(m, 4.0);
  }, { duration: 7.5, fade: 2 });
}

// ---------- option F: funky keys ----------
// Short electric-piano chord stabs, a jumping bass line and a tight beat with a plucked top line.
// D major: Bm7 – Gadd9 – A – D. Groovy, laid-back but lively.
function funkyKeys() {
  const m = new Mix(), top = new Mix();
  const bars = [
    { stab: ['B3', 'D4', 'F#4', 'A4'], bass: 'B1', line: ['F#5', 'D5', 'B4', 'D5'] },
    { stab: ['B3', 'D4', 'G4', 'A4'], bass: 'G1', line: ['G5', 'D5', 'B4', 'D5'] },
    { stab: ['C#4', 'E4', 'A4', 'B4'], bass: 'A1', line: ['A5', 'E5', 'C#5', 'E5'] },
  ];
  bars.forEach(({ stab, bass: b, line }, t) => {
    for (const off of [0, 0.375, 0.625]) chord(m, (x) => epiano(x, 0.28, 0.9), stab, t + off, { gain: 0.42, send: 0.35 }, 0.5);
    [[0, 0, 0.22], [0.25, 0, 0.1], [0.375, 12, 0.1], [0.75, 0, 0.1], [0.875, 12, 0.1]]
      .forEach(([off, oct, dur]) => m.put(bass(n(b) + 12 + oct, dur), t + off, { gain: 0.5 }));
    line.forEach((name, k) => top.put(pluck(n(name), 0.4, { bright: 1.4 }), t + k * 0.25, { gain: 0.3, pan: k % 2 ? 0.35 : -0.35, send: 0.4 }));
    m.put(kick(), t, { gain: 0.75 }); m.put(kick(), t + 0.75, { gain: 0.6 });
    m.put(snap(t * 10 + 3), t + 0.5, { gain: 0.28, send: 0.6 });
    for (let k = 0; k < 8; k++) m.put(hat(t * 8 + k + 100, k % 4 === 2 ? 1 : 0.5), t + k * 0.125, { gain: 0.09, pan: 0.2 });
  });
  top.put(pluck(n('A5'), 0.3, { bright: 1.5 }), 2.875, { gain: 0.3, pan: 0.3, send: 0.4 });
  pingPong(top, 0.375, 0.35, 0.3);
  m.add(top);

  m.put(bell(n('F#6'), 1.2, 0.5), 1.0, { gain: 0.22, pan: 0.3, send: 0.8 });        // name wipe
  m.put(whoosh(0.4, 5), 1.62, { gain: 0.06, send: 0.6 });                           // coin flip
  m.put(riser(0.8, 11), 2.2, { gain: 0.09, send: 0.5 });
  landing(m, { bassNote: 'D2', chordNotes: ['D4', 'A4', 'D5', 'F#5'], padNotes: ['D2', 'A2', 'F#3', 'E4'], bellNote: 'A5' });
  chord(m, (x) => epiano(x, 2.5, 0.9), ['D3', 'A3', 'D4', 'F#4', 'A4', 'E5'], 3.0, { gain: 0.4, send: 0.5 });
  return master(m, { wet: 0.9, room: 0.8, damp: 0.45 });
}

const options = {
  'a-warm-keys': warmKeys, 'b-upbeat-pluck': upbeatPluck, 'c-cinematic': cinematic,
  'd-syncopated-bounce': bounce, 'e-marimba-build': marimbaBuild, 'f-funky-keys': funkyKeys,
  'e1-marimba-clean-triad': () => marimbaBuild(marimbaEndings.cleanTriad),
  'e2-marimba-strum': () => marimbaBuild(marimbaEndings.strum),
  'e3-marimba-open-fifth': () => marimbaBuild(marimbaEndings.openFifth),
  'e4-marimba-melodic-tail': () => marimbaBuild(marimbaEndings.melodicTail),
  'e5-marimba-sus-resolve': () => marimbaBuild(marimbaEndings.susResolve),
  'o1-outro-mirror': outroMirror, 'o2-outro-amen': outroAmen,
};
const only = process.argv.slice(2);                  // e.g. `node intro-music.mjs d e1 e2`
mkdirSync('out/intro-music', { recursive: true });
for (const [name, make] of Object.entries(options).filter(([k]) => !only.length || only.includes(k.split('-')[0]))) {
  const file = `out/intro-music/${name}.wav`;
  writeFileSync(file, wav(make()));
  console.log('wrote', file);
}
