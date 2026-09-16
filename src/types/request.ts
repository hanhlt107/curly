export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type Protocol = 'http' | 'ws' | 'sse';

export interface KeyValue {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
  secret?: boolean;
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

export type SnapshotMode = 'strict' | 'structural';

export interface RequestSnapshot {
  at: number;
  status: number;
  contentType: string;
  data: unknown;
  raw: string;
  mode: SnapshotMode;
}

export interface ApiRequest {
  protocol: Protocol;
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
  responseSchema: string;
  preScript: string;
  postScript: string;
  autoToken: boolean;
  snapshot?: RequestSnapshot | null;
}

export function blankRequest(): ApiRequest {
  const row = (): KeyValue => ({ id: crypto.randomUUID(), enabled: true, key: '', value: '' });
  return {
    protocol: 'http',
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
    responseSchema: '',
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
  mocked?: boolean;
}

export type MockMethod = HttpMethod | 'ANY';

export interface MockRule {
  id: string;
  enabled: boolean;
  name: string;
  method: MockMethod;
  urlPattern: string;
  status: number;
  headers: KeyValue[];
  body: string;
  delayMs: number;
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

export interface Folder {
  id: string;
  name: string;
  requests: SavedRequest[];
  folders: Folder[];
}

export interface Collection {
  id: string;
  name: string;
  requests: SavedRequest[];
  folders: Folder[];
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

export interface Cookie {
  id: string;
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  enabled: boolean;
}

export interface HistoryEntry {
  id: string;
  at: number;
  method: HttpMethod;
  url: string;
  status?: number;
  durationMs?: number;
  response?: ApiResponse;
  request: ApiRequest;
}

export type ExtractSource = 'body' | 'header' | 'status';

export interface WorkflowExtraction {
  id: string;
  source: ExtractSource;
  path: string;
  varName: string;
}

export interface WorkflowStep {
  id: string;
  collectionId: string;
  requestId: string;
  name: string;
  extractions: WorkflowExtraction[];
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

export interface CustomDynamicVar {
  id: string;
  name: string;
  template: string;
  desc: string;
}
