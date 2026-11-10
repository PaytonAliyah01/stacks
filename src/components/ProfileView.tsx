import { useEffect, useState } from 'react';
import { Cover } from './Cover';
import { Avatar } from './ProfileEditor';
import { FriendButton } from './FriendsView';
import { FriendShelf } from './FriendShelf';
import { FriendWishlist } from './FriendWishlist';
import type { Loan } from '../lib/lending';
import { findUser, type Found, type Friend } from '../lib/friends';
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
  loans?: Loan[];
  onLoansChanged?: () => void;
}

function Shelf({ title, items, square }: Readonly<{ title: string; items?: ShowcaseItem[]; square?: boolean }>) {
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

export function ProfileView({ username, mine, signedIn, onEdit, onBack, onSignIn, uid, friends, onFriendsChanged, loans, onLoansChanged }: Readonly<Props>) {
  const own = mine?.username === username;
  const [p, setP] = useState<Profile | null | undefined>(own ? mine : undefined);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  // A private profile still shows its name and picture, so you can add them as a friend.
  const [card, setCard] = useState<Found | null>();

  useEffect(() => {
    if (own) {
      setP(mine);
      return;
    }
    let live = true;
    setP(undefined);
    setFailed(false);
    setCard(undefined);
    const load = async () => {
      let x: Awaited<ReturnType<typeof loadProfileByUsername>>;
      try {
        x = await loadProfileByUsername(username);
      } catch {
        if (live) setFailed(true);
        return;
      }
      if (!live) return;
      setP(x);
      if (x || !signedIn) return;
      try {
        const c = await findUser(username);
        if (live) setCard(c);
      } catch {
        if (live) setCard(null);
      }
    };
    load().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [username, own, mine, signedIn]);

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
  // What lets you become friends with someone, whatever state you're in.
  const addFriend = (them: Found) => {
    if (!signedIn) return <button className="btn primary" onClick={onSignIn}>Sign in to add as a friend</button>;
    if (!mine) return <button className="btn primary" onClick={onEdit}>Make your profile to add friends</button>;
    if (uid && friends && onFriendsChanged) return <FriendButton uid={uid} them={them} friends={friends} onChanged={onFriendsChanged} />;
    return null;
  };

  if (!p && card && !own)
    return (
      <div className="profile-page">
        {back}
        <div className="profile-missing profile-private">
          <Avatar p={card} size={72} />
          <h2>{card.display_name || `@${card.username}`}</h2>
          {card.display_name && <span className="muted">@{card.username}</span>}
          <p>{friends?.some((f) => f.id === card.id && f.status === 'accepted') ? 'Their profile is private.' : 'Their profile is private. Add them as a friend, and once they accept you can see their shelves, reading and wishlist.'}</p>
          {addFriend(card)}
        </div>
      </div>
    );
  if (!p)
    return (
      <div className="profile-page">
        {back}
        <div className="profile-missing">
          <h2>@{username}</h2>
          <p>
            {missingText(failed, signedIn, card === undefined)}
          </p>
          {!signedIn && !failed && <button className="btn primary" onClick={onSignIn}>Sign in</button>}
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
            {!own && addFriend(p)}
            <button className="btn ghost" onClick={copy}>{copied ? 'Link copied' : 'Copy link'}</button>
          </div>
        </div>
        {p.bio && <p className="profile-bio">{p.bio}</p>}
        {own && p.visibility !== 'public' && (
          <p className="muted small">Your profile is {p.visibility === 'private' ? 'private' : 'only visible to friends'}. People with your link still see your name and an Add friend button; set “Who can see your profile” to “Anyone with the link” to show them everything.</p>
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
      {!own && uid && mine && loans && onLoansChanged && friends?.some((f) => f.id === p.id && f.status === 'accepted') && (
        <FriendShelf uid={uid} friendId={p.id} friendName={p.display_name || `@${p.username}`} loans={loans} onChanged={onLoansChanged} />
      )}
      {!own && uid && mine && friends?.some((f) => f.id === p.id && f.status === 'accepted') && (
        <FriendWishlist uid={uid} friendId={p.id} friendName={p.display_name || `@${p.username}`} />
      )}
      {own && !s.topBooks?.length && !s.topRecords?.length && (
        <p className="muted">Pick your top 4 books and records under <button className="link" onClick={onEdit}>Edit profile</button>.</p>
      )}
    </div>
  );
}

function missingText(failed: boolean, signedIn: boolean, stillLooking: boolean): string {
  if (failed) return 'Stacks couldn’t load this profile. Check your connection and try again.';
  if (!signedIn) return 'Sign in to see this profile and add them as a friend.';
  return stillLooking ? 'Looking…' : 'There’s nobody with that username. Check the spelling with your friend.';
}
