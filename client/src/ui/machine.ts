// Agents of other machines (HABBLAUD_INGEST, AgentInfo.machine): a small tag with the machine's name, and what does
// not work for them here. Their sessions run on that machine and their transcripts stay there, so the terminal (read
// or interactive), taking over, ending, the conversation history and dictation are off for them.
import type { AgentInfo } from '../../../shared/types';
import { h, setHidden, setText, setTitle } from './dom';
import { tr } from '../../../shared/i18n';

export function isRemote(a: Pick<AgentInfo, 'machine'> | null | undefined): boolean {
  return !!a?.machine;
}

/** Why the terminal and the session actions are off for an agent of another machine. */
export function remoteTerminalHint(a: Pick<AgentInfo, 'machine'>): string {
  return tr('Esta sessão roda em {0}: o terminal, assumir e encerrar só funcionam lá.', [a.machine?.name ?? '?']);
}

/** Tag with the machine's name (hidden for agents of this machine). */
export function createMachineTag(extra = ''): HTMLElement {
  return h('span', { class: `ui-prov ui-machine${extra ? ` ${extra}` : ''}`, hidden: true });
}

export function updateMachineTag(tag: HTMLElement, a: Pick<AgentInfo, 'machine'> | null | undefined): void {
  const m = a?.machine;
  setHidden(tag, !m);
  if (!m) return;
  setText(tag, m.name);
  setTitle(tag, tr('Roda em outra máquina: {0}', [m.name]));
}
