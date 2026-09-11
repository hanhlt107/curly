import { useCallback, useEffect, useState } from 'react';
import type { ApiRequest, HistoryEntry } from '../types/request';

const STORAGE_KEY = 'api-tester:history';
const MAX_ENTRIES = 50;

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const add = useCallback((request: ApiRequest, status?: number) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      at: Date.now(),
      method: request.method,
      url: request.url,
      status,
      request,
    };
    setHistory((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
  }, []);

  const clear = useCallback(() => setHistory([]), []);

  return { history, add, clear };
}
