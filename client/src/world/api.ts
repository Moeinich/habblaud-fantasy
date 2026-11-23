// CONTRACT of the world (the office canvas) consumed by the UI (client/src/ui/**).
// Implementation: client/src/world/index.ts -> createWorld().
// Rule: changes here must be ADDITIVE.

export type Selection = { type: 'agent'; id: string } | { type: 'room'; id: string } | null;

export interface WorldOptions {
  /** Show name tags for the characters. */
  showNames: boolean;
  /** Activity bubbles: all, only important ones (needs you, selected, recent changes) or none. */
  bubbles: 'all' | 'important' | 'none';
  /** How often idle agents wander around the office. */
  liveliness: 'calm' | 'normal' | 'lively';
  /** Camera follows the selected agent. */
  followSelected: boolean;
  /** Day/night cycle from the local time (windows, lighting). */
  dayNight: boolean;
  /** (Optional, additive) Day/night cycle: automatic, always day or always night. Takes precedence over `dayNight`. */
  daylight?: DaylightMode;
  /** Visual theme: automatic (follows the calendar; see seasonalThemeFor), none, Christmas or Halloween. */
  theme?: OfficeTheme;
}

/** Theme the renderer draws: the original office ('none') or one of the seasonal ones. */
export type SeasonalTheme = 'none' | 'christmas' | 'halloween';
export type OfficeTheme = 'auto' | SeasonalTheme;

/**
 * Theme drawn on a given date (local time). In automatic mode: Halloween from October 1 to 31, Christmas from
 * November 1 to December 26 and, for the rest of the year, the original office.
 */
export function seasonalThemeFor(theme: OfficeTheme | undefined, date: Date): SeasonalTheme {
  if (theme && theme !== 'auto') return theme;
  const month = date.getMonth();
  if (month === 9) return 'halloween';
  if (month === 10 || (month === 11 && date.getDate() <= 26)) return 'christmas';
  return 'none';
}

/** Day/night cycle: follows the local time, or pins day or night. */
export type DaylightMode = 'auto' | 'day' | 'night';

/** Ambient sounds the world suggests (the UI decides whether and how to play them). */
export type SoundCueKind = 'keys' | 'elevator' | 'pingpong' | 'table' | 'arcade';

export interface SoundCue {
  kind: SoundCueKind;
  /** 0..1: proximity (zoom, off screen...). */
  gain: number;
  /** -1 (left) .. 1 (right): position on screen. */
  pan: number;
  /** Keyboard: how many keys in the burst. */
  count?: number;
}

export interface WorldApi {
  /** Selects (or clears) an agent/room. `focus` moves the camera to it. */
  select(sel: Selection, opts?: { focus?: boolean }): void;
  getSelection(): Selection;
  /** Fired when the selection changes (by a click on the canvas or by select()). */
  onSelect(cb: (sel: Selection) => void): () => void;
  /** Agent under the cursor (for UI tooltips). */
  onHover(cb: (agentId: string | null) => void): () => void;
  focusAgent(id: string, opts?: { follow?: boolean }): void;
  focusRoom(id: string): void;
  /** Frames the whole building. */
  overview(): void;
  zoomBy(factor: number): void;
  getOptions(): WorldOptions;
  setOptions(o: Partial<WorldOptions>): void;
  /** Screen position (CSS px, relative to the viewport) just above the character's head, or null if not visible. */
  screenPositionOf(agentId: string): { x: number; y: number } | null;
  /**
   * (Optional, additive) Screen area covered by UI panels, in CSS px. The world then frames (overview) and
   * centers (focusAgent/focusRoom/follow) within the free area.
   */
  setViewInsets?(insets: Partial<ViewInsets>): void;
  /**
   * (Optional, additive) Social life of an agent present in the office: personality, coin wallet,
   * friendships/rivalries with whoever is there now and the group it is part of. null if it is not present.
   */
  social?(agentId: string): AgentSocial | null;
  /** (Optional, additive) Right click on an office room: the room id and the click point (window px). */
  onRoomContextMenu?(cb: (roomId: string, at: { x: number; y: number }) => void): () => void;
  /** (Optional, additive) Social events (matches and bets) for the feed. */
  onSocialEvent?(cb: (e: SocialEvent) => void): () => void;
  /**
   * (Optional, additive) Timelapse: with `p`, the world draws the replayed day (clock and animation factor
   * from `p`); `null` returns to live. Each call restarts the world from scratch (nobody walks to their desk:
   * everyone already appears in place), so call it on entering, when jumping to another point and on leaving;
   * the next store snapshot is applied as the initial load.
   */
  setPlayback?(p: WorldPlayback | null): void;
  /** (Optional, additive) Ambient sounds: keyboards of visible working agents, elevator, groups. */
  onSound?(cb: (cue: SoundCue) => void): () => void;
  /**
   * (Optional, additive) Office off screen (the city scene is open): stops drawing and the camera keyboard;
   * on return, the simulation catches up on the elapsed time (as with a background tab).
   */
  setSuspended?(suspended: boolean): void;
  destroy(): void;
}

/** Timelapse clocks (see world/playback.ts). */
export interface WorldPlayback {
  /** Replayed instant (epoch ms): time for the sky, the lighting and the wall clock. */
  clock(): number;
  /** Animation factor (1 = real time; 0 = paused). */
  scale(): number;
}

export interface AgentSocial {
  traits: { emoji: string; label: string; desc: string }[];
  /** Catchphrase ("Done and done!"). */
  catchphrase: string;
  /** Coin balance (🪙). */
  coins: number;
  /** How much it has earned working (starting balance + tasks + requests + deliveries). */
  earned: number;
  wins: number;
  losses: number;
  /** Present colleagues it has a friendship or rivalry with; `record` = [wins, losses] against them. */
  bonds: { id: string; name: string; kind: 'amizade' | 'rivalidade'; record: [number, number] | null }[];
  /** What it is doing in a group right now ("📺 Watching football on TV with Rafaela"), or null. */
  doing: string | null;
  /** Statement: most recent transactions first. */
  ledger: { at: number; delta: number; icon: string; text: string }[];
}

/** A settled match/bet (becomes a feed line). */
export interface SocialEvent {
  id: string;
  at: number;
  icon: string;
  /** Protagonist (the winner). */
  agentId: string;
  /** Text without the protagonist's name: "won 🪙10 from Caio at rock-paper-scissors". */
  text: string;
  /** Where it happened ("Lounge", "Kitchen"...). */
  place: string;
}

/** Viewport margins covered by the UI (CSS px). */
export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_WORLD_OPTIONS: WorldOptions = {
  showNames: true,
  bubbles: 'important',
  liveliness: 'normal',
  followSelected: false,
  dayNight: true,
  theme: 'auto',
};
