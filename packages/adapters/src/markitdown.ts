import { spawn } from 'node:child_process';
import { prepareHtmlForMarkdown } from './html-clean';

export class MarkitdownUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarkitdownUnavailable';
  }
}

export interface HtmlToMarkdownOptions {
  /** Override the CLI path. Defaults to MARKITDOWN_BIN or `markitdown`. */
  bin?: string;
  timeoutMs?: number;
  /** Skip H1/nav cleanup when the caller already prepared the HTML. */
  alreadyPrepared?: boolean;
  env?: Record<string, string | undefined>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export function markitdownBin(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.MARKITDOWN_BIN?.trim();
  return configured && configured.length > 0 ? configured : 'markitdown';
}

/**
 * Turn noisy storefront HTML into compact markdown for the LLM path.
 * Call this after JSON-LD parsing; it is a cleanup step, not a price parser.
 */
export async function htmlToLlmMarkdown(
  html: string,
  options: HtmlToMarkdownOptions = {},
): Promise<string> {
  const prepared = options.alreadyPrepared
    ? html
    : prepareHtmlForMarkdown(html);
  const markdown = await runMarkitdownCli(prepared, options);
  return compactMarkdown(markdown);
}

export function compactMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Per-listing cap for the markdown block sent to the debate. */
export const DEFAULT_LLM_MARKDOWN_CHARS = 4_000;
/** Cap for a product's combined listing context across stores. */
export const DEFAULT_LLM_CONTEXT_TOTAL_CHARS = 12_000;

const PAGE_CONTEXT_PREAMBLE =
  'Listing context. Structured offer (JSON-LD) prices are authoritative. Do not invent or override a price from the page text.';

export type LlmContextOffer = {
  title: string;
  priceEGP: number;
  listPriceEGP?: number;
  inStock: boolean;
};

export type LlmPageInput = {
  url: string;
  offer: LlmContextOffer | null;
  markdown: string | null;
};

export function clipMarkdown(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}\n…`;
}

/**
 * A short LLM context that keeps structured JSON-LD facts first when they
 * exist, then the compact page text. Prices in `offer` stay authoritative.
 * A different price that appears only in `markdown` is never promoted.
 */
export function formatLlmPageContext(
  input: LlmPageInput & { maxMarkdownChars?: number },
): string {
  const lines = [`Source: ${input.url}`];
  if (input.offer) {
    lines.push(
      'Structured offer (JSON-LD, authoritative):',
      `- title: ${input.offer.title}`,
      `- priceEGP: ${input.offer.priceEGP}`,
    );
    if (input.offer.listPriceEGP != null) {
      lines.push(`- listPriceEGP: ${input.offer.listPriceEGP}`);
    }
    lines.push(`- inStock: ${input.offer.inStock}`);
  } else {
    lines.push(
      'Structured offer: none. Read the page text below; do not invent a price.',
    );
  }
  if (input.markdown) {
    const maxChars = input.maxMarkdownChars ?? DEFAULT_LLM_MARKDOWN_CHARS;
    lines.push('', 'Page text:', clipMarkdown(input.markdown, maxChars));
  }
  return lines.join('\n');
}

/**
 * Combine one or more listings into a single debate/assistant context.
 * Returns undefined when there is nothing useful to send.
 */
export function formatProductLlmContexts(
  pages: LlmPageInput[],
  options?: { maxMarkdownChars?: number; maxTotalChars?: number },
): string | undefined {
  const useful = pages.filter((page) => page.offer || page.markdown);
  if (useful.length === 0) return undefined;
  const maxMarkdownChars =
    options?.maxMarkdownChars ?? DEFAULT_LLM_MARKDOWN_CHARS;
  const maxTotalChars =
    options?.maxTotalChars ?? DEFAULT_LLM_CONTEXT_TOTAL_CHARS;
  const body = useful
    .map((page) => formatLlmPageContext({ ...page, maxMarkdownChars }))
    .join('\n\n');
  return clipMarkdown(`${PAGE_CONTEXT_PREAMBLE}\n\n${body}`, maxTotalChars);
}

async function runMarkitdownCli(
  html: string,
  options: HtmlToMarkdownOptions,
): Promise<string> {
  const bin = options.bin ?? markitdownBin(options.env ?? process.env);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['-x', 'html', '-m', 'text/html'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk as Buffer));
    child.stderr.on('data', (chunk) => stderr.push(chunk as Buffer));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(wrapSpawnError(error, bin));
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`MarkItDown timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString('utf8');
      if (code === 0) {
        resolve(out);
        return;
      }
      const err = Buffer.concat(stderr).toString('utf8').trim().slice(0, 400);
      reject(
        new Error(
          `MarkItDown exited ${code ?? signal ?? 'unknown'}${err ? `: ${err}` : ''}`,
        ),
      );
    });
    child.stdin.on('error', () => {
      // The process may close stdin early (EPIPE). `close` / `error` decide the result.
    });
    child.stdin.end(html, 'utf8');
  });
}

function wrapSpawnError(error: unknown, bin: string): Error {
  if (isEnoent(error)) {
    return new MarkitdownUnavailable(
      `MarkItDown CLI was not found (${bin}). Install markitdown 0.1.x or set MARKITDOWN_BIN.`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

function isEnoent(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT',
  );
}
