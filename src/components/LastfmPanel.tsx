import { useEffect, useState } from 'react';
import { lastfmAuthUrl, lastfmStatus, pendingScrobbles, scrobblingOn, setScrobblingOn, unlinkLastfm } from '../lib/lastfm';

interface Props {
  signedIn: boolean;
  onSignIn: () => void;
  /** Changes whenever the queue may have changed, so the count stays fresh. */
  tick?: number;
}

/** Music → Listening: connect Last.fm so every spin is scrobbled. */
export function LastfmPanel({ signedIn, onSignIn, tick }: Readonly<Props>) {
  const [status, setStatus] = useState<{ apiKey: string; username: string | null }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(scrobblingOn);
  const [pending, setPending] = useState(pendingScrobbles);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    lastfmStatus()
      .then((s) => {
        if (!live) return;
        setStatus(s);
        setError('');
        // Linked on another device: nothing to switch on here until you say so.
        if (!s.username && scrobblingOn()) {
          setScrobblingOn(false);
          setOn(false);
        }
      })
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [signedIn, tick]);

  useEffect(() => {
    setPending(pendingScrobbles());
    setOn(scrobblingOn());
  }, [tick]);

  const toggle = (v: boolean) => {
    setScrobblingOn(v);
    setOn(v);
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      await unlinkLastfm();
      setScrobblingOn(false);
      setOn(false);
      setStatus((s) => s && { ...s, username: null });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <section className="panel lastfm-panel" aria-label="Last.fm">
      <div className="spins-head">
        <div>
          <h3>Last.fm</h3>
          <p className="muted small">Every record you spin goes to your Last.fm, track by track, timed as if you played the whole thing.</p>
        </div>
        <span className="lastfm-mark" aria-hidden="true">fm</span>
      </div>
      {!signedIn ? (
        <p className="lastfm-row">
          <span className="muted small">Sign in to Stacks to connect Last.fm.</span>
          <button className="btn small-btn" onClick={onSignIn}>Sign in</button>
        </p>
      ) : null}
{signedIn && error ? (
        <p className="muted small" role="status">{error}</p>
      ) : null}
{signedIn && !error && !status ? (
        <p className="muted small">Checking…</p>
      ) : null}
{signedIn && !error && status && status.username ? (
        <div className="lastfm-linked">
          <p className="lastfm-row">
            <span>
              Connected as{' '}
              <a href={`https://www.last.fm/user/${encodeURIComponent(status.username)}`} target="_blank" rel="noreferrer">
                {status.username}
              </a>
            </span>
            <button className="link small" onClick={() => void disconnect()} disabled={busy}>Disconnect</button>
          </p>
          <label className="check">
            <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
            <span>Scrobble spins from this device</span>
          </label>
          {pending > 0 && (
            <p className="muted small">
              {pending} track{pending === 1 ? '' : 's'} waiting to send. Tracks go out once they would have played, and catch up when you're back online.
            </p>
          )}
        </div>
      ) : null}
{signedIn && !error && status && !status.username ? <p className="lastfm-row">
          <span className="muted small">Not connected yet. Last.fm asks you to allow Stacks, then sends you back here.</span>
          <a className="btn primary small-btn" href={lastfmAuthUrl(status.apiKey)}>Connect Last.fm</a>
        </p> : null}
    </section>
  );
}
