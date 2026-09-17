import type {
  ApiRequest,
  ApiResponse,
  Collection,
  SavedRequest,
  WorkflowExtraction,
  WorkflowStep,
} from '../types/request';
import { findRequest } from './collections';
import { evalJsonPath } from './jsonpath';

export const VAR_RE = /\{\{\s*([\w.$:-]+)\s*\}\}/g;

export function coerce(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function resolveStep(step: WorkflowStep, collections: Collection[]): SavedRequest | null {
  const col = collections.find((c) => c.id === step.collectionId);
  if (col) {
    const r = findRequest(col, step.requestId);
    if (r) return r;
  }
  for (const c of collections) {
    const r = findRequest(c, step.requestId);
    if (r) return r;
  }
  return null;
}

export function referencedVars(req: ApiRequest): string[] {
  const text = [
    req.url,
    req.body,
    req.graphqlVars,
    req.auth.bearerToken,
    req.auth.basicUser,
    req.auth.basicPass,
    req.auth.apiKeyName,
    req.auth.apiKeyValue,
    ...req.params.flatMap((p) => [p.key, p.value]),
    ...req.headers.flatMap((h) => [h.key, h.value]),
    ...req.formData.flatMap((f) => [f.key, f.value]),
  ].join(' ');
  const out = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) out.add(m[1]);
  return [...out];
}

export function applyExtraction(
  ext: WorkflowExtraction,
  res: ApiResponse,
  vars: Record<string, string>,
): { value: string; ok: boolean } {
  const name = ext.varName.trim();
  if (!name) return { value: '', ok: false };
  if (ext.source === 'status') {
    const value = String(res.status);
    vars[name] = value;
    return { value, ok: true };
  }
  if (ext.source === 'header') {
    const key = ext.path.trim().toLowerCase();
    const hit = Object.entries(res.headers).find(([k]) => k.toLowerCase() === key);
    const value = hit ? hit[1] : '';
    vars[name] = value;
    return { value, ok: !!hit };
  }
  const r = evalJsonPath(ext.path, res.data);
  if (!r.ok || r.matches.length === 0) {
    vars[name] = '';
    return { value: '', ok: false };
  }
  const value = coerce(r.matches[0]);
  vars[name] = value;
  return { value, ok: true };
}
