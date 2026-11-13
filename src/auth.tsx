import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 13 24 13c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-1.1 3.1-3.6 5.5-6.5 6.8l.1.1 6.2 5.2C36.8 41.3 44 36 44 24c0-1.3-.1-2.7-.4-3.9z" />
    </svg>
  );
}

export function AuthGate({ children }: { children: (signOut: () => Promise<void>) => ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [googleAuth, setGoogleAuth] = useState(false);

  async function checkSession() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/get-session', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setSignedIn(Boolean(data?.user));
    } catch {
      setError('Unable to reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void checkSession();
    void fetch('/api/config', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setGoogleAuth(Boolean(data.googleAuth)); })
      .catch(() => undefined);
    const expired = () => {
      setSignedIn(false);
      setError('Your session expired. Sign in again.');
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${register ? 'sign-up' : 'sign-in'}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fields.get('name'),
          email: fields.get('email'),
          password: fields.get('password'),
        }),
      });
      if (!response.ok) {
        setError(register
          ? 'Unable to create your account. Check your details or try signing in.'
          : 'Unable to sign in. Check your email and password, then try again.');
        return;
      }
      await checkSession();
    } catch {
      setError('Unable to reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) {
        setError('Google sign-in is not available right now. Try email instead.');
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError('Unable to reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const response = await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error('Sign out failed');
    setSignedIn(false);
  }

  if (loading) {
    return <main className="auth-page"><p role="status">Loading your account…</p></main>;
  }
  if (signedIn) return children(signOut);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="auth-brand">Omer</span>
        <h1>{register ? 'Create your account' : 'Welcome back'}</h1>
        <p>{register ? 'Connect your website and confirm your first event.' : 'Sign in to manage your projects.'}</p>

        {googleAuth && (
          <>
            <button type="button" className="btn btn-secondary btn-block auth-google" disabled={busy} onClick={() => void continueWithGoogle()}>
              <GoogleMark /> Continue with Google
            </button>
            <div className="auth-divider" role="separator"><span>or</span></div>
          </>
        )}

        <form onSubmit={submit}>
          {register && (
            <div className="field">
              <label className="label" htmlFor="auth-name">Name</label>
              <input className="input" id="auth-name" name="name" required maxLength={80} autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="auth-email">Email</label>
            <input className="input" id="auth-email" name="email" type="email" required maxLength={254} autoComplete="email" />
          </div>
          <div className="field">
            <label className="label" htmlFor="auth-password">Password</label>
            <input
              className="input"
              id="auth-password"
              name="password"
              type="password"
              required
              minLength={register ? 12 : undefined}
              maxLength={128}
              autoComplete={register ? 'new-password' : 'current-password'}
              aria-describedby={register ? 'password-hint' : undefined}
            />
            {register && <p id="password-hint" className="hint">Use at least 12 characters.</p>}
          </div>
          {error && <p className="hint error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-ghost btn-block auth-switch"
          disabled={busy}
          onClick={() => { setRegister(!register); setError(''); }}
        >
          {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </section>
    </main>
  );
}
