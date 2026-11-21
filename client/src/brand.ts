// The brand name the server injected into index.html (<meta name="habblaud-brand">, see shared/brand.ts). Without a
// server (mock, static preview) or with a bad value it is the default, "Habblaud".
import { BRAND_META, brandText, DEFAULT_BRAND, parseBrandName } from '../../shared/brand';

let cached: string | undefined;

/** The brand name as text. */
export function brandName(): string {
  return brandText(brandWordmark());
}

/** The brand name with its optional "|" wordmark split marker ("swift|c"), for wordmarkSvg. */
export function brandWordmark(): string {
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
