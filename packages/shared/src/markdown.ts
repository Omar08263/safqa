export interface MdSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

export interface MdBlock {
  type: 'p' | 'h' | 'li';
  ordered?: boolean;
  spans: MdSpan[];
}

/** A small subset of markdown: headings, lists, bold, italic, code, links. */
export function parseMarkdown(input: string): MdBlock[] {
  let source = input.replace(/\r\n/g, '\n').trim();
  const fenced = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(source);
  if (fenced?.[1]) source = fenced[1].trim();
  const blocks: MdBlock[] = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading?.[2]) {
      blocks.push({ type: 'h', spans: inline(heading[2]) });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet?.[1]) {
      blocks.push({ type: 'li', spans: inline(bullet[1]) });
      continue;
    }
    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered?.[1]) {
      blocks.push({ type: 'li', ordered: true, spans: inline(ordered[1]) });
      continue;
    }
    blocks.push({ type: 'p', spans: inline(line) });
  }
  if (blocks.length === 0) blocks.push({ type: 'p', spans: [{ text: input }] });
  return blocks;
}

function inline(text: string): MdSpan[] {
  const spans: MdSpan[] = [];
  const pattern =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ text: text.slice(last, index) });
    if (match[1] && match[2]) spans.push({ text: match[1], href: match[2] });
    else if (match[3]) spans.push({ text: match[3], bold: true });
    else if (match[4]) spans.push({ text: match[4], code: true });
    else if (match[5]) spans.push({ text: match[5], italic: true });
    last = index + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.length > 0 ? spans : [{ text }];
}
