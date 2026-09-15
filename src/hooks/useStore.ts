import { useCallback, useEffect, useRef, useState } from 'react';
import { seedWorkspace } from '../config/seed';
import {
  blankRequest,
  emptyAuth,
  type ApiRequest,
  type Collection,
  type Environment,
  type HistoryEntry,
  type RequestTab,
  type SavedRequest,
} from '../types/request';

export { blankRequest };

const KEY = 'curly:state:v1';

function normalizeRequest(r: ApiRequest): ApiRequest {
  const row = () => ({ id: crypto.randomUUID(), enabled: true, key: '', value: '' });
  return {
    ...r,
    formData: r.formData?.length ? r.formData : [row()],
    graphqlVars: r.graphqlVars ?? '',
    auth: { ...emptyAuth(), ...r.auth },
    tests: r.tests ?? '',
    preScript: r.preScript ?? '',
    postScript: r.postScript ?? '',
    autoToken: r.autoToken ?? true,
  };
}

function newTab(name = 'Request mới', request = blankRequest()): RequestTab {
  return { id: crypto.randomUUID(), name, request, dirty: false };
}

interface PersistState {
  collections: Collection[];
  environments: Environment[];
  activeEnvId: string | null;
  history: HistoryEntry[];
  tabs: RequestTab[];
  activeTabId: string;
}

function loadPersist(): PersistState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const tabs: RequestTab[] =
        Array.isArray(p.tabs) && p.tabs.length
          ? p.tabs.map((t: RequestTab) => ({ ...t, request: normalizeRequest(t.request) }))
          : [newTab()];
      const activeTabId = tabs.some((t) => t.id === p.activeTabId) ? p.activeTabId : tabs[0].id;
      return {
        collections: p.collections ?? [],
        environments: p.environments ?? [],
        activeEnvId: p.activeEnvId ?? null,
        history: p.history ?? [],
        tabs,
        activeTabId,
      };
    }
  } catch {
    /* ignore */
  }
  const first = newTab();
  const { collections, environments } = seedWorkspace();
  return {
    collections,
    environments,
    activeEnvId: environments[0]?.id ?? null,
    history: [],
    tabs: [first],
    activeTabId: first.id,
  };
}

const MAX_HISTORY = 50;

export function useStore() {
  const initial = useRef(loadPersist());
  const [collections, setCollections] = useState<Collection[]>(initial.current.collections);
  const [environments, setEnvironments] = useState<Environment[]>(initial.current.environments);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(initial.current.activeEnvId);
  const [history, setHistory] = useState<HistoryEntry[]>(initial.current.history);

  const [tabs, setTabs] = useState<RequestTab[]>(initial.current.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(initial.current.activeTabId);

  useEffect(() => {
    const state: PersistState = {
      collections,
      environments,
      activeEnvId,
      history,
      tabs,
      activeTabId,
    };
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [collections, environments, activeEnvId, history, tabs, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  /* ---------- Tabs ---------- */
  const patchTab = useCallback((id: string, patch: Partial<RequestTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const updateActiveRequest = useCallback(
    (patch: Partial<ApiRequest>) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, request: { ...t.request, ...patch }, dirty: true } : t,
        ),
      );
    },
    [activeTabId],
  );

  const openTab = useCallback((tab?: RequestTab) => {
    const t = tab ?? newTab();
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }, []);

  const openRequest = useCallback((request: ApiRequest, name = 'Imported') => {
    const t = newTab(name, normalizeRequest(request));
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }, []);

  const openSaved = useCallback((saved: SavedRequest) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.savedRequestId === saved.id);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      const t: RequestTab = {
        id: crypto.randomUUID(),
        name: saved.name,
        request: normalizeRequest(structuredClone(saved.request)),
        savedRequestId: saved.id,
        dirty: false,
      };
      setActiveTabId(t.id);
      return [...prev, t];
    });
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const t = newTab();
          setActiveTabId(t.id);
          return [t];
        }
        if (id === activeTabId) setActiveTabId(next[next.length - 1].id);
        return next;
      });
    },
    [activeTabId],
  );

  /* ---------- Collections ---------- */
  const addCollection = useCallback((name: string) => {
    setCollections((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: name.trim() || 'Collection', requests: [] },
    ]);
  }, []);

  const renameCollection = useCallback((id: string, name: string) => {
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }, []);

  const deleteCollection = useCallback((id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const importWorkspace = useCallback((cols: Collection[], envs: Environment[]) => {
    setCollections((prev) => [...prev, ...cols]);
    setEnvironments((prev) => [...prev, ...envs]);
    if (envs.length) setActiveEnvId(envs[0].id);
  }, []);

  const deleteSaved = useCallback((collectionId: string, requestId: string) => {
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? { ...c, requests: c.requests.filter((r) => r.id !== requestId) }
          : c,
      ),
    );
  }, []);

  /** Lưu tab hiện tại vào collection (tạo mới hoặc cập nhật). */
  const saveTabToCollection = useCallback(
    (tabId: string, collectionId: string, name: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const request = structuredClone(tab.request);
      setCollections((prev) =>
        prev.map((c) => {
          if (c.id !== collectionId) return c;
          const existing = tab.savedRequestId
            ? c.requests.find((r) => r.id === tab.savedRequestId)
            : undefined;
          if (existing) {
            return {
              ...c,
              requests: c.requests.map((r) => (r.id === existing.id ? { ...r, name, request } : r)),
            };
          }
          const saved: SavedRequest = { id: crypto.randomUUID(), name, request };
          patchTab(tabId, { name, savedRequestId: saved.id, dirty: false });
          return { ...c, requests: [...c.requests, saved] };
        }),
      );
      patchTab(tabId, { name, dirty: false });
    },
    [tabs, patchTab],
  );

  /* ---------- Environments ---------- */
  const addEnvironment = useCallback((name: string) => {
    const env: Environment = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Environment',
      variables: [{ id: crypto.randomUUID(), enabled: true, key: '', value: '' }],
    };
    setEnvironments((prev) => [...prev, env]);
    setActiveEnvId(env.id);
  }, []);

  const updateEnvironment = useCallback((id: string, patch: Partial<Environment>) => {
    setEnvironments((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const deleteEnvironment = useCallback((id: string) => {
    setEnvironments((prev) => prev.filter((e) => e.id !== id));
    setActiveEnvId((cur) => (cur === id ? null : cur));
  }, []);

  /** Ghi các biến (từ script) vào environment đang chọn. */
  const applyVars = useCallback(
    (vars: Record<string, string>) => {
      if (!activeEnvId) return;
      setEnvironments((prev) =>
        prev.map((e) => {
          if (e.id !== activeEnvId) return e;
          const next = [...e.variables];
          for (const [key, value] of Object.entries(vars)) {
            const idx = next.findIndex((v) => v.key.trim() === key);
            if (idx >= 0) next[idx] = { ...next[idx], value };
            else next.push({ id: crypto.randomUUID(), enabled: true, key, value });
          }
          return { ...e, variables: next };
        }),
      );
    },
    [activeEnvId],
  );

  /* ---------- History ---------- */
  const addHistory = useCallback((request: ApiRequest, status?: number) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      at: Date.now(),
      method: request.method,
      url: request.url,
      status,
      request: structuredClone(request),
    };
    setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  const activeEnv = environments.find((e) => e.id === activeEnvId) ?? null;

  const replaceWorkspace = useCallback((cols: Collection[], envs: Environment[]) => {
    setCollections(cols);
    setEnvironments(envs);
  }, []);

  return {
    // tabs
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    openTab,
    openRequest,
    openSaved,
    closeTab,
    patchTab,
    updateActiveRequest,
    // collections
    collections,
    addCollection,
    renameCollection,
    deleteCollection,
    importWorkspace,
    deleteSaved,
    saveTabToCollection,
    replaceWorkspace,
    // environments
    environments,
    activeEnv,
    activeEnvId,
    setActiveEnvId,
    addEnvironment,
    updateEnvironment,
    deleteEnvironment,
    applyVars,
    // history
    history,
    addHistory,
    clearHistory,
  };
}
