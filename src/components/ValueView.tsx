import { useMemo, useState } from 'react';
import type { Book } from '../types';
import { formatMoney } from '../types';
import { Cover } from './Cover';
import { discogsReleaseUrl, isStale, summarize, valueOf } from '../lib/value';
import { formatDay } from '../lib/reading';
import { gainClass } from '../lib/labels';

export interface PriceRun {
  done: number;
  total: number;
}

interface Props {
  records: Book[];
  currency: string;
  hasToken: boolean;
  run: PriceRun | null;
  onUpdate: () => void;
  onStop: () => void;
  onOpen: (b: Book) => void;
  onOpenSettings: () => void;
}

const SOURCE_LABEL = { yours: 'your estimate', suggested: 'Discogs suggested', lowest: 'lowest on sale' } as const;

export function ValueView({ records, currency, hasToken, run, onUpdate, onStop, onOpen, onOpenSettings }: Readonly<Props>) {
  const s = useMemo(() => summarize(records, currency), [records, currency]);
  const [all, setAll] = useState(false);
  const money = (n: number) => formatMoney(n, currency);
  const linked = records.filter((b) => b.discogsId).length;
  const stale = records.filter((b) => b.discogsId && isStale(b)).length;
  const canLink = hasToken ? records.filter((b) => !b.discogsId && b.barcode).length : 0;
  const gain = s.worthOfPaid - s.paid;
  const top = all ? s.top : s.top.slice(0, 15);

  return (
    <div className="value-view">
      <div className="stat-row stat-row-4">
        <div className="stat">
          <span className="stat-label">Collection value</span>
          <span className="stat-value">{s.valued ? money(s.total) : '–'}</span>
          <span className="muted">{s.valued} of {records.reduce((n, b) => n + Math.max(1, b.copies), 0)} copies priced</span>
        </div>
        <div className="stat">
          <span className="stat-label">You paid</span>
          <span className="stat-value">{s.compared ? money(s.paid) : '–'}</span>
          <span className="muted">{s.compared ? `for ${s.compared} record${s.compared === 1 ? '' : 's'} with a price and a value` : 'add prices paid to compare'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{gain >= 0 ? 'Gained' : 'Lost'}</span>
          <span className={`stat-value ${s.compared ? gainClass(gain) : ''}`}>{s.compared ? `${gain >= 0 ? '+' : '−'}${money(Math.abs(gain))}` : '–'}</span>
          <span className="muted">{s.compared && s.paid ? `${gain >= 0 ? '+' : ''}${Math.round((gain / s.paid) * 100)}% on what you paid` : ' '}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Most valuable</span>
          {s.top[0] ? (
            <>
              <span className="stat-value">{money(s.top[0].v.amount)}</span>
              <button className="link muted small most-valuable" onClick={() => onOpen(s.top[0].b)}>{s.top[0].b.title}</button>
            </>
          ) : (
            <>
              <span className="stat-value">–</span>
              <span className="muted"> </span>
            </>
          )}
        </div>
      </div>

      <section className="panel price-panel">
        <div className="spins-head">
          <div>
            <h3>Prices from Discogs</h3>
            <p className="muted small">
              {s.lastChecked ? `Last updated ${formatDay(s.lastChecked)}. ` : ''}
              {linked} of {records.length} records are linked to a Discogs release
              {stale ? `, ${stale} need${stale === 1 ? 's' : ''} a price update` : ''}.
            </p>
          </div>
          {run ? (
            <button className="btn ghost" onClick={onStop}>Stop</button>
          ) : (
            <button className={`btn ${stale || canLink ? 'primary' : 'ghost'}`} onClick={onUpdate} disabled={!stale && !canLink}>
              {stale || canLink ? 'Update prices' : 'Prices are up to date'}
            </button>
          )}
        </div>
        {run && (
          <div className="price-progress">
            <div className="progress-bar"><i style={{ width: `${Math.round((run.done / Math.max(1, run.total)) * 100)}%` }} /></div>
            <span className="muted small">Checked {run.done} of {run.total}. Discogs allows about one record every 2 seconds, so you can keep using Stacks meanwhile.</span>
          </div>
        )}
        <p className="small muted">
          {hasToken ? (
            <>Stacks uses Discogs' suggested price for each record's condition (Very Good Plus if you haven't set one), or the lowest price on sale when there's no suggestion.</>
          ) : (
            <>
              Without a Discogs token, Stacks uses the lowest price on sale right now. For prices that follow each record's condition, and to link scanned records by barcode,{' '}
              <button className="link" onClick={onOpenSettings}>add your Discogs token</button>.
            </>
          )}{' '}
          You can also type your own estimate under “Worth” in a record's panel.
        </p>
        {s.missing.length > 0 && (
          <p className="small">
            <strong>{s.missing.length} without a value.</strong>{' '}
            <span className="muted">
              {records.length - linked > 0 && `${records.length - linked} aren't linked to Discogs${canLink ? ` (${canLink} can be linked by barcode when you update)` : ''}. `}
              Some releases simply have no copies on sale.
            </span>
          </p>
        )}
        {s.otherCurrency > 0 && <p className="muted small">{s.otherCurrency} valued in another currency are left out of the total.</p>}
      </section>

      {s.top.length > 0 && (
        <section className="panel">
          <h3>Most valuable</h3>
          <div className="table-scroll">
            <table className="value-table">
              <thead>
                <tr>
                  <th />
                  <th>Record</th>
                  <th className="num">Worth</th>
                  <th className="num">Paid</th>
                  <th className="num">Difference</th>
                  <th className="num">On sale</th>
                </tr>
              </thead>
              <tbody>
                {top.map(({ b, v, gain: g }) => (
                  <tr key={b.id}>
                    <td><Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" square /></td>
                    <td>
                      <div className="value-record">
                        <button className="link value-title" onClick={() => onOpen(b)}>{b.title}</button>
                        <span className="muted small">{[b.authors[0], b.mediaCondition?.replace(/\s*\(.*\)$/, '')].filter(Boolean).join(' · ')}</span>
                      </div>
                    </td>
                    <td className="num">
                      {formatMoney(v.amount, v.currency)}
                      {b.copies > 1 && <span className="muted small"> ×{b.copies}</span>}
                      <span className="muted small value-source">{SOURCE_LABEL[v.source]}</span>
                    </td>
                    <td className="num">{b.pricePaid !== undefined ? formatMoney(b.pricePaid, b.currency ?? currency) : <span className="muted">–</span>}</td>
                    <td className={`num ${gainClass(g)}`}>{g === undefined ? <span className="muted">–</span> : `${g >= 0 ? '+' : '−'}${formatMoney(Math.abs(g), currency)}`}</td>
                    <td className="num">
                      {b.discogsId ? (
                        <a href={discogsReleaseUrl(b.discogsId)} target="_blank" rel="noreferrer">{b.market?.forSale ?? '–'}</a>
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
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

/** One line about a record's Discogs price, for its panel. */
export function marketLine(b: Book, currency: string): string {
  const v = valueOf({ ...b, myValue: undefined }, currency);
  if (!b.market) return b.discogsId ? 'Press Update prices on Music → Stats → What it’s worth to get the Discogs price.' : 'Not linked to Discogs, so there is no market price.';
  const parts = [
    b.market.suggested !== undefined && `suggested ${formatMoney(b.market.suggested, b.market.currency)}`,
    b.market.lowest !== undefined && `lowest on sale ${formatMoney(b.market.lowest, b.market.currency)}`,
    b.market.forSale !== undefined && `${b.market.forSale} for sale`,
  ].filter(Boolean);
  return `${v ? 'Discogs: ' : 'Discogs has no copies on sale. '}${parts.join(' · ')} (${formatDay(b.market.checkedAt)})`;
}
