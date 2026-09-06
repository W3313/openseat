import { GLOSSARY, type GlossaryEntry } from '@/lib/copy/tooltips';

const GROUP_TITLES = { stats: 'Stats', badges: 'Badges', sorts: 'Sort orders' } as const;
type GroupKey = keyof typeof GROUP_TITLES;

function groupOf(entry: GlossaryEntry): GroupKey {
  return entry.key.split('.')[0] as GroupKey;
}

/** Group the flat GLOSSARY by its key prefix, preserving tooltips.ts order. */
export function glossaryGroups(entries: readonly GlossaryEntry[] = GLOSSARY): { group: GroupKey; title: string; entries: GlossaryEntry[] }[] {
  const out = new Map<GroupKey, GlossaryEntry[]>();
  for (const e of entries) {
    const g = groupOf(e);
    if (!out.has(g)) out.set(g, []);
    out.get(g)!.push(e);
  }
  return [...out.entries()].map(([group, list]) => ({ group, title: GROUP_TITLES[group], entries: list }));
}

/** SPEC 3.6 `#glossary`: every entry in tooltips.ts, template placeholders shown as-is. */
export function Glossary({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p>
        Every tooltip in the app comes from one file (<code>src/lib/copy/tooltips.ts</code>); this is all of them.
        Curly-brace placeholders like <code>{'{n}'}</code> are filled with the professor’s numbers on the page.
      </p>
      {glossaryGroups().map(({ group, title, entries }) => (
        <div key={group} className="space-y-2">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <dl className="divide-y divide-border rounded-lg border border-border">
            {entries.map((e) => (
              <div key={e.key} id={`glossary-${e.key.replace('.', '-')}`} className="grid gap-1 px-4 py-2 sm:grid-cols-[12rem_1fr] sm:gap-4">
                <dt className="font-medium text-ink">
                  {e.label}
                  <span className="block font-mono text-[0.7rem] font-normal text-ink-faint">{e.key}</span>
                </dt>
                <dd className="text-ink-muted">{e.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

export default Glossary;
