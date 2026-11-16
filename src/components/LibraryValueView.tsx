import { useMemo, useState } from 'react';
import type { Book } from '../types';
import { formatMoney, isMusic } from '../types';
import { Cover } from './Cover';
import { summarizeBooks, type BookValue } from '../lib/bookvalue';
import { booksToPrice } from '../lib/bookprices';
import { formatDay } from '../lib/reading';
import { marketCurrency, summarize } from '../lib/value';
import { countOf } from '../lib/labels';

export interface BookPriceRun {
  done: number;
  total: number;
}

interface Props {
  books: Book[];
  currency: string;
  onOpen: (b: Book) => void;
  onRecordPrices: () => void;
  run: BookPriceRun | null;
  onCheckPrices: () => void;
  onStop: () => void;
}

function PricesPanel({ books, s, run, onCheckPrices, onStop }: Readonly<{ books: Book[]; s: ReturnType<typeof summarizeBooks>; run: BookPriceRun | null; onCheckPrices: () => void; onStop: () => void }>) {
  const owned = books.filter((b) => !isMusic(b) && b.owned !== false);
  const todo = booksToPrice(books).length;
  const found = owned.filter((b) => b.bookPrice?.store).length;
  const ebook = owned.filter((b) => b.bookPrice?.store?.ebook).length;
  const notSold = owned.filter((b) => b.bookPrice && !b.bookPrice.store).length;
  const theyHave = notSold === 1 ? 'it has' : 'they have';
  const notSoldNote = notSold ? ` Google doesn't sell ${countOf(notSold, 'book')} right now, so ${theyHave} no price.` : '';
  const last = owned.reduce<string | undefined>((m, b) => (b.bookPrice && (!m || b.bookPrice.checkedAt > m) ? b.bookPrice.checkedAt : m), undefined);
  return (
    <section className="panel price-panel">
      <div className="spins-head">
        <div>
          <h3>Current prices</h3>
          <p className="muted small">
            {last ? `Last checked ${formatDay(last)}. ` : ''}
            {found} of {countOf(owned.length, 'book')} have a price{todo && last ? `, ${todo} still to check` : ''}.
          </p>
        </div>
        {run ? (
          <button className="btn ghost" onClick={onStop}>Stop</button>
        ) : (
          <button className={`btn ${todo ? 'primary' : 'ghost'}`} onClick={onCheckPrices} disabled={!todo}>
            {todo ? `Check prices for ${countOf(todo, 'book')}` : 'Prices are up to date'}
          </button>
        )}
      </div>
      {run && (
        <div className="price-progress">
          <div className="progress-bar"><i style={{ width: `${Math.round((run.done / Math.max(1, run.total)) * 100)}%` }} /></div>
          <span className="muted small">Checked {run.done} of {run.total}, about one book a second. You can keep using Stacks meanwhile.</span>
        </div>
      )}
      <p className="small">
        Stacks asks the Google Books store what each book costs today, by ISBN, or by title and author when Google doesn't sell your edition. Where Google sells a print edition, that's the price;
        where it only sells the ebook, the ebook price is used and marked “ebook”{ebook ? ` (${ebook} so far)` : ''}.
        {notSoldNote}{' '}
        To use your own number instead, type it under “Worth” in a book's panel.
      </p>
      {s.otherCurrency > 0 && <p className="muted small">{s.otherCurrency} priced in another currency are left out of the total.</p>}
    </section>
  );
}

const SOURCE = { yours: 'your estimate', store: 'Google Books', ebook: 'Google Books, ebook' } as const;

function Worth({ v }: Readonly<{ v: BookValue }>) {
  return (
    <>
      {formatMoney(v.amount, v.currency)}
      <span className="muted small value-source">{SOURCE[v.source]}</span>
    </>
  );
}

/** Books → Stats → What it's worth: your whole library, books and records. */
export function LibraryValueView({ books, currency, onOpen, onRecordPrices, run, onCheckPrices, onStop }: Readonly<Props>) {
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
          <span className="muted">{[s.looked && `${s.looked} at today's price`, s.yours && `${s.yours} valued by you`, s.missing && `${s.missing} without a price`].filter(Boolean).join(', ') || 'no books yet'}</span>
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

      <PricesPanel books={books} s={s} run={run} onCheckPrices={onCheckPrices} onStop={onStop} />


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
