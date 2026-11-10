import { useEffect, useState } from 'react';
import type { Book } from '../types';
import { fetchDiscogsCollection, parseDiscogsCsv, planDiscogsImport, type DiscogsPlan } from '../lib/discogs';

interface Props {
  books: Book[];
  onImport: (plan: DiscogsPlan) => Promise<void>;
  onClose: () => void;
  /** Start on the wantlist instead of the collection. */
  wantlist?: boolean;
}

const USER_PREF = 'stacks.discogsUser';

export function DiscogsImport({ books, onImport, onClose, wantlist = false }: Readonly<Props>) {
  const [list, setList] = useState<'collection' | 'wants'>(wantlist ? 'wants' : 'collection');
  const wants = list === 'wants';
  const [how, setHow] = useState<'user' | 'csv'>('user');
  const [user, setUser] = useState(() => {
    try {
      return localStorage.getItem(USER_PREF) ?? '';
    } catch {
      return '';
    }
  });
  const [plan, setPlan] = useState<{ plan: DiscogsPlan; found: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const load = async () => {
    setError('');
    setPlan(null);
    setLoading('Asking Discogs…');
    try {
      const items = await fetchDiscogsCollection(user, (got, total) => setLoading(`Loaded ${got} of ${total} records…`), list);
      try {
        localStorage.setItem(USER_PREF, user.trim());
      } catch {
        /* only a convenience */
      }
      if (!items.length) throw new Error(wants ? 'That wantlist is empty.' : 'That collection is empty.');
      setPlan({ plan: planDiscogsImport(items, books, wants), found: items.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that collection.");
    } finally {
      setLoading('');
    }
  };

  const read = async (file: File) => {
    setError('');
    setPlan(null);
    try {
      const items = parseDiscogsCsv(await file.text());
      setPlan({ plan: planDiscogsImport(items, books, wants), found: items.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  const p = plan?.plan;
  const vinyl = p?.newBooks.filter((b) => b.kind === 'vinyl').length ?? 0;
  const cds = p?.newBooks.filter((b) => b.kind === 'cd').length ?? 0;

  return (
    <div className="drawer-backdrop">
      <button type="button" className="backdrop-close" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <dialog open className="drawer narrow" aria-modal="true" aria-label="Import from Discogs">
        <div className="drawer-form">
          <header className="drawer-head">
            <h2 className="drawer-heading">Import from Discogs</h2>
            <button type="button" className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
          </header>
          <p className="hint">
            Bring your Discogs collection into Stacks: your vinyl and CDs with their label, catalog number, condition and notes. Records you already have in Stacks are linked, not added twice.
          </p>

          <nav className="subtabs" aria-label="What to import">
            <button type="button" className={!wants ? 'active' : ''} onClick={() => { setList('collection'); setPlan(null); }}>My collection</button>
            <button type="button" className={wants ? 'active' : ''} onClick={() => { setList('wants'); setPlan(null); }}>My wantlist</button>
          </nav>

          <nav className="subtabs" aria-label="How to import">
            <button type="button" className={how === 'user' ? 'active' : ''} onClick={() => setHow('user')}>With my username</button>
            <button type="button" className={how === 'csv' ? 'active' : ''} onClick={() => setHow('csv')}>From a CSV file</button>
          </nav>

          {how === 'user' ? (
            <div className="discogs-how">
              <p className="small">
                Works when your collection is public (in Discogs: <b>Settings → Privacy</b>). For a private collection, add your Discogs token under <b>More → Lookup keys</b> first, or use the CSV file.
              </p>
              <div className="discogs-user">
                <input
                  id="discogs-user"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && user.trim() && !loading && load()}
                  placeholder="Your Discogs username"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="button" className="btn primary" onClick={load} disabled={!user.trim() || !!loading}>
                  {loading ? 'Loading…' : null}
                  {!loading && wants ? 'Load my wantlist' : null}
                  {!loading && !wants ? 'Load my collection' : null}
                </button>
              </div>
              {loading && <p className="muted small">{loading}</p>}
            </div>
          ) : (
            <div className="discogs-how">
              <p className="small">
                On discogs.com, open your <b>{wants ? 'Wantlist' : 'Collection'}</b>, press <b>Export</b> (top right), then download the .csv from the <b>Exports</b> page when it's ready.{' '}
                <a href="https://www.discogs.com/users/export" target="_blank" rel="noreferrer">Open the exports page</a>
              </p>
              <p className="muted small">The CSV has no covers, so Stacks fills them in afterwards in the background, one record at a time.</p>
              <input id="discogs-file" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
            </div>
          )}
          {error && <p className="form-error">{error}</p>}

          {plan && p && (
            <div className="import-summary">
              <p>
                Found <b>{plan.found.toLocaleString()}</b> releases in your Discogs {wants ? 'wantlist' : 'collection'}.
              </p>
              <ul>
                <li>
                  <b>{p.newBooks.length}</b> new {wants ? 'on your wantlist' : 'to Stacks'} ({vinyl} vinyl, {cds} CD{cds === 1 ? '' : 's'})
                </li>
                {p.updated.length > 0 && <li><b>{p.updated.length}</b> already in Stacks, {wants ? 'now on your wantlist' : 'now linked to Discogs (wanted ones move into your collection)'}</li>}
                {p.alreadyOwned.length > 0 && (
                  <li>
                    <b>{p.alreadyOwned.length}</b> you already own, so they stay off the wantlist:{' '}
                    <span className="muted">{p.alreadyOwned.slice(0, 5).map((b) => b.title).join(', ')}{p.alreadyOwned.length > 5 ? '…' : ''}</span>
                  </li>
                )}
                {p.unchanged > 0 && <li>{p.unchanged} already in Stacks, nothing to change</li>}
                {p.skipped.length > 0 && (
                  <li>
                    {p.skipped.length} skipped because they aren't vinyl or CDs{' '}
                    <button type="button" className="link small" onClick={() => setShowSkipped(!showSkipped)}>{showSkipped ? 'hide' : 'show'}</button>
                    {showSkipped && (
                      <ul className="skipped-list">
                        {p.skipped.slice(0, 50).map((x) => <li key={`${x.title}|${x.format}`}>{x.title} <span className="muted">({x.format})</span></li>)}
                      </ul>
                    )}
                  </li>
                )}
              </ul>
              {!wants && <p className="muted small">New records go to “Not on a bookcase”. You can place them on your shelves afterwards.</p>}
            </div>
          )}

          <footer className="drawer-foot">
            <button
              className="btn primary"
              type="button"
              disabled={!p || busy || p.newBooks.length + p.updated.length === 0}
              onClick={async () => {
                if (!p) return;
                setBusy(true);
                await onImport(p);
                setBusy(false);
              }}
            >
              {busy ? 'Importing…' : null}
              {!busy && p ? `Import ${p.newBooks.length + p.updated.length}` : null}
              {!busy && !p ? 'Import' : null}
            </button>
            <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          </footer>
        </div>
      </dialog>
    </div>
  );
}
