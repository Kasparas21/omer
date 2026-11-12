import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

export function AuthGate({ children }: { children: (signOut: () => Promise<void>) => ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function checkSession() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/auth/get-session', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setSignedIn(Boolean(data?.user));
    } catch { setError('Unable to reach the server. Try again.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void checkSession();
    const expired = () => { setSignedIn(false); setError('Your session expired. Sign in again.'); };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/auth/${register ? 'sign-up' : 'sign-in'}/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fields.get('name'), email: fields.get('email'), password: fields.get('password') }),
      });
      if (!response.ok) { setError(register ? 'Unable to create your account. Check your details or try signing in.' : 'Unable to sign in. Check your email and password, then try again.'); return; }
      await checkSession();
    } catch { setError('Unable to reach the server. Try again.'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    const response = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('Sign out failed');
    setSignedIn(false);
  }
  if (loading) return <main className="auth-page"><p role="status">Loading your account…</p></main>;
  if (signedIn) return children(signOut);
  return <main className="auth-page"><section className="auth-card">
    <span className="auth-brand">Omer</span>
    <h1>{register ? 'Create your account' : 'Welcome back'}</h1>
    <p>{register ? 'Connect your website and confirm your first event.' : 'Sign in to manage your projects.'}</p>
    <form onSubmit={submit}>
      {register && <><label htmlFor="auth-name">Name</label><input id="auth-name" name="name" required maxLength={80} autoComplete="name" /></>}
      <label htmlFor="auth-email">Email</label><input id="auth-email" name="email" type="email" required maxLength={254} autoComplete="email" />
      <label htmlFor="auth-password">Password</label><input id="auth-password" name="password" type="password" required minLength={register ? 12 : undefined} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} aria-describedby={register ? 'password-hint' : undefined} />
      {register && <p id="password-hint">Use at least 12 characters.</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="button primary submit" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
    </form>
    <button className="button text-button auth-switch" disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
  </section></main>;
}
