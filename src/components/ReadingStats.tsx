import { useMemo, useState } from 'react';
import type { Book, Reading } from '../types';
import { formatDay } from '../lib/reading';
import { Bars } from './Stats';
import { PACES, cap } from '../lib/moods';
import { hoursAndMinutes } from '../lib/sessions';

interface Props {
  books: Book[];
  readings: Reading[];
  onOpen: (b: Book) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'short' }));
const DAY = 86_400_000;

export function ReadingStats({ books, readings, onOpen }: Props) {
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const all = useMemo(
    () =>
      readings
        .filter((r) => (r.status === 'read' || r.status === 'dnf') && byId.has(r.bookId))
        .map((r) => ({ r, b: byId.get(r.bookId)! })),
    [readings, byId],
  );
  const years = useMemo(() => {
    const ys = new Set(all.map((x) => x.r.finishedOn?.slice(0, 4)).filter(Boolean) as string[]);
    ys.add(String(new Date().getFullYear()));
    return [...ys].sort((a, b) => b.localeCompare(a));
  }, [all]);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));

  const s = useMemo(() => {
    const inScope = year === 'all' ? all : all.filter((x) => x.r.finishedOn?.startsWith(year));
    const read = inScope.filter((x) => x.r.status === 'read');
    const pages = read.reduce((n, x) => n + (x.b.pageCount ?? 0), 0);
    const ratings = read.map((x) => x.r.rating).filter((v): v is number => !!v);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : undefined;
    const timed = read.filter((x) => x.r.startedOn && x.r.finishedOn).map((x) => ({ ...x, days: Math.max(1, Math.round((Date.parse(x.r.finishedOn!) - Date.parse(x.r.startedOn!)) / DAY) + 1) }));
    const avgDays = timed.length ? timed.reduce((n, x) => n + x.days, 0) / timed.length : undefined;
    const fastest = [...timed].sort((a, b) => a.days - b.days)[0];
    const withPages = read.filter((x) => x.b.pageCount);
    const longest = [...withPages].sort((a, b) => b.b.pageCount! - a.b.pageCount!)[0];
    const shortest = [...withPages].sort((a, b) => a.b.pageCount! - b.b.pageCount!)[0];

    let perMonth: [string, number][];
    let pagesPerMonth: [string, number][];
    if (year === 'all') {
      const byYear = new Map<string, { n: number; p: number }>();
      for (const x of read) {
        const y = x.r.finishedOn?.slice(0, 4) ?? 'No date';
        const e = byYear.get(y) ?? { n: 0, p: 0 };
        e.n++;
        e.p += x.b.pageCount ?? 0;
        byYear.set(y, e);
      }
      const ys = [...byYear.keys()].sort((a, b) => a.localeCompare(b));
      perMonth = ys.map((y) => [y, byYear.get(y)!.n]);
      pagesPerMonth = ys.map((y) => [y, byYear.get(y)!.p]);
    } else {
      const n = new Array(12).fill(0);
      const p = new Array(12).fill(0);
      for (const x of read) {
        const m = Number(x.r.finishedOn!.slice(5, 7)) - 1;
        n[m]++;
        p[m] += x.b.pageCount ?? 0;
      }
      perMonth = MONTHS.map((m, i) => [m, n[i]]);
      pagesPerMonth = MONTHS.map((m, i) => [m, p[i]]);
    }

    const tally = (keys: (x: (typeof read)[number]) => string[]) => {
      const m = new Map<string, number>();
      for (const x of read) for (const k of new Set(keys(x))) if (k) m.set(k, (m.get(k) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    };
    const stars: [string, number][] = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((v) => [`${v} ★`, ratings.filter((r) => r === v).length]);

    return {
      read: read.length,
      dnf: inScope.length - read.length,
      pages,
      avg,
      avgDays,
      avgPages: withPages.length ? Math.round(withPages.reduce((n, x) => n + x.b.pageCount!, 0) / withPages.length) : undefined,
      fastest,
      longest,
      shortest,
      perMonth,
      pagesPerMonth,
      authors: tally((x) => x.b.authors.slice(0, 1)),
      genres: tally((x) => [...x.b.subjects.slice(0, 3), ...x.b.tags]),
      moods: tally((x) => (x.b.moods ?? []).map(cap)),
      paces: PACES.map((p): [string, number] => [cap(p), read.filter((x) => x.b.pace === p).length]),
      vibed: read.filter((x) => x.b.moods?.length || x.b.pace).length,
      stars: stars.filter(([, n], i) => n > 0 || i % 2 === 0),
      rated: ratings.length,
      reviews: read.filter((x) => x.r.review?.trim()).length,
    };
  }, [all, year]);

  const time = useMemo(() => {
    const sessions = readings.flatMap((r) => r.sessions ?? []).filter((x) => year === 'all' || x.start.startsWith(year));
    const minutes = sessions.reduce((n, x) => n + x.minutes, 0);
    const paged = sessions.filter((x) => x.toPage !== undefined && x.fromPage !== undefined && x.toPage > x.fromPage);
    const pagedMinutes = paged.reduce((n, x) => n + x.minutes, 0);
    const pagesPerHour = pagedMinutes ? Math.round((paged.reduce((n, x) => n + (x.toPage! - x.fromPage!), 0) / pagedMinutes) * 60) : undefined;
    const buckets = new Map<string, number>();
    if (year !== 'all') MONTHS.forEach((m) => buckets.set(m, 0));
    for (const x of sessions) {
      const k = year === 'all' ? x.start.slice(0, 4) : MONTHS[new Date(x.start).getMonth()];
      buckets.set(k, (buckets.get(k) ?? 0) + x.minutes);
    }
    const keys = year === 'all' ? [...buckets.keys()].sort((a, b) => a.localeCompare(b)) : MONTHS;
    return {
      count: sessions.length,
      minutes,
      avg: sessions.length ? minutes / sessions.length : 0,
      pagesPerHour,
      perPeriod: keys.map((k): [string, number] => [k, Math.round(((buckets.get(k) ?? 0) / 60) * 10) / 10]),
    };
  }, [readings, year]);

  const label = year === 'all' ? 'all time' : year;

  return (
    <div className="reading-view">
      <div className="finished-head">
        <p className="muted">Everything you finished in {label}.</p>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
          <option value="all">All time</option>
        </select>
      </div>
      <div className="stat-row stat-row-4">
        <div className="stat">
          <span className="stat-label">Books read</span>
          <span className="stat-value">{s.read.toLocaleString()}</span>
          <span className="muted">{s.dnf ? `${s.dnf} not finished` : ' '}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Pages read</span>
          <span className="stat-value">{s.pages.toLocaleString()}</span>
          <span className="muted">{s.avgPages ? `about ${s.avgPages.toLocaleString()} a book` : ' '}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Average rating</span>
          <span className="stat-value">{s.avg ? s.avg.toFixed(1) : '–'}</span>
          <span className="muted">{s.rated ? `from ${s.rated} rated` : 'rate books when you finish them'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Days per book</span>
          <span className="stat-value">{s.avgDays ? (s.avgDays < 10 ? s.avgDays.toFixed(1) : Math.round(s.avgDays)) : '–'}</span>
          <span className="muted">{s.avgDays ? 'from start to finish' : 'needs start and finish dates'}</span>
        </div>
      </div>

      <div className="stat-grid">
        <section className="panel">
          <h3>{year === 'all' ? 'Books per year' : 'Books per month'}</h3>
          <Bars rows={s.perMonth} />
        </section>
        <section className="panel">
          <h3>{year === 'all' ? 'Pages per year' : 'Pages per month'}</h3>
          <Bars rows={s.pagesPerMonth} />
        </section>
        <section className="panel">
          <h3>Your ratings</h3>
          {s.rated ? <Bars rows={s.stars} /> : <p className="muted">No ratings yet.</p>}
          {s.reviews > 0 && <p className="muted small">{s.reviews} with a written review.</p>}
        </section>
        <section className="panel">
          <h3>Most-read authors</h3>
          <Bars rows={s.authors} />
        </section>
        <section className="panel">
          <h3>Genres and tags</h3>
          <Bars rows={s.genres} />
        </section>
        <section className="panel">
          <h3>Time spent reading</h3>
          {time.count ? (
            <>
              <p className="year-sum">
                <strong>{hoursAndMinutes(time.minutes)}</strong> over {time.count} session{time.count === 1 ? '' : 's'} · about {hoursAndMinutes(time.avg)} each
                {time.pagesPerHour ? <> · <strong>{time.pagesPerHour}</strong> pages an hour</> : null}
              </p>
              <Bars rows={time.perPeriod} />
              <p className="muted small">Hours per {year === 'all' ? 'year' : 'month'}.</p>
            </>
          ) : (
            <p className="muted">Use the reading timer on a book you're reading, or “Log time”, to see how long you read.</p>
          )}
        </section>
        <section className="panel">
          <h3>Moods</h3>
          {s.moods.length ? <Bars rows={s.moods} /> : <p className="muted">Add moods to books you finish (open a book, then “Add mood, pace or content warnings”) to see what you gravitate to.</p>}
        </section>
        <section className="panel">
          <h3>Pace</h3>
          {s.paces.some(([, n]) => n) ? <Bars rows={s.paces} /> : <p className="muted">No pace set yet.</p>}
          {s.vibed > 0 && s.vibed < s.read && <p className="muted small">{s.vibed} of {s.read} books have a mood or pace.</p>}
        </section>
        <section className="panel">
          <h3>Records</h3>
          <dl className="records">
            {[
              ['Longest', s.longest, s.longest && `${s.longest.b.pageCount!.toLocaleString()} pages`],
              ['Shortest', s.shortest, s.shortest && `${s.shortest.b.pageCount!.toLocaleString()} pages`],
              ['Fastest', s.fastest, s.fastest && `${s.fastest.days} day${s.fastest.days === 1 ? '' : 's'}, finished ${formatDay(s.fastest.r.finishedOn)}`],
            ].map(([name, x, detail]) => (
              <div key={name as string}>
                <dt>{name as string}</dt>
                <dd>
                  {x ? (
                    <>
                      <button className="link" onClick={() => onOpen((x as { b: Book }).b)}>{(x as { b: Book }).b.title}</button>
                      <span className="muted small"> · {detail as string}</span>
                    </>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
