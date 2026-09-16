import type { ApiRequest, Collection, Folder, KeyValue, SavedRequest } from '../types/request';
import { blankRequest } from '../types/request';
import type { ImportResult } from './workspace';

type JObj = Record<string, unknown>;

function row(key = '', value = ''): KeyValue {
  return { id: crypto.randomUUID(), enabled: true, key, value };
}

function asObj(v: unknown): JObj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JObj) : {};
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function toStr(v: unknown): string {
  return v == null ? '' : String(v);
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function methodOf(v: unknown): ApiRequest['method'] {
  const m = toStr(v).toUpperCase();
  return (METHODS.includes(m) ? m : 'GET') as ApiRequest['method'];
}

function skipHeader(name: string): boolean {
  if (!name || name.startsWith(':')) return true;
  const lower = name.toLowerCase();
  return lower === 'content-length' || lower === 'host';
}

function buildRequest(harReq: JObj): { request: ApiRequest; host: string; path: string } | null {
  const url = toStr(harReq.url);
  if (!/^https?:\/\//i.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const req = blankRequest();
  req.method = methodOf(harReq.method);
  req.url = `${parsed.origin}${parsed.pathname}`;

  const params: KeyValue[] = [];
  const queryString = asArr(harReq.queryString);
  if (queryString.length) {
    for (const q of queryString) {
      const p = asObj(q);
      params.push(row(toStr(p.name), toStr(p.value)));
    }
  } else {
    parsed.searchParams.forEach((value, key) => params.push(row(key, value)));
  }
  if (params.length) req.params = [...params, row()];

  const headers: KeyValue[] = [];
  for (const h of asArr(harReq.headers)) {
    const ho = asObj(h);
    const name = toStr(ho.name);
    if (skipHeader(name)) continue;
    headers.push(row(name, toStr(ho.value)));
  }
  if (headers.length) req.headers = [...headers, row()];

  const postData = asObj(harReq.postData);
  if (Object.keys(postData).length) {
    const mime = toStr(postData.mimeType).toLowerCase();
    const text = toStr(postData.text);
    const paramsArr = asArr(postData.params);
    if (/urlencoded/.test(mime) || (paramsArr.length && !text)) {
      const fields = paramsArr.map((p) => {
        const po = asObj(p);
        return row(toStr(po.name), toStr(po.value));
      });
      if (fields.length) {
        req.bodyType = 'urlencoded';
        req.formData = [...fields, row()];
      } else if (text) {
        req.bodyType = 'urlencoded';
        req.body = text;
      }
    } else if (text) {
      req.bodyType = /json/.test(mime) ? 'json' : 'raw';
      req.body = text;
    }
  }

  return { request: req, host: parsed.host, path: parsed.pathname || '/' };
}

export function parseHar(text: string): ImportResult {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('File HAR không hợp lệ (không phải JSON).');
  }

  const log = asObj(asObj(doc).log);
  const entries = asArr(log.entries);
  if (!entries.length) {
    throw new Error('Không tìm thấy log.entries trong file HAR.');
  }

  const byHost = new Map<string, SavedRequest[]>();
  let count = 0;
  for (const raw of entries) {
    const entry = asObj(raw);
    const built = buildRequest(asObj(entry.request));
    if (!built) continue;
    const { request, host, path } = built;
    const saved: SavedRequest = {
      id: crypto.randomUUID(),
      name: `${request.method} ${path}`,
      request,
    };
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push(saved);
    count++;
  }

  if (!count) {
    throw new Error('Không có request http(s) nào trong file HAR.');
  }

  const folders: Folder[] = [...byHost.entries()].map(([host, requests]) => ({
    id: crypto.randomUUID(),
    name: host,
    requests,
    folders: [],
  }));

  const collection: Collection = {
    id: crypto.randomUUID(),
    name: `HAR import (${new Date().toISOString().slice(0, 10)})`,
    requests: [],
    folders,
  };

  return { collections: [collection], environments: [] };
}
