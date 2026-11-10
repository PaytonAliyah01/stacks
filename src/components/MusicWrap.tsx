import { paintBackdrop } from '../lib/backdrop';
import { useMemo, useState } from 'react';
import type { Book, Spin } from '../types';
import { formatMoney } from '../types';
import { wrapMusic, type MusicWrap as Wrap } from '../lib/musicwrap';
import { hue, loadImage } from './YearWrap';
import { Cover } from './Cover';

interface Props {
  /** Every record and CD, owned or sold. */
  records: Book[];
  spins: Spin[];
  onOpen: (b: Book) => void;
}

const MONTH_LETTERS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'narrow' }));
const hoursText = (h: number) => (h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString());

/** A 1080×1350 picture of the year in music. */
async function drawShareImage(w: Wrap): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const serif = "Literata, Georgia, 'Times New Roman', serif";
  const sans = 'system-ui, -apple-system, Segoe UI, sans-serif';
  const ink = '#f4ede2';
  const soft = '#c3b5c9';
  const gold = '#e0b65a';
  paintBackdrop(g, W, H, 'music');

  // A record in the corner.
  const cx = W - 150;
  const cy = 170;
  g.fillStyle = '#0f0c12';
  g.beginPath();
  g.arc(cx, cy, 230, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let r = 90; r < 225; r += 9) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = gold;
  g.beginPath();
  g.arc(cx, cy, 72, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0f0c12';
  g.beginPath();
  g.arc(cx, cy, 8, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = gold;
  g.font = `600 34px ${sans}`;
  g.fillText('STACKS', 80, 110);
  g.fillStyle = ink;
  g.font = `600 92px ${serif}`;
  g.fillText(`My ${w.year}`, 80, 220);
  g.fillText('in music', 80, 320);

  const stat = (x: number, value: string, label: string) => {
    g.fillStyle = ink;
    g.font = `700 88px ${serif}`;
    g.fillText(value, x, 480);
    g.fillStyle = soft;
    g.font = `500 30px ${sans}`;
    g.fillText(label, x, 525);
  };
  stat(80, w.spins.toLocaleString(), w.spins === 1 ? 'spin' : 'spins');
  stat(400, hoursText(w.hours), 'hours');
  stat(720, w.records.toLocaleString(), w.records === 1 ? 'record' : 'records');

  const shown = w.topRecords.slice(0, 12).map((x) => x.b);
  const size = 140;
  const gap = 18;
  const imgs = await Promise.all(shown.map((b) => (b.coverUrl ? loadImage(b.coverUrl) : Promise.resolve(null))));
  shown.forEach((b, i) => {
    const x = 80 + (i % 6) * (size + gap);
    const y = 590 + Math.floor(i / 6) * (size + gap);
    const img = imgs[i];
    if (img) g.drawImage(img, x, y, size, size);
    else {
      g.fillStyle = `hsl(${hue(b.title)} 35% 38%)`;
      g.fillRect(x, y, size, size);
      g.fillStyle = ink;
      g.font = `600 19px ${serif}`;
      let line = '';
      let ly = y + 32;
      for (const word of b.title.split(' ')) {
        if (g.measureText(`${line} ${word}`).width > size - 22 && line) {
          g.fillText(line, x + 11, ly);
          line = word;
          ly += 24;
          if (ly > y + size - 16) break;
        } else line = line ? `${line} ${word}` : word;
      }
      if (ly <= y + size - 16) g.fillText(line, x + 11, ly);
    }
  });

  let y = 620;
  if (shown.length) y = shown.length > 6 ? 970 : 812;
  const line = (label: string, value: string) => {
    if (y > H - 200) return;
    g.fillStyle = soft;
    g.font = `500 28px ${sans}`;
    g.fillText(label.toUpperCase(), 80, y);
    g.fillStyle = ink;
    g.font = `600 38px ${serif}`;
    let v = value;
    while (g.measureText(v).width > W - 160 - 300 && v.length > 4) v = v.slice(0, -2);
    g.fillText(v === value ? v : `${v}…`, 380, y);
    y += 66;
  };
  if (w.topRecords[0]) line('On repeat', `${w.topRecords[0].b.title} (${w.topRecords[0].n}×)`);
  if (w.topArtists[0]) line('Top artist', w.topArtists[0][0]);
  if (w.added.length) line('New in', `${w.added.length} record${w.added.length === 1 ? '' : 's'}`);
  if (w.longestStreak > 1) line('Streak', `${w.longestStreak} days in a row`);

  const peak = Math.max(1, ...w.perMonth);
  const bw = 58;
  const step = (W - 160 - bw) / 11;
  w.perMonth.forEach((n, i) => {
    const x = 80 + i * step;
    const h = Math.max(4, (n / peak) * 100);
    g.fillStyle = n ? gold : 'rgba(255,255,255,0.15)';
    g.fillRect(x, 1270 - h, bw, h);
    g.fillStyle = soft;
    g.font = `500 24px ${sans}`;
    g.textAlign = 'center';
    g.fillText(MONTH_LETTERS[i], x + bw / 2, 1305);
    g.textAlign = 'left';
  });
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

export function MusicWrap({ records, spins, onOpen }: Readonly<Props>) {
  const years = useMemo(() => {
    const ys = new Set([...spins.map((s) => String(new Date(s.at).getFullYear())), ...records.filter((b) => b.owned !== false).map((b) => (b.acquiredOn ?? b.addedAt).slice(0, 4))]);
    ys.add(String(new Date().getFullYear()));
    return [...ys].filter((y) => /^\d{4}$/.test(y)).sort((a, b) => b.localeCompare(a));
  }, [spins, records]);
  const [year, setYear] = useState(String(new Date().getFullYear() - (new Date().getMonth() === 0 ? 1 : 0)));
  const w = useMemo(() => wrapMusic(year, records, spins), [year, records, spins]);
  const [sharing, setSharing] = useState('');
  const peak = Math.max(1, ...w.perMonth);
  const isThisYear = year === String(new Date().getFullYear());
  const empty = !w.spins && !w.added.length;

  const save = async () => {
    setSharing('Making your picture…');
    const blob = await drawShareImage(w);
    if (!blob) return setSharing("Couldn't make the picture.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-${year}-in-music.png`;
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
        <p className="muted">{isThisYear ? 'Your year so far. It fills in every time you press Spin.' : 'Your year in music.'}</p>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

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
        <div className="wrap-share">
          <button className="btn primary small-btn" onClick={save} disabled={empty}>Save picture</button>
          <button className="btn ghost small-btn wrap-ghost" onClick={copy} disabled={empty}>Copy picture</button>
          {sharing && <span className="small">{sharing}</span>}
        </div>
      </section>

      {empty ? (
        <section className="panel">
          <p className="muted">Nothing for {year} yet. Press ▶ on a record when you put it on, and your year in music builds itself.</p>
        </section>
      ) : (
        <div className="wrap-grid">
          {w.topRecords[0] && (
            <section className="panel wrap-card wrap-fav">
              <h3>On repeat</h3>
              <button className="wrap-book" onClick={() => onOpen(w.topRecords[0].b)}>
                <Cover url={w.topRecords[0].b.coverUrl} title={w.topRecords[0].b.title} author={w.topRecords[0].b.authors[0]} size="sm" square />
                <span>
                  <strong>{w.topRecords[0].b.title}</strong>
                  <span className="muted small">{w.topRecords[0].b.authors.join(', ')}</span>
                  <span className="small">Played {w.topRecords[0].n} times</span>
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
          )}

          {w.topArtists.length > 0 && (
            <section className="panel wrap-card">
              <h3>Top artists</h3>
              <p className="wrap-big">{w.topArtists[0][0]}</p>
              <ol className="wrap-list" start={2}>
                {w.topArtists.slice(1).map(([a, n]) => (
                  <li key={a}>{a} <span className="muted small">· {n} spin{n === 1 ? '' : 's'}</span></li>
                ))}
              </ol>
            </section>
          )}

          <section className="panel wrap-card">
            <h3>Month by month</h3>
            <div className="wrap-months" aria-label="Spins each month">
              {w.perMonth.map((n, i) => (
                <div key={i} className="wrap-month" title={`${n} spin${n === 1 ? '' : 's'}`}>
                  <span className="wrap-bar" style={{ height: `${(n / peak) * 100}%` }}>{n > 0 && <b>{n}</b>}</span>
                  <span className="wrap-m">{MONTH_LETTERS[i]}</span>
                </div>
              ))}
            </div>
            {w.busiestMonth && <p className="muted small">Busiest: {w.busiestMonth[0]}, with {w.busiestMonth[1]} spin{w.busiestMonth[1] === 1 ? '' : 's'}. Favorite day: {w.busiestDay?.[0]}.</p>}
          </section>

          {w.added.length > 0 && (
            <section className="panel wrap-card">
              <h3>New in your collection</h3>
              <p className="wrap-big">
                {w.added.length} <span className="muted">record{w.added.length === 1 ? '' : 's'}</span>
              </p>
              <p className="muted small">
                {[w.addedVinyl && `${w.addedVinyl} vinyl`, w.addedCds && `${w.addedCds} CD${w.addedCds === 1 ? '' : 's'}`].filter(Boolean).join(' and ')}
                {w.spent.length > 0 && ` · spent ${w.spent.map(([c, n]) => formatMoney(n, c || 'EUR')).join(' + ')}`}
              </p>
              {w.priciest && (
                <p className="small">
                  Biggest buy: <button className="link" onClick={() => onOpen(w.priciest!)}>{w.priciest.title}</button>{' '}
                  <span className="muted">· {formatMoney(w.priciest.pricePaid!, w.priciest.currency || 'EUR')}</span>
                </p>
              )}
            </section>
          )}

          <section className="panel wrap-card">
            <h3>Also</h3>
            <ul className="wrap-facts">
              {w.longestStreak > 1 && <li>Longest streak: <strong>{w.longestStreak} days</strong> in a row with music</li>}
              {w.rediscovered > 0 && <li>{w.rediscovered} record{w.rediscovered === 1 ? '' : 's'} from your shelves played for the very first time</li>}
              {w.first && <li>First spin of the year: <button className="link" onClick={() => onOpen(w.first!)}>{w.first.title}</button></li>}
              {w.last && w.last !== w.first && <li>{isThisYear ? 'Latest' : 'Last'} spin: <button className="link" onClick={() => onOpen(w.last!)}>{w.last.title}</button></li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
