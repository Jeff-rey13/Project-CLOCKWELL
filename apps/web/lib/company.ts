const STORAGE_KEY = 'company-slug';

/**
 * Local and preview: `?company=<slug>` is kept in sessionStorage.
 * Production: the subdomain of NEXT_PUBLIC_ROOT_DOMAIN is the slug.
 */
export function currentCompanySlug(): string {
  const fallback = process.env.NEXT_PUBLIC_DEFAULT_COMPANY ?? 'harbourline';
  if (typeof window === 'undefined') return fallback;

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const host = window.location.hostname;
  if (root && root !== 'localhost' && host.endsWith(`.${root}`)) {
    return host.slice(0, -(root.length + 1));
  }

  const fromQuery = new URLSearchParams(window.location.search).get('company');
  try {
    if (fromQuery) window.sessionStorage.setItem(STORAGE_KEY, fromQuery);
    return fromQuery ?? window.sessionStorage.getItem(STORAGE_KEY) ?? fallback;
  } catch {
    return fromQuery ?? fallback;
  }
}
