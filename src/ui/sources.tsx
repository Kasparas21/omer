/* Traffic sources: one label + mark everywhere (Dashboard, Live, People), as in the product UI. */
export type SourceKey =
  | 'direct'
  | 'google'
  | 'instagram'
  | 'meta'
  | 'tiktok'
  | 'pinterest'
  | 'linkedin'
  | 'twitter'
  | 'reddit'
  | 'youtube'
  | 'email'
  | 'other';

const LABEL: Record<Exclude<SourceKey, 'other'>, string> = {
  direct: 'Direct',
  google: 'Google',
  instagram: 'Instagram',
  meta: 'Facebook',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  linkedin: 'LinkedIn',
  twitter: 'X / Twitter',
  reddit: 'Reddit',
  youtube: 'YouTube',
  email: 'Email',
};

export function sourceKey(referrer: string): SourceKey {
  const name = referrer.toLowerCase().replace(/^www\./, '');
  if (!name || name === '(direct)' || name === 'direct') return 'direct';
  if (name.includes('google') || name === 'bing.com' || name.includes('bing')) return 'google';
  if (name.includes('instagram') || name.startsWith('ig.') || name === 'l.instagram.com') return 'instagram';
  if (name.includes('facebook') || name === 'fb.com' || name.endsWith('.fb.com') || name.includes('meta') || name === 'fb') return 'meta';
  if (name.includes('tiktok') || name === 'vm.tiktok.com') return 'tiktok';
  if (name.includes('pinterest') || name === 'pin.it') return 'pinterest';
  if (name.includes('linkedin') || name === 'lnkd.in' || name === 'li') return 'linkedin';
  if (name.includes('twitter') || name === 't.co' || name === 'x.com' || name.endsWith('.x.com') || name === 'x') return 'twitter';
  if (name.includes('reddit') || name === 'redd.it') return 'reddit';
  if (name.includes('youtube') || name === 'youtu.be' || name.includes('youtu.be')) return 'youtube';
  if (name.includes('mail') || name.includes('email') || name.includes('newsletter')) return 'email';
  return 'other';
}

export function sourceLabel(referrer: string) {
  const key = sourceKey(referrer);
  if (key !== 'other') return LABEL[key];
  return referrer.replace(/^www\./, '');
}

/** How the visit arrived, the second line under the source on People. */
export function sourceKind(referrer: string) {
  const key = sourceKey(referrer);
  if (key === 'direct') return 'Typed or bookmarked';
  if (key === 'google') return 'Search';
  if (key === 'youtube') return 'Video';
  if (key === 'email') return 'Email';
  if (key === 'other') return 'Referral';
  return 'Social';
}

export function SourceMark({ referrer }: { referrer: string }) {
  const key = sourceKey(referrer);
  if (key === 'google' || key === 'instagram' || key === 'meta' || key === 'tiktok') {
    return <img className="brand-logo" src={`/assets/logos/${key}.svg`} alt="" draggable={false} />;
  }
  if (key === 'pinterest') {
    return (
      <svg viewBox="0 0 24 24" fill="#E60023" aria-hidden="true">
        <path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 .1-2.9.2-.8 1.4-5.4 1.4-5.4s-.3-.7-.3-1.7c0-1.6.9-2.8 2.1-2.8 1 0 1.5.7 1.5 1.6 0 1-.6 2.4-1 3.7-.3 1.1.4 2 1.5 2 1.8 0 3.1-2.3 3.1-5.1 0-2.1-1.4-3.7-4-3.7-2.9 0-4.7 2.1-4.7 4.5 0 .8.2 1.4.6 1.9l.1.2-.2.9c0 .2-.3.3-.5.2-1.5-.6-2.2-2.2-2.2-4 0-3 2.5-6.6 7.5-6.6 4 0 6.7 2.9 6.7 6 0 4.1-2.3 7.1-5.6 7.1-1.1 0-2.2-.6-2.5-1.3l-.7 2.6c-.2.8-.8 1.8-1.2 2.4A10 10 0 1 0 12 2z" />
      </svg>
    );
  }
  if (key === 'linkedin') {
    return (
      <svg viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
        <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.24 8.25h4.52V24H.24V8.25zM8.34 8.25h4.33v2.14h.06c.6-1.14 2.08-2.34 4.28-2.34 4.58 0 5.42 3.01 5.42 6.93V24h-4.52v-7.75c0-1.85-.03-4.22-2.57-4.22-2.57 0-2.96 2.01-2.96 4.09V24H8.34V8.25z" />
      </svg>
    );
  }
  if (key === 'twitter') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
      </svg>
    );
  }
  if (key === 'reddit') {
    return (
      <svg viewBox="0 0 24 24" fill="#FF4500" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="9.2" r="1.3" fill="#fff" />
        <circle cx="9.2" cy="13.2" r="1.15" fill="#fff" />
        <circle cx="14.8" cy="13.2" r="1.15" fill="#fff" />
        <path d="M9.2 13.5c.7 1.3 1.9 1.9 2.8 1.9s2.1-.6 2.8-1.9" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (key === 'youtube') {
    return (
      <svg viewBox="0 0 24 24" fill="#FF0000" aria-hidden="true">
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.75 15.5v-7l6.5 3.5-6.5 3.5z" />
      </svg>
    );
  }
  if (key === 'email') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7.5 8 5.5 8-5.5" />
      </svg>
    );
  }
  if (key === 'other') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </svg>
  );
}
