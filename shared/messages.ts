// Messages sent through the office (POST /api/messages): what the server, the demo and the page share.
// Pure code: no Node or DOM APIs.
import { maskSecrets, truncate, type ActivityDescription } from './activity';
import { tr } from './i18n';

/** Maximum length of a message (characters). */
export const MESSAGE_MAX = 20_000;
/** `Activity.tool` of the "Message via Habblaud" activity (not an agent tool: it is your text coming in). */
export const MESSAGE_TOOL = 'HabblaudMessage';
/** Activity detail: the start of the text, masked and truncated (the full text goes only to the session). */
const DETAIL_MAX = 300;

/**
 * "Message via Habblaud" activity for a message delivered to the session (it went in or into its queue: that does not
 * mean the agent has read it yet).
 */
export function describeMessage(text: string): ActivityDescription & { tool: string } {
  const detail = truncate(maskSecrets(text.slice(0, DETAIL_MAX * 4)), DETAIL_MAX);
  return { kind: 'communicate', icon: '✉️', text: tr('Message via Habblaud'), tool: MESSAGE_TOOL, ...(detail ? { detail } : {}) };
}
