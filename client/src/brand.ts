// The brand name the server injected into index.html (<meta name="habblaud-brand">, see shared/brand.ts). Without a
// server (mock, static preview) or with a bad value it is the default, "Habblaud".
import { BRAND_META, DEFAULT_BRAND, parseBrandName } from '../../shared/brand';

let cached: string | undefined;

export function brandName(): string {
  if (cached !== undefined) return cached;
  let raw: string | null | undefined;
  try {
    raw = typeof document === 'undefined' ? undefined : document.querySelector<HTMLMetaElement>(`meta[name="${BRAND_META}"]`)?.content;
  } catch {
    raw = undefined;
  }
  cached = parseBrandName(raw) ?? DEFAULT_BRAND;
  return cached;
}
