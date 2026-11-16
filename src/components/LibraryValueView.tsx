import { useMemo, useState } from 'react';
import type { Book } from '../types';
import { formatMoney, isMusic } from '../types';
import { Cover } from './Cover';
import { canEstimate, priceLinks, summarizeBooks, typicalFor, type BookValue } from '../lib/bookvalue';
import { marketCurrency, summarize } from '../lib/value';
import { countOf } from '../lib/labels';

interface Props {
  books: Book[];
  currency: string;
  onOpen: (b: Book) => void;
  onRecordPrices: () => void;
}

const SOURCE = { yours: 'your estimate', typical: 'typical used price' } as const;

function PriceLinks({ b }: Readonly<{ b: Book }>) {
  return (
    <span className="price-links small">
      {priceLinks(b).map((l) => (
        <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
      ))}
    </span>
  );
}

function Worth({ v }: Readonly<{ v: BookValue }>) {
  return (
    <>
      {formatMoney(v.amount, v.currency)}
      <span className="muted small value-source">{SOURCE[v.source]}</span>
    </>
  );
}

/** Books → Stats → What it's worth: your whole library, books and records. */
export function LibraryValueView({ books, currency, onOpen, onRecordPrices }: Readonly<Props>) {
  const s = useMemo(() => summarizeBooks(books, currency), [books, currency]);
  const records = useMemo(() => books.filter((b) => isMusic(b) && b.owned !== false), [books]);
  const rc = marketCurrency(currency);
  const r = useMemo(() => summarize(records, rc), [records, rc]);
  const [all, setAll] = useState(false);
  const money = (n: number) => formatMoney(n, currency);
  const sameCurrency = rc === currency;
  const total = s.total + (sameCurrency ? r.total : 0);
  const recordCopies = records.reduce((n, b) => n + Math.max(1, b.copies), 0);
  const top = all ? s.top : s.top.slice(0, 15);

  return (
    <div className="value-view">
      <div className="stat-row stat-row-4">
        <div className="stat">
          <span className="stat-label">Your library is worth about</span>
          <span className="stat-value">{s.valued || r.valued ? money(total) : '–'}</span>
          <span className="muted">{sameCurrency || !r.valued ? 'books, records and CDs' : `books only; records are in ${rc}`}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Books</span>
          <span className="stat-value">{s.valued ? money(s.total) : '–'}</span>
          <span className="muted">{s.valued} of {countOf(s.copies, 'copy', 'copies')}{s.yours ? `, ${s.yours} valued by you` : ''}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Records and CDs</span>
          <span className="stat-value">{r.valued ? formatMoney(r.total, rc) : '–'}</span>
          <span className="muted">
            {recordCopies ? `${r.valued} of ${recordCopies} priced on Discogs ` : 'none yet '}
            {recordCopies > 0 && <button className="link small" onClick={onRecordPrices}>Update</button>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">You paid for your books</span>
          <span className="stat-value">{s.paid ? money(s.paid) : '–'}</span>
          <span className="muted">{s.paid ? 'where you entered a price' : 'add prices in a book’s panel'}</span>
        </div>
      </div>

      <section className="panel">
        <h3>How books are valued</h3>
        <p className="small">
          There's no free service with real second-hand book prices, so a book counts at <b>your own estimate</b> when you type one under “Worth” in its panel, and
          otherwise at a <b>typical second-hand price</b>
          {canEstimate(currency)
            ? ` for its format: about ${money(typicalFor('paperback', currency)!)} for a paperback and ${money(typicalFor('hardcover', currency)!)} for a hardcover, a bit more for books from the last two years, very long books and old hardcovers. Ebooks count as nothing, since they can't be resold.`
            : '. Typical prices aren’t available in your currency, so only books you value yourself count.'}{' '}
          Most books really do sell for only a little second-hand; the ones that can be worth much more are usually old, signed or first editions, listed under “Worth checking”.
        </p>
        {s.otherCurrency > 0 && <p className="muted small">{s.otherCurrency} valued in another currency are left out of the total.</p>}
      </section>

      {s.check.length > 0 && (
        <section className="panel">
          <h3>Worth checking</h3>
          <p className="muted small">These could sell for much more than a typical copy. Look them up, then type what they're worth in their panel.</p>
          <ul className="worth-check">
            {s.check.slice(0, 20).map(({ b, why }) => (
              <li key={b.id}>
                <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" />
                <span className="worth-check-text">
                  <button className="link value-title" onClick={() => onOpen(b)}>{b.title}</button>
                  <span className="muted small">{[b.authors[0], why].filter(Boolean).join(' · ')}</span>
                  <PriceLinks b={b} />
                </span>
              </li>
            ))}
          </ul>
          {s.check.length > 20 && <p className="muted small">And {s.check.length - 20} more.</p>}
        </section>
      )}

      {s.top.length > 0 && (
        <section className="panel">
          <h3>Most valuable books</h3>
          <div className="table-scroll">
            <table className="value-table">
              <thead>
                <tr>
                  <th />
                  <th>Book</th>
                  <th className="num">Worth</th>
                  <th className="num">Paid</th>
                  <th>Check prices</th>
                </tr>
              </thead>
              <tbody>
                {top.map(({ b, v }) => (
                  <tr key={b.id}>
                    <td><Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" /></td>
                    <td>
                      <div className="value-record">
                        <button className="link value-title" onClick={() => onOpen(b)}>{b.title}</button>
                        <span className="muted small">{[b.authors[0], b.format, b.publishedDate?.slice(0, 4)].filter(Boolean).join(' · ')}</span>
                      </div>
                    </td>
                    <td className="num">
                      <Worth v={v} />
                      {b.copies > 1 && <span className="muted small"> ×{b.copies}</span>}
                    </td>
                    <td className="num">{b.pricePaid === undefined ? <span className="muted">–</span> : formatMoney(b.pricePaid, b.currency ?? currency)}</td>
                    <td><PriceLinks b={b} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.top.length > 15 && <button className="link small" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${s.top.length}`}</button>}
        </section>
      )}
    </div>
  );
}
