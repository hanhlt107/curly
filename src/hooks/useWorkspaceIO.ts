import {
  buildEnvironmentExport,
  buildExport,
  buildPostmanExport,
  parseEnvironment,
  parseWorkspace,
} from '../config/workspace';
import { buildCodeExport, isCodeExport, parseCodeExport } from '../config/codeExport';
import { buildN8nWorkflow, n8nWorkflowFilename } from '../config/n8nExport';
import { downloadJson, downloadText, readFileText, slugify } from '../config/download';
import { parseOpenApiSpec } from '../config/openapi';
import { parseHar } from '../config/har';
import { countRequests } from '../config/collections';
import type { ReceiveSummary } from '../components/P2PShareModal';
import type { SharedWorkspace } from '../config/p2p';
import type { useStore } from './useStore';
import type { useDialogs } from './useDialogs';

export function useWorkspaceIO(
  store: ReturnType<typeof useStore>,
  dialogs: ReturnType<typeof useDialogs>,
) {
  const exportWorkspace = () => {
    const data = buildExport(store.collections, store.environments);
    downloadJson(data, `curly-workspace-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const exportTestsAsCode = () => {
    downloadText(
      buildCodeExport(store.collections),
      `curly-tests-${new Date().toISOString().slice(0, 10)}.http`,
    );
  };

  const exportN8nWorkflow = () => {
    downloadJson(buildN8nWorkflow(store.collections), n8nWorkflowFilename());
  };

  const exportCollectionAsPostman = (id: string) => {
    const col = store.collections.find((c) => c.id === id);
    if (!col) return;
    const slug = slugify(col.name, 'collection');
    downloadJson(buildPostmanExport(col), `${slug}.postman_collection.json`);
  };

  const exportEnvironment = (id: string) => {
    const env = store.environments.find((e) => e.id === id);
    if (!env) return;
    const slug = slugify(env.name, 'environment');
    downloadJson(buildEnvironmentExport(env), `${slug}.curly-env.json`);
  };

  const importFile = async (file: File) => {
    try {
      const text = await readFileText(file);
      if (isCodeExport(text)) {
        store.importWorkspace(parseCodeExport(text), []);
        return;
      }
      const { collections, environments } = parseWorkspace(text);
      store.importWorkspace(collections, environments);
    } catch (err) {
      dialogs.toast((err as Error).message || 'Không đọc được file.', 'error');
    }
  };

  const importOpenApiSpec = (text: string): number => {
    const { collections, environments } = parseOpenApiSpec(text);
    store.importWorkspace(collections, environments);
    return collections.reduce((n, c) => n + countRequests(c), 0);
  };

  const importHar = (text: string): number => {
    const { collections, environments } = parseHar(text);
    store.importWorkspace(collections, environments);
    return collections.reduce((n, c) => n + countRequests(c), 0);
  };

  const importEnvironmentFile = async (file: File) => {
    try {
      store.importEnvironment(parseEnvironment(await readFileText(file)));
    } catch (err) {
      dialogs.toast((err as Error).message || 'Không đọc được file.', 'error');
    }
  };

  const receiveSharedWorkspace = async (
    shared: SharedWorkspace,
  ): Promise<ReceiveSummary | null> => {
    const colCount = shared.collections?.length ?? 0;
    const envCount = shared.environments?.length ?? 0;
    const ok = await dialogs.confirm({
      title: 'Nhận workspace từ thiết bị khác',
      message: `Sẽ gộp ${colCount} collection và ${envCount} môi trường vào workspace hiện tại (không ghi đè dữ liệu cũ). Tiếp tục?`,
      confirmLabel: 'Gộp vào',
      cancelLabel: 'Hủy',
    });
    if (!ok) return null;
    const { collections, environments } = parseWorkspace(JSON.stringify(shared));
    store.importWorkspace(collections, environments);
    if (Array.isArray(shared.globals) && shared.globals.length) {
      const existingKeys = new Set(store.globals.map((v) => v.key.trim()).filter(Boolean));
      const added = shared.globals
        .filter((v) => v.key.trim() && !existingKeys.has(v.key.trim()))
        .map((v) => ({
          id: crypto.randomUUID(),
          enabled: v.enabled ?? true,
          key: v.key,
          value: v.value,
          ...(v.secret ? { secret: true as const } : {}),
        }));
      if (added.length) store.updateGlobals([...store.globals, ...added]);
    }
    const requests = collections.reduce((n, c) => n + countRequests(c), 0);
    dialogs.toast(
      `Đã nhận ${collections.length} collection, ${requests} request, ${environments.length} môi trường.`,
      'success',
    );
    return { collections: collections.length, requests, environments: environments.length };
  };

  return {
    exportWorkspace,
    exportTestsAsCode,
    exportN8nWorkflow,
    exportCollectionAsPostman,
    exportEnvironment,
    importFile,
    importOpenApiSpec,
    importHar,
    importEnvironmentFile,
    receiveSharedWorkspace,
  };
}
