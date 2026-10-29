import { AlertTriangle } from 'lucide-react';
import type { LegalDoc } from '@/content/legal';
import type { Block } from '@/content/legal/types';
import type { SiteDict } from '@/lib/i18n';

/** Renders text with [● …] placeholders highlighted, so open items are impossible to miss. */
function Text({ value }: { value: string }) {
  const parts = value.split(/(\[● [^\]]+\])/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('[● ') ? (
          <mark key={i} className="rounded bg-warn/20 px-1 text-warn">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (typeof block === 'string') return <p className="leading-relaxed text-muted"><Text value={block} /></p>;
  if ('list' in block) {
    return (
      <ul className="grid gap-2 pl-5 text-muted marker:text-violet-400 [list-style:disc]">
        {block.list.map((item) => (
          <li key={item} className="leading-relaxed"><Text value={item} /></li>
        ))}
      </ul>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-surface-strong text-xs text-subtle">
          <tr>{block.table.head.map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {block.table.rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j} className="px-4 py-3 align-top text-muted"><Text value={cell} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalArticle({ doc, t }: { doc: LegalDoc; t: SiteDict['legal'] }) {
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_15rem]">
      <article className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{doc.title}</h1>
        <p className="mt-3 text-sm text-subtle">
          {t.version} {doc.version}
        </p>
        {doc.status === 'draft' && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/8 px-4 py-3 text-sm text-warn">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            {t.draft}
          </div>
        )}
        {t.translation && <p className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">{t.translation}</p>}
        <div className="mt-10 grid gap-12">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id} className="grid scroll-mt-24 gap-4">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              {section.blocks.map((block, i) => (
                <BlockView key={i} block={block} />
              ))}
            </section>
          ))}
        </div>
      </article>
      {doc.sections.length > 2 && (
        <nav className="hidden lg:block">
          <div className="sticky top-24">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-subtle">{t.onThisPage}</div>
            <ul className="grid gap-2 border-l border-line text-sm">
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l border-transparent pl-4 text-muted hover:border-violet-400 hover:text-fg">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      )}
    </div>
  );
}
