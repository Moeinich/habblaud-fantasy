// Rooms of the office: identity (the project's folder name), displayed name and position (slot) in the building.

/** Normalized cwd: no repeated slashes or trailing slash. */
export function normalizeCwd(cwd: string): string {
  const p = cwd.trim().replace(/\/{2,}/g, '/');
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

function segments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

/** Agent worktrees (`<project>/.claude/worktrees/<name>`, also under `.codex`), with an optional subfolder. */
const WORKTREE = /^(.*?)[\\/]\.(claude|codex)[\\/]worktrees[\\/][^\\/]+([\\/].*)?$/;

/** The project folder of a session cwd: a worktree of an agent counts as its project (the repository). */
export function projectPath(cwd: string): string {
  const p = normalizeCwd(cwd);
  const wt = WORKTREE.exec(p);
  return wt && wt[1] ? wt[1] : p;
}

/**
 * Room id of a session cwd: the project's folder name, case-insensitive (NFC, lower case). The same project checked
 * out in different places ("~/GitHub/shop" and "~/code/Shop") or on different machines (ingest) is ONE room, and an
 * agent worktree is the room of its repository. Ids never contain a slash (older ids were the full cwd: see
 * isLegacyRoomId).
 */
export function roomKey(cwd: string): string {
  const segs = segments(projectPath(cwd));
  const base = segs.length ? segs[segs.length - 1] : cwd.trim() || '/';
  // A bare Windows drive ("C:") or the root keeps its own room.
  return base.normalize('NFC').toLowerCase().replace(/[\\/]/g, '') || '/';
}

/** Room id from before rooms were keyed by folder name (the normalized cwd, with slashes). */
export function isLegacyRoomId(id: string): boolean {
  return /[\\/]/.test(id) && id !== '/';
}

/**
 * Name of each room: the path's basename; rooms with the same basename get their parent folder(s) added until they are
 * distinct (e.g. "applications/app" and "other/app").
 */
export function roomDisplayNames(rooms: ReadonlyMap<string, string>): Map<string, string> {
  const segs = new Map([...rooms].map(([id, path]) => [id, segments(path)]));
  const depth = new Map([...rooms.keys()].map((id) => [id, 1]));
  const nameOf = (id: string) => {
    const s = segs.get(id)!;
    return s.length ? s.slice(-depth.get(id)!).join('/') : rooms.get(id) || '/';
  };
  for (let guard = 0; guard < 16; guard++) {
    const groups = new Map<string, string[]>();
    for (const id of rooms.keys()) {
      const n = nameOf(id);
      groups.set(n, [...(groups.get(n) ?? []), id]);
    }
    let grew = false;
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        if (depth.get(id)! < segs.get(id)!.length) {
          depth.set(id, depth.get(id)! + 1);
          grew = true;
        }
      }
    }
    if (!grew) break;
  }
  return new Map([...rooms.keys()].map((id) => [id, nameOf(id)]));
}

/**
 * Hands out slots: a new room takes the lowest free slot that isn't cooling down.
 * A freed slot is only reused after `cooldownMs` (the length of the leaving animation).
 */
export class SlotAllocator {
  private slots = new Map<string, number>();
  private freedAt = new Map<number, number>();

  constructor(private readonly cooldownMs = 30_000) {}

  /** Syncs the allocations with the current set of rooms. Returns true if anything changed. */
  sync(ids: Iterable<string>, now: number): boolean {
    const live = new Set(ids);
    let changed = false;
    for (const [id, slot] of [...this.slots]) {
      if (live.has(id)) continue;
      this.slots.delete(id);
      this.freedAt.set(slot, now);
      changed = true;
    }
    for (const id of live) {
      if (this.slots.has(id)) continue;
      this.slots.set(id, this.firstFree(now));
      changed = true;
    }
    return changed;
  }

  slotOf(id: string): number | undefined {
    return this.slots.get(id);
  }

  private firstFree(now: number): number {
    const used = new Set(this.slots.values());
    for (let slot = 0; ; slot++) {
      if (used.has(slot)) continue;
      const freed = this.freedAt.get(slot);
      if (freed !== undefined && now - freed < this.cooldownMs) continue;
      this.freedAt.delete(slot);
      return slot;
    }
  }
}
