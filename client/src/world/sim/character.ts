// A character's state: position, pose, animation, step queue and visual markers.
import type { AgentInfo } from '../../../../shared/types';
import type { Appearance, Dir, HeldItem, IconName, Pose } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { FOOT_DX, FOOT_DY, TILE } from '../constants';
import type { Mode } from './behavior';
import type { Gathering } from '../social/gathering';
import type { ShellStage } from './shell';
import type { Step } from './steps';

export class Character {
  readonly id: string;
  info: AgentInfo;
  appearance: Appearance;
  readonly rng: () => number;

  // position (world px; feet) and logical tile (always walkable when stopped)
  x = 0;
  y = 0;
  tx = 0;
  ty = 0;
  dir: Dir = 'down';
  pose: Pose = 'stand';
  held: HeldItem = 'none';
  seated = false;
  alpha = 1;
  visible = true;
  /** Forced depth (seats). null = use y. */
  sortY: number | null = null;
  /** Time (ms) in the current pose, to pick the animation frame. */
  animT = 0;

  // behavior
  mode: Mode = 'idle';
  queue: Step[] = [];
  step: Step | null = null;
  stepT = 0;
  stepStarted = false;
  /** Replan as soon as the current (non-interruptible) step finishes. */
  replan = false;
  /** Desk/stool/workplace spot (reserved for as long as the character exists). */
  homeSpot: string | null = null;
  /** Spot it is at right now (seat/machine), besides home. */
  atSpot: string | null = null;
  /** Temporary spots reserved during a stroll. */
  tempSpots: string[] = [];
  roomId: string;
  leaving = false;
  gone = false;
  arriving = false;
  missingSince: number | null = null;
  /** Idle character's next stroll (epoch ms). */
  nextOutingAt = 0;
  /** Gathering it is part of (or on its way to). */
  gathering: Gathering | null = null;
  /** Waiting on a shell: next attempt to join a gathering (epoch ms; 0 = schedule one). */
  nextSocialAt = 0;
  /** Drawn only after this moment (elevator queue). */
  hiddenUntil = 0;
  /** Hidden (inside a stall or a closed elevator). */
  inside = false;
  /** Next time the planner may run (avoids needlessly replanning every frame). */
  thinkAt = 0;
  /** Subagent has already delivered its result to the parent. */
  delivered = false;
  /** End of the stall use (epoch ms). */
  stallUntil = 0;
  /** Origin of a seat's snap-in/exit (short interpolation). */
  enterFrom: { x: number; y: number } | null = null;
  /** Room is full: tile where it works standing (no reserved place). */
  standTile: { x: number; y: number } | null = null;
  /** Own walking pace (±8%), so people leaving together don't walk in a perfect line. */
  readonly speedK: number;
  /** Side lane (px) while walking: two characters on the same path don't overlap. */
  readonly lane: number;
  /** Current visual offset (px), eased towards the lane while walking. */
  offX = 0;
  offY = 0;

  // markers
  icon: IconName | null = null;
  iconUntil = 0;
  iconAt = 0;
  bubbleText: string | null = null;
  bubbleIcon = '';
  bubbleAt = 0;
  bubbleUntil = 0;
  /** Mini chat bubble (emoji). */
  chatEmoji = '';
  chatUntil = 0;
  /** Short line (small text bubble) from gatherings: invites, chatter, cheering, bets. */
  sayText = '';
  sayAt = 0;
  sayUntil = 0;
  lastActivityId: string | null = null;
  activityChangedAt = 0;

  // shell wait ('shell' mode; rules in sim/shell.ts)
  /** Start (epoch ms) of the current wait: the oldest shell. 0 = not waiting. */
  shellSince = 0;
  /** How many shells it is waiting on (the hourglass "×N"). */
  shellCount = 0;
  shellLabel = '';
  /** Gag stage (recomputed every frame from the wait's age). */
  shellStage: ShellStage | null = null;
  /** When it entered 'shell' mode (world clock): bubble pacing in 'important' mode. */
  shellEnteredAt = 0;
  /** Cached bubble text: rebuilt only when the displayed time changes (no new string per frame). */
  shellText = '';
  shellTextKey = -1;
  /**
   * Reaction to a shell finishing (celebration/lament) in progress until this moment: a mode change
   * doesn't interrupt it (the queue ends back at the desk and the planner follows the current status).
   */
  reactUntil = 0;
  /** `at` of the last 'ShellDone' Activity already handled (those before arrival don't celebrate). */
  shellDoneAt = 0;
  /** Render: next popcorn kernel that pops out of the bucket (epoch ms). */
  popcornAt = 0;

  constructor(info: AgentInfo, appearance: Appearance) {
    this.id = info.id;
    this.info = info;
    this.appearance = appearance;
    this.roomId = info.roomId;
    this.rng = mulberry32((info.seed ^ 0x9e3779b9) >>> 0);
    // derived from another generator so the behavior's random sequence isn't altered
    const r = mulberry32((info.seed ^ 0x51ed27a3) >>> 0);
    this.speedK = 0.92 + r() * 0.16;
    this.lane = Math.round((r() * 2 - 1) * 3.5);
  }

  /** Eases the visual offset toward the lane (walking) or the center (stopped). */
  updateLane(dt: number): void {
    const walking = this.pose === 'walk' || this.pose === 'run';
    const horiz = this.dir === 'left' || this.dir === 'right';
    const tx = walking && !horiz ? this.lane : 0;
    const ty = walking && horiz ? this.lane * 0.6 : 0;
    const k = Math.min(1, dt * 5);
    this.offX += (tx - this.offX) * k;
    this.offY += (ty - this.offY) * k;
    if (Math.abs(this.offX) < 0.05) this.offX = 0;
    if (Math.abs(this.offY) < 0.05) this.offY = 0;
  }

  /** Puts the feet at a tile's default point. */
  placeAtTile(tx: number, ty: number): void {
    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE + FOOT_DX;
    this.y = ty * TILE + FOOT_DY;
  }

  setPose(pose: Pose, held: HeldItem = 'none'): void {
    if (this.pose !== pose) {
      this.pose = pose;
      this.animT = 0;
    }
    this.held = held;
  }

  setIcon(icon: IconName | null, ms: number, now: number): void {
    this.icon = icon;
    this.iconAt = now;
    this.iconUntil = icon ? now + ms : 0;
  }

  showBubble(icon: string, text: string, ms: number, now: number): void {
    this.bubbleIcon = icon;
    this.bubbleText = text;
    this.bubbleAt = now;
    this.bubbleUntil = now + ms;
  }

  depth(): number {
    return this.sortY ?? this.y;
  }
}

/** Dominant direction of a displacement. */
export function dirOf(dx: number, dy: number, fallback: Dir): Dir {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** Direction from A looking at B. */
export function facing(ax: number, ay: number, bx: number, by: number): Dir {
  return dirOf(bx - ax, by - ay, 'down');
}
