import { useEffect, useState } from 'react';
import { DEFAULT_SHARE, getShareLink, newShareToken, saveShareLink, ShareNotReady, shareUrl, type ShareLink, type ShareSettings } from '../lib/share';

const OPTIONS: [keyof ShareSettings, string, string][] = [
  ['show_books', 'Books', 'Every book you own.'],
  ['show_music', 'Records and CDs', 'Your vinyl and CDs.'],
  ['show_shelves', 'Bookcases', 'Your bookcases drawn with everything in its spot.'],
  ['show_wishlist', 'Wishlist', 'Books and records you want, handy before a birthday.'],
  ['show_ratings', 'Your star ratings', 'Stars on books you rated. Reviews always stay private.'],
];

/** Make, tune, copy or turn off your shareable shelf link. */
export function ShareDialog({ uid, defaultTitle, onClose, onToast }: Readonly<{ uid: string; defaultTitle: string; onClose: () => void; onToast: (m: string) => void }>) {
  const [link, setLink] = useState<ShareLink | null>();
  const [s, setS] = useState<ShareSettings>(DEFAULT_SHARE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notReady, setNotReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    getShareLink().then(
      (l) => {
        setLink(l);
        if (l) setS({ enabled: l.enabled, title: l.title, show_books: l.show_books, show_music: l.show_music, show_wishlist: l.show_wishlist, show_shelves: l.show_shelves, show_ratings: l.show_ratings });
      },
      (e) => (e instanceof ShareNotReady ? setNotReady(true) : setError((e as Error).message)),
    );
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (f: () => Promise<ShareLink>, done?: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const l = await f();
      setLink(l);
      setS((x) => ({ ...x, enabled: l.enabled }));
      if (done) onToast(done);
    } catch (e) {
      if (e instanceof ShareNotReady) setNotReady(true);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = (next: ShareSettings, done?: string) => {
    setS(next);
    return run(() => saveShareLink(uid, next), done);
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(shareUrl(link.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      (document.getElementById('share-url') as HTMLInputElement | null)?.select();
    }
  };
  const nothing = !s.show_books && !s.show_music && !s.show_wishlist;
  const changed = !!link && (Object.keys(DEFAULT_SHARE) as (keyof ShareSettings)[]).some((k) => link[k] !== s[k]);

  return (
    <div className="drawer-backdrop">
      <button type="button" className="backdrop-close" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <dialog open className="drawer narrow" aria-modal="true" aria-label="Share your shelves">
        <div className="drawer-form">
          <header className="drawer-head">
            <h2 className="drawer-heading">Share your shelves</h2>
            <button type="button" className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
          </header>
          <p className="muted">
            A link anyone can open, even without a Stacks account. They see only what you pick here, never prices, notes, loans or reviews. Your library stays private everywhere else.
          </p>
          {notReady ? (
            <p className="key-test bad">Shelf links need one more step on the server: run <code>supabase/11-share-links.sql</code> in Supabase's SQL Editor, then open this again.</p>
          ) : null}
          {!notReady && (link === undefined && !error) ? (
            <p className="muted">Loading…</p>
          ) : null}
          {!notReady && !(link === undefined && !error) ? <>
              {link?.enabled && (
                <div className="field">
                  <span>Your link</span>
                  <div className="search-row">
                    <input id="share-url" readOnly value={shareUrl(link.token)} onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="btn primary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                  </div>
                  <p className="hint share-hint">
                    <a href={shareUrl(link.token)} target="_blank" rel="noreferrer">Open it</a> to see what others see.
                  </p>
                </div>
              )}
              <label className="field">
                <span>Title</span>
                <input value={s.title} maxLength={80} placeholder={`${defaultTitle}’s shelves`} onChange={(e) => setS({ ...s, title: e.target.value })} />
              </label>
              <fieldset className="share-options">
                <legend className="section-label">Show</legend>
                {OPTIONS.map(([k, label, help]) => (
                  <label key={k} className="check share-option">
                    <input type="checkbox" aria-label={label} checked={!!s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />
                    <span>
                      <b>{label}</b>
                      <span className="muted small">{help}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {nothing && <p className="key-test bad">Pick at least books, records or your wishlist.</p>}
              {error && <p className="key-test bad">{error}</p>}
              {link?.enabled && (
                <div className="share-danger">
                  {confirmNew ? (
                    <>
                      <p className="small">The link you sent out stops working, and you get a new one to share.</p>
                      <div className="row-actions">
                        <button className="btn ghost" disabled={busy} onClick={() => { setConfirmNew(false); void run(() => newShareToken(uid), 'New link made. The old one no longer works.'); }}>Make a new link</button>
                        <button className="btn ghost" onClick={() => setConfirmNew(false)}>Keep this one</button>
                      </div>
                    </>
                  ) : (
                    <div className="row-actions">
                      <button className="link small" onClick={() => setConfirmNew(true)}>Make a new link…</button>
                      <button className="link small" disabled={busy} onClick={() => void save({ ...s, enabled: false }, 'Your shelf link is off. Nobody can open it now.')}>Turn the link off</button>
                    </div>
                  )}
                </div>
              )}
            </> : null}
          <footer className="drawer-foot">
            <button type="button" className="btn ghost" onClick={onClose}>Close</button>
            {!notReady && link !== undefined && (
              <button
                type="button"
                className="btn primary"
                disabled={busy || nothing || (!!link?.enabled && !changed)}
                onClick={() => void save({ ...s, enabled: true }, link?.enabled ? 'Saved. Your link shows the new choices.' : 'Your shelf link is ready. Copy it and send it to anyone.')}
              >
                {busy ? 'Saving…' : null}
                {!busy && link?.enabled ? 'Save' : null}
                {!busy && !link?.enabled && link ? 'Turn the link on' : null}
                {!busy && !link?.enabled && !link ? 'Make my link' : null}
              </button>
            )}
          </footer>
        </div>
      </dialog>
    </div>
  );
}
