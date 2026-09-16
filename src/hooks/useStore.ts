import { useCallback, useEffect, useRef, useState } from 'react';
import { seedWorkspace } from '../config/seed';
import {
  addFolder as addFolderTo,
  deleteFolder as deleteFolderIn,
  duplicateRequest,
  extractFolder,
  findRequest,
  folderContains,
  insertRequest,
  removeRequest,
  renameFolder as renameFolderIn,
} from '../config/collections';
import {
  blankRequest,
  emptyAuth,
  type ApiRequest,
  type ApiResponse,
  type Collection,
  type Cookie,
  type Environment,
  type Folder,
  type HistoryEntry,
  type KeyValue,
  type MockRule,
  type RequestTab,
  type SavedRequest,
  type Workflow,
  type WorkflowStep,
  type WorkflowExtraction,
  type CustomDynamicVar,
} from '../types/request';
import { setCustomDynamicVars } from '../config/dynamicVars';

export { blankRequest };

const KEY = 'curly:state:v1';
const MAX_RESPONSE_CHARS = 100_000;

function capResponse(res: ApiResponse): ApiResponse {
  if (res.raw.length <= MAX_RESPONSE_CHARS) return res;
  return {
    ...res,
    data: undefined,
    raw: res.raw.slice(0, MAX_RESPONSE_CHARS) + '\n… (đã cắt bớt trong lịch sử)',
  };
}

function normalizeRequest(r: ApiRequest): ApiRequest {
  const row = () => ({ id: crypto.randomUUID(), enabled: true, key: '', value: '' });
  return {
    ...r,
    protocol: r.protocol ?? 'http',
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

function normalizeSaved(sr: SavedRequest): SavedRequest {
  return {
    id: typeof sr?.id === 'string' ? sr.id : crypto.randomUUID(),
    name: sr?.name ?? 'Request',
    request: normalizeRequest(sr?.request ?? blankRequest()),
  };
}

function normalizeFolder(f: Folder): Folder {
  return {
    id: typeof f?.id === 'string' ? f.id : crypto.randomUUID(),
    name: f?.name ?? 'Folder',
    requests: Array.isArray(f?.requests) ? f.requests.map(normalizeSaved) : [],
    folders: Array.isArray(f?.folders) ? f.folders.map(normalizeFolder) : [],
  };
}

function normalizeCollection(c: Collection): Collection {
  return {
    id: typeof c?.id === 'string' ? c.id : crypto.randomUUID(),
    name: c?.name ?? 'Collection',
    requests: Array.isArray(c?.requests) ? c.requests.map(normalizeSaved) : [],
    folders: Array.isArray(c?.folders) ? c.folders.map(normalizeFolder) : [],
  };
}

function normalizeVars(list: KeyValue[]): KeyValue[] {
  if (!Array.isArray(list)) return [];
  return list.map((v) => ({
    id: typeof v?.id === 'string' ? v.id : crypto.randomUUID(),
    enabled: v?.enabled ?? true,
    key: v?.key ?? '',
    value: v?.value ?? '',
    ...(v?.secret ? { secret: true } : {}),
  }));
}

function normalizeExtraction(e: WorkflowExtraction): WorkflowExtraction {
  const source = e?.source === 'header' || e?.source === 'status' ? e.source : 'body';
  return {
    id: typeof e?.id === 'string' ? e.id : crypto.randomUUID(),
    source,
    path: typeof e?.path === 'string' ? e.path : '',
    varName: typeof e?.varName === 'string' ? e.varName : '',
  };
}

function normalizeStep(s: WorkflowStep): WorkflowStep {
  return {
    id: typeof s?.id === 'string' ? s.id : crypto.randomUUID(),
    collectionId: typeof s?.collectionId === 'string' ? s.collectionId : '',
    requestId: typeof s?.requestId === 'string' ? s.requestId : '',
    name: typeof s?.name === 'string' ? s.name : 'Request',
    extractions: Array.isArray(s?.extractions) ? s.extractions.map(normalizeExtraction) : [],
  };
}

function normalizeWorkflow(w: Workflow): Workflow {
  return {
    id: typeof w?.id === 'string' ? w.id : crypto.randomUUID(),
    name: typeof w?.name === 'string' ? w.name : 'Workflow',
    steps: Array.isArray(w?.steps) ? w.steps.map(normalizeStep) : [],
  };
}

export function sanitizeDynVarName(raw: string): string {
  return (raw || '').replace(/^\$+/, '').replace(/[^\w.-]/g, '');
}

function normalizeCustomDynVar(v: CustomDynamicVar): CustomDynamicVar {
  return {
    id: typeof v?.id === 'string' ? v.id : crypto.randomUUID(),
    name: sanitizeDynVarName(typeof v?.name === 'string' ? v.name : ''),
    template: typeof v?.template === 'string' ? v.template : '',
    desc: typeof v?.desc === 'string' ? v.desc : '',
  };
}

function newTab(name = 'Request mới', request = blankRequest()): RequestTab {
  return { id: crypto.randomUUID(), name, request, dirty: false };
}

interface PersistState {
  collections: Collection[];
  environments: Environment[];
  globals: KeyValue[];
  activeEnvId: string | null;
  history: HistoryEntry[];
  historyLimit: number;
  tabs: RequestTab[];
  activeTabId: string;
  cookies: Cookie[];
  cookieJarEnabled: boolean;
  mocks: MockRule[];
  mockMode: boolean;
  workflows: Workflow[];
  customDynVars: CustomDynamicVar[];
}

const DEFAULT_HISTORY_LIMIT = 50;

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
        collections: Array.isArray(p.collections) ? p.collections.map(normalizeCollection) : [],
        environments: Array.isArray(p.environments)
          ? p.environments.map((e: Environment) => ({
              ...e,
              variables: normalizeVars(e.variables),
            }))
          : [],
        globals: normalizeVars(p.globals ?? []),
        activeEnvId: p.activeEnvId ?? null,
        history: p.history ?? [],
        historyLimit:
          typeof p.historyLimit === 'number' && p.historyLimit > 0
            ? p.historyLimit
            : DEFAULT_HISTORY_LIMIT,
        tabs,
        activeTabId,
        cookies: p.cookies ?? [],
        cookieJarEnabled: p.cookieJarEnabled ?? true,
        mocks: p.mocks ?? [],
        mockMode: p.mockMode ?? false,
        workflows: Array.isArray(p.workflows) ? p.workflows.map(normalizeWorkflow) : [],
        customDynVars: Array.isArray(p.customDynVars)
          ? p.customDynVars.map(normalizeCustomDynVar)
          : [],
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
    globals: [],
    activeEnvId: environments[0]?.id ?? null,
    history: [],
    historyLimit: DEFAULT_HISTORY_LIMIT,
    tabs: [first],
    activeTabId: first.id,
    cookies: [],
    cookieJarEnabled: true,
    mocks: [],
    mockMode: false,
    workflows: [],
    customDynVars: [],
  };
}

export function useStore() {
  const initial = useRef(loadPersist());
  const [collections, setCollections] = useState<Collection[]>(initial.current.collections);
  const [environments, setEnvironments] = useState<Environment[]>(initial.current.environments);
  const [globals, setGlobals] = useState<KeyValue[]>(initial.current.globals);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(initial.current.activeEnvId);
  const [history, setHistory] = useState<HistoryEntry[]>(initial.current.history);
  const [historyLimit, setHistoryLimit] = useState<number>(initial.current.historyLimit);

  const [tabs, setTabs] = useState<RequestTab[]>(initial.current.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(initial.current.activeTabId);
  const [cookies, setCookies] = useState<Cookie[]>(initial.current.cookies);
  const [cookieJarEnabled, setCookieJarEnabled] = useState<boolean>(
    initial.current.cookieJarEnabled,
  );
  const [mocks, setMocks] = useState<MockRule[]>(initial.current.mocks);
  const [mockMode, setMockMode] = useState<boolean>(initial.current.mockMode);
  const [workflows, setWorkflows] = useState<Workflow[]>(initial.current.workflows);
  const [customDynVars, setCustomDynVars] = useState<CustomDynamicVar[]>(
    initial.current.customDynVars,
  );

  useEffect(() => {
    setCustomDynamicVars(customDynVars);
  }, [customDynVars]);

  useEffect(() => {
    const state: PersistState = {
      collections,
      environments,
      globals,
      activeEnvId,
      history,
      historyLimit,
      tabs,
      activeTabId,
      cookies,
      cookieJarEnabled,
      mocks,
      mockMode,
      workflows,
      customDynVars,
    };
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [
    collections,
    environments,
    globals,
    activeEnvId,
    history,
    historyLimit,
    tabs,
    activeTabId,
    cookies,
    cookieJarEnabled,
    mocks,
    mockMode,
    workflows,
    customDynVars,
  ]);

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
      { id: crypto.randomUUID(), name: name.trim() || 'Collection', requests: [], folders: [] },
    ]);
  }, []);

  const renameCollection = useCallback((id: string, name: string) => {
    setCollections((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }, []);

  const deleteCollection = useCallback((id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const importWorkspace = useCallback((cols: Collection[], envs: Environment[]) => {
    setCollections((prev) => [...prev, ...cols.map(normalizeCollection)]);
    setEnvironments((prev) => [...prev, ...envs]);
    if (envs.length) setActiveEnvId(envs[0].id);
  }, []);

  const addFolder = useCallback(
    (collectionId: string, parentFolderId: string | null, name: string) => {
      const folder: Folder = {
        id: crypto.randomUUID(),
        name: name.trim() || 'Folder',
        requests: [],
        folders: [],
      };
      setCollections((prev) =>
        prev.map((c) => (c.id === collectionId ? addFolderTo(c, parentFolderId, folder) : c)),
      );
    },
    [],
  );

  const renameFolder = useCallback((collectionId: string, folderId: string, name: string) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? renameFolderIn(c, folderId, name) : c)),
    );
  }, []);

  const deleteFolder = useCallback((collectionId: string, folderId: string) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? deleteFolderIn(c, folderId) : c)),
    );
  }, []);

  const deleteSaved = useCallback((collectionId: string, requestId: string) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? removeRequest(c, requestId) : c)),
    );
  }, []);

  const duplicateSaved = useCallback((collectionId: string, requestId: string) => {
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? duplicateRequest(c, requestId, (src) => ({
              id: crypto.randomUUID(),
              name: `${src.name} (copy)`,
              request: structuredClone(src.request),
            }))
          : c,
      ),
    );
  }, []);

  const moveSavedTo = useCallback(
    (
      fromCollectionId: string,
      requestId: string,
      toCollectionId: string,
      toFolderId: string | null,
    ) => {
      setCollections((prev) => {
        const src = prev.find((c) => c.id === fromCollectionId);
        if (!src) return prev;
        const moved = findRequest(src, requestId);
        if (!moved) return prev;
        return prev.map((c) => {
          let next = c;
          if (c.id === fromCollectionId) next = removeRequest(next, requestId);
          if (c.id === toCollectionId) next = insertRequest(next, toFolderId, moved);
          return next;
        });
      });
    },
    [],
  );

  const moveFolderTo = useCallback(
    (
      fromCollectionId: string,
      folderId: string,
      toCollectionId: string,
      toFolderId: string | null,
    ) => {
      if (folderId === toFolderId) return;
      setCollections((prev) => {
        const src = prev.find((c) => c.id === fromCollectionId);
        if (!src) return prev;
        const { folder } = extractFolder(src, folderId);
        if (!folder) return prev;
        if (toFolderId && folderContains(folder, toFolderId)) return prev;
        return prev.map((c) => {
          let next = c;
          if (c.id === fromCollectionId) next = extractFolder(next, folderId).container;
          if (c.id === toCollectionId) next = addFolderTo(next, toFolderId, folder);
          return next;
        });
      });
    },
    [],
  );

  /** Lưu tab hiện tại vào collection (tạo mới, cập nhật, hoặc di chuyển). */
  const saveTabToCollection = useCallback(
    (tabId: string, collectionId: string, folderId: string | null, name: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const request = structuredClone(tab.request);
      const savedId = tab.savedRequestId ?? null;
      const reuseId =
        savedId && collections.some((c) => findRequest(c, savedId)) ? savedId : crypto.randomUUID();
      const saved: SavedRequest = { id: reuseId, name, request };

      setCollections((prev) =>
        prev.map((c) => {
          let next = savedId ? removeRequest(c, savedId) : c;
          if (c.id === collectionId) next = insertRequest(next, folderId, saved);
          return next;
        }),
      );
      patchTab(tabId, { name, savedRequestId: reuseId, dirty: false });
    },
    [tabs, collections, patchTab],
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

  const updateGlobals = useCallback((variables: KeyValue[]) => {
    setGlobals(variables);
  }, []);

  const importDotenv = useCallback(
    (
      pairs: { key: string; value: string }[],
      target: { mode: 'new' | 'merge'; envId?: string; name?: string },
    ) => {
      if (target.mode === 'new') {
        const vars: KeyValue[] = pairs.map((p) => ({
          id: crypto.randomUUID(),
          enabled: true,
          key: p.key,
          value: p.value,
        }));
        const env: Environment = {
          id: crypto.randomUUID(),
          name: target.name?.trim() || '.env',
          variables: vars.length
            ? vars
            : [{ id: crypto.randomUUID(), enabled: true, key: '', value: '' }],
        };
        setEnvironments((prev) => [...prev, env]);
        setActiveEnvId(env.id);
        return;
      }
      setEnvironments((prev) =>
        prev.map((e) => {
          if (e.id !== target.envId) return e;
          const next = e.variables.filter((v) => v.key.trim());
          for (const p of pairs) {
            const idx = next.findIndex((v) => v.key.trim() === p.key);
            if (idx >= 0) next[idx] = { ...next[idx], value: p.value };
            else next.push({ id: crypto.randomUUID(), enabled: true, key: p.key, value: p.value });
          }
          return { ...e, variables: next };
        }),
      );
      if (target.envId) setActiveEnvId(target.envId);
    },
    [],
  );

  const importEnvironment = useCallback((env: Environment) => {
    const fresh: Environment = {
      id: crypto.randomUUID(),
      name: env.name || 'Environment',
      variables: normalizeVars(env.variables),
    };
    setEnvironments((prev) => [...prev, fresh]);
    setActiveEnvId(fresh.id);
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
  const addHistory = useCallback(
    (request: ApiRequest, response?: ApiResponse) => {
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        at: Date.now(),
        method: request.method,
        url: request.url,
        status: response?.status,
        durationMs: response?.durationMs,
        response: response ? capResponse(response) : undefined,
        request: structuredClone(request),
      };
      setHistory((prev) => {
        const head = prev[0];
        const dup =
          head &&
          head.method === entry.method &&
          head.url === entry.url &&
          head.request.body === entry.request.body;
        const rest = dup ? prev.slice(1) : prev;
        return [entry, ...rest].slice(0, Math.max(1, historyLimit));
      });
    },
    [historyLimit],
  );

  const deleteHistoryEntry = useCallback((id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  const addCookie = useCallback((cookie: Cookie) => {
    setCookies((prev) => [...prev, cookie]);
  }, []);

  const updateCookie = useCallback((id: string, patch: Partial<Cookie>) => {
    setCookies((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const deleteCookie = useCallback((id: string) => {
    setCookies((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearCookies = useCallback(() => setCookies([]), []);

  const addMock = useCallback((mock: MockRule) => {
    setMocks((prev) => [...prev, mock]);
  }, []);

  const updateMock = useCallback((id: string, patch: Partial<MockRule>) => {
    setMocks((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const deleteMock = useCallback((id: string) => {
    setMocks((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const activeEnv = environments.find((e) => e.id === activeEnvId) ?? null;

  const replaceWorkspace = useCallback((cols: Collection[], envs: Environment[]) => {
    setCollections(cols.map(normalizeCollection));
    setEnvironments(envs.map((e) => ({ ...e, variables: normalizeVars(e.variables) })));
  }, []);

  const addWorkflow = useCallback((name: string) => {
    const wf: Workflow = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Chuỗi mới',
      steps: [],
    };
    setWorkflows((prev) => [...prev, wf]);
    return wf.id;
  }, []);

  const renameWorkflow = useCallback((id: string, name: string) => {
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)));
  }, []);

  const deleteWorkflow = useCallback((id: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const updateWorkflow = useCallback((id: string, patch: Partial<Workflow>) => {
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }, []);

  const addCustomDynVar = useCallback(() => {
    const v: CustomDynamicVar = {
      id: crypto.randomUUID(),
      name: '',
      template: '',
      desc: '',
    };
    setCustomDynVars((prev) => [...prev, v]);
    return v.id;
  }, []);

  const updateCustomDynVar = useCallback((id: string, patch: Partial<CustomDynamicVar>) => {
    setCustomDynVars((prev) =>
      prev.map((v) =>
        v.id === id
          ? {
              ...v,
              ...patch,
              ...(patch.name !== undefined ? { name: sanitizeDynVarName(patch.name) } : {}),
            }
          : v,
      ),
    );
  }, []);

  const deleteCustomDynVar = useCallback((id: string) => {
    setCustomDynVars((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const changeHistoryLimit = useCallback((limit: number) => {
    const next = Math.max(1, Math.floor(limit) || DEFAULT_HISTORY_LIMIT);
    setHistoryLimit(next);
    setHistory((prev) => prev.slice(0, next));
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
    duplicateSaved,
    moveSavedTo,
    moveFolderTo,
    addFolder,
    renameFolder,
    deleteFolder,
    saveTabToCollection,
    replaceWorkspace,
    // environments
    environments,
    globals,
    updateGlobals,
    importEnvironment,
    importDotenv,
    activeEnv,
    activeEnvId,
    setActiveEnvId,
    addEnvironment,
    updateEnvironment,
    deleteEnvironment,
    applyVars,
    // history
    history,
    historyLimit,
    setHistoryLimit: changeHistoryLimit,
    addHistory,
    deleteHistoryEntry,
    clearHistory,
    cookies,
    cookieJarEnabled,
    setCookieJarEnabled,
    addCookie,
    updateCookie,
    deleteCookie,
    clearCookies,
    mocks,
    mockMode,
    setMockMode,
    addMock,
    updateMock,
    deleteMock,
    workflows,
    addWorkflow,
    renameWorkflow,
    deleteWorkflow,
    updateWorkflow,
    customDynVars,
    addCustomDynVar,
    updateCustomDynVar,
    deleteCustomDynVar,
  };
}
