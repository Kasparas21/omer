/* Traffic sources: one label + mark everywhere (Dashboard, Live, People), as in the UI kit. */
export type SourceKey = 'direct' | 'google' | 'instagram' | 'meta' | 'tiktok' | 'pinterest' | 'email' | 'other';

const LABEL: Record<Exclude<SourceKey, 'other'>, string> = {
  direct: 'Direct',
  google: 'Google',
  instagram: 'Instagram',
  meta: 'Facebook',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  email: 'Email',
};

export function sourceKey(referrer: string): SourceKey {
  const name = referrer.toLowerCase();
  if (!name || name === '(direct)') return 'direct';
  if (name.includes('google')) return 'google';
  if (name.includes('instagram') || name.startsWith('ig.') || name === 'l.instagram.com') return 'instagram';
  if (name.includes('facebook') || name === 'fb.com' || name.endsWith('.fb.com') || name.includes('meta')) return 'meta';
  if (name.includes('tiktok')) return 'tiktok';
  if (name.includes('pinterest') || name === 'pin.it') return 'pinterest';
  if (name.includes('mail')) return 'email';
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
