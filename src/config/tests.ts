import type { ApiResponse } from '../types/request';

export interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

function getPath(data: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = data;
  for (const p of parts) {
    if (cur == null) return undefined;
    const arrMatch = p.match(/^(\w+)\[(\d+)\]$/);
    if (arrMatch) {
      cur = (cur as Record<string, unknown>)[arrMatch[1]];
      if (Array.isArray(cur)) cur = cur[Number(arrMatch[2])];
      continue;
    }
    if (/^\d+$/.test(p) && Array.isArray(cur)) {
      cur = cur[Number(p)];
    } else {
      cur = (cur as Record<string, unknown>)[p];
    }
  }
  return cur;
}

function cmp(a: number, op: string, b: number): boolean {
  switch (op) {
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    default:
      return a === b;
  }
}

function evalLine(line: string, res: ApiResponse): TestResult | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const statusCmp = trimmed.match(/^status\s*(>=|<=|>|<)\s*(\d+)$/i);
  if (statusCmp) {
    const limit = Number(statusCmp[2]);
    const ok = cmp(res.status, statusCmp[1], limit);
    return {
      name: `status ${statusCmp[1]} ${limit}`,
      passed: ok,
      message: ok ? undefined : `nhận ${res.status}`,
    };
  }

  const statusEq = trimmed.match(/^status\s*(===?|!=)\s*(\d+)$/i);
  if (statusEq) {
    const expected = Number(statusEq[2]);
    const neg = statusEq[1] === '!=';
    const ok = neg ? res.status !== expected : res.status === expected;
    return {
      name: `status ${statusEq[1]} ${expected}`,
      passed: ok,
      message: ok ? undefined : `nhận ${res.status}`,
    };
  }

  const contains = trimmed.match(/^body\s+contains\s+(.+)$/i);
  if (contains) {
    const needle = contains[1].replace(/^["']|["']$/g, '');
    const ok = res.raw.includes(needle);
    return {
      name: `body chứa "${needle}"`,
      passed: ok,
      message: ok ? undefined : 'không tìm thấy',
    };
  }

  const bodyMatch = trimmed.match(/^body\s+matches\s+\/(.+)\/([a-z]*)$/i);
  if (bodyMatch) {
    let ok = false;
    let msg: string | undefined = 'không khớp';
    try {
      ok = new RegExp(bodyMatch[1], bodyMatch[2]).test(res.raw);
    } catch {
      msg = 'regex không hợp lệ';
    }
    return { name: `body khớp /${bodyMatch[1]}/`, passed: ok, message: ok ? undefined : msg };
  }

  const header = trimmed.match(/^header\s+([\w-]+)\s*(===?|!=|contains)\s*(.+)$/i);
  if (header) {
    const actual = res.headers[header[1].toLowerCase()] ?? '';
    const expected = header[3].trim().replace(/^["']|["']$/g, '');
    const op = header[2].toLowerCase();
    const ok =
      op === 'contains'
        ? actual.toLowerCase().includes(expected.toLowerCase())
        : op === '!='
          ? actual !== expected
          : actual === expected;
    return {
      name: `header ${header[1]} ${op} ${expected}`,
      passed: ok,
      message: ok ? undefined : `nhận "${actual}"`,
    };
  }

  const jsonCmp = trimmed.match(/^json\s+([\w.[\]]+)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/i);
  if (jsonCmp) {
    const actual = getPath(res.data, jsonCmp[1]);
    const num = Number(actual);
    const ok = !Number.isNaN(num) && cmp(num, jsonCmp[2], Number(jsonCmp[3]));
    return {
      name: `json ${jsonCmp[1]} ${jsonCmp[2]} ${jsonCmp[3]}`,
      passed: ok,
      message: ok ? undefined : `nhận ${JSON.stringify(actual)}`,
    };
  }

  const jsonEq = trimmed.match(/^json\s+([\w.[\]]+)\s*(===?|!=)\s*(.+)$/i);
  if (jsonEq) {
    const actual = getPath(res.data, jsonEq[1]);
    let expected: unknown = jsonEq[3].trim().replace(/^["']|["']$/g, '');
    if (/^\d+(\.\d+)?$/.test(jsonEq[3].trim())) expected = Number(jsonEq[3].trim());
    else if (jsonEq[3].trim() === 'true') expected = true;
    else if (jsonEq[3].trim() === 'false') expected = false;
    const neg = jsonEq[2] === '!=';
    const eq = actual === expected || String(actual) === String(expected);
    const ok = neg ? !eq : eq;
    return {
      name: `json ${jsonEq[1]} ${jsonEq[2]} ${jsonEq[3].trim()}`,
      passed: ok,
      message: ok ? undefined : `nhận ${JSON.stringify(actual)}`,
    };
  }

  const timeCmp = trimmed.match(/^time\s*(>=|<=|>|<)\s*(\d+)$/i);
  if (timeCmp) {
    const limit = Number(timeCmp[2]);
    const ok = cmp(res.durationMs, timeCmp[1], limit);
    return {
      name: `time ${timeCmp[1]} ${limit}ms`,
      passed: ok,
      message: ok ? undefined : `mất ${res.durationMs}ms`,
    };
  }

  return { name: trimmed, passed: false, message: 'không hiểu cú pháp' };
}

export function runTests(script: string, res: ApiResponse): TestResult[] {
  return script
    .split('\n')
    .map((line) => evalLine(line, res))
    .filter((r): r is TestResult => r !== null);
}

export const TEST_PLACEHOLDER = `status === 200
status < 400
time < 2000
body contains "id"
body matches /"id":\\s*\\d+/
header content-type contains json
json data.id === 1
json data.count > 0`;
