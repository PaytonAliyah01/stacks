import { useMemo, useState } from 'react';
import type { Book, Spin } from '../types';
import { formatMoney } from '../types';
import { wrapMusic, type MusicWrap as Wrap } from '../lib/musicwrap';
import { drawMusicImage, hoursText } from '../lib/shareImage';
import { Cover } from './Cover';
import { MonthBars, ShareButtons, WrapYearPicker } from './WrapParts';
import { useSharePicture } from '../lib/useSharePicture';

interface Props {
  /** Every record and CD, owned or sold. */
  records: Book[];
  spins: Spin[];
  onOpen: (b: Book) => void;
}

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`;

interface CardProps {
  w: Wrap;
  onOpen: (b: Book) => void;
}

function OnRepeatCard({ w, onOpen }: Readonly<CardProps>) {
  const top = w.topRecords[0];
  if (!top) return null;
  return (
    <section className="panel wrap-card wrap-fav">
      <h3>On repeat</h3>
      <button className="wrap-book" onClick={() => onOpen(top.b)}>
        <Cover url={top.b.coverUrl} title={top.b.title} author={top.b.authors[0]} size="sm" square />
        <span>
          <strong>{top.b.title}</strong>
          <span className="muted small">{top.b.authors.join(', ')}</span>
          <span className="small">Played {top.n} times</span>
        </span>
      </button>
      {w.topRecords.length > 1 && (
        <ol className="wrap-list" start={2}>
          {w.topRecords.slice(1, 5).map((x) => (
            <li key={x.b.id}>
              <button className="link" onClick={() => onOpen(x.b)}>{x.b.title}</button> <span className="muted small">· {x.n}×</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function NewInCard({ w, onOpen }: Readonly<CardProps>) {
  if (!w.added.length) return null;
  const kinds = [w.addedVinyl && `${w.addedVinyl} vinyl`, w.addedCds && `${w.addedCds} ${plural(w.addedCds, 'CD')}`].filter(Boolean).join(' and ');
  const spent = w.spent.length > 0 ? ` · spent ${w.spent.map(([c, n]) => formatMoney(n, c || 'EUR')).join(' + ')}` : '';
  const priciest = w.priciest;
  return (
    <section className="panel wrap-card">
      <h3>New in your collection</h3>
      <p className="wrap-big">
        {w.added.length} <span className="muted">{plural(w.added.length, 'record')}</span>
      </p>
      <p className="muted small">
        {kinds}
        {spent}
      </p>
      {priciest && (
        <p className="small">
          Biggest buy: <button className="link" onClick={() => onOpen(priciest)}>{priciest.title}</button>{' '}
          <span className="muted">· {formatMoney(priciest.pricePaid!, priciest.currency || 'EUR')}</span>
        </p>
      )}
    </section>
  );
}

function AlsoCard({ w, onOpen, isThisYear }: Readonly<CardProps & { isThisYear: boolean }>) {
  const { first } = w;
  const last = w.last === w.first ? undefined : w.last;
  return (
    <section className="panel wrap-card">
      <h3>Also</h3>
      <ul className="wrap-facts">
        {w.longestStreak > 1 && <li>Longest streak: <strong>{w.longestStreak} days</strong> in a row with music</li>}
        {w.rediscovered > 0 && <li>{w.rediscovered} {plural(w.rediscovered, 'record')} from your shelves played for the very first time</li>}
        {first && <li>First spin of the year: <button className="link" onClick={() => onOpen(first)}>{first.title}</button></li>}
        {last && <li>{isThisYear ? 'Latest' : 'Last'} spin: <button className="link" onClick={() => onOpen(last)}>{last.title}</button></li>}
      </ul>
    </section>
  );
}

function WrapCards({ w, onOpen, isThisYear }: Readonly<CardProps & { isThisYear: boolean }>) {
  const busiest = w.busiestMonth;
  return (
    <div className="wrap-grid">
      <OnRepeatCard w={w} onOpen={onOpen} />
      {w.topArtists.length > 0 && (
        <section className="panel wrap-card">
          <h3>Top artists</h3>
          <p className="wrap-big">{w.topArtists[0][0]}</p>
          <ol className="wrap-list" start={2}>
            {w.topArtists.slice(1).map(([a, n]) => (
              <li key={a}>{a} <span className="muted small">· {n} {plural(n, 'spin')}</span></li>
            ))}
          </ol>
        </section>
      )}
      <section className="panel wrap-card">
        <h3>Month by month</h3>
        <MonthBars perMonth={w.perMonth} unit="spin" label="Spins each month" />
        {busiest && <p className="muted small">Busiest: {busiest[0]}, with {busiest[1]} {plural(busiest[1], 'spin')}. Favorite day: {w.busiestDay?.[0]}.</p>}
      </section>
      <NewInCard w={w} onOpen={onOpen} />
      <AlsoCard w={w} onOpen={onOpen} isThisYear={isThisYear} />
    </div>
  );
}

function yearsWithMusic(spins: Spin[], records: Book[]): string[] {
  const ys = new Set([...spins.map((s) => String(new Date(s.at).getFullYear())), ...records.filter((b) => b.owned !== false).map((b) => (b.acquiredOn ?? b.addedAt).slice(0, 4))]);
  ys.add(String(new Date().getFullYear()));
  return [...ys].filter((y) => /^\d{4}$/.test(y)).sort((a, b) => b.localeCompare(a));
}

export function MusicWrap({ records, spins, onOpen }: Readonly<Props>) {
  const years = useMemo(() => yearsWithMusic(spins, records), [spins, records]);
  const [year, setYear] = useState(String(new Date().getFullYear() - (new Date().getMonth() === 0 ? 1 : 0)));
  const w = useMemo(() => wrapMusic(year, records, spins), [year, records, spins]);
  const share = useSharePicture(() => drawMusicImage(w), `my-${year}-in-music.png`);
  const isThisYear = year === String(new Date().getFullYear());
  const empty = !w.spins && !w.added.length;

  return (
    <div className="reading-view wrap">
      <WrapYearPicker intro={isThisYear ? 'Your year so far. It fills in every time you press Spin.' : 'Your year in music.'} year={year} years={years} onYear={setYear} />

      <section className="wrap-hero music-hero">
        <span className="wrap-kicker">Stacks</span>
        <h3 className="wrap-title">My {year} in music</h3>
        <div className="wrap-numbers">
          <div><strong>{w.spins.toLocaleString()}</strong><span>{w.spins === 1 ? 'spin' : 'spins'}</span></div>
          <div><strong>{hoursText(w.hours)}</strong><span>hours of music</span></div>
          <div><strong>{w.records.toLocaleString()}</strong><span>{w.records === 1 ? 'record' : 'different records'}</span></div>
          <div><strong>{w.days.toLocaleString()}</strong><span>{w.days === 1 ? 'day' : 'days'} with music</span></div>
        </div>
        {w.topRecords.length > 0 && (
          <ul className="wrap-covers">
            {w.topRecords.map(({ b }) => (
              <li key={b.id}>
                <button onClick={() => onOpen(b)} title={b.title}>
                  <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" square />
                </button>
              </li>
            ))}
          </ul>
        )}
        <ShareButtons {...share} disabled={empty} />
      </section>

      {empty ? (
        <section className="panel">
          <p className="muted">Nothing for {year} yet. Press ▶ on a record when you put it on, and your year in music builds itself.</p>
        </section>
      ) : (
        <WrapCards w={w} onOpen={onOpen} isThisYear={isThisYear} />
      )}
    </div>
  );
}
