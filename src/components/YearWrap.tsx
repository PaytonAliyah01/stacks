import { paintBackdrop, paintSpines } from '../lib/backdrop';
import { useMemo, useState } from 'react';
import type { Book, BookNote, Challenge, Reading } from '../types';
import { shortTitle, wrapYear, type Wrap } from '../lib/wrapup';
import { hoursAndMinutes } from '../lib/sessions';
import { Cover } from './Cover';

interface Props {
  books: Book[];
  readings: Reading[];
  notes: BookNote[];
  challenges: Challenge[];
  onOpen: (b: Book) => void;
}

const MONTH_LETTERS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'narrow' }));
const stars = (n?: number) => (n ? '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') : '');

export function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + (s.codePointAt(i) ?? 0)) % 360;
  return h;
}

export const loadImage = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => resolve(null), 4000);
    img.onload = () => {
      clearTimeout(t);
      resolve(img.naturalWidth > 5 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    img.src = url;
  });

/** A 1080×1350 picture of the year, the size Instagram and most chats show whole. */
async function drawShareImage(w: Wrap): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const serif = "Literata, Georgia, 'Times New Roman', serif";
  const sans = 'system-ui, -apple-system, Segoe UI, sans-serif';
  paintBackdrop(g, W, H, 'books');
  paintSpines(g, W - 110, 330);
  g.fillStyle = '#d8ad55';
  g.font = `600 34px ${sans}`;
  g.fillText('STACKS', 80, 110);
  g.fillStyle = '#f3efe4';
  g.font = `600 92px ${serif}`;
  g.fillText(`My ${w.year}`, 80, 220);
  g.fillText('in books', 80, 320);

  const stat = (x: number, value: string, label: string) => {
    g.fillStyle = '#f3efe4';
    g.font = `700 88px ${serif}`;
    g.fillText(value, x, 470);
    g.fillStyle = '#b9c8bf';
    g.font = `500 30px ${sans}`;
    g.fillText(label, x, 515);
  };
  stat(80, w.books.toLocaleString(), w.books === 1 ? 'book' : 'books');
  stat(400, w.pages.toLocaleString(), 'pages');
  if (w.minutes) stat(760, String(Math.round(w.minutes / 60)), 'hours');

  // Covers: real ones where the image server allows it, colored blocks otherwise.
  const shown = w.covers.slice(-12);
  const cw = 140;
  const ch = 210;
  const gap = 18;
  const imgs = await Promise.all(shown.map((b) => (b.coverUrl ? loadImage(b.coverUrl) : Promise.resolve(null))));
  shown.forEach((b, i) => {
    const x = 80 + (i % 6) * (cw + gap);
    const y = 580 + Math.floor(i / 6) * (ch + gap);
    const img = imgs[i];
    if (img) g.drawImage(img, x, y, cw, ch);
    else {
      g.fillStyle = `hsl(${hue(b.title)} 35% 38%)`;
      g.fillRect(x, y, cw, ch);
      g.fillStyle = '#f3efe4';
      g.font = `600 20px ${serif}`;
      const words = shortTitle(b).split(' ');
      let line = '';
      let ly = y + 34;
      for (const word of words) {
        if (g.measureText(`${line} ${word}`).width > cw - 24 && line) {
          g.fillText(line, x + 12, ly);
          line = word;
          ly += 26;
          if (ly > y + ch - 20) break;
        } else line = line ? `${line} ${word}` : word;
      }
      if (ly <= y + ch - 20) g.fillText(line, x + 12, ly);
    }
  });

  let y = 600;
  if (shown.length) y = shown.length > 6 ? 1080 : 870;
  const line = (label: string, value: string) => {
    if (y > H - 80) return;
    g.fillStyle = '#b9c8bf';
    g.font = `500 28px ${sans}`;
    g.fillText(label.toUpperCase(), 80, y);
    g.fillStyle = '#f3efe4';
    g.font = `600 38px ${serif}`;
    let v = value;
    while (g.measureText(v).width > W - 160 - 300 && v.length > 4) v = v.slice(0, -2);
    g.fillText(v === value ? v : `${v}…`, 380, y);
    y += 66;
  };
  if (w.favorite) line('Favorite', `${shortTitle(w.favorite.book)} ${stars(w.favorite.rating)}`);
  if (w.moods.length) line('Mood', w.moods.map(([m]) => m).join(', '));
  if (w.topAuthor && w.topAuthor[1] > 1) line('Top author', w.topAuthor[0]);
  if (w.challenge) line('Challenge', `${w.challenge.done.toLocaleString()} of ${w.challenge.goal.toLocaleString()} ${w.challenge.unit}`);
  if (w.longest) line('Longest', `${shortTitle(w.longest)}, ${w.longest.pageCount} pages`);

  // Books per month along the bottom, when there's room.
  if (y < 1150) {
    const peak = Math.max(1, ...w.perMonth);
    const bw = 58;
    const step = (W - 160 - bw) / 11;
    w.perMonth.forEach((n, i) => {
      const x = 80 + i * step;
      const h = Math.max(4, (n / peak) * 110);
      g.fillStyle = n ? '#d8ad55' : 'rgba(255,255,255,0.15)';
      g.fillRect(x, 1270 - h, bw, h);
      g.fillStyle = '#b9c8bf';
      g.font = `500 24px ${sans}`;
      g.textAlign = 'center';
      g.fillText(MONTH_LETTERS[i], x + bw / 2, 1305);
      g.textAlign = 'left';
    });
  }
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

export function YearWrap({ books, readings, notes, challenges, onOpen }: Readonly<Props>) {
  const years = useMemo(() => {
    const ys = new Set(readings.filter((r) => r.status === 'read' && r.finishedOn).map((r) => r.finishedOn!.slice(0, 4)));
    ys.add(String(new Date().getFullYear()));
    if (new Date().getMonth() === 0) ys.add(String(new Date().getFullYear() - 1));
    return [...ys].sort((a, b) => b.localeCompare(a));
  }, [readings]);
  // In January, last year is the one worth looking back on.
  const [year, setYear] = useState(String(new Date().getFullYear() - (new Date().getMonth() === 0 ? 1 : 0)));
  const w = useMemo(() => wrapYear(year, books, readings, notes, challenges), [year, books, readings, notes, challenges]);
  const [sharing, setSharing] = useState('');
  const peak = Math.max(1, ...w.perMonth);
  const isThisYear = year === String(new Date().getFullYear());

  const save = async () => {
    setSharing('Making your picture…');
    const blob = await drawShareImage(w);
    if (!blob) return setSharing("Couldn't make the picture.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-${year}-in-books.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setSharing('Saved to your downloads.');
  };
  const copy = async () => {
    setSharing('Making your picture…');
    const blob = await drawShareImage(w);
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob! })]);
      setSharing('Copied. Paste it into a message or post.');
    } catch {
      setSharing("Your browser wouldn't copy the picture. Use Save picture instead.");
    }
  };

  return (
    <div className="reading-view wrap">
      <div className="finished-head">
        <p className="muted">{isThisYear ? 'Your year so far. It fills in as you finish books.' : 'Your year in books.'}</p>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

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
        <div className="wrap-share">
          <button className="btn primary small-btn" onClick={save} disabled={!w.books}>Save picture</button>
          <button className="btn ghost small-btn wrap-ghost" onClick={copy} disabled={!w.books}>Copy picture</button>
          {sharing && <span className="small">{sharing}</span>}
        </div>
      </section>

      {w.books === 0 ? (
        <section className="panel">
          <p className="muted">No finished books in {year} yet. Mark books as Read, or import your Goodreads or StoryGraph history, and your wrap-up builds itself.</p>
        </section>
      ) : (
        <div className="wrap-grid">
          {w.favorite && (
            <section className="panel wrap-card wrap-fav">
              <h3>Favorite</h3>
              <button className="wrap-book" onClick={() => onOpen(w.favorite!.book)}>
                <Cover url={w.favorite.book.coverUrl} title={w.favorite.book.title} author={w.favorite.book.authors[0]} size="sm" />
                <span>
                  <strong>{shortTitle(w.favorite.book)}</strong>
                  <span className="muted small">{w.favorite.book.authors.join(', ')}</span>
                  <span className="wrap-stars">{stars(w.favorite.rating)}</span>
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
          )}

          {w.moods.length > 0 && (
            <section className="panel wrap-card">
              <h3>Your mood</h3>
              <p className="wrap-big">{w.moods.map(([m]) => m).join(', ')}</p>
              {w.pace && <p className="muted">Mostly {w.pace}-paced books.</p>}
            </section>
          )}

          <section className="panel wrap-card">
            <h3>Month by month</h3>
            <div className="wrap-months" aria-label="Books finished each month">
              {w.perMonth.map((n, i) => (
                <div key={i} className="wrap-month" title={`${n} book${n === 1 ? '' : 's'}`}>
                  <span className="wrap-bar" style={{ height: `${(n / peak) * 100}%` }}>{n > 0 && <b>{n}</b>}</span>
                  <span className="wrap-m">{MONTH_LETTERS[i]}</span>
                </div>
              ))}
            </div>
            {w.busiestMonth && <p className="muted small">Busiest: {w.busiestMonth[0]}, with {w.busiestMonth[1]} book{w.busiestMonth[1] === 1 ? '' : 's'}.</p>}
          </section>

          {w.challenge && (
            <section className="panel wrap-card">
              <h3>Challenge</h3>
              <p className="wrap-big">
                {w.challenge.done.toLocaleString()} <span className="muted">of {w.challenge.goal.toLocaleString()} {w.challenge.unit}</span>
              </p>
              <p className="muted small">
                {w.challenge.name}
                {w.challenge.done >= w.challenge.goal ? '. Goal reached!' : ''}
              </p>
            </section>
          )}

          <section className="panel wrap-card">
            <h3>Records</h3>
            <dl className="records">
              {w.longest && (
                <div>
                  <dt>Longest</dt>
                  <dd><button className="link" onClick={() => onOpen(w.longest!)}>{shortTitle(w.longest)}</button> <span className="muted small">· {w.longest.pageCount} pages</span></dd>
                </div>
              )}
              {w.shortest && w.shortest !== w.longest && (
                <div>
                  <dt>Shortest</dt>
                  <dd><button className="link" onClick={() => onOpen(w.shortest!)}>{shortTitle(w.shortest)}</button> <span className="muted small">· {w.shortest.pageCount} pages</span></dd>
                </div>
              )}
              {w.fastest && (
                <div>
                  <dt>Fastest</dt>
                  <dd><button className="link" onClick={() => onOpen(w.fastest!.book)}>{shortTitle(w.fastest.book)}</button> <span className="muted small">· {w.fastest.days} day{w.fastest.days === 1 ? '' : 's'}</span></dd>
                </div>
              )}
              {w.firstBook && (
                <div>
                  <dt>First</dt>
                  <dd><button className="link" onClick={() => onOpen(w.firstBook!)}>{shortTitle(w.firstBook)}</button></dd>
                </div>
              )}
              {w.lastBook && w.lastBook !== w.firstBook && (
                <div>
                  <dt>{isThisYear ? 'Latest' : 'Last'}</dt>
                  <dd><button className="link" onClick={() => onOpen(w.lastBook!)}>{shortTitle(w.lastBook)}</button></dd>
                </div>
              )}
            </dl>
          </section>

          <section className="panel wrap-card">
            <h3>Also</h3>
            <ul className="wrap-facts">
              {w.topAuthor && w.topAuthor[1] > 1 && <li>Most-read author: <strong>{w.topAuthor[0]}</strong> ({w.topAuthor[1]} books)</li>}
              {w.topGenre && w.topGenre[1] > 1 && <li>Top genre or tag: <strong>{w.topGenre[0]}</strong></li>}
              {w.seriesFinished.length > 0 && <li>Finished {w.seriesFinished.length === 1 ? 'a series' : 'series'}: <strong>{w.seriesFinished.join(', ')}</strong></li>}
              {w.rereads > 0 && <li>{w.rereads} re-read{w.rereads === 1 ? '' : 's'}</li>}
              {w.dnf > 0 && <li>{w.dnf} you put down</li>}
              {w.added > 0 && <li>{w.added} book{w.added === 1 ? '' : 's'} added to your shelves</li>}
              {w.quotesSaved > 0 && <li>{w.quotesSaved} quote{w.quotesSaved === 1 ? '' : 's'} saved</li>}
            </ul>
          </section>

          {w.quote && (
            <section className="panel wrap-card wrap-quote">
              <h3>A line you kept</h3>
              <blockquote>{w.quote.note.text}</blockquote>
              <button className="link spotlight-src" onClick={() => onOpen(w.quote!.book)}>{shortTitle(w.quote.book)}</button>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
