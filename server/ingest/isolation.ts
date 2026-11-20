// Habblaud World only ever sees THIS machine's office.
//
// Agents of other machines (HABBLAUD_INGEST, AgentInfo.machine) are real, but they are not this computer's office:
// the World building must reflect only the sessions running here (shared/world/README.md, "Truthful data"). So the
// World uplink (server/world/uplink.ts) is wired, in server/index.ts, with the views below and never with the
// unfiltered office: `localAgents` for its agents and a separate "My day" tracker, fed by `localSnapshot`, for its
// tokens. Nothing in server/world/ or shared/world/ changes.
import type { AgentInfo, OfficeSnapshot } from '../../shared/types';

/** Only the agents of this machine. */
export function localAgents(list: readonly AgentInfo[]): AgentInfo[] {
  return list.filter((a) => !a.machine);
}

/** The snapshot without anything from other machines (agents, their rooms and their accounts). */
export function localSnapshot(snap: OfficeSnapshot): OfficeSnapshot {
  if (!snap.agents.some((a) => a.machine) && !snap.rooms.some((r) => r.machine) && !snap.accounts.some((a) => a.machine)) return snap;
  return {
    ...snap,
    agents: snap.agents.filter((a) => !a.machine),
    rooms: snap.rooms.filter((r) => !r.machine),
    accounts: snap.accounts.filter((a) => !a.machine),
  };
}
