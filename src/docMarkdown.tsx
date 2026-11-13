/* Light markdown → React for Brand Documents (headings, lists, emphasis). No HTML pass-through. */
import type { ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const raw = m[0];
    if (raw.startsWith('**')) out.push(<strong key={i++}>{raw.slice(2, -2)}</strong>);
    else if (raw.startsWith('*')) out.push(<em key={i++}>{raw.slice(1, -1)}</em>);
    else out.push(<code key={i++}>{raw.slice(1, -1)}</code>);
    last = m.index + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function DocMarkdown({ text, empty }: { text: string; empty: string }) {
  const body = text.replace(/\r\n/g, '\n').trim();
  if (!body) return <p className="bk-md-empty">{empty}</p>;

  const blocks: ReactNode[] = [];
  const lines = body.split('\n');
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = (level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4') as 'h2' | 'h3' | 'h4';
      blocks.push(<Tag key={k++} className={`bk-md-h bk-md-h${level}`}>{inline(heading[2].trim())}</Tag>);
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(<li key={items.length}>{inline(lines[i].replace(/^[-*]\s+/, ''))}</li>);
        i += 1;
      }
      blocks.push(<ul key={k++} className="bk-md-ul">{items}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(<li key={items.length}>{inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>);
        i += 1;
      }
      blocks.push(<ol key={k++} className="bk-md-ol">{items}</ol>);
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^#{1,3}\s/.test(lines[i]) && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(<p key={k++} className="bk-md-p">{inline(para.join(' '))}</p>);
  }

  return <div className="bk-md">{blocks}</div>;
}
