import type { ApiResponse, RequestSnapshot, SnapshotMode } from '../types/request';

export type DriftKind = 'added' | 'removed' | 'type' | 'value';

export interface Drift {
  path: string;
  kind: DriftKind;
  oldVal?: string;
  newVal?: string;
}

export interface ContractResult {
  ok: boolean;
  mode: SnapshotMode;
  statusChanged: boolean;
  oldStatus: number;
  newStatus: number;
  added: number;
  removed: number;
  typeChanged: number;
  valueChanged: number;
  drifts: Drift[];
  summary: string;
}

const MAX_SNAPSHOT = 100_000;

function jsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function parseResponse(res: ApiResponse): unknown {
  if (typeof res.data === 'string') {
    try {
      return JSON.parse(res.data);
    } catch {
      return undefined;
    }
  }
  return res.data ?? undefined;
}

export function snapshotFromResponse(res: ApiResponse, mode: SnapshotMode): RequestSnapshot {
  const contentType = res.headers['content-type'] || '';
  let data = parseResponse(res);
  let serialized = '';
  try {
    serialized = data === undefined ? '' : JSON.stringify(data);
  } catch {
    serialized = '';
  }
  if (!serialized || serialized.length > MAX_SNAPSHOT) data = undefined;
  const raw = res.raw.length > MAX_SNAPSHOT ? res.raw.slice(0, MAX_SNAPSHOT) : res.raw;
  return { at: Date.now(), status: res.status, contentType, data, raw, mode };
}

function walk(oldVal: unknown, curVal: unknown, path: string, out: Drift[]): void {
  const to = jsonType(oldVal);
  const tc = jsonType(curVal);
  const label = path || '(root)';

  if (to !== tc) {
    out.push({ path: label, kind: 'type', oldVal: `${to}`, newVal: `${tc}` });
    return;
  }

  if (to === 'object') {
    const o = oldVal as Record<string, unknown>;
    const c = curVal as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(o), ...Object.keys(c)]));
    for (const k of keys) {
      const childPath = path ? `${path}.${k}` : k;
      const inOld = k in o;
      const inCur = k in c;
      if (inOld && !inCur) out.push({ path: childPath, kind: 'removed', oldVal: fmt(o[k]) });
      else if (!inOld && inCur) out.push({ path: childPath, kind: 'added', newVal: fmt(c[k]) });
      else walk(o[k], c[k], childPath, out);
    }
    return;
  }

  if (to === 'array') {
    const o = oldVal as unknown[];
    const c = curVal as unknown[];
    const len = Math.max(o.length, c.length);
    for (let i = 0; i < len; i++) {
      const childPath = `${path}[${i}]`;
      if (i >= c.length) out.push({ path: childPath, kind: 'removed', oldVal: fmt(o[i]) });
      else if (i >= o.length) out.push({ path: childPath, kind: 'added', newVal: fmt(c[i]) });
      else walk(o[i], c[i], childPath, out);
    }
    return;
  }

  if (JSON.stringify(oldVal) !== JSON.stringify(curVal)) {
    out.push({ path: label, kind: 'value', oldVal: fmt(oldVal), newVal: fmt(curVal) });
  }
}

function buildSummary(r: Omit<ContractResult, 'summary'>): string {
  if (r.ok) return 'Response khớp snapshot đã lưu.';
  const parts: string[] = [];
  if (r.statusChanged) parts.push(`trạng thái ${r.oldStatus} → ${r.newStatus}`);
  if (r.added) parts.push(`+${r.added} khóa mới`);
  if (r.removed) parts.push(`−${r.removed} khóa mất`);
  if (r.typeChanged) parts.push(`${r.typeChanged} kiểu đổi`);
  if (r.mode === 'strict' && r.valueChanged) parts.push(`${r.valueChanged} giá trị đổi`);
  return parts.length ? `Khác snapshot: ${parts.join(', ')}.` : 'Khác snapshot.';
}

export function compareSnapshot(snap: RequestSnapshot, res: ApiResponse): ContractResult {
  const statusChanged = snap.status !== res.status;
  const drifts: Drift[] = [];

  const curData = parseResponse(res);
  if (snap.data !== undefined && curData !== undefined) {
    walk(snap.data, curData, '', drifts);
  } else if (snap.raw !== res.raw) {
    drifts.push({ path: '(body)', kind: 'value', oldVal: '…', newVal: '…' });
  }

  const added = drifts.filter((d) => d.kind === 'added').length;
  const removed = drifts.filter((d) => d.kind === 'removed').length;
  const typeChanged = drifts.filter((d) => d.kind === 'type').length;
  const valueChanged = drifts.filter((d) => d.kind === 'value').length;

  const structuralIssues = added + removed + typeChanged;
  const ok =
    !statusChanged && (snap.mode === 'structural' ? structuralIssues === 0 : drifts.length === 0);

  const base = {
    ok,
    mode: snap.mode,
    statusChanged,
    oldStatus: snap.status,
    newStatus: res.status,
    added,
    removed,
    typeChanged,
    valueChanged,
    drifts,
  };
  return { ...base, summary: buildSummary(base) };
}
