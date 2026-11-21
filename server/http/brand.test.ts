import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { brandIndexHtml, brandManifest, parseBrand, parseBrandName } from '../../shared/brand';
import { tempDir } from '../test/fixtures';
import { createManifestHandler } from './brand';
import { loginPage } from './remote';
import { createStaticHandler } from './static';

const ROOT = join(__dirname, '..', '..');

describe('brand settings', () => {
  it('validates HABBLAUD_BRAND_NAME and falls back to Habblaud', () => {
    expect(parseBrand({})).toEqual({ name: 'Habblaud', short: 'Habblaud' });
    expect(parseBrand({ HABBLAUD_BRAND_NAME: '  SWIFTc ' })).toEqual({ name: 'SWIFTc', short: 'SWIFTc' });
    expect(parseBrand({ HABBLAUD_BRAND_NAME: 'Acme Agents', HABBLAUD_BRAND_SHORT: 'Acme' })).toEqual({ name: 'Acme Agents', short: 'Acme' });
    expect(parseBrandName('')).toBeUndefined();
    expect(parseBrandName('   ')).toBeUndefined();
    expect(parseBrandName('x'.repeat(25))).toBeUndefined();
    expect(parseBrandName('x'.repeat(24))).toBe('x'.repeat(24));
    expect(parseBrandName('a\u0007b')).toBeUndefined();
    expect(parseBrandName('<script>')).toBeUndefined();
    expect(parseBrand({ HABBLAUD_BRAND_NAME: 'bad\nname' }).name).toBe('Habblaud');
  });

  it('takes a "|" wordmark split marker in HABBLAUD_BRAND_NAME and keeps it out of the text', () => {
    expect(parseBrand({ HABBLAUD_BRAND_NAME: 'swift|c' })).toEqual({ name: 'swiftc', short: 'swiftc', wordmark: 'swift|c' });
    expect(parseBrand({ HABBLAUD_BRAND_NAME: 'swift|c', HABBLAUD_BRAND_SHORT: 's|c' }).short).toBe('sc');
    expect(parseBrandName('x'.repeat(12) + '|' + 'x'.repeat(12))).toBe('x'.repeat(12) + '|' + 'x'.repeat(12));
    for (const bad of ['|c', 'swift|', 'a|b|c', 'swift |c']) expect(parseBrandName(bad)).toBeUndefined();
    const html = readFileSync(join(ROOT, 'client', 'index.html'), 'utf8');
    const out = brandIndexHtml(html, parseBrand({ HABBLAUD_BRAND_NAME: 'swift|c' }));
    expect(out).toContain('<title>swiftc</title>');
    expect(out).toContain('<meta name="habblaud-brand" content="swift|c" />');
    expect(out).toContain('<meta property="og:title" content="swiftc" />');
  });

  it('rewrites index.html: title, social titles, home-screen title and the brand meta', () => {
    const html = readFileSync(join(ROOT, 'client', 'index.html'), 'utf8');
    expect(brandIndexHtml(html, { name: 'Habblaud', short: 'Habblaud' })).toBe(html);
    const out = brandIndexHtml(html, { name: 'SWIFTc & Co', short: 'SWIFTc' });
    expect(out).toContain('<title>SWIFTc &amp; Co</title>');
    expect(out).toContain('<meta name="habblaud-brand" content="SWIFTc &amp; Co" />');
    expect(out).toContain('<meta property="og:title" content="SWIFTc &amp; Co" />');
    expect(out).toContain('<meta name="apple-mobile-web-app-title" content="SWIFTc" />');
    expect(out).not.toMatch(/\bHabblaud\b/);
    // Asset paths (lowercase) are untouched.
    expect(out).toContain('/assets/brand/favicon-32.png');
  });

  it('rewrites the manifest names', () => {
    const json = readFileSync(join(ROOT, 'client', 'public', 'manifest.webmanifest'), 'utf8');
    const out = JSON.parse(brandManifest(json, { name: 'SWIFTc', short: 'SW' })) as Record<string, unknown>;
    expect(out.name).toBe('SWIFTc');
    expect(out.short_name).toBe('SW');
    expect(out.start_url).toBe('/?app=1');
  });

  it('puts the brand on the remote login page', () => {
    const page = loginPage({ caDownload: true, brand: { name: 'SWIFTc', short: 'SW' } });
    expect(page).toContain('<h1>SWIFTc</h1>');
    expect(page).toContain('content="SW"');
    expect(page).not.toMatch(/<title>[^<]*Habblaud/);
    expect(loginPage({ caDownload: false })).toContain('<h1>Habblaud</h1>');
  });

  it('lets docker-compose pass the brand to the container', () => {
    const compose = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
    expect(compose).toMatch(/^\s+HABBLAUD_BRAND_NAME: \$\{HABBLAUD_BRAND_NAME:-Habblaud\}$/m);
    expect(compose).toMatch(/^\s+HABBLAUD_BRAND_SHORT: \$\{HABBLAUD_BRAND_SHORT:-\}$/m);
  });
});

describe('serving the brand', () => {
  let close: (() => Promise<void>) | undefined;
  let cleanup: (() => void) | undefined;
  afterEach(async () => {
    await close?.();
    cleanup?.();
    close = cleanup = undefined;
  });

  async function serve(brand: { name: string; short: string }): Promise<string> {
    const tmp = tempDir();
    cleanup = tmp.cleanup;
    const dist = join(tmp.dir, 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Habblaud</title><meta name="habblaud-brand" content="Habblaud" />');
    writeFileSync(join(dist, 'manifest.webmanifest'), '{"name":"Habblaud","short_name":"Habblaud"}');
    const serveStatic = createStaticHandler(dist, { transformIndex: (html) => brandIndexHtml(html, brand) });
    const serveManifest = createManifestHandler(brand, [join(dist, 'manifest.webmanifest')]);
    const server = http.createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (!serveManifest(req, res, path)) serveStatic(req, res, path);
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    close = () => new Promise((ok) => server.close(() => ok()));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('serves index.html (and SPA routes) with the brand, revalidating by content', async () => {
    const base = await serve({ name: 'SWIFTc', short: 'SWIFTc' });
    for (const path of ['/', '/index.html', '/some/route']) {
      const r = await fetch(`${base}${path}`);
      expect(r.status).toBe(200);
      const body = await r.text();
      expect(body).toContain('<title>SWIFTc</title>');
      expect(body).toContain('content="SWIFTc"');
    }
    const first = await fetch(`${base}/`);
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();
    expect((await fetch(`${base}/`, { headers: { 'If-None-Match': etag } })).status).toBe(304);
  });

  it('serves the manifest with the brand', async () => {
    const base = await serve({ name: 'SWIFTc', short: 'SW' });
    const r = await fetch(`${base}/manifest.webmanifest`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/manifest+json');
    expect(await r.json()).toEqual({ name: 'SWIFTc', short_name: 'SW' });
  });

  it('leaves the files alone for the default brand', async () => {
    const base = await serve({ name: 'Habblaud', short: 'Habblaud' });
    expect(await (await fetch(`${base}/manifest.webmanifest`)).json()).toEqual({ name: 'Habblaud', short_name: 'Habblaud' });
    expect(await (await fetch(`${base}/`)).text()).toContain('<title>Habblaud</title>');
  });
});
