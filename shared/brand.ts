// White-labeling: the product name shown in the page title, the pixel wordmark, the PWA manifest and the remote
// login page. The server reads HABBLAUD_BRAND_NAME / HABBLAUD_BRAND_SHORT (server/config.ts) and injects the result
// into index.html and the manifest at runtime (server/http/brand.ts), so the same build serves any brand.
// Pure: shared by the server and the client.

export const DEFAULT_BRAND = 'Habblaud';
export const BRAND_MAX_LENGTH = 24;

/** `<meta name="habblaud-brand">` in index.html: where the client reads the brand the server injected. */
export const BRAND_META = 'habblaud-brand';

/** Optional marker in HABBLAUD_BRAND_NAME ("swift|c"): where the wordmark turns gold. Shown nowhere else. */
export const BRAND_SPLIT = '|';

export interface Brand {
  /** Full name: page title, wordmark, login page, manifest `name`. */
  name: string;
  /** Short form for the home-screen icon label (manifest `short_name`, apple-mobile-web-app-title). */
  short: string;
  /** The name with its BRAND_SPLIT marker ("swift|c"), when it has one: the wordmark split, via the brand meta. */
  wordmark?: string;
}

export const DEFAULT_BRAND_INFO: Brand = { name: DEFAULT_BRAND, short: DEFAULT_BRAND };

/**
 * A usable brand name: trimmed, 1 to 24 characters, no control characters (and no `<`/`>`, which have no place in a
 * name and would only matter if some HTML escaping were missed). Anything else is undefined (the caller falls back).
 * One BRAND_SPLIT marker between two characters is kept (it does not count toward the length); use brandText to
 * show the name.
 */
export function parseBrandName(raw: string | undefined | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim();
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/.test(name)) return undefined;
  const parts = name.split(BRAND_SPLIT);
  if (parts.length > 2 || parts.some((p) => p.trim() !== p || p === '')) return undefined;
  const length = [...brandText(name)].length;
  if (length < 1 || length > BRAND_MAX_LENGTH) return undefined;
  return name;
}

/** The brand name as text: without its BRAND_SPLIT marker. */
export function brandText(name: string): string {
  return name.replace(BRAND_SPLIT, '');
}

/** HABBLAUD_BRAND_NAME and HABBLAUD_BRAND_SHORT; invalid or missing values fall back to the default / the name. */
export function parseBrand(env: Readonly<Record<string, string | undefined>>): Brand {
  const raw = parseBrandName(env.HABBLAUD_BRAND_NAME) ?? DEFAULT_BRAND;
  const name = brandText(raw);
  const shortRaw = parseBrandName(env.HABBLAUD_BRAND_SHORT);
  const short = shortRaw === undefined ? name : brandText(shortRaw);
  return raw === name ? { name, short } : { name, short, wordmark: raw };
}

/** Escapes text for an HTML attribute or element body. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Puts the brand in index.html: every "Habblaud" (title, Open Graph / Twitter titles, the brand meta) becomes the
 * brand name, and `apple-mobile-web-app-title` gets the short form. Identity for the default brand.
 */
export function brandIndexHtml(html: string, brand: Brand): string {
  if (brand.name === DEFAULT_BRAND && brand.short === DEFAULT_BRAND && !brand.wordmark) return html;
  const name = escapeHtml(brand.name);
  const short = escapeHtml(brand.short);
  const wordmark = escapeHtml(brand.wordmark ?? brand.name);
  return html
    .replace(/(<meta\s+name="apple-mobile-web-app-title"\s+content=")Habblaud(")/g, (_m, a: string, b: string) => `${a}${short}${b}`)
    .replace(new RegExp(`(<meta\\s+name="${BRAND_META}"\\s+content=")Habblaud(")`, 'g'), (_m, a: string, b: string) => `${a}${wordmark}${b}`)
    .replace(/\bHabblaud\b/g, () => name);
}

/** Puts the brand in the PWA manifest (JSON text); a manifest that does not parse is returned as is. */
export function brandManifest(json: string, brand: Brand): string {
  if (brand.name === DEFAULT_BRAND && brand.short === DEFAULT_BRAND) return json;
  try {
    const manifest = JSON.parse(json) as Record<string, unknown>;
    manifest.name = brand.name;
    manifest.short_name = brand.short;
    return `${JSON.stringify(manifest, null, 2)}\n`;
  } catch {
    return json;
  }
}
