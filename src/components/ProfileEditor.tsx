import { useEffect, useMemo, useRef, useState } from 'react';
import type { Book } from '../types';
import { isMusic } from '../types';
import { Cover } from './Cover';
import {
  ACCENTS,
  AVATAR_COLORS,
  USERNAME_RULE,
  cleanUsername,
  initials,
  profileLink,
  saveProfile,
  uploadAvatar,
  type Profile,
  type Showcase,
  type Visibility,
} from '../lib/profile';

export function Avatar({ p, size = 40 }: Readonly<{ p: Pick<Profile, 'avatar_url' | 'avatar_color' | 'display_name' | 'username'>; size?: number }>) {
  return p.avatar_url ? (
    <img className="avatar" src={p.avatar_url} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar-initials" aria-hidden="true" style={{ width: size, height: size, background: p.avatar_color, fontSize: size * 0.4 }}>
      {initials(p.display_name || p.username)}
    </span>
  );
}

const VISIBILITY: { v: Visibility; label: string; help: string }[] = [
  { v: 'private', label: 'Only me', help: 'Nobody else can see your profile.' },
  { v: 'friends', label: 'Friends', help: 'Only people you’ve added as friends.' },
  { v: 'public', label: 'Anyone with the link', help: 'Anyone who has your link can see your profile, but never your full library.' },
];

/** Pick up to 4 favorites from your own shelves. */
function TopPicker({ label, pool, ids, onChange }: Readonly<{ label: string; pool: Book[]; ids: string[]; onChange: (ids: string[]) => void }>) {
  const [q, setQ] = useState('');
  const byId = useMemo(() => new Map(pool.map((b) => [b.id, b])), [pool]);
  const chosen = ids.map((id) => byId.get(id)).filter((b): b is Book => !!b);
  const hits = q.trim()
    ? pool
        .filter((b) => !ids.includes(b.id) && `${b.title} ${b.authors.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
        .slice(0, 6)
    : [];
  return (
    <div className="top-picker">
      <span className="section-label">{label}</span>
      <ol className="top-row">
        {[0, 1, 2, 3].map((i) => {
          const b = chosen[i];
          return (
            <li key={i} className={b ? '' : 'empty'}>
              {b ? (
                <>
                  <Cover url={b.coverUrl} title={b.title} author={b.authors[0]} size="sm" square={isMusic(b)} />
                  <button type="button" className="top-remove" onClick={() => onChange(ids.filter((x) => x !== b.id))} aria-label={`Take ${b.title} off`}>✕</button>
                </>
              ) : (
                <span>{i + 1}</span>
              )}
            </li>
          );
        })}
      </ol>
      {chosen.length < 4 && (
        <>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search your ${label.toLowerCase().includes('record') ? 'records' : 'books'} to add one`} />
          {hits.length > 0 && (
            <ul className="top-hits">
              {hits.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...ids.filter((x) => byId.has(x)), b.id].slice(0, 4));
                      setQ('');
                    }}
                  >
                    <strong>{b.title}</strong> <span className="muted small">{b.authors[0]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

interface Props {
  uid: string;
  email?: string;
  profile: Profile | null;
  books: Book[];
  /** Builds the snapshot of your library from the favorites you picked. */
  makeShowcase: (top: { books: string[]; records: string[] }) => Showcase;
  onSaved: (p: Profile) => void;
  onClose: () => void;
}

export function ProfileEditor({ uid, email, profile, books, makeShowcase, onSaved, onClose }: Readonly<Props>) {
  const [username, setUsername] = useState(profile?.username ?? cleanUsername(email?.split('@')[0] ?? '').slice(0, 20));
  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [color, setColor] = useState(profile?.avatar_color ?? AVATAR_COLORS[0]);
  const [accent, setAccent] = useState(profile?.accent ?? ACCENTS[0]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [visibility, setVisibility] = useState<Visibility>(profile?.visibility ?? 'private');
  const [topBooks, setTopBooks] = useState<string[]>(profile?.showcase.topBooks?.map((x) => x.id) ?? []);
  const [topRecords, setTopRecords] = useState<string[]>(profile?.showcase.topRecords?.map((x) => x.id) ?? []);
  const [share, setShare] = useState(profile?.share_activity ?? true);
  const [busy, setBusy] = useState<'save' | 'photo'>();
  const [error, setError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const owned = books.filter((b) => b.owned !== false);
  const okName = USERNAME_RULE.test(username);

  const pickPhoto = async (f?: File) => {
    if (!f) return;
    setBusy('photo');
    setError(undefined);
    try {
      setAvatarUrl(await uploadAvatar(uid, f, avatarUrl));
    } catch (e) {
      setError(`The picture didn't upload: ${(e as Error).message}`);
    } finally {
      setBusy(undefined);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!okName) return;
    setBusy('save');
    setError(undefined);
    try {
      const saved = await saveProfile({
        id: uid,
        username,
        display_name: name.trim(),
        bio: bio.trim(),
        avatar_url: avatarUrl,
        avatar_color: color,
        accent,
        visibility,
        share_activity: share,
        showcase: makeShowcase({ books: topBooks, records: topRecords }),
      });
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const preview = { avatar_url: avatarUrl, avatar_color: color, display_name: name, username };

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer narrow" role="dialog" aria-modal="true" aria-label="Edit profile">
        <form className="drawer-form profile-editor" onSubmit={save}>
          <header className="drawer-head">
            <h2 className="drawer-heading">{profile ? 'Edit profile' : 'Set up your profile'}</h2>
            <button type="button" className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
          </header>

          <div className="avatar-edit" style={{ ['--accent-p' as string]: accent }}>
            <Avatar p={preview} size={88} />
            <div className="avatar-edit-actions">
              <button type="button" className="btn small-btn" onClick={() => fileRef.current?.click()} disabled={busy === 'photo'}>
                {busy === 'photo' ? 'Uploading…' : avatarUrl ? 'Change picture' : 'Upload a picture'}
              </button>
              {avatarUrl && <button type="button" className="link small" onClick={() => setAvatarUrl(null)}>Use initials instead</button>}
              <input ref={fileRef} id="avatar-file" type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            </div>
          </div>
          {!avatarUrl && (
            <div className="swatches" role="radiogroup" aria-label="Picture color">
              {AVATAR_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          )}

          <label className="field">
            <span>Username</span>
            <div className="username-input">
              <span aria-hidden="true">@</span>
              <input id="p-username" value={username} onChange={(e) => setUsername(cleanUsername(e.target.value).slice(0, 20))} autoCapitalize="none" autoComplete="username" spellCheck={false} required />
            </div>
            <span className={`hint ${username && !okName ? 'bad-text' : ''}`}>3 to 20 letters, numbers or _. Friends find you by this.</span>
          </label>
          <label className="field">
            <span>Name</span>
            <input id="p-name" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="What friends call you" />
          </label>
          <label className="field">
            <span>About you</span>
            <textarea id="p-bio" value={bio} maxLength={300} rows={3} onChange={(e) => setBio(e.target.value)} placeholder="Fantasy reader, vinyl hoarder, always one book behind…" />
            <span className="hint">{300 - bio.length} characters left</span>
          </label>

          <div className="field">
            <span>Profile color</span>
            <div className="swatches" role="radiogroup" aria-label="Profile color">
              {ACCENTS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={accent === c} aria-label={c} className={`swatch ${accent === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setAccent(c)} />
              ))}
            </div>
          </div>

          <TopPicker label="Top 4 books" pool={owned.filter((b) => !isMusic(b))} ids={topBooks} onChange={setTopBooks} />
          <TopPicker label="Top 4 records" pool={owned.filter(isMusic)} ids={topRecords} onChange={setTopRecords} />

          <fieldset className="visibility">
            <legend className="section-label">Who can see your profile</legend>
            {VISIBILITY.map((o) => (
              <label key={o.v} className={`visibility-option ${visibility === o.v ? 'on' : ''}`}>
                <input type="radio" name="visibility" checked={visibility === o.v} onChange={() => setVisibility(o.v)} />
                <span>
                  <strong>{o.label}</strong>
                  <span className="muted small">{o.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="check-row">
            <input id="p-share" type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
            <span>
              <strong>Share what I read and spin with friends</strong>
              <span className="muted small">Starting or finishing a book, your rating, putting on a record, and new additions show up in your friends' feed.</span>
            </span>
          </label>
          <p className="muted small">
            Your profile shows your name, picture, favorites, what you're reading and spinning, and a few totals. Your full library always stays private.
            {okName && <> Your link: <span className="mono">{profileLink(username)}</span></>}
          </p>

          {error && <p className="account-error" role="alert">{error}</p>}
          <div className="drawer-foot">
            <button type="submit" className="btn primary" disabled={!!busy || !okName}>{busy === 'save' ? 'Saving…' : 'Save profile'}</button>
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </aside>
    </div>
  );
}
