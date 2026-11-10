import type { ReactNode } from 'react';

// Remembered for the whole visit, so a group opens on the page you used last.
const lastPage = new Map<string, string>();

/** One page inside a group: [key, label, badge count]. */
export type GroupPage<K extends string> = readonly [K, string, number?];
export interface TabGroup<K extends string> {
  label: string;
  pages: readonly GroupPage<K>[];
}

/**
 * Sub-tabs with related pages grouped: the top row shows the groups, and a
 * small switch under it picks the page inside the current group. A group
 * opens on the page you used last.
 */
export function GroupedTabs<K extends string>({ groups, current, onPick, label, line }: Readonly<{ groups: readonly TabGroup<K>[]; current: K; onPick: (k: K) => void; label: string; line?: boolean }>) {
  const active = groups.find((g) => g.pages.some(([k]) => k === current)) ?? groups[0];
  lastPage.set(`${label}|${active.label}`, current);
  const badge = (n?: number): ReactNode => (n ? <span className="tab-badge">{n}</span> : null);
  const nav = (
    <nav className="subtabs" aria-label={label}>
      {groups.map((g) => {
        const on = g === active;
        return (
          <button key={g.label} className={on ? 'active' : ''} aria-current={on ? 'page' : undefined} onClick={() => onPick((lastPage.get(`${label}|${g.label}`) as K | undefined) ?? g.pages[0][0])}>
            {g.label}
            {badge(g.pages.reduce((s, [, , n]) => s + (n ?? 0), 0))}
          </button>
        );
      })}
    </nav>
  );
  const seg =
    active.pages.length > 1 ? (
      <div className="seg" role="group" aria-label={`${active.label} pages`}>
        {active.pages.map(([k, l, n]) => (
          <button key={k} className={k === current ? 'active' : ''} aria-pressed={k === current} onClick={() => onPick(k)}>
            {l}
            {badge(n)}
          </button>
        ))}
      </div>
    ) : null;
  return (
    <>
      {line ? <div className="subtabs-line">{nav}</div> : nav}
      {seg && <div className="subtabs-line seg-line">{seg}</div>}
    </>
  );
}
