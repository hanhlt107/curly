import type { ApiRequest, HttpMethod, KeyValue } from '../types/request';
import { emptyAuth } from '../types/request';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function row(key: string, value: string): KeyValue {
  return { id: crypto.randomUUID(), enabled: true, key, value };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const s = input.replace(/\\\r?\n/g, ' ').trim();
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let buf = '';
      while (i < s.length && s[i] !== quote) {
        if (s[i] === '\\' && quote === '"' && i + 1 < s.length) {
          buf += s[i + 1];
          i += 2;
        } else {
          buf += s[i];
          i++;
        }
      }
      i++;
      tokens.push(buf);
    } else {
      let buf = '';
      while (i < s.length && !/\s/.test(s[i])) {
        if (s[i] === '\\' && i + 1 < s.length) {
          buf += s[i + 1];
          i += 2;
        } else if (s[i] === '"' || s[i] === "'") {
          const quote = s[i];
          i++;
          while (i < s.length && s[i] !== quote) {
            buf += s[i];
            i++;
          }
          i++;
        } else {
          buf += s[i];
          i++;
        }
      }
      tokens.push(buf);
    }
  }
  return tokens;
}

export function parseCurl(input: string): ApiRequest {
  const tokens = tokenize(input);
  if (tokens[0] === 'curl') tokens.shift();

  let url = '';
  let method: HttpMethod | '' = '';
  const headers: KeyValue[] = [];
  let body = '';
  const auth = emptyAuth();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => tokens[++i] ?? '';

    if (t === '-X' || t === '--request') {
      const m = next().toUpperCase();
      if ((METHODS as string[]).includes(m)) method = m as HttpMethod;
    } else if (t === '-H' || t === '--header') {
      const h = next();
      const idx = h.indexOf(':');
      if (idx > -1) {
        const k = h.slice(0, idx).trim();
        const v = h.slice(idx + 1).trim();
        if (k.toLowerCase() === 'authorization' && /^bearer\s+/i.test(v)) {
          auth.type = 'bearer';
          auth.bearerToken = v.replace(/^bearer\s+/i, '');
        } else {
          headers.push(row(k, v));
        }
      }
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary') {
      body += (body ? '&' : '') + next();
    } else if (t === '-u' || t === '--user') {
      const creds = next();
      const idx = creds.indexOf(':');
      auth.type = 'basic';
      auth.basicUser = idx > -1 ? creds.slice(0, idx) : creds;
      auth.basicPass = idx > -1 ? creds.slice(idx + 1) : '';
    } else if (t === '--url') {
      url = next();
    } else if (t === '-A' || t === '--user-agent') {
      headers.push(row('User-Agent', next()));
    } else if (t === '-b' || t === '--cookie') {
      headers.push(row('Cookie', next()));
    } else if (t === '-G' || t === '--get') {
      method = 'GET';
    } else if (t === '-I' || t === '--head') {
      method = 'HEAD';
    } else if (t.startsWith('-')) {
      if (!t.startsWith('--') && t.length > 2 && /^-[a-zA-Z]/.test(t)) continue;
    } else if (!url) {
      url = t;
    }
  }

  const hasJson = headers.some(
    (h) => h.key.toLowerCase() === 'content-type' && /application\/json/i.test(h.value),
  );
  let bodyType: ApiRequest['bodyType'] = 'none';
  if (body) {
    bodyType = 'raw';
    if (hasJson || /^\s*[[{]/.test(body)) {
      try {
        JSON.parse(body);
        bodyType = 'json';
      } catch {
        bodyType = 'raw';
      }
    }
  }

  if (!method) method = body ? 'POST' : 'GET';

  let params: KeyValue[] = [];
  const qIdx = url.indexOf('?');
  if (qIdx > -1) {
    const qs = url.slice(qIdx + 1);
    url = url.slice(0, qIdx);
    params = qs
      .split('&')
      .filter(Boolean)
      .map((pair) => {
        const eq = pair.indexOf('=');
        const k = eq > -1 ? pair.slice(0, eq) : pair;
        const v = eq > -1 ? pair.slice(eq + 1) : '';
        return row(decodeURIComponent(k), decodeURIComponent(v));
      });
  }

  return { method, url, params, headers, bodyType, body, auth, tests: '' };
}

function quote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function buildUrl(req: ApiRequest): string {
  const enabled = req.params.filter((p) => p.enabled && p.key.trim());
  if (!enabled.length) return req.url;
  const qs = enabled
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  return req.url.includes('?') ? `${req.url}&${qs}` : `${req.url}?${qs}`;
}

function authHeaders(req: ApiRequest): KeyValue[] {
  const out: KeyValue[] = [];
  const { auth } = req;
  if (auth.type === 'bearer' && auth.bearerToken.trim()) {
    out.push(row('Authorization', `Bearer ${auth.bearerToken.trim()}`));
  } else if (auth.type === 'apikey' && auth.apiKeyIn === 'header' && auth.apiKeyName.trim()) {
    out.push(row(auth.apiKeyName.trim(), auth.apiKeyValue));
  }
  return out;
}

export function toCurl(req: ApiRequest): string {
  const lines: string[] = [];
  const first = req.method !== 'GET' ? `curl -X ${req.method} ${quote(buildUrl(req))}` : `curl ${quote(buildUrl(req))}`;
  lines.push(first);

  const headers = [...req.headers.filter((h) => h.enabled && h.key.trim()), ...authHeaders(req)];
  for (const h of headers) {
    lines.push(`-H ${quote(`${h.key}: ${h.value}`)}`);
  }
  if (req.auth.type === 'basic') {
    lines.push(`-u ${quote(`${req.auth.basicUser}:${req.auth.basicPass}`)}`);
  }
  if (req.bodyType !== 'none' && req.body.trim()) {
    lines.push(`--data-raw ${quote(req.body)}`);
  }

  return lines.join(' \\\n  ');
}
