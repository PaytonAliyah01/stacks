import { useEffect, useState } from 'react';
import { getDiscogsToken, getGoogleKey, hasBuiltInGoogleKey, setDiscogsToken, setGoogleKey, testGoogleKey } from '../lib/lookup';

export function SettingsDialog({ onClose, onSaved }: Readonly<{ onClose: () => void; onSaved: () => void }>) {
  const [key, setKey] = useState(getGoogleKey());
  const [discogs, setDiscogs] = useState(getDiscogsToken());
  const [test, setTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'bad'; message?: string }>({ state: 'idle' });

  const runTest = async () => {
    setTest({ state: 'testing' });
    const problem = await testGoogleKey(key);
    setTest(problem ? { state: 'bad', message: problem } : { state: 'ok' });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer narrow" role="dialog" aria-modal="true" aria-label="Lookup keys">
        <form
          className="drawer-form"
          onSubmit={(e) => {
            e.preventDefault();
            setGoogleKey(key);
            setDiscogsToken(discogs);
            onSaved();
          }}
        >
          <header className="drawer-head">
            <h2 className="drawer-heading">Lookup keys</h2>
            <button type="button" className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
          </header>
          <h3 className="section-label">Books</h3>
          <label className="field">
            <span>Google Books API key</span>
            <div className="search-row">
              <input data-scan-input value={key} onChange={(e) => { setKey(e.target.value); setTest({ state: 'idle' }); }} placeholder="Optional" spellCheck={false} autoComplete="off" />
              <button type="button" className="btn ghost" onClick={runTest} disabled={!key.trim() || test.state === 'testing'}>
                {test.state === 'testing' ? 'Testing…' : 'Test key'}
              </button>
            </div>
            {test.state === 'ok' && <div className="key-test ok">The key works. Press Save.</div>}
            {test.state === 'bad' && <div className="key-test bad">{test.message}</div>}
            <span className="hint">
              {hasBuiltInGoogleKey() ? (
                <>
                  Stacks already has a Google Books key built in, so you don’t need to do anything here. Only add your own if book
                  lookups start saying Google’s daily limit is used up.
                </>
              ) : (
                <>
                  Without a key, Google shares one small daily limit between everyone, so lookups can fail even when Google has the
                  book. A free key gives you your own limit (1,000 lookups a day).
                </>
              )}
            </span>
          </label>
          <details className="settings-steps-wrap" open={!hasBuiltInGoogleKey() || undefined}>
            <summary className="muted small">How to get your own Google Books key</summary>
            <ol className="settings-steps">
              <li>
                Open{' '}
                <a href="https://console.cloud.google.com/apis/library/books.googleapis.com" target="_blank" rel="noreferrer">
                  Books API in Google Cloud
                </a>{' '}
                and sign in with your Google account. Create a project if it asks, then press <b>Enable</b>.
              </li>
              <li>
                Go to{' '}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Credentials</a>, choose{' '}
                <b>Create credentials → API key</b>, and copy the key.
              </li>
              <li>
                Click the key's name to edit it. Under <b>Application restrictions</b> choose <b>None</b> (or <b>Websites</b> with this
                site’s address). Under <b>API restrictions</b>, choose Books API. Save.
              </li>
              <li>Paste the key above, press <b>Test key</b>, then Save. It stays in this browser only.</li>
            </ol>
          </details>
          <h3 className="section-label">Records and CDs</h3>
          <label className="field">
            <span>Discogs personal token</span>
            <input data-scan-input value={discogs} onChange={(e) => setDiscogs(e.target.value)} placeholder="Optional" spellCheck={false} autoComplete="off" />
            <span className="hint">
              Discogs knows the most vinyl and CD pressings. Without a token, Stacks still looks records up on MusicBrainz, Deezer and iTunes.
            </span>
          </label>
          <ol className="settings-steps">
            <li>
              Sign in or make a free account at{' '}
              <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noreferrer">Discogs developer settings</a>.
            </li>
            <li>Press <b>Generate new token</b> and copy it.</li>
            <li>Paste it above and save. It stays in this browser only.</li>
          </ol>
          <footer className="drawer-foot">
            <button className="btn primary" type="submit">Save</button>
            <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
