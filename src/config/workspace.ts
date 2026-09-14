import type { ApiRequest, Collection, Environment, KeyValue, SavedRequest } from '../types/request';
import { emptyAuth } from '../types/request';

export interface WorkspaceExport {
  app: 'curly';
  version: 1;
  exportedAt: number;
  collections: Collection[];
  environments: Environment[];
}

export function buildExport(collections: Collection[], environments: Environment[]): WorkspaceExport {
  return {
    app: 'curly',
    version: 1,
    exportedAt: Date.now(),
    collections,
    environments,
  };
}

function row(key = '', value = ''): KeyValue {
  return { id: crypto.randomUUID(), enabled: true, key, value };
}

function normalizeRequest(r: Partial<ApiRequest>): ApiRequest {
  return {
    method: r.method ?? 'GET',
    url: r.url ?? '',
    params: r.params?.length ? r.params : [row()],
    headers: r.headers?.length ? r.headers : [row()],
    bodyType: r.bodyType ?? 'none',
    body: r.body ?? '',
    formData: r.formData?.length ? r.formData : [row()],
    graphqlVars: r.graphqlVars ?? '',
    auth: { ...emptyAuth(), ...r.auth },
    tests: r.tests ?? '',
    preScript: r.preScript ?? '',
    postScript: r.postScript ?? '',
  };
}

export interface ImportResult {
  collections: Collection[];
  environments: Environment[];
}

interface PostmanUrl {
  raw?: string;
  query?: { key?: string; value?: string; disabled?: boolean }[];
}

interface PostmanItem {
  name?: string;
  request?: {
    method?: string;
    url?: string | PostmanUrl;
    header?: { key?: string; value?: string; disabled?: boolean }[];
    body?: { mode?: string; raw?: string };
    auth?: { type?: string; bearer?: { key?: string; value?: string }[] };
  };
  item?: PostmanItem[];
}

function postmanUrlToString(url?: string | PostmanUrl): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  return url.raw ?? '';
}

function postmanItemToSaved(item: PostmanItem): SavedRequest | null {
  if (!item.request) return null;
  const r = item.request;
  const headers = (r.header ?? [])
    .filter((h) => !h.disabled)
    .map((h) => row(h.key ?? '', h.value ?? ''));
  const auth = emptyAuth();
  if (r.auth?.type === 'bearer') {
    const tok = r.auth.bearer?.find((b) => b.key === 'token')?.value;
    if (tok) {
      auth.type = 'bearer';
      auth.bearerToken = tok;
    }
  }
  const raw = r.body?.raw ?? '';
  const request = normalizeRequest({
    method: (r.method ?? 'GET').toUpperCase() as ApiRequest['method'],
    url: postmanUrlToString(r.url),
    headers: headers.length ? headers : undefined,
    bodyType: raw ? 'raw' : 'none',
    body: raw,
    auth,
  });
  return { id: crypto.randomUUID(), name: item.name ?? request.url ?? 'Request', request };
}

function flattenPostman(items: PostmanItem[]): SavedRequest[] {
  const out: SavedRequest[] = [];
  for (const it of items) {
    if (it.item) out.push(...flattenPostman(it.item));
    else {
      const saved = postmanItemToSaved(it);
      if (saved) out.push(saved);
    }
  }
  return out;
}

function isCurlyExport(data: unknown): data is WorkspaceExport {
  return !!data && typeof data === 'object' && (data as { app?: string }).app === 'curly';
}

function isPostman(data: unknown): boolean {
  return (
    !!data &&
    typeof data === 'object' &&
    !!(data as { info?: { schema?: string } }).info &&
    Array.isArray((data as { item?: unknown[] }).item)
  );
}

export function parseWorkspace(json: string): ImportResult {
  const data = JSON.parse(json);

  if (isCurlyExport(data)) {
    return {
      collections: (data.collections ?? []).map((c) => ({
        ...c,
        id: crypto.randomUUID(),
        requests: (c.requests ?? []).map((sr) => ({
          id: crypto.randomUUID(),
          name: sr.name,
          request: normalizeRequest(sr.request),
        })),
      })),
      environments: (data.environments ?? []).map((e) => ({
        ...e,
        id: crypto.randomUUID(),
      })),
    };
  }

  if (isPostman(data)) {
    const info = (data as { info?: { name?: string } }).info;
    const items = (data as { item?: PostmanItem[] }).item ?? [];
    const collection: Collection = {
      id: crypto.randomUUID(),
      name: info?.name ?? 'Imported Collection',
      requests: flattenPostman(items),
    };
    return { collections: [collection], environments: [] };
  }

  throw new Error('File không đúng định dạng Curly hoặc Postman.');
}
