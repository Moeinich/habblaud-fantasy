// Validation of what other machines send to /api/ingest/*. Nothing from the network reaches the office without going
// through here: every field is checked by type and shape and cut to a size limit; unknown fields are dropped.
import { INGEST_EVENTS, type IngestEvent, type IngestEventName } from '../../shared/ingest';

export class InvalidIngest extends Error {}

/** Body limit of one request to /api/ingest/* (one event, a permission request or a usage record). */
export const INGEST_BODY_MAX = 256 * 1024;
/** Texts inside tool_input / tool_response. */
const VALUE_STRING_MAX = 8_000;
const VALUE_ARRAY_MAX = 100;
const VALUE_KEYS_MAX = 60;
const VALUE_DEPTH_MAX = 6;
/** tool_input / tool_response after trimming, as JSON. */
const VALUE_JSON_MAX = 48 * 1024;

const EVENT_NAMES = new Set<string>(INGEST_EVENTS);
const ID = /^[A-Za-z0-9_-]{8,64}$/;
/** Session ids, agent ids, tool_use ids: no spaces, slashes or control characters. */
const TOKENISH = /^[A-Za-z0-9_.:@-]{1,128}$/;
/** Account: basename of a config dir (".claude", ".claude-work"). */
const ACCOUNT = /^[A-Za-z0-9_.-]{1,64}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** A text field: string, control characters removed, cut to `max`. Empty = undefined. */
export function text(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(CONTROL, '').trim();
  return s ? s.slice(0, max) : undefined;
}

function token(v: unknown, re = TOKENISH): string | undefined {
  return typeof v === 'string' && re.test(v) ? v : undefined;
}

/**
 * A JSON value from the network (tool_input, tool_response), rebuilt: plain objects, arrays, strings, finite numbers,
 * booleans and null only, with limits on depth, keys, array length and text size. Keys like `__proto__` are dropped.
 */
export function cleanValue(v: unknown, depth = 0): unknown {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.length > VALUE_STRING_MAX ? v.slice(0, VALUE_STRING_MAX) : v;
  if (depth >= VALUE_DEPTH_MAX) return undefined;
  if (Array.isArray(v)) return v.slice(0, VALUE_ARRAY_MAX).map((x) => cleanValue(x, depth + 1) ?? null);
  const r = rec(v);
  if (!r) return undefined;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, x] of Object.entries(r)) {
    if (n >= VALUE_KEYS_MAX) break;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype' || k.length > 100) continue;
    const c = cleanValue(x, depth + 1);
    if (c === undefined) continue;
    out[k] = c;
    n++;
  }
  return out;
}

function boundedValue(v: unknown): unknown {
  if (v === undefined) return undefined;
  const c = cleanValue(v);
  if (c === undefined) return undefined;
  // Still too big (many medium texts): keep only a short preview of each text.
  if (JSON.stringify(c).length <= VALUE_JSON_MAX) return c;
  const shorter = (x: unknown): unknown => {
    if (typeof x === 'string') return x.slice(0, 400);
    if (Array.isArray(x)) return x.slice(0, 20).map(shorter);
    const r = rec(x);
    if (!r) return x;
    return Object.fromEntries(Object.entries(r).map(([k, y]) => [k, shorter(y)]));
  };
  const s = shorter(c);
  return JSON.stringify(s).length <= VALUE_JSON_MAX ? s : undefined;
}

/** Validates one hook event. Throws InvalidIngest with the reason when it cannot be used. */
export function parseIngestEvent(raw: unknown, now: number): IngestEvent {
  const r = rec(raw);
  if (!r) throw new InvalidIngest('expected a JSON object');
  if (r.v !== 1) throw new InvalidIngest('unsupported protocol version (expected v: 1)');
  const event = typeof r.event === 'string' && EVENT_NAMES.has(r.event) ? (r.event as IngestEventName) : undefined;
  if (!event) throw new InvalidIngest('unknown event');
  const id = token(r.id, ID);
  if (!id) throw new InvalidIngest('invalid id');
  const sessionId = token(r.session_id);
  if (!sessionId) throw new InvalidIngest('invalid session_id');
  const account = token(r.account, ACCOUNT);
  if (!account) throw new InvalidIngest('invalid account');
  // The sender's clock: only for ordering. Anything absurd (more than a day off) becomes "now".
  const at = typeof r.at === 'number' && Number.isFinite(r.at) && Math.abs(r.at - now) < 86_400_000 ? Math.round(r.at) : now;
  const out: IngestEvent = { v: 1, id, at, event, account, session_id: sessionId };
  const set = <K extends keyof IngestEvent>(k: K, v: IngestEvent[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  if (r.provider === 'codex') out.provider = 'codex';
  set('cwd', text(r.cwd, 1024));
  set('agent_id', token(r.agent_id));
  set('agent_type', text(r.agent_type, 80));
  set('source', token(r.source, /^[a-z_]{1,32}$/));
  set('reason', token(r.reason, /^[a-z_]{1,32}$/));
  set('prompt', text(r.prompt, 4_000));
  set('tool_name', text(r.tool_name, 128));
  set('tool_use_id', token(r.tool_use_id));
  set('tool_input', boundedValue(r.tool_input));
  set('tool_response', boundedValue(r.tool_response));
  set('error', text(r.error, 2_000));
  set('message', text(r.message, 1_000));
  set('notification_type', token(r.notification_type, /^[a-z_]{1,64}$/));
  set('model', text(r.model, 128));
  set('permission_mode', token(r.permission_mode, /^[A-Za-z_-]{1,32}$/));
  set('branch', text(r.branch, 256));
  return out;
}

/** The fields of a statusline-tap usage record (the habblaud mod sends the same JSON it writes to the usage file). */
export function parseIngestUsage(raw: unknown): { account: string; body: Record<string, unknown> } {
  const r = rec(raw);
  if (!r) throw new InvalidIngest('expected a JSON object');
  const account = token(r.account, ACCOUNT);
  if (!account) throw new InvalidIngest('invalid account');
  const win = (v: unknown) => {
    const w = rec(v);
    if (!w) return undefined;
    const used = w.used_percentage ?? w.utilization;
    const out: Record<string, unknown> = {};
    if (typeof used === 'number' && Number.isFinite(used)) out.utilization = Math.min(100, Math.max(0, used));
    if (typeof w.resets_at === 'number' && Number.isFinite(w.resets_at)) out.resets_at = w.resets_at;
    return 'utilization' in out ? out : undefined;
  };
  const body: Record<string, unknown> = {};
  if (typeof r.fetchedAt === 'number' && Number.isFinite(r.fetchedAt)) body.fetchedAt = r.fetchedAt;
  const five = win(r.five_hour);
  const week = win(r.seven_day);
  if (five) body.five_hour = five;
  if (week) body.seven_day = week;
  if (!five && !week) throw new InvalidIngest('no usage windows');
  return { account, body };
}
