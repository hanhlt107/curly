import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiRequest, ApiResponse, KeyValue, RequestError } from '../types/request';

const client = axios.create({
  timeout: 30000,
  validateStatus: () => true,
});

function toRecord(list: KeyValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of list) {
    if (!item.enabled) continue;
    const key = item.key.trim();
    if (!key) continue;
    out[key] = item.value;
  }
  return out;
}

function byteSize(data: unknown): number {
  try {
    if (data == null) return 0;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return new Blob([text]).size;
  } catch {
    return 0;
  }
}

function parseBody(req: ApiRequest): unknown {
  if (req.bodyType === 'none' || !req.body.trim()) return undefined;
  if (req.bodyType === 'json') {
    return JSON.parse(req.body);
  }
  return req.body;
}

export async function sendRequest(req: ApiRequest): Promise<ApiResponse> {
  const headers = toRecord(req.headers);
  if (req.bodyType === 'json' && !headerHas(headers, 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  let data: unknown;
  try {
    data = parseBody(req);
  } catch {
    throw errorOf('Body JSON không hợp lệ', 'Kiểm tra lại cú pháp JSON trong tab Body.');
  }

  const config: AxiosRequestConfig = {
    method: req.method,
    url: req.url.trim(),
    params: toRecord(req.params),
    headers,
    data,
  };

  const start = performance.now();
  try {
    const res = await client.request(config);
    const durationMs = Math.round(performance.now() - start);
    return {
      status: res.status,
      statusText: res.statusText,
      durationMs,
      sizeBytes: byteSize(res.data),
      headers: normalizeHeaders(res.headers),
      data: res.data,
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
