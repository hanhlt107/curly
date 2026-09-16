import type { ApiRequest, ApiResponse, KeyValue, MockMethod, MockRule } from '../types/request';
import { resolveVars } from './apiClient';

export function newMock(): MockRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    name: 'Mock mới',
    method: 'GET',
    urlPattern: '',
    status: 200,
    headers: [
      { id: crypto.randomUUID(), enabled: true, key: 'Content-Type', value: 'application/json' },
    ],
    body: '{\n  "message": "mocked"\n}',
    delayMs: 0,
  };
}

function stripQuery(url: string): string {
  return url.split('?')[0].split('#')[0];
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return stripQuery(url);
  }
}

function patternToRegex(pattern: string): RegExp {
  const body = stripQuery(pattern.trim())
    .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
    .replace(/:[A-Za-z0-9_]+/g, '[^/]+')
    .replace(/\*/g, '.*');
  return new RegExp('^' + body + '$');
}

function methodMatch(rule: MockMethod, method: string): boolean {
  return rule === 'ANY' || rule === method;
}

/** Tìm mock rule khớp method + URL của request (đã thay biến). */
export function matchMock(
  req: ApiRequest,
  mocks: MockRule[],
  vars: Record<string, string> = {},
): MockRule | null {
  const resolved = stripQuery(resolveVars(req.url, vars).trim());
  if (!resolved) return null;
  const path = pathOf(resolved);
  for (const rule of mocks) {
    if (!rule.enabled || !rule.urlPattern.trim()) continue;
    if (!methodMatch(rule.method, req.method)) continue;
    let re: RegExp;
    try {
      re = patternToRegex(rule.urlPattern);
    } catch {
      continue;
    }
    if (re.test(resolved) || re.test(path)) return rule;
  }
  return null;
}

function headersToRecord(list: KeyValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of list) {
    if (!h.enabled) continue;
    const k = h.key.trim();
    if (!k) continue;
    out[k] = h.value;
  }
  return out;
}

function byteSize(text: string): number {
  try {
    return new Blob([text]).size;
  } catch {
    return text.length;
  }
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/** Dựng ApiResponse giả từ một mock rule. */
export async function runMock(
  rule: MockRule,
  vars: Record<string, string> = {},
): Promise<ApiResponse> {
  const delay = Math.max(0, rule.delayMs || 0);
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  const raw = resolveVars(rule.body, vars);
  let data: unknown = raw;
  try {
    data = raw.trim() ? JSON.parse(raw) : '';
  } catch {
    data = raw;
  }
  const headers = headersToRecord(rule.headers);
  const resolvedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) resolvedHeaders[k] = resolveVars(v, vars);
  return {
    status: rule.status,
    statusText: STATUS_TEXT[rule.status] ?? '',
    durationMs: delay,
    sizeBytes: byteSize(raw),
    headers: resolvedHeaders,
    data,
    raw,
    mocked: true,
  };
}
