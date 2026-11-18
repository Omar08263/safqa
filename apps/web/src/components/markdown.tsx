import { type MdSpan, parseMarkdown } from '@safqa/shared';

export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2 leading-7">
      {blocks.map((block, index) => {
        if (block.type === 'h') {
          return (
            <p key={index} className="font-semibold">
              <Spans spans={block.spans} />
            </p>
          );
        }
        if (block.type === 'li') {
          return (
            <p key={index} className="ps-4">
              {block.ordered ? `${index + 1}. ` : '• '}
              <Spans spans={block.spans} />
            </p>
          );
        }
        return (
          <p key={index}>
            <Spans spans={block.spans} />
          </p>
        );
      })}
    </div>
  );
}

function Spans({ spans }: { spans: MdSpan[] }) {
  return spans.map((span, index) => {
    const body = span.code ? (
      <code key={index} className="rounded bg-accent px-1">
        {span.text}
      </code>
    ) : span.bold ? (
      <strong key={index}>{span.text}</strong>
    ) : span.italic ? (
      <em key={index}>{span.text}</em>
    ) : (
      <span key={index}>{span.text}</span>
    );
    if (!span.href) return body;
    return (
      <a key={index} href={span.href} className="underline">
        {span.text}
      </a>
    );
  });
}
