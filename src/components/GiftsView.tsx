import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from './ProfileEditor';
import { Cover } from './Cover';
import { FriendWishlist } from './FriendWishlist';
import { myGiftClaims, unclaimGift, type GiftClaim } from '../lib/gifts';
import type { Friend } from '../lib/friends';

interface Props {
  uid: string;
  friends: Friend[];
  onOpenProfile: (username: string) => void;
}

const nameOf = (f: { display_name: string | null; username: string }) => f.display_name || `@${f.username}`;

/** Friends → Gifts: presents you're getting, and your friends' wishlists. */
export function GiftsView({ uid, friends, onOpenProfile }: Readonly<Props>) {
  const [claims, setClaims] = useState<GiftClaim[]>();
  const [error, setError] = useState<string>();
  const accepted = useMemo(() => friends.filter((f) => f.status === 'accepted').sort((a, b) => nameOf(a).localeCompare(nameOf(b))), [friends]);
  const [pick, setPick] = useState<string>();

  const load = useCallback(() => {
    myGiftClaims().then(
      (l) => {
        setClaims(l);
        setError(undefined);
      },
      (e) => setError((e as Error).message),
    );
  }, []);
  useEffect(load, [load]);

  // Your presents, grouped by who they're for.
  const byFriend = useMemo(() => {
    const m = new Map<string, { friend: GiftClaim['friend']; list: GiftClaim[] }>();
    for (const c of claims ?? []) {
      const g = m.get(c.owner) ?? { friend: c.friend, list: [] };
      g.list.push(c);
      m.set(c.owner, g);
    }
    return [...m.values()];
  }, [claims]);
  const picked = accepted.find((f) => f.id === pick);

  return (
    <div className="gifts-page">
      <section className="panel">
        <div className="home-head">
          <h3>Presents you’re getting</h3>
          {claims && claims.length > 0 && <span className="muted small">{claims.length} in all</span>}
        </div>
        {error && <p className="account-error">{error}</p>}
        {claims === undefined && !error && <p className="muted">Loading…</p>}
        {claims && !claims.length && <p className="muted">Nothing yet. Open a friend’s wishlist below and say “I’m getting this” on something.</p>}
        {byFriend.map(({ friend, list }) => (
          <div key={friend.id} className="gift-group">
            <button className="gift-friend link-plain" onClick={() => onOpenProfile(friend.username)}>
              <Avatar p={friend} size={28} />
              <strong>For {nameOf(friend)}</strong>
            </button>
            <ul className="wish-gifts">
              {list.map((c) => (
                <li key={c.item_id} className={c.still_wanted ? '' : 'taken'}>
                  <Cover url={c.item.cover} title={c.item.title} author={c.item.by} size="sm" square={c.item.kind !== 'book'} />
                  <span className="wish-gift-text">
                    <strong>{c.item.title}</strong>
                    <span className="muted small">{c.item.by}</span>
                    {!c.still_wanted && <span className="late-text small">No longer on their list. They may have bought it themselves.</span>}
                  </span>
                  <span className="wish-gift-action">
                    <button
                      className="link small"
                      onClick={async () => {
                        try {
                          await unclaimGift(c.owner, c.item_id);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                        load();
                      }}
                    >
                      {c.still_wanted ? 'Not getting it' : 'Remove'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="home-head">
          <h3>Friends’ wishlists</h3>
        </div>
        {accepted.length ? (
          <div className="gift-friends">
            {accepted.map((f) => (
              <button key={f.id} className={`chip${pick === f.id ? ' active' : ''}`} aria-pressed={pick === f.id} onClick={() => setPick(pick === f.id ? undefined : f.id)}>
                {nameOf(f)}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Add friends to see what they’d like.</p>
        )}
      </section>
      {picked && <FriendWishlist key={picked.id} uid={uid} friendId={picked.id} friendName={nameOf(picked)} onChanged={load} />}
    </div>
  );
}
