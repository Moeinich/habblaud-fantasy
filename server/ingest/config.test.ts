// HABBLAUD_INGEST only turns on with the remote port over HTTPS; without the variable nothing changes.
import { describe, expect, it } from 'vitest';
import { ingestOffReason } from '../config';
import type { RemoteConfig } from '../http/remote';

const remote = (tls: boolean) => ({ port: 4748, host: '0.0.0.0', tls: tls ? { dir: '/x', keyFile: '/x/k', certFile: '/x/c', caFile: '/x/ca' } : undefined }) as unknown as RemoteConfig;

describe('ingestOffReason', () => {
  it('off unless HABBLAUD_INGEST is set', () => {
    expect(ingestOffReason({}, remote(true))).toBe('off');
    expect(ingestOffReason({ HABBLAUD_INGEST: '0' }, remote(true))).toBe('off');
  });

  it('needs the remote port, and with HTTPS', () => {
    expect(ingestOffReason({ HABBLAUD_INGEST: '1' }, undefined)).toMatch(/remote:setup/);
    expect(ingestOffReason({ HABBLAUD_INGEST: '1' }, remote(false))).toMatch(/HTTPS/);
    expect(ingestOffReason({ HABBLAUD_INGEST: '1' }, remote(true))).toBeUndefined();
  });
});
