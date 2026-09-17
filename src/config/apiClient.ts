import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiRequest, ApiResponse, Cookie, KeyValue, RequestError } from '../types/request';
import { buildCookieHeader, matchCookies } from './cookies';
import { isDynamicVar, resolveDynamic } from './dynamicVars';
import { isExtensionAvailable, sendViaExtension } from './extensionBridge';

const client = axios.create({
  timeout: 30000,
  validateStatus: () => true,
});

const VAR_RE = /\{\{\s*([\w.$:-]+)\s*\}\}/g;

/** Thay {{var}} bằng giá trị trong environment. */
export function resolveVars(text: string, vars: Record<string, string>): string {
  return text.replace(VAR_RE, (whole, name: string) => {
    if (name in vars) return vars[name];
    const dyn = resolveDynamic(name);
    return dyn !== null ? dyn : whole;
  });
}

/** Tìm các biến {{x}} được dùng trong request nhưng chưa có trong environment. */
export function findUnresolvedVars(req: ApiRequest, vars: Record<string, string>): string[] {
  const found = new Set<string>();
  const scan = (text: string) => {
    if (!text) return;
    for (const m of text.matchAll(/\{\{\s*([\w.$:-]+)\s*\}\}/g)) {
      if (!(m[1] in vars) && !isDynamicVar(m[1])) found.add(m[1]);
    }
  };
  scan(req.url);
  scan(req.body);
  scan(req.graphqlVars);
  for (const list of [req.params, req.headers, req.formData]) {
    for (const item of list) {
      if (!item.enabled) continue;
      scan(item.key);
      scan(item.value);
    }
  }
  const { auth } = req;
  scan(auth.bearerToken);
  scan(auth.basicUser);
  scan(auth.basicPass);
  scan(auth.apiKeyName);
  scan(auth.apiKeyValue);
  return [...found];
}

export function envToRecord(vars: KeyValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of vars) {
    if (!v.enabled) continue;
    const k = v.key.trim();
    if (!k) continue;
    out[k] = v.value;
  }
  return out;
}

function toRecord(list: KeyValue[], vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of list) {
    if (!item.enabled) continue;
    const key = resolveVars(item.key, vars).trim();
    if (!key) continue;
    out[key] = resolveVars(item.value, vars);
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

function parseBody(req: ApiRequest, vars: Record<string, string>): unknown {
  if (req.bodyType === 'none') return undefined;

  if (req.bodyType === 'graphql') {
    const query = resolveVars(req.body, vars);
    if (!query.trim()) return undefined;
    let variables: unknown = undefined;
    if (req.graphqlVars.trim()) variables = JSON.parse(resolveVars(req.graphqlVars, vars));
    return variables !== undefined ? { query, variables } : { query };
  }

  if (req.bodyType === 'form' || req.bodyType === 'urlencoded') {
    const pairs = req.formData.filter((p) => p.enabled && p.key.trim());
    if (req.bodyType === 'urlencoded') {
      return pairs
        .map(
          (p) =>
            `${encodeURIComponent(resolveVars(p.key, vars))}=${encodeURIComponent(resolveVars(p.value, vars))}`,
        )
        .join('&');
    }
    const fd = new FormData();
    for (const p of pairs) fd.append(resolveVars(p.key, vars), resolveVars(p.value, vars));
    return fd;
  }

  if (!req.body.trim()) return undefined;
  const resolved = resolveVars(req.body, vars);
  if (req.bodyType === 'json') {
    return JSON.parse(resolved);
  }
  return resolved;
}

function applyAuth(
  req: ApiRequest,
  headers: Record<string, string>,
  params: Record<string, string>,
  vars: Record<string, string>,
) {
  const { auth } = req;
  const r = (s: string) => resolveVars(s, vars);
  switch (auth.type) {
    case 'bearer':
      if (auth.bearerToken.trim()) headers.Authorization = `Bearer ${r(auth.bearerToken).trim()}`;
      break;
    case 'basic': {
      const token = btoa(`${r(auth.basicUser)}:${r(auth.basicPass)}`);
      headers.Authorization = `Basic ${token}`;
      break;
    }
    case 'apikey': {
      const name = r(auth.apiKeyName).trim();
      if (!name) break;
      if (auth.apiKeyIn === 'header') headers[name] = r(auth.apiKeyValue);
      else params[name] = r(auth.apiKeyValue);
      break;
    }
  }
}

function toRawString(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export async function sendRequest(
  req: ApiRequest,
  vars: Record<string, string> = {},
  cookies: Cookie[] = [],
): Promise<ApiResponse> {
  const headers = toRecord(req.headers, vars);
  const params = toRecord(req.params, vars);
  applyAuth(req, headers, params, vars);

  const url = resolveVars(req.url, vars).trim();
  if (cookies.length && !headerHas(headers, 'cookie')) {
    const matched = matchCookies(url, cookies);
    if (matched.length) headers.Cookie = buildCookieHeader(matched);
  }

  if (!headerHas(headers, 'content-type')) {
    if (req.bodyType === 'json' || req.bodyType === 'graphql') {
      headers['Content-Type'] = 'application/json';
    } else if (req.bodyType === 'urlencoded') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  let data: unknown;
  try {
    data = parseBody(req, vars);
  } catch {
    throw errorOf('Body JSON không hợp lệ', 'Kiểm tra lại cú pháp JSON trong tab Body.');
  }

  const config: AxiosRequestConfig = {
    method: req.method,
    url,
    params,
    headers,
    data,
  };

  if (await isExtensionAvailable()) {
    try {
      const res = await sendViaExtension({ method: req.method, url, params, headers, data });
      const raw = res.body ?? '';
      return {
        status: res.status,
        statusText: res.statusText,
        durationMs: res.durationMs,
        sizeBytes: byteSize(raw),
        headers: normalizeHeaders(res.headers),
        data: parseResponseData(raw, res.headers),
        raw,
      };
    } catch (err) {
      const e = err as Error;
      throw errorOf('Không gọi được request', e.message || 'Lỗi khi gọi qua extension curly.');
    }
  }

  const start = performance.now();
  try {
    const res = await client.request(config);
    const durationMs = Math.round(performance.now() - start);
    const raw = toRawString(res.data);
    return {
      status: res.status,
      statusText: res.statusText,
      durationMs,
      sizeBytes: byteSize(raw),
      headers: normalizeHeaders(res.headers),
      data: res.data,
      raw,
    };
  } catch (err) {
    const ax = err as AxiosError;
    if (ax.code === 'ECONNABORTED') {
      throw errorOf('Request timeout', 'Server không phản hồi trong 30 giây.');
    }
    throw errorOf(
      'Không gọi được request',
      ax.message +
        '. Có thể do URL sai, mất mạng, hoặc bị chặn CORS. Cài đặt curly dạng extension để bỏ qua giới hạn CORS.',
    );
  }
}

function parseResponseData(raw: string, headers: Record<string, string>): unknown {
  const ct = Object.entries(headers)
    .find(([k]) => k.toLowerCase() === 'content-type')?.[1]
    ?.toLowerCase();
  if (ct && (ct.includes('application/json') || ct.includes('+json'))) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function headerHas(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === name);
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      out[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
  }
  return out;
}

function errorOf(message: string, detail?: string): RequestError {
  return { message, detail };
}
