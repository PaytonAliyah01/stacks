import { useMemo } from 'react';
import { FORMAT_LABELS, KIND_LABELS, formatMoney, isMusic, kindOf, type Book, type BookFormat, type Bookcase } from '../types';

export function Bars({ rows, unit }: Readonly<{ rows: [string, number][]; unit?: (n: number) => string }>) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (rows.length === 0) return <p className="muted">Nothing to show yet.</p>;
  return (
    <ul className="bars">
      {rows.map(([label, n]) => (
        <li key={label}>
          <span className="bar-label">{label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="bar-value">{unit ? unit(n) : n.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}


export function Stats({ books, bookcases, onOpen }: Readonly<{ books: Book[]; bookcases: Bookcase[]; onOpen: (b: Book) => void }>) {
  const s = useMemo(() => {
    const count = <K extends string>(keyOf: (b: Book) => K | K[] | undefined) => {
      const m = new Map<K, number>();
      for (const b of books) {
        const k = keyOf(b);
        for (const x of Array.isArray(k) ? k : k ? [k] : []) m.set(x, (m.get(x) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const priced = books.filter((b) => b.pricePaid !== undefined);
    const spentBy = new Map<string, number>();
    for (const b of priced) {
      const c = b.currency ?? 'USD';
      spentBy.set(c, (spentBy.get(c) ?? 0) + (b.pricePaid ?? 0) * b.copies);
    }
    const spent = [...spentBy.entries()].sort((a, b) => b[1] - a[1]);
    const byMonth = new Map<string, number>();
    for (const b of books) {
      if (!b.acquiredOn) continue;
      const m = b.acquiredOn.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
    }
    const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).reverse();
    const monthLabel = (ym: string) =>
      new Date(`${ym}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    return {
      formats: count((b) => (isMusic(b) ? `m:${kindOf(b)}` : b.format)).map(
        ([k, n]) => [k.startsWith('m:') ? KIND_LABELS[k.slice(2) as 'vinyl' | 'cd'].many : FORMAT_LABELS[k as BookFormat], n] as [string, number],
      ),
      authors: count((b) => b.authors).slice(0, 8),
      locations: count((b) => bookcases.find((c) => c.id === b.placement?.bookcaseId)?.name ?? b.location).slice(0, 8),
      genres: count((b) => b.subjects.slice(0, 3)).slice(0, 8),
      months: months.map(([k, n]) => [monthLabel(k), n] as [string, number]),
      spent,
      pricedCount: priced.length,
      undated: books.filter((b) => !b.acquiredOn).length,
      loans: books.filter((b) => b.loan).sort((a, b) => a.loan!.since.localeCompare(b.loan!.since)),
      longest: [...books].filter((b) => !isMusic(b) && b.pageCount).sort((a, b) => b.pageCount! - a.pageCount!)[0],
    };
  }, [books, bookcases]);

  const daysAgo = (d: string) => Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000));

  return (
    <div className="stats">
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Spent on books</span>
          <span className={`stat-value ${s.spent.length > 1 ? 'small' : ''}`}>
            {s.spent.length ? s.spent.map(([c, n]) => formatMoney(n, c)).join(' + ') : '—'}
          </span>
          <span className="muted">from {s.pricedCount} with a price entered</span>
        </div>
        <div className="stat">
          <span className="stat-label">Lent out</span>
          <span className="stat-value">{s.loans.length}</span>
          <span className="muted">{s.loans.length ? 'see the list below' : 'every book is home'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Longest book</span>
          <span className="stat-value small">{s.longest ? s.longest.title : '—'}</span>
          <span className="muted">{s.longest ? `${s.longest.pageCount!.toLocaleString()} pages` : 'no page counts yet'}</span>
        </div>
      </div>

      <div className="stat-grid">
        <section className="panel">
          <h3>Bought per month</h3>
          {(s.months.length > 0 || s.undated === 0) && <Bars rows={s.months} />}
          {s.undated > 0 && (
            <p className="muted small">
              {s.months.length === 0 ? 'No purchase dates yet. ' : ''}
              {s.undated === 1 ? '1 item has' : `${s.undated} items have`} no purchase date, so {s.undated === 1 ? "it isn't" : "they aren't"} counted here.
              Add one under “Your copy” when you open a book.
            </p>
          )}
        </section>
        <section className="panel">
          <h3>Formats and media</h3>
          <Bars rows={s.formats} />
        </section>
        <section className="panel">
          <h3>Most-owned authors and artists</h3>
          <Bars rows={s.authors} />
        </section>
        <section className="panel">
          <h3>Bookcases</h3>
          {s.locations.length ? <Bars rows={s.locations} /> : <p className="muted">Add bookcases in the Shelves tab and put books on them to see them here.</p>}
        </section>
        <section className="panel">
          <h3>Top subjects</h3>
          <Bars rows={s.genres} />
        </section>
        <section className="panel">
          <h3>Lent out</h3>
          {s.loans.length === 0 ? (
            <p className="muted">When you lend a book, put the person's name on it and it will show up here.</p>
          ) : (
            <ul className="loan-list">
              {s.loans.map((b) => (
                <li key={b.id}>
                  <button className="link" onClick={() => onOpen(b)}>{b.title}</button>
                  <span>{b.loan!.to}</span>
                  <span className="muted mono">{daysAgo(b.loan!.since)} days</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
