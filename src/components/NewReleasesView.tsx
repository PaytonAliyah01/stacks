import { useEffect, useState } from 'react';
import type { Book } from '../types';
import { isMusic } from '../types';
import { Cover } from './Cover';
import { sameBook } from '../lib/wishlist';
import { dateLabel, dateMs, markSeen, muteName, mutedNames, type Followed, type Release } from '../lib/newreleases';
import { authorKey } from '../lib/recommend';
import { artistKey } from '../lib/musicrecs';

interface Props {
  kind: 'book' | 'music';
  releases: Release[];
  followed: Followed[];
  allBooks: Book[];
  loading: boolean;
  error?: string;
  checkedAt?: number;
  onRefresh: () => void;
  /** Book: to-read list. */
  onWant?: (r: Release) => void;
  /** Book: wishlist. Music: wantlist. */
  onWish: (r: Release) => void;
  onHide: (r: Release) => void;
  /** After following or unfollowing, look again. */
  onFollowChange: () => void;
  onSeen?: () => void;
}

function ReleaseCard({ r, kind, have, onWant, onWish, onHide }: { r: Release; kind: Props['kind']; have?: Book } & Pick<Props, 'onWant' | 'onWish' | 'onHide'>) {
  const wanted = have && (have.wishlist || have.owned === false);
  return (
    <li className="rec release">
      <span className="rec-cover">
        <Cover url={r.cover} title={r.title} author={r.authors[0]} size="sm" square={kind === 'music'} />
      </span>
      <div className="rec-body">
        {r.link ? (
          <a className="rec-title" href={r.link} target="_blank" rel="noreferrer">{r.title}</a>
        ) : (
          <strong className="rec-title">{r.title}</strong>
        )}
        <span className="muted small">{r.authors[0]}{r.type ? ` · ${r.type}` : ''}</span>
        <span className={`release-date small${r.upcoming ? ' soon' : ''}`}>{dateLabel(r.date)}</span>
        <span className="rec-why small">{r.reason}</span>
        <span className="rec-actions">
          {have && !wanted ? (
            <span className="muted small">In your library</span>
          ) : wanted ? (
            <span className="muted small">On your {kind === 'music' ? 'wantlist' : 'wishlist'}</span>
          ) : kind === 'book' ? (
            <>
              <button className="btn small-btn" onClick={() => onWish(r)}>Wishlist</button>
              {onWant && <button className="link small" onClick={() => onWant(r)}>Want to read</button>}
            </>
          ) : (
            <button className="btn small-btn" onClick={() => onWish(r)}>Add to wantlist</button>
          )}
          <button className="icon-btn rec-hide" onClick={() => onHide(r)} aria-label={`Not interested: ${r.title}`} title="Not interested">✕</button>
        </span>
      </div>
    </li>
  );
}

export function NewReleasesView(p: Props) {
  const { kind, releases } = p;
  const soon = releases.filter((r) => r.upcoming).sort((a, b) => dateMs(a.date) - dateMs(b.date));
  const out = releases.filter((r) => !r.upcoming);
  const [showFollow, setShowFollow] = useState(false);
  const [muted, setMuted] = useState(mutedNames);
  const keyOf = kind === 'music' ? artistKey : authorKey;
  const who = kind === 'music' ? 'artists' : 'authors';

  // Opening the page counts as seeing what's on it.
  useEffect(() => {
    if (!releases.length) return;
    markSeen(releases.map((r) => r.key));
    p.onSeen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releases]);

  const row = (list: Release[]) => (
    <ul className="recs">
      {list.map((r) => (
        <ReleaseCard key={r.key} r={r} kind={kind} have={sameBook(p.allBooks, { title: r.title, authors: r.authors })} onWant={p.onWant} onWish={p.onWish} onHide={p.onHide} />
      ))}
    </ul>
  );
  const unfollow = (name: string, on: boolean) => {
    muteName(keyOf(name), on);
    setMuted(mutedNames());
    p.onFollowChange();
  };
  const mutedHere = [...muted].filter((k) => p.allBooks.some((b) => (kind === 'music') === isMusic(b) && keyOf(b.authors[0] ?? '') === k));
  const nameOf = (k: string) => p.allBooks.find((b) => keyOf(b.authors[0] ?? '') === k)?.authors[0] ?? k;

  return (
    <div className="recs-page releases-page">
      <p className="muted recs-intro">
        {p.followed.length
          ? `New and upcoming ${kind === 'music' ? 'albums' : 'books'} from the ${p.followed.length === 1 ? `${kind === 'music' ? 'artist' : 'author'}` : `${p.followed.length} ${who}`} you ${kind === 'music' ? 'own and play most' : 'read and like most'}, checked once a day.`
          : kind === 'music'
            ? 'Add records to your collection and Stacks follows those artists for new albums.'
            : 'Finish and rate a few books (or own two by the same author) and Stacks follows those authors for new books.'}
      </p>

      {soon.length > 0 && (
        <section className="panel">
          <div className="home-head">
            <h3>Coming soon</h3>
            <span className="muted small">Soonest first</span>
          </div>
          {row(soon)}
        </section>
      )}
      {out.length > 0 && (
        <section className="panel">
          <div className="home-head">
            <h3>Out in the last year</h3>
            <span className="muted small">Newest first</span>
          </div>
          {row(out)}
        </section>
      )}
      {p.loading && !releases.length && <p className="muted">Looking for new {kind === 'music' ? 'albums' : 'books'}…</p>}
      {!p.loading && !p.error && p.followed.length > 0 && !releases.length && (
        <p className="muted">Nothing new from your {who} in the last year, and nothing announced yet. Stacks checks again tomorrow.</p>
      )}
      {p.error && <p className="account-error">{p.error}</p>}

      {(p.followed.length > 0 || mutedHere.length > 0) && (
        <section className="panel">
          <div className="home-head">
            <h3>{kind === 'music' ? 'Artists' : 'Authors'} you follow</h3>
            <button className="link small" onClick={() => setShowFollow((v) => !v)} aria-expanded={showFollow}>{showFollow ? 'Hide' : `Show ${p.followed.length}`}</button>
          </div>
          {showFollow && (
            <>
              <ul className="follow-list">
                {p.followed.map((f) => (
                  <li key={f.name}>
                    <span>
                      <strong>{f.name}</strong>
                      <span className="muted small"> · {f.why.replace(` by ${f.name}`, '')}</span>
                    </span>
                    <button className="link small" onClick={() => unfollow(f.name, true)}>Stop following</button>
                  </li>
                ))}
              </ul>
              {mutedHere.length > 0 && (
                <p className="muted small">
                  Not following:{' '}
                  {mutedHere.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ', '}
                      {nameOf(k)} (<button className="link small" onClick={() => unfollow(nameOf(k), false)}>follow again</button>)
                    </span>
                  ))}
                </p>
              )}
              <p className="muted small">
                {kind === 'music'
                  ? 'Stacks follows the artists you own the most records by and spin the most.'
                  : 'Stacks follows the authors whose books you rated highly, read, or own more than one of.'}
              </p>
            </>
          )}
        </section>
      )}

      <p className="recs-foot muted small">
        {p.checkedAt && `Checked ${new Date(p.checkedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. `}
        <button className="link small" onClick={p.onRefresh} disabled={p.loading}>{p.loading ? 'Looking…' : 'Check now'}</button>
        {kind === 'book' && ' Dates come from Google Books, or Open Library when Google is busy.'}
        {kind === 'music' && ' Dates come from Deezer.'}
      </p>
    </div>
  );
}
