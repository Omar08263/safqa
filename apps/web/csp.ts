// Content-Security-Policy for the site, generated at build time: the inline boot script
// in index.html (clean URLs + Google implicit-flow fragment capture) and the font
// onload handler are allowed by their SHA-256 hashes only — no 'unsafe-inline' scripts.
// Writes the policy into dist/_headers (placeholder __SAFQA_CSP__ from public/_headers).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const API = 'https://safqa-api.safqaeg.workers.dev';
const sha = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

export function buildCsp(html: string): string {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => sha(m[1]!));
  const handlers = [...html.matchAll(/\son[a-z]+="([^"]*)"/gi)].map((m) => sha(m[1]!));
  return [
    "default-src 'self'",
    `script-src 'self' ${scripts.join(' ')}${handlers.length ? ` 'unsafe-hashes' ${[...new Set(handlers)].join(' ')}` : ''} 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://fastly.jsdelivr.net`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    `connect-src 'self' ${API} https://safqa-eg-safqa.static.hf.space https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net https://fastly.jsdelivr.net https://raw.githubusercontent.com https://api.github.com https://open.er-api.com https://*.openfoodfacts.org https://api.upcitemdb.com https://accounts.google.com https://oauth2.googleapis.com https://fonts.googleapis.com https://fonts.gstatic.com`,
    "worker-src 'self' blob:",
    'frame-src https://accounts.google.com',
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com",
    "base-uri 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
    `report-uri ${API}/api/v2/csp-report`,
  ].join('; ');
}

export function cspHeaders(): Plugin {
  let outDir = 'dist';
  return {
    name: 'safqa-csp-headers',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    writeBundle() {
      const headers = join(outDir, '_headers');
      const index = join(outDir, 'index.html');
      if (!existsSync(headers) || !existsSync(index)) return;
      const csp = buildCsp(readFileSync(index, 'utf8'));
      writeFileSync(headers, readFileSync(headers, 'utf8').replace('__SAFQA_CSP__', csp));
    },
  };
}
