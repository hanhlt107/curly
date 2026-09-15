export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KeyValue {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export type BodyType = 'none' | 'json' | 'raw' | 'graphql' | 'form' | 'urlencoded';

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey';
export type ApiKeyIn = 'header' | 'query';

export interface Auth {
  type: AuthType;
  bearerToken: string;
  basicUser: string;
  basicPass: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyIn: ApiKeyIn;
}

export function emptyAuth(): Auth {
  return {
    type: 'none',
    bearerToken: '',
    basicUser: '',
    basicPass: '',
    apiKeyName: '',
    apiKeyValue: '',
    apiKeyIn: 'header',
  };
}

export interface ApiRequest {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyType: BodyType;
  body: string;
  formData: KeyValue[];
  graphqlVars: string;
  auth: Auth;
  tests: string;
  preScript: string;
  postScript: string;
  autoToken: boolean;
}

export function blankRequest(): ApiRequest {
  const row = (): KeyValue => ({ id: crypto.randomUUID(), enabled: true, key: '', value: '' });
  return {
    method: 'GET',
    url: '',
    params: [row()],
    headers: [row()],
    bodyType: 'none',
    body: '',
    formData: [row()],
    graphqlVars: '',
    auth: emptyAuth(),
    tests: '',
    preScript: '',
    postScript: '',
    autoToken: true,
  };
}

export interface ApiResponse {
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  data: unknown;
  raw: string;
}

export interface RequestError {
  message: string;
  detail?: string;
}

/** Một request đã lưu trong collection. */
export interface SavedRequest {
  id: string;
  name: string;
  request: ApiRequest;
}

export interface Collection {
  id: string;
  name: string;
  requests: SavedRequest[];
}

/** Một tab đang mở trong workspace. */
export interface RequestTab {
  id: string;
  name: string;
  request: ApiRequest;
  savedRequestId?: string;
  dirty: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValue[];
}

export interface HistoryEntry {
  id: string;
  at: number;
  method: HttpMethod;
  url: string;
  status?: number;
  request: ApiRequest;
}
