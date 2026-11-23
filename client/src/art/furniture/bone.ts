// Undead furniture (pure): any piece recoloured as if built from bones and grave cloth. Wood, hide and other warm
// browns turn to old bone (light to dark kept), red leather and cloth turn to grave violet, and the rest — iron,
// glass, screens, paper — stays as it is. Used for every piece in an undead room.
import { hslToRgb, rgbToHsl } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';

const BONE_HUE = 44;
const VIOLET_HUE = 278;

export function boneify(b: PixelBuf): void {
  const d = b.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    let out: [number, number, number] | null = null;
    if (s > 0.12 && h >= 12 && h <= 60) {
      // wood / hide / straw -> bone: lifted towards ivory, little saturation
      out = hslToRgb(BONE_HUE, Math.min(0.32, s * 0.55), Math.min(0.92, 0.32 + l * 0.85));
    } else if (s > 0.3 && (h < 12 || h > 330)) {
      // red leather, banners, cushions -> grave violet
      out = hslToRgb(VIOLET_HUE, s * 0.7, l * 0.9);
    }
    if (!out) continue;
    d[i] = out[0];
    d[i + 1] = out[1];
    d[i + 2] = out[2];
  }
}
