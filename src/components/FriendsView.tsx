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
{f && (f.status === 'accepted') ? (
        <span className="friend-badge">✓ Friends</span>
      ) : null}
{f && !(f.status === 'accepted') && f.incoming ? (
        <>
          <button className="btn primary small-btn" disabled={busy} onClick={() => act(() => acceptRequest(uid, them.id))}>Accept</button>
          <button className="btn ghost small-btn" disabled={busy} onClick={() => act(() => removeFriend(uid, them.id))}>Decline</button>
        </>
      ) : null}
{f && !(f.status === 'accepted') && !f.incoming ? <>
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

export function FriendsView({ uid, me, friends, loadError, onChanged, onOpenProfile, onEditProfile, onBack, lending, lendingBadge = 0, gifts, initialTab }: Readonly<Props>) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[] | undefined>();
  const [suggested, setSuggested] = useState<(Found & { mutual: number })[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [removing, setRemoving] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'feed' | 'people' | 'lending' | 'gifts'>(initialTab ?? (friends.some((f) => f.status === 'accepted') ? 'feed' : 'people'));

  const incoming = friends.filter((f) => f.status === 'pending' && f.incoming);
  const outgoing = friends.filter((f) => f.status === 'pending' && !f.incoming);
  const accepted = friends.filter((f) => f.status === 'accepted').sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

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

  const copy = async () => {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(profileLink(me.username));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* link is on screen */
    }
  };

  const unfriend = async (id: string) => {
    await removeFriend(uid, id).catch(() => undefined);
    setRemoving(undefined);
    onChanged();
  };

  return (
    <div className="profile-page friends-page">
      <button className="link small profile-back" onClick={onBack}>← Back to my library</button>
      <div className="friends-head">
        <h2 className="page-title">Friends</h2>
        {me && <button className="btn primary" onClick={findPeople}>+ Find people</button>}
      </div>
      {me && (
        <nav className="subtabs" aria-label="Friends pages">
          <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>Feed</button>
          <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
            Friends{incoming.length > 0 && <span className="tab-badge">{incoming.length}</span>}
          </button>
          {lending && (
            <button className={tab === 'lending' ? 'active' : ''} onClick={() => setTab('lending')}>
              Lending{lendingBadge > 0 && <span className="tab-badge">{lendingBadge}</span>}
            </button>
          )}
          {gifts && <button className={tab === 'gifts' ? 'active' : ''} onClick={() => setTab('gifts')}>Gifts</button>}
        </nav>
      )}

      {!me ? (
        <div className="profile-missing">
          <p>Make your profile first, so friends can find you by your username.</p>
          <button className="btn primary" onClick={onEditProfile}>Set up my profile</button>
        </div>
      ) : null}
{me && (tab === 'lending' && lending) ? (
        lending
      ) : null}
{me && !(tab === 'lending' && lending) && (tab === 'gifts' && gifts) ? (
        gifts
      ) : null}
{me && !(tab === 'lending' && lending) && !(tab === 'gifts' && gifts) && (tab === 'feed') ? (
        <FeedView uid={uid} onOpenProfile={onOpenProfile} hasFriends={accepted.length > 0} onFindFriends={findPeople} />
      ) : null}
{me && !(tab === 'lending' && lending) && !(tab === 'gifts' && gifts) && !(tab === 'feed') ? <>
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
              Or send them your link: <span className="mono">{profileLink(me.username)}</span>{' '}
              <button className="link small" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            </p>
          </section>

          {suggested.length > 0 && (
            <section className="panel">
              <h3>People you may know</h3>
              <ul className="people">
                {suggested.map((f) => (
                  <Person key={f.id} f={f} onOpen={() => onOpenProfile(f.username)}>
                    <span className="muted small mutual">{f.mutual} mutual {f.mutual === 1 ? 'friend' : 'friends'}</span>
                    <FriendButton uid={uid} them={f} friends={friends} onChanged={onChanged} />
                  </Person>
                ))}
              </ul>
            </section>
          )}

          {loadError && <p className="account-error">{loadError}</p>}

          {incoming.length > 0 && (
            <section className="panel">
              <h3>Friend requests</h3>
              <ul className="people">
                {incoming.map((f) => (
                  <Person key={f.id} f={f} onOpen={() => onOpenProfile(f.username)}>
                    <FriendButton uid={uid} them={f} friends={friends} onChanged={onChanged} />
                  </Person>
                ))}
              </ul>
            </section>
          )}

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

          {outgoing.length > 0 && (
            <section className="panel">
              <h3>Waiting for an answer</h3>
              <ul className="people">
                {outgoing.map((f) => (
                  <Person key={f.id} f={f}>
                    <FriendButton uid={uid} them={f} friends={friends} onChanged={onChanged} />
                  </Person>
                ))}
              </ul>
            </section>
          )}

          {me.visibility === 'private' && (
            <p className="muted small">
              Your profile is set to “Only me”, so friends won't see it. <button className="link small" onClick={onEditProfile}>Change who can see it</button>
            </p>
          )}
        </> : null}
    </div>
  );
}
