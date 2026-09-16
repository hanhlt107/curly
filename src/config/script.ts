import type { ApiResponse } from '../types/request';

export interface ScriptResult {
  vars: Record<string, string>;
  logs: string[];
  error?: string;
}

export const SCRIPT_PLACEHOLDER = `// Chạy trước khi gửi request.
// curly.get(name)         -> đọc biến
// curly.set(name, value)  -> ghi biến (lưu vào environment đang chọn)
// curly.vars              -> object tất cả biến
// console.log(...)        -> hiện trong log

// Ví dụ:
// curly.set('ts', Date.now());`;

export const POST_SCRIPT_PLACEHOLDER = `// Chạy sau khi nhận response.
// Có thêm curly.response = { status, body, headers }

// Ví dụ: lưu token từ response
// curly.set('token', curly.response.body.access_token);`;

function buildApi(vars: Record<string, string>, logs: string[], response?: ApiResponse) {
  const out: Record<string, string> = { ...vars };
  const api: Record<string, unknown> = {
    vars: out,
    get: (name: string) => out[name],
    set: (name: string, value: unknown) => {
      out[String(name)] = value == null ? '' : String(value);
    },
  };
  if (response) {
    let body: unknown = response.data;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        /* giữ nguyên string */
      }
    }
    api.response = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body,
    };
  }
  return { api, out, logs };
}

function runScript(
  code: string,
  vars: Record<string, string>,
  response?: ApiResponse,
): ScriptResult {
  const logs: string[] = [];
  if (!code.trim()) return { vars, logs };

  if (typeof window !== 'undefined' && window.location.protocol === 'chrome-extension:') {
    return {
      vars,
      logs,
      error:
        'Chrome chặn chạy script tùy chỉnh trong extension (chính sách MV3). Hãy mở bản web để dùng pre/post script.',
    };
  }

  const { api, out } = buildApi(vars, logs, response);
  const console = {
    log: (...args: unknown[]) =>
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
  };

  try {
    const fn = new Function('curly', 'console', code);
    fn(api, console);
    return { vars: out, logs };
  } catch (err) {
    return { vars: out, logs, error: (err as Error).message };
  }
}

export function runPreScript(code: string, vars: Record<string, string>): ScriptResult {
  return runScript(code, vars);
}

export function runPostScript(
  code: string,
  vars: Record<string, string>,
  response: ApiResponse,
): ScriptResult {
  return runScript(code, vars, response);
}

export const TOKEN_VAR = 'token';

const TOKEN_KEYS = [
  'access_token',
  'accessToken',
  'token',
  'idToken',
  'id_token',
  'jwt',
  'authToken',
];

function parsedBody(response: ApiResponse): unknown {
  let body: unknown = response.data;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return response.data;
    }
  }
  return body;
}

function findToken(node: unknown, depth = 0): string | undefined {
  if (node == null || depth > 4) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findToken(item, depth + 1);
      if (hit) return hit;
    }
    return undefined;
  }
  if (typeof node !== 'object') return undefined;
  const obj = node as Record<string, unknown>;
  for (const key of TOKEN_KEYS) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val;
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') {
      const hit = findToken(val, depth + 1);
      if (hit) return hit;
    }
  }
  return undefined;
}

export function autoExtractToken(
  vars: Record<string, string>,
  response: ApiResponse,
): ScriptResult {
  const logs: string[] = [];
  const existing = vars[TOKEN_VAR];
  if (existing && existing.trim()) return { vars, logs };

  const token = findToken(parsedBody(response));
  if (!token) return { vars, logs };

  logs.push(`⇢ ${TOKEN_VAR} = ${token.length > 60 ? token.slice(0, 60) + '…' : token}`);
  return { vars: { ...vars, [TOKEN_VAR]: token }, logs };
}
