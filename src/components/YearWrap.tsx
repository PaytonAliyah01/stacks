import { useMemo, useState } from 'react';
import type { Book, BookNote, Challenge, Reading } from '../types';
import { shortTitle, wrapYear, type Wrap } from '../lib/wrapup';
import { hoursAndMinutes } from '../lib/sessions';
import { drawYearImage } from '../lib/shareImage';
import { Cover } from './Cover';
import { MonthBars, ShareButtons, WrapYearPicker } from './WrapParts';
import { useSharePicture } from '../lib/useSharePicture';

interface Props {
  books: Book[];
  readings: Reading[];
  notes: BookNote[];
  challenges: Challenge[];
  onOpen: (b: Book) => void;
}

const stars = (n?: number) => (n ? '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') : '');
const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`;

interface CardProps {
  w: Wrap;
  onOpen: (b: Book) => void;
}

function FavoriteCard({ w, onOpen }: Readonly<CardProps>) {
  const fav = w.favorite;
  if (!fav) return null;
  return (
    <section className="panel wrap-card wrap-fav">
      <h3>Favorite</h3>
      <button className="wrap-book" onClick={() => onOpen(fav.book)}>
        <Cover url={fav.book.coverUrl} title={fav.book.title} author={fav.book.authors[0]} size="sm" />
        <span>
          <strong>{shortTitle(fav.book)}</strong>
          <span className="muted small">{fav.book.authors.join(', ')}</span>
          <span className="wrap-stars">{stars(fav.rating)}</span>
        </span>
      </button>
      {w.topRated.length > 1 && (
        <ol className="wrap-list">
          {w.topRated.slice(1).map((x) => (
            <li key={x.book.id}>
              <button className="link" onClick={() => onOpen(x.book)}>{shortTitle(x.book)}</button> <span className="wrap-stars small">{stars(x.rating)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ChallengeCard({ w }: Readonly<{ w: Wrap }>) {
  const ch = w.challenge;
  if (!ch) return null;
  return (
    <section className="panel wrap-card">
      <h3>Challenge</h3>
      <p className="wrap-big">
        {ch.done.toLocaleString()} <span className="muted">of {ch.goal.toLocaleString()} {ch.unit}</span>
      </p>
      <p className="muted small">
        {ch.name}
        {ch.done >= ch.goal ? '. Goal reached!' : ''}
      </p>
    </section>
  );
}

function RecordRow({ label, book, extra, onOpen }: Readonly<{ label: string; book?: Book; extra?: string; onOpen: (b: Book) => void }>) {
  if (!book) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <button className="link" onClick={() => onOpen(book)}>{shortTitle(book)}</button>
        {extra && <> <span className="muted small">· {extra}</span></>}
      </dd>
    </div>
  );
}

function RecordsCard({ w, onOpen, isThisYear }: Readonly<CardProps & { isThisYear: boolean }>) {
  return (
    <section className="panel wrap-card">
      <h3>Records</h3>
      <dl className="records">
        <RecordRow label="Longest" book={w.longest} extra={`${w.longest?.pageCount} pages`} onOpen={onOpen} />
        <RecordRow label="Shortest" book={w.shortest === w.longest ? undefined : w.shortest} extra={`${w.shortest?.pageCount} pages`} onOpen={onOpen} />
        <RecordRow label="Fastest" book={w.fastest?.book} extra={w.fastest && `${w.fastest.days} ${plural(w.fastest.days, 'day')}`} onOpen={onOpen} />
        <RecordRow label="First" book={w.firstBook} onOpen={onOpen} />
        <RecordRow label={isThisYear ? 'Latest' : 'Last'} book={w.lastBook === w.firstBook ? undefined : w.lastBook} onOpen={onOpen} />
      </dl>
    </section>
  );
}

function AlsoCard({ w }: Readonly<{ w: Wrap }>) {
  const topAuthor = w.topAuthor && w.topAuthor[1] > 1 ? w.topAuthor : undefined;
  const topGenre = w.topGenre && w.topGenre[1] > 1 ? w.topGenre : undefined;
  const series = w.seriesFinished;
  return (
    <section className="panel wrap-card">
      <h3>Also</h3>
      <ul className="wrap-facts">
        {topAuthor && <li>Most-read author: <strong>{topAuthor[0]}</strong> ({topAuthor[1]} books)</li>}
        {topGenre && <li>Top genre or tag: <strong>{topGenre[0]}</strong></li>}
        {series.length > 0 && <li>Finished {series.length === 1 ? 'a series' : 'series'}: <strong>{series.join(', ')}</strong></li>}
        {w.rereads > 0 && <li>{w.rereads} {plural(w.rereads, 're-read')}</li>}
        {w.dnf > 0 && <li>{w.dnf} you put down</li>}
        {w.added > 0 && <li>{w.added} {plural(w.added, 'book')} added to your shelves</li>}
        {w.quotesSaved > 0 && <li>{w.quotesSaved} {plural(w.quotesSaved, 'quote')} saved</li>}
      </ul>
    </section>
  );
}

function QuoteCard({ w, onOpen }: Readonly<CardProps>) {
  const q = w.quote;
  if (!q) return null;
  return (
    <section className="panel wrap-card wrap-quote">
      <h3>A line you kept</h3>
      <blockquote>{q.note.text}</blockquote>
      <button className="link spotlight-src" onClick={() => onOpen(q.book)}>{shortTitle(q.book)}</button>
    </section>
  );
}

function WrapCards({ w, onOpen, isThisYear }: Readonly<CardProps & { isThisYear: boolean }>) {
  const busiest = w.busiestMonth;
  return (
    <div className="wrap-grid">
      <FavoriteCard w={w} onOpen={onOpen} />
      {w.moods.length > 0 && (
        <section className="panel wrap-card">
          <h3>Your mood</h3>
          <p className="wrap-big">{w.moods.map(([m]) => m).join(', ')}</p>
          {w.pace && <p className="muted">Mostly {w.pace}-paced books.</p>}
        </section>
      )}
      <section className="panel wrap-card">
        <h3>Month by month</h3>
        <MonthBars perMonth={w.perMonth} unit="book" label="Books finished each month" />
        {busiest && <p className="muted small">Busiest: {busiest[0]}, with {busiest[1]} {plural(busiest[1], 'book')}.</p>}
      </section>
      <ChallengeCard w={w} />
      <RecordsCard w={w} onOpen={onOpen} isThisYear={isThisYear} />
      <AlsoCard w={w} />
      <QuoteCard w={w} onOpen={onOpen} />
    </div>
  );
}

function yearsWithReads(readings: Reading[]): string[] {
  const now = new Date();
  const ys = new Set(readings.filter((r) => r.status === 'read' && r.finishedOn).map((r) => r.finishedOn!.slice(0, 4)));
  ys.add(String(now.getFullYear()));
  if (now.getMonth() === 0) ys.add(String(now.getFullYear() - 1));
  return [...ys].sort((a, b) => b.localeCompare(a));
}

export function YearWrap({ books, readings, notes, challenges, onOpen }: Readonly<Props>) {
  const years = useMemo(() => yearsWithReads(readings), [readings]);
  // In January, last year is the one worth looking back on.
  const [year, setYear] = useState(String(new Date().getFullYear() - (new Date().getMonth() === 0 ? 1 : 0)));
  const w = useMemo(() => wrapYear(year, books, readings, notes, challenges), [year, books, readings, notes, challenges]);
  const share = useSharePicture(() => drawYearImage(w), `my-${year}-in-books.png`);
  const isThisYear = year === String(new Date().getFullYear());

  return (
    <div className="reading-view wrap">
      <WrapYearPicker intro={isThisYear ? 'Your year so far. It fills in as you finish books.' : 'Your year in books.'} year={year} years={years} onYear={setYear} />

      <section className="wrap-hero">
        <svg className="wrap-spines" viewBox="0 0 319 300" aria-hidden="true">
          <rect x="0" y="70" width="34" height="230" fill="#d8ad55" /><rect x="0" y="92" width="34" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="0" y="266" width="34" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="40" y="30" width="26" height="270" fill="#7a3b4a" /><rect x="40" y="52" width="26" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="40" y="266" width="26" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="72" y="90" width="40" height="210" fill="#3f7f6c" /><rect x="72" y="112" width="40" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="72" y="266" width="40" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="118" y="50" width="22" height="250" fill="#e9dfc8" /><rect x="118" y="72" width="22" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="118" y="266" width="22" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="146" y="15" width="36" height="285" fill="#a5583a" /><rect x="146" y="37" width="36" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="146" y="266" width="36" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="188" y="65" width="30" height="235" fill="#2f5a8a" /><rect x="188" y="87" width="30" height="6" fill="rgb(0 0 0 / 0.18)" /><rect x="188" y="266" width="30" height="6" fill="rgb(0 0 0 / 0.18)" /><g transform="translate(228 300) rotate(12.6)"><rect x="0" y="-240" width="32" height="240" fill="#c98f3a" /><rect x="0" y="-218" width="32" height="6" fill="rgb(0 0 0 / 0.18)" /></g>
        </svg>
        <span className="wrap-kicker">Stacks</span>
        <h3 className="wrap-title">My {year} in books</h3>
        <div className="wrap-numbers">
          <div><strong>{w.books.toLocaleString()}</strong><span>{w.books === 1 ? 'book' : 'books'}</span></div>
          <div><strong>{w.pages.toLocaleString()}</strong><span>pages</span></div>
          {w.minutes > 0 && <div><strong>{hoursAndMinutes(w.minutes)}</strong><span>reading</span></div>}
          {w.avgRating && <div><strong>{w.avgRating.toFixed(1)}</strong><span>average rating</span></div>}
        </div>
        {w.covers.length > 0 && (
          <ul className="wrap-covers">
            {w.covers.map((b, i) => (
              <li key={`${b.id}-${i}`}>
                <button onClick={() => onOpen(b)} title={b.title}>
                  <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <ShareButtons {...share} disabled={!w.books} />
      </section>

      {w.books === 0 ? (
        <section className="panel">
          <p className="muted">No finished books in {year} yet. Mark books as Read, or import your Goodreads or StoryGraph history, and your wrap-up builds itself.</p>
        </section>
      ) : (
        <WrapCards w={w} onOpen={onOpen} isThisYear={isThisYear} />
      )}
    </div>
  );
}
