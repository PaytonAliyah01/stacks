import { useEffect, useState } from 'react';
import { Avatar } from './ProfileEditor';
import { FeedView } from './FeedView';
import { acceptRequest, peopleYouMayKnow, removeFriend, searchPeople, sendRequest, type Found, type Friend } from '../lib/friends';
import { cleanUsername, profileLink, type Profile } from '../lib/profile';

interface Props {
  uid: string;
  me: Profile | null;
  friends: Friend[];
  loadError?: string;
  onChanged: () => void;
  onOpenProfile: (username: string) => void;
  onEditProfile: () => void;
  onBack: () => void;
  /** The Lending page, and how many requests wait there. */
  lending?: React.ReactNode;
  lendingBadge?: number;
  /** The Gifts page. */
  gifts?: React.ReactNode;
  initialTab?: 'feed' | 'people' | 'lending' | 'gifts';
}

const nameOf = (f: Pick<Friend, 'display_name' | 'username'>) => f.display_name || `@${f.username}`;

/** The button for someone, whatever state your friendship is in. */
export function FriendButton({ uid, them, friends, onChanged }: Readonly<{ uid: string; them: Found; friends: Friend[]; onChanged: () => void }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const f = friends.find((x) => x.id === them.id);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (them.id === uid) return null;
  return (
    <span className="friend-button">
      {!f ? (
        <button className="btn primary small-btn" disabled={busy} onClick={() => act(() => sendRequest(uid, them.id))}>Add friend</button>
      ) : null}
{f?.status === 'accepted' ? (
        <span className="friend-badge">✓ Friends</span>
      ) : null}
{f && f.status !== 'accepted' && f.incoming ? (
        <>
          <button className="btn primary small-btn" disabled={busy} onClick={() => act(() => acceptRequest(uid, them.id))}>Accept</button>
          <button className="btn ghost small-btn" disabled={busy} onClick={() => act(() => removeFriend(uid, them.id))}>Decline</button>
        </>
      ) : null}
{f && f.status !== 'accepted' && !f.incoming ? <>
          <span className="friend-badge muted">Request sent</span>
          <button className="link small" disabled={busy} onClick={() => act(() => removeFriend(uid, them.id))}>Cancel</button>
        </> : null}
      {error && <span className="account-error small">{error}</span>}
    </span>
  );
}

function Person({ f, onOpen, children }: Readonly<{ f: Found; onOpen?: () => void; children?: React.ReactNode }>) {
  return (
    <li className="person">
      <button className="person-open" onClick={onOpen} disabled={!onOpen}>
        <Avatar p={f} size={44} />
        <span className="person-text">
          <strong>{nameOf(f)}</strong>
          <span className="muted small">@{f.username}</span>
        </span>
      </button>
      <span className="person-actions">{children}</span>
    </li>
  );
}

type Tab = 'feed' | 'people' | 'lending' | 'gifts';

interface ListCtx {
  uid: string;
  friends: Friend[];
  onChanged: () => void;
  onOpenProfile: (username: string) => void;
}

function FriendsTabs({ tab, setTab, incoming, lending, lendingBadge, gifts }: Readonly<{ tab: Tab; setTab: (t: Tab) => void; incoming: number; lending: boolean; lendingBadge: number; gifts: boolean }>) {
  return (
    <nav className="subtabs" aria-label="Friends pages">
      <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>Feed</button>
      <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
        Friends{incoming > 0 && <span className="tab-badge">{incoming}</span>}
      </button>
      {lending && (
        <button className={tab === 'lending' ? 'active' : ''} onClick={() => setTab('lending')}>
          Lending{lendingBadge > 0 && <span className="tab-badge">{lendingBadge}</span>}
        </button>
      )}
      {gifts && <button className={tab === 'gifts' ? 'active' : ''} onClick={() => setTab('gifts')}>Gifts</button>}
    </nav>
  );
}

function FindPeoplePanel({ ctx, username }: Readonly<{ ctx: ListCtx; username: string }>) {
  const { uid, friends, onChanged, onOpenProfile } = ctx;
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[] | undefined>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [copied, setCopied] = useState(false);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = q.trim().replace(/^@/, '');
    if (name.length < 2) return;
    setSearching(true);
    setSearchError(undefined);
    try {
      setFound(await searchPeople(name));
    } catch (err) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profileLink(username));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* link is on screen */
    }
  };

  return (
    <section className="panel">
      <h3>Find people</h3>
      <form className="search-row" onSubmit={search}>
        <input id="friend-search" type="search" value={q} onChange={(e) => { setQ(e.target.value); setFound(undefined); }} placeholder="Name or @username" autoCapitalize="none" spellCheck={false} autoComplete="off" />
        <button type="submit" className="btn primary" disabled={searching || q.trim().replace(/^@/, '').length < 2}>{searching ? 'Looking…' : 'Search'}</button>
      </form>
      {found?.length === 0 && (
        <p className="muted small">
          Nobody found for “{q.trim()}”. People with a private profile only show up when you type their exact username, like @{cleanUsername(q) || 'maya'}.
        </p>
      )}
      {searchError && <p className="account-error small">{searchError}</p>}
      {found && found.length > 0 && (
        <ul className="people">
          {found.map((f) => (
            <Person key={f.id} f={f} onOpen={() => onOpenProfile(f.username)}>
              {f.id === uid ? <span className="muted small">That's you</span> : <FriendButton uid={uid} them={f} friends={friends} onChanged={onChanged} />}
            </Person>
          ))}
        </ul>
      )}
      <p className="muted small">
        Or send them your link: <span className="mono">{profileLink(username)}</span>{' '}
        <button className="link small" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </p>
    </section>
  );
}

/** A panel listing people with the friend button beside each, or nothing when the list is empty. */
function PeoplePanel({ title, people, ctx, openable = true, extra }: Readonly<{ title: string; people: Found[]; ctx: ListCtx; openable?: boolean; extra?: (f: Found) => React.ReactNode }>) {
  const { uid, friends, onChanged, onOpenProfile } = ctx;
  if (!people.length) return null;
  return (
    <section className="panel">
      <h3>{title}</h3>
      <ul className="people">
        {people.map((f) => (
          <Person key={f.id} f={f} onOpen={openable ? () => onOpenProfile(f.username) : undefined}>
            {extra?.(f)}
            <FriendButton uid={uid} them={f} friends={friends} onChanged={onChanged} />
          </Person>
        ))}
      </ul>
    </section>
  );
}

function YourFriends({ accepted, ctx }: Readonly<{ accepted: Friend[]; ctx: ListCtx }>) {
  const { uid, onChanged, onOpenProfile } = ctx;
  const [removing, setRemoving] = useState<string>();
  const unfriend = async (id: string) => {
    await removeFriend(uid, id).catch(() => undefined);
    setRemoving(undefined);
    onChanged();
  };
  return (
    <section className="panel">
      <h3>Your friends{accepted.length ? ` (${accepted.length})` : ''}</h3>
      {accepted.length ? (
        <ul className="people">
          {accepted.map((f) => (
            <Person key={f.id} f={f} onOpen={() => onOpenProfile(f.username)}>
              {removing === f.id ? (
                <>
                  <button className="btn danger small-btn" onClick={() => unfriend(f.id)}>Remove</button>
                  <button className="link small" onClick={() => setRemoving(undefined)}>Keep</button>
                </>
              ) : (
                <button className="icon-btn" onClick={() => setRemoving(f.id)} aria-label={`Remove ${nameOf(f)} as a friend`} title="Remove friend">⋯</button>
              )}
            </Person>
          ))}
        </ul>
      ) : (
        <p className="muted">No friends yet. Search for someone above, or send them your link.</p>
      )}
    </section>
  );
}

/** "2 mutual friends", beside someone you may know. */
function mutualFriends(f: Found) {
  const mutual = (f as Found & { mutual: number }).mutual;
  return <span className="muted small mutual">{mutual} mutual {mutual === 1 ? 'friend' : 'friends'}</span>;
}

function PeoplePage({ me, ctx, suggested, incoming, accepted, outgoing, loadError, onEditProfile }: Readonly<{ me: Profile; ctx: ListCtx; suggested: (Found & { mutual: number })[]; incoming: Friend[]; accepted: Friend[]; outgoing: Friend[]; loadError?: string; onEditProfile: () => void }>) {
  return (
    <>
      <FindPeoplePanel ctx={ctx} username={me.username} />
      <PeoplePanel
        title="People you may know"
        people={suggested}
        ctx={ctx}
        extra={mutualFriends}
      />
      {loadError && <p className="account-error">{loadError}</p>}
      <PeoplePanel title="Friend requests" people={incoming} ctx={ctx} />
      <YourFriends accepted={accepted} ctx={ctx} />
      <PeoplePanel title="Waiting for an answer" people={outgoing} ctx={ctx} openable={false} />
      {me.visibility === 'private' && (
        <p className="muted small">
          Your profile is set to “Only me”, so friends won't see it. <button className="link small" onClick={onEditProfile}>Change who can see it</button>
        </p>
      )}
    </>
  );
}

export function FriendsView({ uid, me, friends, loadError, onChanged, onOpenProfile, onEditProfile, onBack, lending, lendingBadge = 0, gifts, initialTab }: Readonly<Props>) {
  const [suggested, setSuggested] = useState<(Found & { mutual: number })[]>([]);
  const [tab, setTab] = useState<Tab>(initialTab ?? (friends.some((f) => f.status === 'accepted') ? 'feed' : 'people'));

  const incoming = friends.filter((f) => f.status === 'pending' && f.incoming);
  const outgoing = friends.filter((f) => f.status === 'pending' && !f.incoming);
  const accepted = friends.filter((f) => f.status === 'accepted').sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const ctx: ListCtx = { uid, friends, onChanged, onOpenProfile };

  useEffect(() => {
    if (!me) return;
    let live = true;
    peopleYouMayKnow().then((l) => live && setSuggested(l), () => undefined);
    return () => {
      live = false;
    };
  }, [me, friends.length]);

  const findPeople = () => {
    setTab('people');
    setTimeout(() => document.getElementById('friend-search')?.focus(), 50);
  };

  const page = () => {
    if (!me) {
      return (
        <div className="profile-missing">
          <p>Make your profile first, so friends can find you by your username.</p>
          <button className="btn primary" onClick={onEditProfile}>Set up my profile</button>
        </div>
      );
    }
    if (tab === 'lending' && lending) return <>{lending}</>;
    if (tab === 'gifts' && gifts) return <>{gifts}</>;
    if (tab === 'feed') return <FeedView uid={uid} onOpenProfile={onOpenProfile} hasFriends={accepted.length > 0} onFindFriends={findPeople} />;
    return <PeoplePage me={me} ctx={ctx} suggested={suggested} incoming={incoming} accepted={accepted} outgoing={outgoing} loadError={loadError} onEditProfile={onEditProfile} />;
  };

  return (
    <div className="profile-page friends-page">
      <button className="link small profile-back" onClick={onBack}>← Back to my library</button>
      <div className="friends-head">
        <h2 className="page-title">Friends</h2>
        {me && <button className="btn primary" onClick={findPeople}>+ Find people</button>}
      </div>
      {me && <FriendsTabs tab={tab} setTab={setTab} incoming={incoming.length} lending={!!lending} lendingBadge={lendingBadge} gifts={!!gifts} />}
      {page()}
    </div>
  );
}
