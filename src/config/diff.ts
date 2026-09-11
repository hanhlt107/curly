export type DiffKind = 'added' | 'removed' | 'changed' | 'same';

export interface DiffRow {
  path: string;
  kind: DiffKind;
  left?: string;
  right?: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function keysOf(v: unknown): string[] {
  if (isObject(v)) return Object.keys(v);
  if (Array.isArray(v)) return v.map((_, i) => String(i));
  return [];
}

function get(v: unknown, key: string): unknown {
  if (isObject(v)) return v[key];
  if (Array.isArray(v)) return v[Number(key)];
  return undefined;
}

function walk(left: unknown, right: unknown, path: string, out: DiffRow[]): void {
  const lLeaf = !isObject(left) && !Array.isArray(left);
  const rLeaf = !isObject(right) && !Array.isArray(right);

  if (lLeaf && rLeaf) {
    if (JSON.stringify(left) === JSON.stringify(right)) {
      out.push({ path, kind: 'same', left: fmt(left), right: fmt(right) });
    } else {
      out.push({ path, kind: 'changed', left: fmt(left), right: fmt(right) });
    }
    return;
  }

  if (JSON.stringify(left) === JSON.stringify(right)) {
    out.push({ path, kind: 'same', left: fmt(left), right: fmt(right) });
    return;
  }

  const keys = Array.from(new Set([...keysOf(left), ...keysOf(right)]));
  for (const k of keys) {
    const childPath = path ? `${path}.${k}` : k;
    const lHas = keysOf(left).includes(k);
    const rHas = keysOf(right).includes(k);
    if (lHas && !rHas) {
      out.push({ path: childPath, kind: 'removed', left: fmt(get(left, k)) });
    } else if (!lHas && rHas) {
      out.push({ path: childPath, kind: 'added', right: fmt(get(right, k)) });
    } else {
      walk(get(left, k), get(right, k), childPath, out);
    }
  }
}

export function diffValues(left: unknown, right: unknown): DiffRow[] {
  const out: DiffRow[] = [];
  walk(left, right, '', out);
  return out;
}

export function diffSummary(rows: DiffRow[]): { added: number; removed: number; changed: number } {
  return {
    added: rows.filter((r) => r.kind === 'added').length,
    removed: rows.filter((r) => r.kind === 'removed').length,
    changed: rows.filter((r) => r.kind === 'changed').length,
  };
}
