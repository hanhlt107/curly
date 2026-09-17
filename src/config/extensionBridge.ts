interface ChromeRuntime {
  id?: string;
  lastError?: { message?: string };
  sendMessage: (message: unknown, callback: (response: unknown) => void) => void;
}

interface ChromeApi {
  runtime?: ChromeRuntime;
}

declare const chrome: ChromeApi | undefined;

type SerializedBody =
  { kind: 'text'; value: string } | { kind: 'form'; entries: [string, string][] };

export interface ExtensionResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

export interface ExtensionRequestConfig {
  method?: string;
  url: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  data?: unknown;
}

function runtime(): ChromeRuntime | null {
  if (typeof chrome === 'undefined' || !chrome.runtime) return null;
  const rt = chrome.runtime;
  if (!rt.id || typeof rt.sendMessage !== 'function') return null;
  return rt;
}

let availability: Promise<boolean> | null = null;

export function isExtensionAvailable(): Promise<boolean> {
  const rt = runtime();
  if (!rt) return Promise.resolve(false);
  if (!availability) {
    availability = new Promise<boolean>((resolve) => {
      try {
        rt.sendMessage({ type: 'curly.ping' }, (response) => {
          if (rt.lastError) {
            resolve(false);
            return;
          }
          const r = response as { type?: string } | null;
          resolve(!!r && r.type === 'curly.pong');
        });
      } catch {
        resolve(false);
      }
    });
  }
  return availability;
}

function buildUrl(base: string, params?: Record<string, string>): string {
  if (!params) return base;
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  if (!qs) return base;
  return base + (base.includes('?') ? '&' : '?') + qs;
}

function serializeBody(data: unknown): SerializedBody | null {
  if (data == null) return null;
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    const entries: [string, string][] = [];
    data.forEach((value, key) => {
      entries.push([key, typeof value === 'string' ? value : String(value)]);
    });
    return { kind: 'form', entries };
  }
  if (typeof data === 'string') return { kind: 'text', value: data };
  return { kind: 'text', value: JSON.stringify(data) };
}

export function sendViaExtension(config: ExtensionRequestConfig): Promise<ExtensionResponse> {
  const rt = runtime();
  if (!rt) return Promise.reject(new Error('Extension curly không khả dụng'));
  const payload = {
    method: (config.method ?? 'GET').toUpperCase(),
    url: buildUrl(config.url, config.params),
    headers: config.headers ?? {},
    body: serializeBody(config.data),
  };
  return new Promise<ExtensionResponse>((resolve, reject) => {
    try {
      rt.sendMessage({ type: 'curly.request', payload }, (response) => {
        if (rt.lastError) {
          reject(new Error(rt.lastError.message || 'Lỗi kết nối tới extension'));
          return;
        }
        const r = response as { ok?: boolean; response?: ExtensionResponse; error?: string } | null;
        if (!r || !r.ok || !r.response) {
          reject(new Error((r && r.error) || 'Extension không trả về phản hồi'));
          return;
        }
        resolve(r.response);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
