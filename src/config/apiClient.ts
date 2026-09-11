import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiRequest, ApiResponse, KeyValue, RequestError } from '../types/request';

const client = axios.create({
  timeout: 30000,
  validateStatus: () => true,
});

/** Thay {{var}} bằng giá trị trong environment. */
export function resolveVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, name: string) =>
    name in vars ? vars[name] : whole,
  );
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
  if (req.bodyType === 'none' || !req.body.trim()) return undefined;
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
): Promise<ApiResponse> {
  const headers = toRecord(req.headers, vars);
  const params = toRecord(req.params, vars);
  applyAuth(req, headers, params, vars);

  if (req.bodyType === 'json' && !headerHas(headers, 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  let data: unknown;
  try {
    data = parseBody(req, vars);
  } catch {
    throw errorOf('Body JSON không hợp lệ', 'Kiểm tra lại cú pháp JSON trong tab Body.');
  }

  const config: AxiosRequestConfig = {
    method: req.method,
    url: resolveVars(req.url, vars).trim(),
    params,
    headers,
    data,
  };

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
      ax.message + '. Có thể do URL sai, mất mạng, hoặc bị chặn CORS.',
    );
  }
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
