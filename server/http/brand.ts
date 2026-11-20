// White-labeling at runtime (HABBLAUD_BRAND_NAME / HABBLAUD_BRAND_SHORT, shared/brand.ts): the same build serves
// any brand. index.html is rewritten by the static handler (production) or by a Vite plugin (dev); the PWA manifest
// is served from here with `name` and `short_name` replaced.
import { readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { brandIndexHtml, brandManifest, DEFAULT_BRAND, type Brand } from '../../shared/brand';
import { contentEtag, isNotModified } from './static';

export const MANIFEST_PATH = '/manifest.webmanifest';

export function isDefaultBrand(brand: Brand): boolean {
  return brand.name === DEFAULT_BRAND && brand.short === DEFAULT_BRAND;
}

/** Vite plugin (dev mode): the same index.html rewrite the static handler does in production. */
export function brandVitePlugin(brand: Brand): { name: string; transformIndexHtml: (html: string) => string } {
  return { name: 'habblaud-brand', transformIndexHtml: (html) => brandIndexHtml(html, brand) };
}

/**
 * GET/HEAD /manifest.webmanifest with the brand. `files` are tried in order (dist/client, then client/public); returns
 * false (not handled) for the default brand, another path or a missing file, so the normal handler serves it.
 */
export function createManifestHandler(brand: Brand, files: readonly string[]): (req: IncomingMessage, res: ServerResponse, pathname: string) => boolean {
  return (req, res, pathname) => {
    if (pathname !== MANIFEST_PATH || isDefaultBrand(brand)) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    for (const file of files) {
      let text: string;
      try {
        if (!statSync(file).isFile()) continue;
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const body = Buffer.from(brandManifest(text, brand), 'utf8');
      const etag = contentEtag(body);
      const headers: Record<string, string | number> = {
        'Cache-Control': 'no-cache',
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
      };
      // Only the ETag counts (Number.NaN never matches If-Modified-Since): the content depends on the brand too.
      if (isNotModified(req, etag, Number.NaN)) {
        res.writeHead(304, headers);
        res.end();
        return true;
      }
      res.writeHead(200, { ...headers, 'Content-Type': 'application/manifest+json', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return true;
    }
    return false;
  };
}
