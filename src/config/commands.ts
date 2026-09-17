import type { Command } from '../components/CommandPalette';
import type { Collection, Environment, KeyValue, SavedRequest } from '../types/request';
import { locateRequests } from './collections';

export interface CommandActions {
  newTab: () => void;
  openSave: () => void;
  openCode: () => void;
  openCookies: () => void;
  openMock: () => void;
  toggleMockMode: () => void;
  exportWorkspace: () => void;
  exportTestsAsCode: () => void;
  exportN8nWorkflow: () => void;
  importFile: () => void;
  setActiveEnvId: (id: string | null) => void;
  openDocs: (collectionId: string) => void;
  openSaved: (saved: SavedRequest) => void;
}

function kvText(list: KeyValue[]): string {
  return list
    .filter((v) => v.enabled)
    .map((v) => `${v.key} ${v.value}`)
    .join(' ');
}

export function buildCommands(
  args: { collections: Collection[]; environments: Environment[]; mockMode: boolean },
  actions: CommandActions,
): Command[] {
  const list: Command[] = [
    { id: 'new-tab', group: 'Lệnh', label: 'Tab mới', hint: 'New', run: actions.newTab },
    { id: 'save', group: 'Lệnh', label: 'Lưu request', hint: 'Save', run: actions.openSave },
    { id: 'code', group: 'Lệnh', label: 'Import cURL / Code snippet', run: actions.openCode },
    { id: 'cookies', group: 'Lệnh', label: 'Cookie jar', run: actions.openCookies },
    { id: 'mocks', group: 'Lệnh', label: 'Mock server', run: actions.openMock },
    {
      id: 'mock-mode',
      group: 'Lệnh',
      label: args.mockMode ? 'Tắt Mock mode' : 'Bật Mock mode',
      run: actions.toggleMockMode,
    },
    { id: 'export', group: 'Lệnh', label: 'Export workspace', run: actions.exportWorkspace },
    {
      id: 'export-code',
      group: 'Lệnh',
      label: 'Export tests-as-code (.http)',
      run: actions.exportTestsAsCode,
    },
    {
      id: 'export-n8n',
      group: 'Lệnh',
      label: 'Export n8n workflow (giám sát API)',
      run: actions.exportN8nWorkflow,
    },
    {
      id: 'import',
      group: 'Lệnh',
      label: 'Import workspace / Postman',
      run: actions.importFile,
    },
    {
      id: 'no-env',
      group: 'Environment',
      label: 'No Environment',
      run: () => actions.setActiveEnvId(null),
    },
  ];
  for (const c of args.collections) {
    list.push({
      id: `docs-${c.id}`,
      group: c.name,
      label: `📄 Tài liệu: ${c.name}`,
      run: () => actions.openDocs(c.id),
    });
  }
  for (const loc of locateRequests(args.collections)) {
    const r = loc.saved.request;
    const deep = [
      kvText(r.params),
      kvText(r.headers),
      kvText(r.formData),
      r.body,
      r.graphqlVars,
    ].join(' ');
    list.push({
      id: `req-${loc.saved.id}`,
      group: loc.collectionName,
      label: loc.saved.name,
      method: r.method,
      url: r.url,
      path: loc.path,
      haystack: `${r.url} ${loc.path} ${deep}`,
      run: () => actions.openSaved(loc.saved),
    });
  }
  for (const e of args.environments) {
    list.push({
      id: `env-${e.id}`,
      group: 'Environment',
      label: e.name,
      run: () => actions.setActiveEnvId(e.id),
    });
  }
  return list;
}
