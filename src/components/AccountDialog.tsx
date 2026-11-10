import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Avatar } from './ProfileEditor';
import type { Profile } from '../lib/profile';
import { countOf } from '../lib/labels';
import { SITE_URL, pendingCount, signOut, supabase, syncNow, type SyncState } from '../lib/cloud';

interface Props {
  user: User | null;
  sync: SyncState;
  /** Opened from a "reset your password" email link. */
  recovering?: boolean;
  onClose: () => void;
  onSignedOut: () => void;
  profile?: Profile | null;
  onEditProfile?: () => void;
  onViewProfile?: () => void;
  /** Open on "Make an account" instead of "Sign in". */
  startMode?: 'signin' | 'signup';
}

type Mode = 'signin' | 'signup' | 'forgot';

const HEADINGS: Record<Mode, string> = { signup: 'Make an account', forgot: 'Forgot password', signin: 'Sign in' };
const SUBMIT_LABELS: Record<Mode, string> = { signup: 'Make my account', forgot: 'Send the link', signin: 'Sign in' };
const INTROS: Record<Mode, string> = {
  signup: 'An account keeps your library safe and the same on all your devices. It’s free.',
  forgot: 'Type your email and we’ll send you a link to choose a new password.',
  signin: 'Sign in to keep your library safe and the same on your phone and computer.',
};
const VISIBILITY: Record<string, string> = { public: 'anyone with the link', friends: 'friends only' };

function authMessage(e: { message?: string } | null | undefined): string {
  const m = e?.message ?? '';
  if (/invalid login credentials/i.test(m)) return 'That email and password don’t match. Check them, or press “Forgot password”.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: open the email from Stacks and press the link.';
  if (/already registered|already exists/i.test(m)) return 'There’s already an account with this email. Sign in instead.';
  if (/password should be|at least 6/i.test(m)) return 'Your password needs at least 6 characters.';
  if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/fetch|network/i.test(m)) return 'No internet connection. Try again when you’re online.';
  return m || 'Something went wrong. Try again.';
}

export function syncLabel(s: SyncState): string {
  switch (s.kind) {
    case 'off':
      return 'Not signed in';
    case 'syncing':
      return 'Syncing…';
    case 'synced':
      return Date.now() - Date.parse(s.at) < 60_000 ? 'Synced just now' : `Synced at ${new Date(s.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    case 'offline':
      return s.pending ? `Offline · ${countOf(s.pending, 'change')} to send` : 'Offline';
    case 'error':
      return 'Sync problem';
  }
}

export function AccountDialog({ user, sync, recovering, onClose, onSignedOut, profile, onEditProfile, onViewProfile, startMode }: Readonly<Props>) {
  const [mode, setMode] = useState<Mode>(startMode ?? 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [confirmOut, setConfirmOut] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    try {
      await fn();
    } catch (e) {
      setError(authMessage(e as Error));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (recovering) {
      return run(async () => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setInfo('Your new password is saved.');
        setPassword('');
      });
    }
    if (mode === 'forgot') {
      return run(async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: SITE_URL });
        if (error) throw error;
        setInfo('Check your email for a link to choose a new password.');
      });
    }
    if (mode === 'signup') {
      return run(async () => {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: SITE_URL } });
        if (error) throw error;
        if (!data.session) setInfo(`Almost done. We sent an email to ${email.trim()}. Press the link in it, then sign in here.`);
      });
    }
    return run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    });
  };

  const doSignOut = (keepCopy: boolean) =>
    run(async () => {
      await signOut(keepCopy);
      onSignedOut();
    });

  return (
    <div className="drawer-backdrop">
      <button type="button" className="backdrop-close" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <dialog open className="drawer narrow" aria-modal="true" aria-label="Account">
        <form className="drawer-form account-form" onSubmit={submit}>
          <header className="drawer-head">
            <h2 className="drawer-heading">{user ? 'Your account' : HEADINGS[mode]}</h2>
            <button type="button" className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
          </header>

          {user && recovering && (
            <>
              <p>Choose a new password for {user.email}.</p>
              <label className="field">
                <span>New password</span>
                <input id="acct-new-password" type="password" autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <button type="submit" className="btn primary" disabled={busy || password.length < 6}>{busy ? 'Saving…' : 'Save new password'}</button>
            </>
          )}
          {user && !recovering && (
            <>
              <div className="account-card">
                <span className="stat-label">Signed in as</span>
                <strong className="account-email">{user.email}</strong>
                <span className={`sync-pill ${sync.kind}`}>
                  <span className="dot" /> {syncLabel(sync)}
                </span>
                {sync.kind === 'error' && <p className="muted small">{sync.message}</p>}
              </div>
              <div className="account-profile">
                {profile ? (
                  <>
                    <Avatar p={profile} size={48} />
                    <span className="account-profile-text">
                      <strong>{profile.display_name || `@${profile.username}`}</strong>
                      <span className="muted small">@{profile.username} · {VISIBILITY[profile.visibility] ?? 'only you'}</span>
                    </span>
                    <span className="account-actions">
                      <button type="button" className="btn small-btn" onClick={onViewProfile}>View</button>
                      <button type="button" className="btn ghost small-btn" onClick={onEditProfile}>Edit</button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="account-profile-text">
                      <strong>Make your profile</strong>
                      <span className="muted small">Pick a username and picture, and show off your top 4 books and records.</span>
                    </span>
                    <button type="button" className="btn primary small-btn" onClick={onEditProfile}>Set up</button>
                  </>
                )}
              </div>
              <p className="muted small">
                Your library is saved in your account and on this device. Sign in on your phone or another computer with the same email and it all shows up there too.
                Changes made offline are sent as soon as you’re back online.
              </p>
              <div className="account-actions">
                <button type="button" className="btn" onClick={() => void syncNow()} disabled={sync.kind === 'syncing'}>Sync now</button>
                {!confirmOut && <button type="button" className="btn ghost" onClick={() => setConfirmOut(true)}>Sign out</button>}
              </div>
              {confirmOut && (
                <div className="account-signout">
                  <p>Signing out on a phone or computer that other people use? Take your library off it too. It stays safe in your account.</p>
                  <div className="account-actions">
                    <button type="button" className="btn primary" disabled={busy} onClick={() => doSignOut(false)}>Sign out and remove from this device</button>
                    <button type="button" className="btn ghost" disabled={busy} onClick={() => doSignOut(true)}>Sign out, keep a copy here</button>
                    <button type="button" className="link small" onClick={() => setConfirmOut(false)}>Cancel</button>
                  </div>
                  {pendingCount() > 0 && <p className="muted small">{pendingCount()} change{pendingCount() === 1 ? ' is' : 's are'} still waiting to be sent.</p>}
                </div>
              )}
            </>
          )}
          {!user && (
            <>
              <p className="muted">
{INTROS[mode]}
              </p>
              <label className="field">
                <span>Email</span>
                <input id="acct-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              {mode !== 'forgot' && (
                <label className="field">
                  <span>Password</span>
                  <input
                    id="acct-password"
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  {mode === 'signup' && <span className="hint">At least 6 characters.</span>}
                </label>
              )}
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? 'One moment…' : SUBMIT_LABELS[mode]}
              </button>
              <div className="account-switch">
                {mode === 'signin' ? (
                  <>
                    <button type="button" className="link small" onClick={() => setMode('signup')}>New here? Make an account</button>
                    <button type="button" className="link small" onClick={() => setMode('forgot')}>Forgot password</button>
                  </>
                ) : (
                  <button type="button" className="link small" onClick={() => setMode('signin')}>I already have an account</button>
                )}
              </div>
              {mode === 'signup' && (
                <p className="muted small">The books, records and reading history already on this device go into your new account.</p>
              )}
            </>
          )}
          {error && <p className="account-error" role="alert">{error}</p>}
          {info && <p className="account-info" role="status">{info}</p>}
        </form>
      </dialog>
    </div>
  );
}
