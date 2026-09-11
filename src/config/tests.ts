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

function evalLine(line: string, res: ApiResponse): TestResult | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

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
    return { name: `body chứa "${needle}"`, passed: ok, message: ok ? undefined : 'không tìm thấy' };
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

  const timeLt = trimmed.match(/^time\s*<\s*(\d+)$/i);
  if (timeLt) {
    const limit = Number(timeLt[1]);
    const ok = res.durationMs < limit;
    return {
      name: `time < ${limit}ms`,
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
time < 2000
body contains "id"
json data.id === 1`;
