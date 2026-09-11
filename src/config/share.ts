import type { ApiRequest } from '../types/request';
import { emptyAuth } from '../types/request';

interface SharePayload {
  m: string;
  u: string;
  p?: [string, string][];
  h?: [string, string][];
  bt?: string;
  b?: string;
  gv?: string;
  fd?: [string, string][];
  a?: ApiRequest['auth'];
  t?: string;
}

function toBase64Url(str: string): string {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  return decodeURIComponent(escape(atob(b64 + pad)));
}

function pairs(list: ApiRequest['params']): [string, string][] {
  return list.filter((x) => x.enabled && x.key.trim()).map((x): [string, string] => [x.key, x.value]);
}

function unpairs(list?: [string, string][]): ApiRequest['params'] {
  const rows = (list ?? []).map(([key, value]) => ({
    id: crypto.randomUUID(),
    enabled: true,
    key,
    value,
  }));
  rows.push({ id: crypto.randomUUID(), enabled: true, key: '', value: '' });
  return rows;
}

export function encodeRequest(req: ApiRequest): string {
  const payload: SharePayload = { m: req.method, u: req.url };
  const p = pairs(req.params);
  const h = pairs(req.headers);
  const fd = pairs(req.formData);
  if (p.length) payload.p = p;
  if (h.length) payload.h = h;
  if (req.bodyType !== 'none') payload.bt = req.bodyType;
  if (req.body.trim()) payload.b = req.body;
  if (req.graphqlVars.trim()) payload.gv = req.graphqlVars;
  if (fd.length) payload.fd = fd;
  if (req.auth.type !== 'none') payload.a = req.auth;
  if (req.tests.trim()) payload.t = req.tests;
  return toBase64Url(JSON.stringify(payload));
}

export function decodeRequest(encoded: string): ApiRequest {
  const payload = JSON.parse(fromBase64Url(encoded)) as SharePayload;
  return {
    method: (payload.m ?? 'GET') as ApiRequest['method'],
    url: payload.u ?? '',
    params: unpairs(payload.p),
    headers: unpairs(payload.h),
    bodyType: (payload.bt ?? 'none') as ApiRequest['bodyType'],
    body: payload.b ?? '',
    formData: unpairs(payload.fd),
    graphqlVars: payload.gv ?? '',
    auth: { ...emptyAuth(), ...payload.a },
    tests: payload.t ?? '',
  };
}

export function buildShareLink(req: ApiRequest): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#r=${encodeRequest(req)}`;
}

export function readSharedRequest(): ApiRequest | null {
  const hash = location.hash;
  const match = hash.match(/[#&]r=([^&]+)/);
  if (!match) return null;
  try {
    return decodeRequest(match[1]);
  } catch {
    return null;
  }
}
