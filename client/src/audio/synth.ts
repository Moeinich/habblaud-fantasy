// Sons sintetizados com WebAudio (sem arquivos de áudio nem amostras gravadas): curtos, baixos e
// com timbre de acampamento — machado na lenha, bigorna, trompa grave, corda e roldana rangendo.
import type { SoundKind } from './scheduler';

export interface VoiceOpts {
  /** Ganho final (já com o volume mestre). */
  gain: number;
  /** -1 .. 1 (esquerda .. direita). */
  pan?: number;
  /** Trabalho: golpes na rajada. */
  count?: number;
  rng: () => number;
  /** Ruído branco curto (golpes, rangidos e o "hup"). */
  noise: AudioBuffer | null;
}

/** Envelope percussivo: ataque curto e queda exponencial. */
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

/** Estalo de ruído filtrado (madeira, palha, raspão). */
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

/** Corda dedilhada: dente de serra com o filtro fechando depressa (alaúde rústico). */
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

/** Cria um buffer de ruído branco (base dos golpes, do rangido e do "hup"). */
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

/** Toca `kind` em `t` (tempo do AudioContext) na saída `dest`. */
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
      // "precisa de você": trompa grave chamando duas vezes
      horn(ac, out, t, g);
      return;
    case 'pop':
      // tarefa concluída: pancada de malho num tronco ("thok" de madeira)
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
      // malho de madeira batendo na bola: "tok" oco com a altura caindo
      tone(ac, out, 'triangle', 820, t, 0.09 * g, 0.002, 0.07, 560);
      return;
    case 'table':
      // quique no tampo da mesa de tábuas: mais grave e abafado
      tone(ac, out, 'sine', 420, t, 0.07 * g, 0.002, 0.06, 260);
      return;
    case 'arcade': {
      // "fliperama" da taverna: três notas de alaúde numa escala pentatônica
      const scale = [220, 246.9, 293.7, 329.6, 392, 440];
      for (let i = 0; i < 3; i++) {
        const f = scale[Math.floor(o.rng() * scale.length)];
        pluck(ac, out, f, t + i * 0.09, 0.035 * g, 0.28);
      }
      return;
    }
  }
}

/** Trompa grave: dois dentes de serra levemente desafinados, filtro abrindo devagar, duas chamadas. */
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
      // entra um pouco abaixo e sobe para a nota, como um sopro
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

/** Corda e roldana rangendo: trem de estalos num filtro estreito que oscila, e o baque da plataforma. */
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
  // a plataforma de tábuas encosta: baque grave de madeira
  tone(ac, out, 'sine', 130, t + len - 0.04, 0.1 * o.gain, 0.004, 0.18, 80);
  if (o.noise) noiseHit(ac, out, o.noise, t + len - 0.04, 'lowpass', 900, 0.7, 0.05 * o.gain, 0.06, 0.05);
}

/**
 * Trabalho: rajada de machadadas na lenha (ou, às vezes, marteladas na bigorna) com intervalos
 * irregulares; de vez em quando o trabalhador solta um "hup" curto antes do primeiro golpe.
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

/** Machadada: estalo seco de madeira (ruído em banda média) com um corpo grave curto. */
function chop(ac: AudioContext, out: AudioNode, t: number, v: number, o: VoiceOpts): void {
  if (!o.noise) return;
  noiseHit(ac, out, o.noise, t, 'bandpass', 800 + o.rng() * 500, 1.6, 0.11 * v, 0.045 + o.rng() * 0.02, o.rng() * 0.1);
  tone(ac, out, 'sine', 190 + o.rng() * 40, t, 0.06 * v, 0.002, 0.07, 110);
}

/** Martelada na bigorna: parciais inarmônicas agudas, com o brilho morrendo antes do corpo. */
function clink(ac: AudioContext, out: AudioNode, t: number, v: number, rng: () => number): void {
  const base = 1500 + rng() * 250;
  tone(ac, out, 'sine', base, t, 0.04 * v, 0.001, 0.35);
  tone(ac, out, 'sine', base * 2.76, t, 0.02 * v, 0.001, 0.18);
  tone(ac, out, 'sine', base * 5.4, t, 0.01 * v, 0.001, 0.07);
}

/** "Hup": ruído filtrado com um formante subindo, como um grunhido de esforço. Curto e baixo. */
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
