export interface JsonPathResult {
  ok: boolean;
  matches: unknown[];
  error?: string;
}

type Step =
  | { type: 'child'; name: string }
  | { type: 'index'; index: number }
  | { type: 'wildcard' }
  | { type: 'slice'; start: number | null; end: number | null }
  | { type: 'recurse'; name: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readName(expr: string, start: number): [string, number] {
  let i = start;
  while (i < expr.length && !'.[]'.includes(expr[i])) i++;
  return [expr.slice(start, i), i];
}

function parseBracket(inner: string, steps: Step[]): void {
  const trimmed = inner.trim();
  if (trimmed === '*') {
    steps.push({ type: 'wildcard' });
    return;
  }
  const quoted = /^'([^']*)'$/.exec(trimmed) || /^"([^"]*)"$/.exec(trimmed);
  if (quoted) {
    steps.push({ type: 'child', name: quoted[1] });
    return;
  }
  if (trimmed.includes(':')) {
    const [a, b] = trimmed.split(':');
    steps.push({
      type: 'slice',
      start: a.trim() === '' ? null : Number(a),
      end: b.trim() === '' ? null : Number(b),
    });
    return;
  }
  if (/^-?\d+$/.test(trimmed)) {
    steps.push({ type: 'index', index: Number(trimmed) });
    return;
  }
  steps.push({ type: 'child', name: trimmed });
}

function parse(expr: string): Step[] {
  const src = expr.trim();
  if (!src.startsWith('$')) throw new Error('Biểu thức phải bắt đầu bằng $');
  const steps: Step[] = [];
  let i = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '.') {
      if (src[i + 1] === '.') {
        i += 2;
        if (src[i] === '*') {
          steps.push({ type: 'recurse', name: '*' });
          i += 1;
        } else if (src[i] === '[') {
          const end = src.indexOf(']', i);
          if (end === -1) throw new Error('Thiếu dấu ]');
          const bracket: Step[] = [];
          parseBracket(src.slice(i + 1, end), bracket);
          const b = bracket[0];
          if (b.type === 'child') steps.push({ type: 'recurse', name: b.name });
          else throw new Error('Recursive descent chỉ hỗ trợ ..key');
          i = end + 1;
        } else {
          const [name, next] = readName(src, i);
          if (!name) throw new Error('Thiếu tên khóa sau ..');
          steps.push({ type: 'recurse', name });
          i = next;
        }
      } else {
        i += 1;
        if (src[i] === '*') {
          steps.push({ type: 'wildcard' });
          i += 1;
        } else {
          const [name, next] = readName(src, i);
          if (!name) throw new Error('Thiếu tên khóa sau .');
          steps.push({ type: 'child', name });
          i = next;
        }
      }
    } else if (c === '[') {
      const end = src.indexOf(']', i);
      if (end === -1) throw new Error('Thiếu dấu ]');
      parseBracket(src.slice(i + 1, end), steps);
      i = end + 1;
    } else {
      throw new Error(`Ký tự không hợp lệ: "${c}"`);
    }
  }
  return steps;
}

function collectAll(node: unknown, acc: unknown[]): void {
  acc.push(node);
  if (Array.isArray(node)) {
    for (const item of node) collectAll(item, acc);
  } else if (isObject(node)) {
    for (const value of Object.values(node)) collectAll(value, acc);
  }
}

function applyStep(nodes: unknown[], step: Step): unknown[] {
  const out: unknown[] = [];
  for (const node of nodes) {
    switch (step.type) {
      case 'child': {
        if (isObject(node) && step.name in node) out.push(node[step.name]);
        else if (Array.isArray(node) && /^\d+$/.test(step.name)) {
          const idx = Number(step.name);
          if (idx < node.length) out.push(node[idx]);
        }
        break;
      }
      case 'index': {
        if (Array.isArray(node)) {
          const idx = step.index < 0 ? node.length + step.index : step.index;
          if (idx >= 0 && idx < node.length) out.push(node[idx]);
        }
        break;
      }
      case 'wildcard': {
        if (Array.isArray(node)) out.push(...node);
        else if (isObject(node)) out.push(...Object.values(node));
        break;
      }
      case 'slice': {
        if (Array.isArray(node)) {
          const start = step.start ?? 0;
          const end = step.end ?? node.length;
          out.push(...node.slice(start, end));
        }
        break;
      }
      case 'recurse': {
        const all: unknown[] = [];
        collectAll(node, all);
        if (step.name === '*') {
          for (const n of all) {
            if (Array.isArray(n)) out.push(...n);
            else if (isObject(n)) out.push(...Object.values(n));
          }
        } else {
          for (const n of all) {
            if (isObject(n) && step.name in n) out.push(n[step.name]);
          }
        }
        break;
      }
    }
  }
  return out;
}

export function evalJsonPath(expr: string, data: unknown): JsonPathResult {
  if (!expr.trim()) return { ok: true, matches: [] };
  let steps: Step[];
  try {
    steps = parse(expr);
  } catch (e) {
    return { ok: false, matches: [], error: (e as Error).message };
  }
  let nodes: unknown[] = [data];
  for (const step of steps) nodes = applyStep(nodes, step);
  return { ok: true, matches: nodes };
}
