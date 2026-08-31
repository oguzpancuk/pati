import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { KVKK_MD } from '../legal';

/**
 * Renders the legal markdown with a deliberately tiny converter: the text is
 * ours and uses only headings, lists, bold, and rules — a markdown library
 * for one static page isn't worth the bundle bytes. Public page: reachable
 * without signing in (App mounts it outside the auth gate) so the register
 * screen can link to it.
 */
type Block =
  | { kind: 'h1' | 'h2' | 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'hr' };

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line === '---') {
      flush();
      blocks.push({ kind: 'hr' });
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'h2', text: line.slice(3) });
    } else if (line.startsWith('# ')) {
      flush();
      blocks.push({ kind: 'h1', text: line.slice(2) });
    } else if (line.startsWith('- ')) {
      if (list?.kind !== 'ul') {
        flush();
        list = { kind: 'ul', items: [] };
      }
      list.items.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      if (list?.kind !== 'ol') {
        flush();
        list = { kind: 'ol', items: [] };
      }
      list.items.push(line.replace(/^\d+\.\s/, ''));
    } else if (list) {
      // A wrapped continuation line belongs to the previous list item.
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      blocks.push({ kind: 'p', text: line });
    }
  }
  flush();
  return blocks;
}

/** **bold** → <strong>; everything else stays plain text. */
function rich(text: string) {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/**
 * Shared shell for the two legal pages (KVKK at /gizlilik, terms at
 * /kosullar) — same tiny renderer, different markdown. Deliberately NO
 * cross-link between them (owner decision, 2026-08-31: it read like a tab
 * bar); each page stands alone and is reached by its own link.
 */
export function LegalPage({ md, micro }: { md: string; micro: string }) {
  const navigate = useNavigate();
  const blocks = useMemo(() => parse(md), [md]);

  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="topbar">
        <button className="back" aria-label="Geri" onClick={() => navigate(-1)}>
          ←
        </button>
        <div className="micro">{micro}</div>
        <span />
      </div>

      <div style={{ lineHeight: 1.65, fontSize: 14.5 }}>
        {blocks.map((block, i) => {
          switch (block.kind) {
            case 'h1':
              return (
                <h1 key={i} style={{ fontSize: 23, margin: '26px 0 8px' }}>
                  {rich(block.text)}
                </h1>
              );
            case 'h2':
              return (
                <h2 key={i} style={{ fontSize: 17, margin: '22px 0 6px' }}>
                  {rich(block.text)}
                </h2>
              );
            case 'ul':
            case 'ol': {
              const Tag = block.kind;
              return (
                <Tag key={i} style={{ margin: '8px 0', paddingLeft: 22 }}>
                  {block.items.map((item, j) => (
                    <li key={j} style={{ marginBottom: 4 }}>
                      {rich(item)}
                    </li>
                  ))}
                </Tag>
              );
            }
            case 'hr':
              return <div key={i} className="hairline" style={{ margin: '28px 0' }} />;
            default:
              return (
                <p key={i} style={{ margin: '8px 0' }} className="_p">
                  {rich(block.text)}
                </p>
              );
          }
        })}
      </div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <LegalPage
      md={KVKK_MD}
      micro="aydınlatma metni (kvkk)"
    />
  );
}
