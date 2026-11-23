// Files of the built client (dist/client) in production mode, with an SPA fallback.
//
// Caching:
// - /bundle/* are the files Vite generates with a hash in the name (build.assetsDir = 'bundle'):
//   their content never changes, so they can be cached for 1 year (immutable);
// - everything else (index.html and client/public: /assets/brand, /assets/art, manifest.json...) has a
//   fixed name and may change on every build: `no-cache` + ETag/Last-Modified, and the browser revalidates (304).
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync, type Stats } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { tr } from '../../shared/i18n';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

/** Folder of Vite's hashed files (same as `build.assetsDir` in vite.config.ts). */
export const HASHED_DIR = '/bundle/';
export const IMMUTABLE = 'public, max-age=31536000, immutable';
export const REVALIDATE = 'no-cache';

function fileStat(p: string): Stats | undefined {
  try {
    const st = statSync(p);
    return st.isFile() ? st : undefined;
  } catch {
    return undefined;
  }
}

/** Weak ETag from the size and modification time (cheap and stable across restarts). */
export function etagOf(st: Pick<Stats, 'size' | 'mtimeMs'>): string {
  return `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
}

/** Weak ETag from the content itself, for responses rewritten per request (index.html and manifest with the brand). */
export function contentEtag(body: Buffer): string {
  return `W/"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
}

/** Is the browser's copy still valid? (If-None-Match takes precedence over If-Modified-Since.) */
export function isNotModified(req: IncomingMessage, etag: string, mtimeMs: number): boolean {
  const inm = req.headers['if-none-match'];
  if (typeof inm === 'string' && inm.trim()) {
    const strip = (t: string) => t.trim().replace(/^W\//, '');
    const want = strip(etag);
    return inm.split(',').some((t) => t.trim() === '*' || strip(t) === want);
  }
  const ims = req.headers['if-modified-since'];
  if (typeof ims === 'string' && ims.trim()) {
    const since = Date.parse(ims);
    // Last-Modified has one-second resolution.
    return Number.isFinite(since) && Math.floor(mtimeMs / 1000) * 1000 <= since;
  }
  return false;
}

export interface StaticOptions {
  /** Rewrites index.html before it is sent (white-labeling: the brand name, see http/brand.ts). */
  transformIndex?: (html: string) => string;
}

export function createStaticHandler(
  distDir: string,
  opts: StaticOptions = {},
): (req: IncomingMessage, res: ServerResponse, pathname: string) => void {
  const root = resolve(distDir);
  const index = join(root, 'index.html');

  const send = (req: IncomingMessage, res: ServerResponse, file: string, st: Stats, cache: string) => {
    const etag = etagOf(st);
    const headers: Record<string, string | number> = {
      'Cache-Control': cache,
      ETag: etag,
      'Last-Modified': new Date(st.mtimeMs).toUTCString(),
      'X-Content-Type-Options': 'nosniff',
      // The page must not be embedded in third-party sites (clickjacking on the settings).
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    };
    if (isNotModified(req, etag, st.mtimeMs)) {
      res.writeHead(304, headers);
      return void res.end();
    }
    res.writeHead(200, {
      ...headers,
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': st.size,
    });
    if (req.method === 'HEAD') return void res.end();
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  };

  /** index.html through `transformIndex`: read and rewritten per request (small, no-cache), ETag from the result. */
  const sendIndex = (req: IncomingMessage, res: ServerResponse, st: Stats) => {
    const transform = opts.transformIndex;
    if (!transform) return send(req, res, index, st, REVALIDATE);
    let body: Buffer;
    try {
      body = Buffer.from(transform(readFileSync(index, 'utf8')), 'utf8');
    } catch {
      return send(req, res, index, st, REVALIDATE);
    }
    const etag = contentEtag(body);
    const headers: Record<string, string | number> = {
      'Cache-Control': REVALIDATE,
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    };
    // Only the ETag counts (NaN never matches If-Modified-Since): the content depends on more than the file.
    if (isNotModified(req, etag, Number.NaN)) {
      res.writeHead(304, headers);
      return void res.end();
    }
    res.writeHead(200, { ...headers, 'Content-Type': MIME['.html'], 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  };

  return (req, res, pathname) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      return void res.end(tr('Method not allowed'));
    }
    const indexStat = fileStat(index);
    if (!indexStat) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return void res.end(tr('Client not built. Run "npm run build" (or use "npm run dev").'));
    }
    let rel: string;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return void res.end(tr('Invalid path'));
    }
    const file = resolve(root, `.${rel}`);
    const inside = file === root || file.startsWith(root + sep);
    const st = inside && file !== root ? fileStat(file) : undefined;
    if (st && file === index) return sendIndex(req, res, st);
    if (st) return send(req, res, file, st, rel.startsWith(HASHED_DIR) ? IMMUTABLE : REVALIDATE);
    if (rel.startsWith('/assets/') || rel.startsWith(HASHED_DIR)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return void res.end(tr('Not found'));
    }
    // SPA: any other route falls back to index.html.
    sendIndex(req, res, indexStat);
  };
}
