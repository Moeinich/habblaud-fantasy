// Sounds synthesized with WebAudio (no audio files or recorded samples): short, quiet and with a
// camp timbre — axe on firewood, anvil, low horn, creaking rope and pulley.
import type { SoundKind } from './scheduler';

export interface VoiceOpts {
  /** Final gain (master volume already applied). */
  gain: number;
  /** -1 .. 1 (left .. right). */
  pan?: number;
  /** Work: strikes in the burst. */
  count?: number;
  rng: () => number;
  /** Short white noise (strikes, creaks and the "hup"). */
  noise: AudioBuffer | null;
}

/** Percussive envelope: short attack and exponential decay. */
function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(ac: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, peak: number, attack: number, decay: number, toFreq?: number): void {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + Math.min(decay, 0.08));
  env(g, t, peak, attack, decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

/** Filtered noise snap (wood, straw, scrape). */
function noiseHit(ac: AudioContext, out: AudioNode, noise: AudioBuffer, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, offset: number): void {
  const src = ac.createBufferSource();
  src.buffer = noise;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  env(g, t, peak, 0.002, decay);
  src.connect(f).connect(g).connect(out);
  src.start(t, offset, decay + 0.03);
}

/** Plucked string: sawtooth with the filter closing quickly (rustic lute). */
function pluck(ac: AudioContext, out: AudioNode, freq: number, t: number, peak: number, decay: number): void {
  const o = ac.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(Math.min(5000, freq * 8), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.2), t + decay * 0.6);
  const g = ac.createGain();
  env(g, t, peak, 0.003, decay);
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  o.stop(t + decay + 0.05);
}

/** Creates a white-noise buffer (the basis of the strikes, the creak and the "hup"). */
export function makeNoise(ac: AudioContext): AudioBuffer | null {
  try {
    const len = Math.floor(ac.sampleRate * 0.25);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  } catch {
    return null;
  }
}

/** Plays `kind` at `t` (AudioContext time) on the `dest` output. */
export function playVoice(ac: AudioContext, dest: AudioNode, kind: SoundKind, t: number, o: VoiceOpts): void {
  let out: AudioNode = dest;
  if (o.pan && typeof ac.createStereoPanner === 'function') {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    p.connect(dest);
    out = p;
  }
  const g = o.gain;
  switch (kind) {
    case 'chime':
      // "needs you": a low horn calling twice
      horn(ac, out, t, g);
      return;
    case 'pop':
      // task done: a mallet blow on a log (wooden "thok")
      tone(ac, out, 'triangle', 520, t, 0.13 * g, 0.004, 0.14, 210);
      tone(ac, out, 'sine', 150, t, 0.09 * g, 0.004, 0.12, 95);
      if (o.noise) noiseHit(ac, out, o.noise, t, 'bandpass', 1400, 1.2, 0.05 * g, 0.03, 0);
      return;
    case 'elevator':
      creak(ac, out, t, o);
      return;
    case 'keys':
      work(ac, out, t, o);
      return;
    case 'pingpong':
      // wooden mallet hitting the ball: hollow "tok" with falling pitch
      tone(ac, out, 'triangle', 820, t, 0.09 * g, 0.002, 0.07, 560);
      return;
    case 'table':
      // bounce on the plank tabletop: lower and muffled
      tone(ac, out, 'sine', 420, t, 0.07 * g, 0.002, 0.06, 260);
      return;
    case 'arcade': {
      // the tavern "arcade": three lute notes on a pentatonic scale
      const scale = [220, 246.9, 293.7, 329.6, 392, 440];
      for (let i = 0; i < 3; i++) {
        const f = scale[Math.floor(o.rng() * scale.length)];
        pluck(ac, out, f, t + i * 0.09, 0.035 * g, 0.28);
      }
      return;
    }
  }
}

/** Low horn: two slightly detuned sawtooths, a slowly opening filter, two calls. */
function horn(ac: AudioContext, out: AudioNode, t: number, gain: number): void {
  const blow = (at: number, freq: number, len: number, peak: number) => {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(260, at);
    lp.frequency.linearRampToValueAtTime(900, at + 0.12);
    lp.frequency.linearRampToValueAtTime(520, at + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.08);
    g.gain.setValueAtTime(peak, at + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    lp.connect(g).connect(out);
    for (const detune of [-6, 7]) {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      // starts a little flat and rises to the note, like a breath
      osc.frequency.setValueAtTime(freq * 0.94, at);
      osc.frequency.exponentialRampToValueAtTime(freq, at + 0.07);
      osc.connect(lp);
      osc.start(at);
      osc.stop(at + len + 0.05);
    }
  };
  blow(t, 110, 0.38, 0.07 * gain);
  blow(t + 0.42, 146.8, 0.8, 0.08 * gain);
}

/** Creaking rope and pulley: a click train through a narrow wobbling filter, and the platform's thud. */
function creak(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  const len = 0.65;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(26, t);
  osc.frequency.linearRampToValueAtTime(44 + o.rng() * 10, t + len * 0.45);
  osc.frequency.linearRampToValueAtTime(30, t + len);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 7;
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.linearRampToValueAtTime(1100, t + len * 0.5);
  bp.frequency.linearRampToValueAtTime(820, t + len);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22 * o.gain, t + 0.06);
  g.gain.setValueAtTime(0.22 * o.gain, t + len * 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(bp).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + len + 0.05);
  // the plank platform lands: a low wooden thud
  tone(ac, out, 'sine', 130, t + len - 0.04, 0.1 * o.gain, 0.004, 0.18, 80);
  if (o.noise) noiseHit(ac, out, o.noise, t + len - 0.04, 'lowpass', 900, 0.7, 0.05 * o.gain, 0.06, 0.05);
}

/**
 * Work: a burst of axe blows on firewood (or, sometimes, hammer blows on the anvil) at irregular
 * intervals; now and then the worker lets out a short "hup" before the first strike.
 */
function work(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  if (!o.noise) return;
  const anvil = o.rng() < 0.3;
  const n = Math.max(1, Math.min(anvil ? 4 : 6, Math.ceil((o.count ?? 4) * (anvil ? 0.5 : 0.75))));
  let at = t;
  if (!anvil && o.rng() < 0.12) {
    hup(ac, out, at, o);
    at += 0.13;
  }
  for (let i = 0; i < n; i++) {
    const v = o.gain * (0.6 + o.rng() * 0.4);
    if (anvil) clink(ac, out, at, v, o.rng);
    else chop(ac, out, at, v, o);
    at += anvil ? 0.22 + o.rng() * 0.12 : 0.17 + o.rng() * 0.14 + (o.rng() < 0.15 ? 0.15 : 0);
  }
}

/** Axe blow: a dry wooden snap (mid-band noise) with a short low body. */
function chop(ac: AudioContext, out: AudioNode, t: number, v: number, o: VoiceOpts): void {
  if (!o.noise) return;
  noiseHit(ac, out, o.noise, t, 'bandpass', 800 + o.rng() * 500, 1.6, 0.11 * v, 0.045 + o.rng() * 0.02, o.rng() * 0.1);
  tone(ac, out, 'sine', 190 + o.rng() * 40, t, 0.06 * v, 0.002, 0.07, 110);
}

/** Hammer on the anvil: high inharmonic partials, with the shimmer dying before the body. */
function clink(ac: AudioContext, out: AudioNode, t: number, v: number, rng: () => number): void {
  const base = 1500 + rng() * 250;
  tone(ac, out, 'sine', base, t, 0.04 * v, 0.001, 0.35);
  tone(ac, out, 'sine', base * 2.76, t, 0.02 * v, 0.001, 0.18);
  tone(ac, out, 'sine', base * 5.4, t, 0.01 * v, 0.001, 0.07);
}

/** "Hup": filtered noise with a rising formant, like a grunt of effort. Short and quiet. */
function hup(ac: AudioContext, out: AudioNode, t: number, o: VoiceOpts): void {
  if (!o.noise) return;
  const src = ac.createBufferSource();
  src.buffer = o.noise;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 4;
  bp.frequency.setValueAtTime(320, t);
  bp.frequency.exponentialRampToValueAtTime(620, t + 0.09);
  const g = ac.createGain();
  env(g, t, 0.09 * o.gain, 0.015, 0.1);
  src.connect(bp).connect(g).connect(out);
  src.start(t, o.rng() * 0.1, 0.15);
  tone(ac, out, 'triangle', 105, t, 0.03 * o.gain, 0.015, 0.09, 135);
}
