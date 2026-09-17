import { useEffect, useState } from 'react';
import type { ApiResponse, RequestError } from '../types/request';
import type { TestResult } from '../config/tests';
import type { SchemaResult } from '../config/schema';

export interface RespState {
  loading: boolean;
  response: ApiResponse | null;
  prevResponse?: ApiResponse | null;
  error: RequestError | null;
  tests?: TestResult[];
  schema?: SchemaResult;
  logs?: string[];
}

const RESP_KEY = 'curly:responses:v1';
const EMPTY: RespState = { loading: false, response: null, error: null };

export function useResponses() {
  const [respByTab, setRespByTab] = useState<Record<string, RespState>>(() => {
    try {
      const raw = localStorage.getItem(RESP_KEY);
      return raw ? (JSON.parse(raw) as Record<string, RespState>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const persistable: Record<string, RespState> = {};
    for (const [id, s] of Object.entries(respByTab)) {
      if (s.response || s.error) {
        persistable[id] = { ...s, loading: false };
      }
    }
    try {
      localStorage.setItem(RESP_KEY, JSON.stringify(persistable));
    } catch {
      /* quota exceeded — bỏ qua */
    }
  }, [respByTab]);

  const setResp = (id: string, patch: Partial<RespState>) =>
    setRespByTab((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? EMPTY), ...patch },
    }));

  const clearResp = (id: string) =>
    setRespByTab((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });

  const getResp = (id: string): RespState => respByTab[id] ?? EMPTY;

  return { respByTab, setResp, clearResp, getResp };
}
