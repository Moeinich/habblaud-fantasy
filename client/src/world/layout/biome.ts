// Race biomes (pure): the land round each hall takes on its race — a jungle round the night-elf tree, cut-down
// badlands round the orc camp, dead purple blight round the undead crypts and the green park round the human wing
// and the core. Every hall sits in the middle of its own land: a spot of ground belongs to the hall it is nearest
// to, with the distances stirred by noise, so the lands meet roughly halfway in ragged, organic borders, and the
// borders are frayed at a quarter-tile scale so the grounds melt into each other instead of meeting in a line.
// The exterior's trees and bushes then turn into their land's kind.
import type { FloorKind } from '../../art/api';
import type { Race } from '../../../../shared/race';
import { EAST_COL0, TILE } from '../constants';
import { hallRings } from './enclosure';
import { northRect, type Shape, type Strip } from './geometry';
import type { ExteriorProp, FloorPatch, TileRect } from './types';

const GROUND: Readonly<Record<Race, FloorKind>> = { human: 'grass', elf: 'jungle', orc: 'desert', undead: 'blight' };

/** Size (px) of the cells the land is decided in: small enough for the borders to look frayed, not blocky. */
const CELL = 4;

/** Integer hash -> 0..1. */
function h01(a: number, b: number, s: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(s | 0, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1, with features about `cell` tiles across. */
function noise(x: number, y: number, cell: number, s: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h01(gx, gy, s);
  const b = h01(gx + 1, gy, s);
  const c = h01(gx, gy + 1, s);
  const d = h01(gx + 1, gy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export interface BiomeMap {
  /** Race of the land at a point (tiles, fractions allowed). */
  at(tx: number, ty: number): Race;
  /** Ground patches of every land but the human park (which is the grass underneath). */
  floors(bounds: TileRect): FloorPatch[];
}

/** Where each race's land lies, for the halls of this shape. */
export function biomeMap(shape: Shape): BiomeMap {
  const anchors: { race: Race; r: TileRect }[] = hallRings(shape).map((h) => ({ race: h.race, r: h.rect }));
  const north = northRect(shape);
  if (north) anchors.push({ race: 'elf', r: north });
  const at = (tx: number, ty: number): Race => {
    // large, slow swirls move the borders around; a fine grain frays them
    const warp = (noise(tx, ty, 9, 11) - 0.5) * 14 + (noise(tx, ty, 1.2, 12) - 0.5) * 2.2;
    let best: Race = 'human';
    let bd = Infinity;
    for (const [i, a] of anchors.entries()) {
      const dx = Math.max(a.r.x - tx, 0, tx - (a.r.x + a.r.w));
      const dy = Math.max(a.r.y - ty, 0, ty - (a.r.y + a.r.h));
      const d = Math.hypot(dx, dy) + warp * (i % 2 ? 1 : -1) + (noise(tx, ty, 6, 20 + i) - 0.5) * 10;
      if (d < bd) {
        bd = d;
        best = a.race;
      }
    }
    return best;
  };
  return {
    at,
    floors(bounds) {
      const out: FloorPatch[] = [];
      const x0 = bounds.x * TILE;
      const y0 = bounds.y * TILE;
      const cols = Math.ceil((bounds.w * TILE) / CELL);
      const rows = Math.ceil((bounds.h * TILE) / CELL);
      // decide per tile first; only where neighbouring tiles disagree is the border worked out cell by cell
      const tw = bounds.w + 2;
      const th = bounds.h + 2;
      const tiles: Race[] = [];
      for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) tiles.push(at(bounds.x - 1 + tx + 0.5, bounds.y - 1 + ty + 0.5));
      const settled = (tx: number, ty: number) => {
        const r0 = tiles[(ty + 1) * tw + tx + 1];
        for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) if (tiles[(ty + dy) * tw + tx + dx] !== r0) return null;
        return r0;
      };
      const per = TILE / CELL;
      for (let r = 0; r < rows; r++) {
        let run: Race | null = null;
        let start = 0;
        const flush = (end: number) => {
          if (run && run !== 'human') out.push({ kind: GROUND[run], x: x0 + start * CELL, y: y0 + r * CELL, w: (end - start) * CELL, h: CELL, seed: 40 });
        };
        for (let c = 0; c <= cols; c++) {
          const race = c < cols ? (settled(Math.floor(c / per), Math.floor(r / per)) ?? at((x0 + (c + 0.5) * CELL) / TILE, (y0 + (r + 0.5) * CELL) / TILE)) : null;
          if (race === run) continue;
          flush(c);
          run = race;
          start = c;
        }
      }
      return out;
    },
  };
}

/** The same tree, bush or stone, as it grows in a race's land. */
export function biomeProp(race: Race, p: ExteriorProp): ExteriorProp {
  if (race === 'human') return p;
  const k = p.kind;
  const odd = p.seed % 3;
  let kind: ExteriorProp['kind'] = k;
  if (race === 'elf') {
    if (k === 'tree' || k === 'pine') kind = 'jungle_tree';
    else if (k === 'bush' || k === 'flowers' || k === 'rock') kind = 'fern';
  } else if (race === 'orc') {
    if (k === 'tree') kind = odd === 0 ? 'log' : 'stump';
    else if (k === 'pine') kind = 'stump';
    else if (k === 'bush' || k === 'flowers') kind = 'dry_bush';
  } else {
    if (k === 'tree' || k === 'pine') kind = 'dead_tree';
    else if (k === 'bush' || k === 'rock') kind = 'grave';
    else if (k === 'flowers') kind = odd === 0 ? 'grave' : 'rock';
  }
  return kind === k ? p : { ...p, kind };
}

/** Race of the land a project cell's patio stands in. */
export function cellRace(strip: Strip, col: number): Race {
  if (strip === 'north') return 'elf';
  if (strip === 'south') return 'undead';
  return col >= EAST_COL0 ? 'orc' : 'human';
}
