import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

// Optional same-origin hosting of the built web app (apps/web/dist).
// Enabled only when WEB_DIST_DIR is set (used by the single-container
// Hugging Face Space deploy). API routes always win.
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const API_PREFIXES = ['/api/', '/api', '/docs', '/openapi.json'];

export function withStaticWeb(
  apiFetch: (request: Request) => Response | Promise<Response>,
  distDir = process.env.WEB_DIST_DIR,
): (request: Request) => Promise<Response> {
  if (!distDir) return async (request) => apiFetch(request);
  const root = resolve(distDir);

  async function file(path: string, cache: string): Promise<Response | null> {
    const full = normalize(join(root, path));
    if (!full.startsWith(root)) return null;
    try {
      const info = await stat(full);
      if (!info.isFile()) return null;
      const body = await readFile(full);
      return new Response(body, {
        headers: {
          'content-type':
            TYPES[extname(full).toLowerCase()] || 'application/octet-stream',
          'cache-control': cache,
        },
      });
    } catch {
      return null;
    }
  }

  return async (request) => {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    const isApi = API_PREFIXES.some(
      (p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`),
    );
    if (isApi || (request.method !== 'GET' && request.method !== 'HEAD'))
      return apiFetch(request);
    if (path !== '/' && !path.endsWith('/')) {
      const immutable = path.startsWith('/assets/');
      const hit = await file(
        path,
        immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
      if (hit) return hit;
      if (extname(path)) return new Response('Not found', { status: 404 });
    }
    const index = await file('index.html', 'no-cache');
    return index ?? apiFetch(request);
  };
}
