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

  const { api, out } = buildApi(vars, logs, response);
  const console = {
    log: (...args: unknown[]) =>
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')),
  };

  try {
    // eslint-disable-next-line no-new-func
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
