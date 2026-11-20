// Rugs (pure). Three looks, picked from the shape and the colour the layout asks for:
// - long thin strips (corridor runners) become a cobbled dirt path with ragged edges;
// - cool colours (blue/teal, Alliance rooms) become a woven heraldic runner: blue field, gold border, lozenges;
// - warm colours (Horde rooms, tavern) become a stretched hide rug with painted tribal stripes and lacing.
import { mix, parseColor, ramp, rgbToHsl, shade } from '../core/color';
import { PixelBuf } from '../core/pixbuf';

/** Cheap deterministic hash for per-pixel variation. */
function hp(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77) ^ Math.imul(seed | 0, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 13;
  return h >>> 0;
}

export function renderRug(w: number, h: number, color: string, seed: number): PixelBuf {
  if (w >= h * 6 && h <= 24) return pathStrip(w, h, seed);
  const [r, g, bl] = parseColor(color);
  const [hue, sat] = rgbToHsl(r, g, bl);
  if (hue >= 165 && hue <= 280 && sat > 0.12) return heraldicRunner(w, h, color, seed);
  return hideRug(w, h, color, seed);
}

/** Alliance: woven runner with fringe, gold border with a knot band and gold lozenges on the blue field. */
function heraldicRunner(w: number, h: number, color: string, seed: number): PixelBuf {
  const b = new PixelBuf(w, h);
  const field = ramp(mix(color, '#2f4f9c', 0.45), 0.07);
  const gold = ramp('#e0b23c', 0.06);
  const fringe = '#e6dcc4';
  const x0 = 1;
  const x1 = w - 2;
  for (let y = 1; y < h - 1; y += 2) {
    b.set(0, y, fringe);
    b.set(w - 1, y, fringe);
  }
  b.rect(x0, 0, x1 - x0 + 1, h, field.dd);
  b.rect(x0 + 1, 1, x1 - x0 - 1, h - 2, gold.base);
  // knot band in the gold border (dark ticks every 3px)
  for (let x = x0 + 2; x < x1 - 1; x += 3) {
    b.set(x, 1, gold.dk);
    b.set(x, h - 2, gold.dk);
  }
  for (let y = 2; y < h - 2; y += 3) {
    b.set(x0 + 1, y, gold.dk);
    b.set(x1 - 1, y, gold.dk);
  }
  b.rect(x0 + 2, 2, x1 - x0 - 3, h - 4, field.dk);
  b.rect(x0 + 3, 3, x1 - x0 - 5, h - 6, field.base);
  const fx = x0 + 3;
  const fy = 3;
  const fw = x1 - x0 - 5;
  const fh = h - 6;
  if (fw > 4 && fh > 4) {
    // subtle weave
    for (let y = 0; y < fh; y++) for (let x = (y & 1); x < fw; x += 4) b.set(fx + x, fy + y, field.lt);
    // gold lozenges spaced along the long axis, with a cream centre
    const horiz = fw >= fh;
    const len = horiz ? fw : fh;
    const span = horiz ? fh : fw;
    const rad = Math.max(1, Math.min(4, Math.floor(span / 2) - 1));
    const step = rad * 2 + 6;
    const n = Math.max(1, Math.floor((len - 2) / step));
    const start = Math.floor((len - (n - 1) * step) / 2);
    for (let i = 0; i < n; i++) {
      const c = start + i * step;
      const cx = horiz ? fx + c : fx + Math.floor(fw / 2);
      const cy = horiz ? fy + Math.floor(fh / 2) : fy + c;
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d === rad) b.set(cx + dx, cy + dy, gold.base);
          else if (d < rad && d === rad - 1 && rad > 2) b.set(cx + dx, cy + dy, field.dd);
        }
      }
      b.set(cx, cy, rad > 1 ? '#f0e6c8' : gold.hi);
    }
  }
  for (const [cx, cy] of [[x0, 0], [x1, 0], [x0, h - 1], [x1, h - 1]] as const) b.clear(cx, cy);
  return b;
}

/** Horde / tavern: stretched hide with an irregular outline, leg nubs, painted stripes and lacing holes. */
function hideRug(w: number, h: number, color: string, seed: number): PixelBuf {
  const b = new PixelBuf(w, h);
  const hide = ramp(mix(color, '#b08a5a', 0.45), 0.07);
  const paint = mix(color, '#9c2f25', 0.5);
  const ink = '#2a1c14';
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rx = w / 2 - 1.5;
  const ry = h / 2 - 1.5;
  /** Inside the pelt: a superellipse, wobbly edge, plus four leg nubs at the corners. */
  const inside = (x: number, y: number): boolean => {
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    const wob = ((hp(Math.floor(x / 3), Math.floor(y / 3), seed) & 7) - 3) * 0.012;
    if (Math.abs(nx) ** 2.6 + Math.abs(ny) ** 2.6 <= 1 + wob) return true;
    // leg nubs reaching toward the corners
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const lx = cx + sx * rx * 0.74;
      const ly = cy + sy * ry * 0.74;
      if (Math.abs(x - lx) + Math.abs(y - ly) <= 4 && Math.abs(x - cx) > Math.abs(lx - cx) - 1 && Math.abs(y - cy) > Math.abs(ly - cy) - 1) return true;
    }
    return false;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) {
        b.set(x, y, hide.dd);
        continue;
      }
      const edge2 = !inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || !inside(x, y + 2);
      const n = hp(x, y, seed) % 13;
      // light from the top-left: lighter rim on the upper/left side of the pelt
      let c = edge2 ? (x < cx && y < cy ? hide.lt : hide.dk) : n === 0 ? hide.dk : n === 1 ? hide.lt : hide.base;
      // lacing holes along the rim
      if (edge2 && (x + y) % 4 === 0) c = ink;
      b.set(x, y, c);
    }
  }
  // painted tribal band: bold zigzag (or chevrons on small mats) across the middle, with ink dots
  const iw = Math.floor(rx * 2) - 6;
  const ih = Math.floor(ry * 2) - 6;
  if (iw > 4 && ih > 2) {
    const horiz = iw >= ih;
    const len = horiz ? iw : ih;
    const amp = Math.max(1, Math.min(3, Math.floor((horiz ? ih : iw) / 4)));
    const start = horiz ? Math.round(cx - iw / 2) : Math.round(cy - ih / 2);
    for (let i = 0; i < len; i++) {
      const p = start + i;
      const z = Math.abs(((i + 2 * amp) % (4 * amp)) - 2 * amp) - amp;
      for (const off of [-1, 0]) {
        const x = horiz ? p : Math.round(cx) + z + off;
        const y = horiz ? Math.round(cy) + z + off : p;
        if (inside(x, y) && inside(x - 2, y) && inside(x + 2, y)) b.set(x, y, off === 0 ? paint : shade(paint, -0.12));
      }
    }
    // two thin stripes framing the band
    const sep = amp + 3;
    for (let i = 0; i < len; i += 1) {
      const p = start + i;
      for (const s of [-sep, sep]) {
        const x = horiz ? p : Math.round(cx) + s;
        const y = horiz ? Math.round(cy) + s : p;
        if (inside(x, y) && inside(x - 2, y) && inside(x + 2, y) && inside(x, y - 2) && inside(x, y + 2)) b.set(x, y, i % 4 === 3 ? hide.base : ink);
      }
    }
  }
  return b;
}

/** Corridor runner → cobbled dirt path: packed earth with ragged edges and a line of worn round cobbles. */
function pathStrip(w: number, h: number, seed: number): PixelBuf {
  const b = new PixelBuf(w, h);
  const dirt = ramp('#7a6046', 0.05);
  const stones = ['#9c968a', '#8f897d', '#a39d90', '#857f74'];
  for (let x = 0; x < w; x++) {
    const top = (hp(Math.floor(x / 3), 1, seed) % 3 === 0 ? 1 : 0) + (x === 0 || x === w - 1 ? 1 : 0);
    const bot = h - 1 - (hp(Math.floor(x / 3), 2, seed) % 3 === 0 ? 1 : 0) - (x === 0 || x === w - 1 ? 1 : 0);
    for (let y = top; y <= bot; y++) {
      const n = hp(x, y, seed) % 17;
      let c = n === 0 ? dirt.dk : n === 1 ? dirt.lt : dirt.base;
      if (y === top) c = dirt.dk;
      else if (y === bot) c = shade(dirt.base, -0.06);
      b.set(x, y, c);
    }
  }
  // cobbles: rounded stones ~5x4 packed in staggered rows, a few missing (bare dirt)
  for (let cy = 2, row = 0; cy + 3 < h; cy += 5, row++) {
    for (let x = 1 + (row % 2) * 3; x < w - 5; x += 6) {
      const hh = hp(x, row, seed);
      if (hh % 6 === 0) continue;
      const sx = x + ((hh >>> 3) & 1);
      const sy = cy + ((hh >>> 5) & 1);
      const t = ramp(stones[(hh >>> 8) % stones.length], 0.06);
      b.rect(sx, sy, 5, 4, t.base);
      b.clear(sx, sy);
      b.clear(sx + 4, sy);
      b.set(sx, sy, dirt.base);
      b.set(sx + 4, sy, dirt.base);
      b.hline(sx + 1, sx + 3, sy, t.lt);
      b.set(sx, sy + 1, t.lt);
      b.hline(sx + 1, sx + 4, sy + 3, t.dk);
      b.set(sx + 4, sy + 2, t.dk);
      b.hline(sx + 1, sx + 3, sy + 4, dirt.dd);
    }
  }
  return b;
}
