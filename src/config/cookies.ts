import type { Cookie } from '../types/request';

export function newCookie(domain = ''): Cookie {
  return {
    id: crypto.randomUUID(),
    name: '',
    value: '',
    domain,
    path: '/',
    secure: false,
    httpOnly: false,
    enabled: true,
  };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return '/';
  }
}

function domainMatch(host: string, domain: string): boolean {
  const d = domain.trim().replace(/^\./, '').toLowerCase();
  if (!d) return false;
  return host === d || host.endsWith('.' + d);
}

function pathMatch(reqPath: string, cookiePath: string): boolean {
  const cp = (cookiePath || '/').trim() || '/';
  if (cp === '/') return true;
  if (reqPath === cp) return true;
  const prefix = cp.endsWith('/') ? cp : cp + '/';
  return reqPath.startsWith(prefix);
}

/** Lọc các cookie khớp domain/path (và scheme secure) của URL. */
export function matchCookies(url: string, cookies: Cookie[]): Cookie[] {
  const host = hostOf(url);
  if (!host) return [];
  const reqPath = pathOf(url);
  const secureScheme = /^(https|wss):/i.test(url.trim());
  return cookies.filter(
    (c) =>
      c.enabled &&
      c.name.trim() &&
      domainMatch(host, c.domain) &&
      pathMatch(reqPath, c.path) &&
      (!c.secure || secureScheme),
  );
}

export function buildCookieHeader(cookies: Cookie[]): string {
  return cookies
    .filter((c) => c.name.trim())
    .map((c) => `${c.name.trim()}=${c.value}`)
    .join('; ');
}

export function groupByDomain(cookies: Cookie[]): [string, Cookie[]][] {
  const map = new Map<string, Cookie[]>();
  for (const c of cookies) {
    const key = c.domain.trim() || '(chưa có domain)';
    const list = map.get(key) ?? [];
    list.push(c);
    map.set(key, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
