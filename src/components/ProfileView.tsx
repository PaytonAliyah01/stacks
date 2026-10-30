import { useEffect, useState } from 'react';
import { Cover } from './Cover';
import { Avatar } from './ProfileEditor';
import { FriendButton } from './FriendsView';
import type { Friend } from '../lib/friends';
import { loadProfileByUsername, profileLink, type Profile, type ShowcaseItem } from '../lib/profile';

interface Props {
  username: string;
  /** Your own profile, when you're signed in. */
  mine: Profile | null;
  signedIn: boolean;
  onEdit: () => void;
  onBack: () => void;
  onSignIn: () => void;
  uid?: string;
  friends?: Friend[];
  onFriendsChanged?: () => void;
}

function Shelf({ title, items, square }: { title: string; items?: ShowcaseItem[]; square?: boolean }) {
  if (!items?.length) return null;
  return (
    <section className="profile-shelf">
      <h3 className="section-label">{title}</h3>
      <ol className="profile-row">
        {items.map((x) => (
          <li key={x.id}>
            <Cover url={x.cover} title={x.title} author={x.by} size="md" square={square} />
            <strong>{x.title}</strong>
            {x.by && <span className="muted small">{x.by}</span>}
            {x.pct !== undefined && (
              <span className="progress-bar" aria-label={`${x.pct}% read`}>
                <i style={{ width: `${x.pct}%` }} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ProfileView({ username, mine, signedIn, onEdit, onBack, onSignIn, uid, friends, onFriendsChanged }: Props) {
  const own = mine?.username === username;
  const [p, setP] = useState<Profile | null | undefined>(own ? mine : undefined);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (own) {
      setP(mine);
      return;
    }
    let live = true;
    setP(undefined);
    setFailed(false);
    loadProfileByUsername(username).then(
      (x) => live && setP(x),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [username, own, mine]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profileLink(username));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the link is on screen */
    }
  };

  const back = (
    <button className="link small profile-back" onClick={onBack}>
      ← {signedIn || mine ? 'Back to my library' : 'Back to Stacks'}
    </button>
  );

  if (p === undefined && !failed) return <div className="profile-page">{back}<p className="muted">Loading @{username}…</p></div>;
  if (!p)
    return (
      <div className="profile-page">
        {back}
        <div className="profile-missing">
          <h2>@{username}</h2>
          <p>{failed ? 'Stacks couldn’t load this profile. Check your connection and try again.' : 'This profile is private, or there’s nobody with that username.'}</p>
          {!signedIn && !failed && <button className="btn" onClick={onSignIn}>Sign in</button>}
        </div>
      </div>
    );

  const s = p.showcase ?? {};
  const st = s.stats;
  return (
    <div className="profile-page" style={{ ['--accent-p' as string]: p.accent }}>
      {back}
      <header className="profile-head">
        <div className="profile-band" aria-hidden="true" />
        <div className="profile-id">
          <Avatar p={p} size={96} />
          <div className="profile-names">
            <h2>{p.display_name || `@${p.username}`}</h2>
            {p.display_name && <span className="muted">@{p.username}</span>}
          </div>
          <div className="profile-actions">
            {own && <button className="btn" onClick={onEdit}>Edit profile</button>}
            {!own && uid && mine && friends && onFriendsChanged && <FriendButton uid={uid} them={p} friends={friends} onChanged={onFriendsChanged} />}
            <button className="btn ghost" onClick={copy}>{copied ? 'Link copied' : 'Copy link'}</button>
          </div>
        </div>
        {p.bio && <p className="profile-bio">{p.bio}</p>}
        {own && p.visibility !== 'public' && (
          <p className="muted small">Only you can see this right now. Set “Who can see your profile” to “Anyone with the link” to share it.</p>
        )}
      </header>

      {st && (
        <dl className="profile-stats">
          <div><dt>Books</dt><dd>{st.books.toLocaleString()}</dd></div>
          <div><dt>Records and CDs</dt><dd>{st.records.toLocaleString()}</dd></div>
          <div><dt>Read in {st.year}</dt><dd>{st.readThisYear.toLocaleString()}</dd></div>
          <div><dt>Pages in {st.year}</dt><dd>{st.pagesThisYear.toLocaleString()}</dd></div>
        </dl>
      )}

      {s.spinning && (
        <div className="profile-spinning">
          <Cover url={s.spinning.cover} title={s.spinning.title} author={s.spinning.by} size="sm" square />
          <span>
            <span className="stat-label">Spinning now</span>
            <strong>{s.spinning.title}</strong> <span className="muted">{s.spinning.by}</span>
          </span>
          <span className="vinyl-disc small-disc" aria-hidden="true" />
        </div>
      )}
      <Shelf title="Currently reading" items={s.reading} />
      <Shelf title="Top 4 books" items={s.topBooks} />
      <Shelf title="Top 4 records" items={s.topRecords} square />
      {own && !s.topBooks?.length && !s.topRecords?.length && (
        <p className="muted">Pick your top 4 books and records under <button className="link" onClick={onEdit}>Edit profile</button>.</p>
      )}
    </div>
  );
}
