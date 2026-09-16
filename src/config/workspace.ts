import type {
  ApiRequest,
  Collection,
  Environment,
  Folder,
  KeyValue,
  SavedRequest,
} from '../types/request';
import { emptyAuth } from '../types/request';

export interface WorkspaceExport {
  app: 'curly';
  version: 1;
  exportedAt: number;
  collections: Collection[];
  environments: Environment[];
}

export function sanitizeEnv(env: Environment): Environment {
  return {
    ...env,
    variables: env.variables.map((v) => (v.secret ? { ...v, value: '' } : v)),
  };
}

export function buildExport(
  collections: Collection[],
  environments: Environment[],
): WorkspaceExport {
  return {
    app: 'curly',
    version: 1,
    exportedAt: Date.now(),
    collections,
    environments: environments.map(sanitizeEnv),
  };
}

export interface EnvironmentExport {
  app: 'curly';
  type: 'environment';
  exportedAt: number;
  environment: Environment;
}

export function buildEnvironmentExport(env: Environment): EnvironmentExport {
  return {
    app: 'curly',
    type: 'environment',
    exportedAt: Date.now(),
    environment: sanitizeEnv(env),
  };
}

export function parseEnvironment(json: string): Environment {
  const data = JSON.parse(json);
  const env =
    data && typeof data === 'object' && data.type === 'environment' && data.environment
      ? data.environment
      : data;
  if (!env || typeof env !== 'object' || !Array.isArray(env.variables)) {
    throw new Error('File không phải environment hợp lệ.');
  }
  return {
    id: crypto.randomUUID(),
    name: typeof env.name === 'string' ? env.name : 'Environment',
    variables: (env.variables as KeyValue[]).map((v) => ({
      id: crypto.randomUUID(),
      enabled: v.enabled ?? true,
      key: v.key ?? '',
      value: v.value ?? '',
      ...(v.secret ? { secret: true as const } : {}),
    })),
  };
}

function row(key = '', value = ''): KeyValue {
  return { id: crypto.randomUUID(), enabled: true, key, value };
}

function requestToPostman(name: string, req: ApiRequest): PostmanItem {
  const header = req.headers
    .filter((h) => h.key.trim())
    .map((h) => ({ key: h.key, value: h.value, disabled: !h.enabled }));

  const enabledParams = req.params.filter((p) => p.key.trim());
  const query = enabledParams.map((p) => ({
    key: p.key,
    value: p.value,
    disabled: !p.enabled,
  }));
  const qs = enabledParams
    .filter((p) => p.enabled)
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  const rawUrl = qs ? `${req.url}${req.url.includes('?') ? '&' : '?'}${qs}` : req.url;

  let body: PostmanBody | undefined;
  if (req.bodyType === 'json' || req.bodyType === 'raw') {
    if (req.body.trim()) {
      body = {
        mode: 'raw',
        raw: req.body,
        options: { raw: { language: req.bodyType === 'json' ? 'json' : 'text' } },
      };
    }
  } else if (req.bodyType === 'graphql') {
    body = { mode: 'graphql', graphql: { query: req.body, variables: req.graphqlVars } };
  } else if (req.bodyType === 'form' || req.bodyType === 'urlencoded') {
    const list = req.formData
      .filter((p) => p.key.trim())
      .map((p) => ({ key: p.key, value: p.value, disabled: !p.enabled }));
    body =
      req.bodyType === 'urlencoded'
        ? { mode: 'urlencoded', urlencoded: list }
        : { mode: 'formdata', formdata: list };
  }

  let auth: PostmanAuth | undefined;
  if (req.auth.type === 'bearer') {
    auth = { type: 'bearer', bearer: [{ key: 'token', value: req.auth.bearerToken }] };
  } else if (req.auth.type === 'basic') {
    auth = {
      type: 'basic',
      basic: [
        { key: 'username', value: req.auth.basicUser },
        { key: 'password', value: req.auth.basicPass },
      ],
    };
  } else if (req.auth.type === 'apikey') {
    auth = {
      type: 'apikey',
      apikey: [
        { key: 'key', value: req.auth.apiKeyName },
        { key: 'value', value: req.auth.apiKeyValue },
        { key: 'in', value: req.auth.apiKeyIn },
      ],
    };
  }

  return {
    name,
    request: {
      method: req.method,
      header,
      url: { raw: rawUrl, query: query.length ? query : undefined },
      body,
      auth,
    },
  };
}

function folderToPostman(folder: Folder): PostmanItem {
  return {
    name: folder.name,
    item: containerItemsToPostman(folder),
  };
}

function containerItemsToPostman(container: {
  requests: SavedRequest[];
  folders: Folder[];
}): PostmanItem[] {
  return [
    ...container.requests.map((r) => requestToPostman(r.name, r.request)),
    ...container.folders.map(folderToPostman),
  ];
}

export function buildPostmanExport(collection: Collection): unknown {
  return {
    info: {
      name: collection.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: containerItemsToPostman(collection),
  };
}

function normalizeRequest(r: Partial<ApiRequest>): ApiRequest {
  return {
    protocol: r.protocol ?? 'http',
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
    responseSchema: r.responseSchema ?? '',
    preScript: r.preScript ?? '',
    postScript: r.postScript ?? '',
    autoToken: r.autoToken ?? true,
  };
}

function cloneSaved(sr: SavedRequest): SavedRequest {
  return {
    id: crypto.randomUUID(),
    name: sr.name ?? 'Request',
    request: normalizeRequest(sr.request),
  };
}

function cloneFolder(f: Folder): Folder {
  return {
    id: crypto.randomUUID(),
    name: f?.name ?? 'Folder',
    requests: Array.isArray(f?.requests) ? f.requests.map(cloneSaved) : [],
    folders: Array.isArray(f?.folders) ? f.folders.map(cloneFolder) : [],
  };
}

export interface ImportResult {
  collections: Collection[];
  environments: Environment[];
}

interface PostmanKV {
  key?: string;
  value?: string;
  disabled?: boolean;
}

interface PostmanUrl {
  raw?: string;
  query?: PostmanKV[];
}

interface PostmanBody {
  mode?: string;
  raw?: string;
  urlencoded?: PostmanKV[];
  formdata?: PostmanKV[];
  graphql?: { query?: string; variables?: string };
  options?: { raw?: { language?: string } };
}

interface PostmanAuth {
  type?: string;
  bearer?: PostmanKV[];
  basic?: PostmanKV[];
  apikey?: PostmanKV[];
}

interface PostmanItem {
  name?: string;
  request?: {
    method?: string;
    url?: string | PostmanUrl;
    header?: PostmanKV[];
    body?: PostmanBody;
    auth?: PostmanAuth;
  };
  item?: PostmanItem[];
}

function postmanUrlToString(url?: string | PostmanUrl): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  return url.raw ?? '';
}

function postmanQuery(url?: string | PostmanUrl): KeyValue[] {
  if (!url || typeof url === 'string') return [];
  return (url.query ?? [])
    .filter((q) => !q.disabled && (q.key ?? '').trim())
    .map((q) => row(q.key ?? '', q.value ?? ''));
}

function postmanAuth(a?: PostmanAuth) {
  const auth = emptyAuth();
  if (!a) return auth;
  const val = (list: PostmanKV[] | undefined, key: string) =>
    list?.find((b) => b.key === key)?.value ?? '';
  if (a.type === 'bearer') {
    auth.type = 'bearer';
    auth.bearerToken = val(a.bearer, 'token');
  } else if (a.type === 'basic') {
    auth.type = 'basic';
    auth.basicUser = val(a.basic, 'username');
    auth.basicPass = val(a.basic, 'password');
  } else if (a.type === 'apikey') {
    auth.type = 'apikey';
    auth.apiKeyName = val(a.apikey, 'key');
    auth.apiKeyValue = val(a.apikey, 'value');
    auth.apiKeyIn = val(a.apikey, 'in') === 'query' ? 'query' : 'header';
  }
  return auth;
}

function postmanBody(body?: PostmanBody): Partial<ApiRequest> {
  if (!body || !body.mode) return { bodyType: 'none' };
  if (body.mode === 'urlencoded' || body.mode === 'formdata') {
    const list = (body.mode === 'urlencoded' ? body.urlencoded : body.formdata) ?? [];
    const formData = list
      .filter((p) => !p.disabled && (p.key ?? '').trim())
      .map((p) => row(p.key ?? '', p.value ?? ''));
    return {
      bodyType: body.mode === 'urlencoded' ? 'urlencoded' : 'form',
      formData: formData.length ? formData : undefined,
    };
  }
  if (body.mode === 'graphql') {
    return {
      bodyType: 'graphql',
      body: body.graphql?.query ?? '',
      graphqlVars: body.graphql?.variables ?? '',
    };
  }
  const raw = body.raw ?? '';
  if (!raw) return { bodyType: 'none' };
  const isJson = body.options?.raw?.language === 'json' || /^\s*[[{]/.test(raw);
  return { bodyType: isJson ? 'json' : 'raw', body: raw };
}

function postmanItemToSaved(item: PostmanItem): SavedRequest | null {
  if (!item.request) return null;
  const r = item.request;
  const headers = (r.header ?? [])
    .filter((h) => !h.disabled)
    .map((h) => row(h.key ?? '', h.value ?? ''));
  const params = postmanQuery(r.url);
  let url = postmanUrlToString(r.url);
  if (params.length) {
    const q = url.indexOf('?');
    if (q > -1) url = url.slice(0, q);
  }
  const request = normalizeRequest({
    method: (r.method ?? 'GET').toUpperCase() as ApiRequest['method'],
    url,
    params: params.length ? params : undefined,
    headers: headers.length ? headers : undefined,
    auth: postmanAuth(r.auth),
    ...postmanBody(r.body),
  });
  return { id: crypto.randomUUID(), name: item.name ?? request.url ?? 'Request', request };
}

function postmanItemsToContainer(items: PostmanItem[]): {
  requests: SavedRequest[];
  folders: Folder[];
} {
  const requests: SavedRequest[] = [];
  const folders: Folder[] = [];
  for (const it of items) {
    if (it.item) {
      const inner = postmanItemsToContainer(it.item);
      folders.push({
        id: crypto.randomUUID(),
        name: it.name ?? 'Folder',
        requests: inner.requests,
        folders: inner.folders,
      });
    } else {
      const saved = postmanItemToSaved(it);
      if (saved) requests.push(saved);
    }
  }
  return { requests, folders };
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
        id: crypto.randomUUID(),
        name: c.name ?? 'Collection',
        requests: (c.requests ?? []).map(cloneSaved),
        folders: (c.folders ?? []).map(cloneFolder),
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
    const container = postmanItemsToContainer(items);
    const collection: Collection = {
      id: crypto.randomUUID(),
      name: info?.name ?? 'Imported Collection',
      requests: container.requests,
      folders: container.folders,
    };
    return { collections: [collection], environments: [] };
  }

  throw new Error('File không đúng định dạng Curly hoặc Postman.');
}
