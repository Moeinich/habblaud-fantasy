// Opaque bounds of the art's canvases, worked out from the pixel buffer when the canvas is made. Reading them back
// later (getImageData) stalls on the GPU for milliseconds and can leave the canvas slower to draw for good.

export interface OpaqueBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const known = new WeakMap<object, OpaqueBox>();

/** Bounding box of the pixels with alpha above 16 (the full size when there are none). */
export function opaqueBox(data: ArrayLike<number>, w: number, h: number): OpaqueBox {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 >= 0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w, h };
}

export function rememberOpaque(canvas: object, box: OpaqueBox): void {
  known.set(canvas, box);
}

export function knownOpaque(canvas: object): OpaqueBox | undefined {
  return known.get(canvas);
}
