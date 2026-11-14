/* Brand marks from public/assets/logos (thesvg.org), same pattern as traffic SourceMark. */

export function BrandLogo({ slug, className = 'brand-logo' }: { slug: string; className?: string }) {
  return <img className={className} src={`/assets/logos/${slug}.svg`} alt="" draggable={false} />;
}
