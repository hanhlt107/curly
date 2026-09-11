export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KeyValue {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
}

export type BodyType = 'none' | 'json' | 'raw';

export interface ApiRequest {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyType: BodyType;
  body: string;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  data: unknown;
}

export interface RequestError {
  message: string;
  detail?: string;
}

export interface HistoryEntry {
  id: string;
  at: number;
  method: HttpMethod;
  url: string;
  status?: number;
  request: ApiRequest;
}
