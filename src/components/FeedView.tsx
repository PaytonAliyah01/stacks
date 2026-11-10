import { useCallback, useEffect, useState } from 'react';
import { Avatar } from './ProfileEditor';
import { Cover } from './Cover';
import { deleteActivity, loadFeed, sentence, setLiked, type FeedEntry } from '../lib/feed';

interface Props {
  uid: string;
  onOpenProfile: (username: string) => void;
  hasFriends: boolean;
  onFindFriends: () => void;
  /** Show only the newest few, e.g. on Home. */
  limit?: number;
}

function when(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const stars = (n: number) => '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '');

function Post({ e, mine, onOpenProfile, onChange, onGone }: Readonly<{ e: FeedEntry; mine: boolean; onOpenProfile: (u: string) => void; onChange: (e: FeedEntry) => void; onGone: () => void }>) {
  const [menu, setMenu] = useState(false);
  const first = e.items[0];
  const many = e.kind === 'added' && e.items.length > 1;
  const like = async () => {
    const next = { ...e, liked: !e.liked, likes: e.likes + (e.liked ? -1 : 1) };
    onChange(next);
    try {
      await setLiked(e.id, next.liked);
    } catch {
      onChange(e);
    }
  };
  return (
    <li className="post">
      <button className="post-who" onClick={() => onOpenProfile(e.username)} aria-label={`Open @${e.username}`}>
        <Avatar p={e} size={40} />
      </button>
      <div className="post-body">
        <p className="post-line">
          <button className="link-plain" onClick={() => onOpenProfile(e.username)}>{mine ? 'You' : e.display_name || `@${e.username}`}</button>{' '}
          {sentence(e)}
          {!many && first && (
            <>
              {' '}<strong>{first.title}</strong>
              {first.by && <span className="muted"> by {first.by}</span>}
            </>
          )}
          <span className="muted small post-time"> · {when(e.created_at)}</span>
        </p>
        {e.extra.rating !== undefined && <span className="post-stars" aria-label={`${e.extra.rating} stars`}>{stars(e.extra.rating)}</span>}
        {e.extra.review && <blockquote className="post-review">{e.extra.review}</blockquote>}
        {many ? (
          <div className="post-covers">
            {e.items.map((x, i) => (
              <Cover key={i} url={x.cover} title={x.title} author={x.by} size="sm" square={x.kind !== 'book'} />
            ))}
            {(e.extra.count ?? 0) > e.items.length && <span className="muted small">+{(e.extra.count ?? 0) - e.items.length} more</span>}
          </div>
        ) : (
          first && (
            <div className="post-cover">
              <Cover url={first.cover} title={first.title} author={first.by} size="sm" square={first.kind !== 'book'} />
            </div>
          )
        )}
        <div className="post-actions">
          <button className={`like ${e.liked ? 'on' : ''}`} onClick={like} aria-pressed={e.liked} aria-label={e.liked ? 'Unlike' : 'Like'}>
            {e.liked ? '♥' : '♡'} {e.likes > 0 && <span>{e.likes}</span>}
          </button>
          {mine &&
            (menu ? (
              <>
                <button className="link small danger-text" onClick={() => deleteActivity(e.id).then(onGone, () => setMenu(false))}>Delete this post</button>
                <button className="link small" onClick={() => setMenu(false)}>Keep</button>
              </>
            ) : (
              <button className="icon-btn" onClick={() => setMenu(true)} aria-label="More">⋯</button>
            ))}
        </div>
      </div>
    </li>
  );
}

export function FeedView({ uid, onOpenProfile, hasFriends, onFindFriends, limit }: Readonly<Props>) {
  const [entries, setEntries] = useState<FeedEntry[]>();
  const [error, setError] = useState<string>();
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    loadFeed().then(
      (l) => {
        setEntries(l);
        setMore(l.length >= 40);
        setError(undefined);
      },
      (e) => setError(`Couldn't load the feed: ${(e as Error).message}`),
    );
  }, []);
  useEffect(() => {
    refresh();
    const t = window.setInterval(() => !document.hidden && refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const older = async () => {
    if (!entries?.length) return;
    setBusy(true);
    try {
      const l = await loadFeed(entries[entries.length - 1].created_at);
      setEntries([...entries, ...l]);
      setMore(l.length >= 40);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="account-error">{error}</p>;
  if (!entries) return <p className="muted">Loading…</p>;
  return (
    <div className="feed">
      {!entries.length ? (
        <div className="profile-missing">
          <p>
            {hasFriends
              ? 'Nothing here yet. When you or your friends start a book, finish one, or put on a record, it shows up here.'
              : 'Your feed shows what your friends are reading and spinning. Add some friends to get it going.'}
          </p>
          {!hasFriends && <button className="btn primary" onClick={onFindFriends}>Find friends</button>}
        </div>
      ) : (
        <ul className="posts">
          {(limit ? entries.slice(0, limit) : entries).map((e) => (
            <Post
              key={e.id}
              e={e}
              mine={e.user_id === uid}
              onOpenProfile={onOpenProfile}
              onChange={(n) => setEntries((l) => l?.map((x) => (x.id === n.id ? n : x)))}
              onGone={() => setEntries((l) => l?.filter((x) => x.id !== e.id))}
            />
          ))}
        </ul>
      )}
      {more && !limit && entries.length > 0 && (
        <button className="btn ghost" onClick={older} disabled={busy}>{busy ? 'Loading…' : 'Show older'}</button>
      )}
    </div>
  );
}
