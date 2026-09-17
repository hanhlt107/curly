import type {
  ApiRequest,
  Auth,
  Collection,
  Folder,
  KeyValue,
  SavedRequest,
} from '../types/request';
import { blankRequest } from '../types/request';

const HEADER = '# curly tests-as-code v1';
const FOLDER_SEP = ' / ';

type Container = { requests: SavedRequest[]; folders: Folder[] };

export function isCodeExport(text: string): boolean {
  return text.trimStart().startsWith('# curly tests-as-code');
}

function kvLines(prefix: string, list: KeyValue[]): string[] {
  return list
    .filter((p) => p.key.trim())
    .map((p) => `${p.enabled ? prefix : prefix + '-off'} ${p.key.trim()}=${p.value}`);
}

function block(label: string, value: string): string[] {
  const body = value
    .split('\n')
    .map((l) => (l === '' ? '' : '  ' + l))
    .join('\n');
  return [`${label}:`, body, ''];
}

function authLines(auth: Auth): string[] {
  if (auth.type === 'none') return [];
  const out = [`auth: ${auth.type}`];
  if (auth.type === 'bearer' && auth.bearerToken) out.push(`auth.bearerToken=${auth.bearerToken}`);
  if (auth.type === 'basic') {
    if (auth.basicUser) out.push(`auth.basicUser=${auth.basicUser}`);
    if (auth.basicPass) out.push(`auth.basicPass=${auth.basicPass}`);
  }
  if (auth.type === 'apikey') {
    if (auth.apiKeyName) out.push(`auth.apiKeyName=${auth.apiKeyName}`);
    if (auth.apiKeyValue) out.push(`auth.apiKeyValue=${auth.apiKeyValue}`);
    out.push(`auth.apiKeyIn=${auth.apiKeyIn}`);
  }
  return out;
}

function requestLines(name: string, req: ApiRequest): string[] {
  const out = [`### ${name}`, `${req.method} ${req.url}`];
  if (req.protocol !== 'http') out.push(`protocol: ${req.protocol}`);
  if (!req.autoToken) out.push('autoToken: false');
  out.push(...authLines(req.auth));
  out.push(...kvLines('header', req.headers));
  out.push(...kvLines('query', req.params));

  if (req.bodyType !== 'none') {
    out.push(`bodyType: ${req.bodyType}`);
    if (req.bodyType === 'form' || req.bodyType === 'urlencoded') {
      out.push(...kvLines('form', req.formData));
    } else if (req.body) {
      out.push('', ...block('body', req.body));
    }
    if (req.bodyType === 'graphql' && req.graphqlVars) {
      out.push(...block('graphqlVars', req.graphqlVars));
    }
  }

  if (req.tests) out.push('', ...block('tests', req.tests));
  if (req.responseSchema) out.push(...block('responseSchema', req.responseSchema));
  if (req.preScript) out.push(...block('preScript', req.preScript));
  if (req.postScript) out.push(...block('postScript', req.postScript));
  return out;
}

function emitContainer(container: Container, path: string[], out: string[]): void {
  if (path.length) out.push('', `>> folder: ${path.join(FOLDER_SEP)}`);
  for (const r of container.requests) out.push('', ...requestLines(r.name, r.request));
  for (const f of container.folders) emitContainer(f, [...path, f.name], out);
}

export function buildCodeExport(collections: Collection[]): string {
  const out = [
    HEADER,
    '# Plain-text, chỉnh tay & commit git thoải mái. Import lại bằng nút Import trong curly.',
    '# Chạy CI: node scripts/run-tests.mjs <file> [--env env.json]',
  ];
  for (const col of collections) {
    out.push('', `== collection: ${col.name}`);
    emitContainer(col, [], out);
  }
  return out.join('\n') + '\n';
}

function newRequest(): ApiRequest {
  const req = blankRequest();
  req.params = [];
  req.headers = [];
  req.formData = [];
  return req;
}

function row(key: string, value: string, enabled: boolean): KeyValue {
  return { id: crypto.randomUUID(), enabled, key, value };
}

function splitKv(rest: string): [string, string] {
  const eq = rest.indexOf('=');
  if (eq < 0) return [rest.trim(), ''];
  return [rest.slice(0, eq).trim(), rest.slice(eq + 1)];
}

function pad(list: KeyValue[]): KeyValue[] {
  return list.length ? list : [row('', '', true)];
}

function applyAuthField(auth: Auth, rest: string): void {
  const [field, value] = splitKv(rest);
  switch (field) {
    case 'bearerToken':
      auth.bearerToken = value;
      break;
    case 'basicUser':
      auth.basicUser = value;
      break;
    case 'basicPass':
      auth.basicPass = value;
      break;
    case 'apiKeyName':
      auth.apiKeyName = value;
      break;
    case 'apiKeyValue':
      auth.apiKeyValue = value;
      break;
    case 'apiKeyIn':
      auth.apiKeyIn = value === 'query' ? 'query' : 'header';
      break;
  }
}

export function parseCodeExport(text: string): Collection[] {
  const lines = text.split(/\r?\n/);
  const collections: Collection[] = [];
  let col: Collection | null = null;
  let path: string[] = [];
  let req: ApiRequest | null = null;
  let pending: { name: string; req: ApiRequest; target: Container } | null = null;
  let expectMethod = false;

  const container = (): Container => {
    if (!col) {
      col = { id: crypto.randomUUID(), name: 'Imported', requests: [], folders: [] };
      collections.push(col);
    }
    let node: Container = col;
    for (const seg of path) {
      let next = node.folders.find((f) => f.name === seg);
      if (!next) {
        next = { id: crypto.randomUUID(), name: seg, requests: [], folders: [] };
        node.folders.push(next);
      }
      node = next;
    }
    return node;
  };

  const flush = (): void => {
    if (pending && req) {
      req.params = pad(req.params);
      req.headers = pad(req.headers);
      req.formData = pad(req.formData);
      pending.target.requests.push({ id: crypto.randomUUID(), name: pending.name, request: req });
    }
    pending = null;
    req = null;
  };

  const readBlock = (start: number): [string, number] => {
    const acc: string[] = [];
    let j = start;
    while (j < lines.length && (lines[j] === '' || lines[j].startsWith('  '))) {
      acc.push(lines[j] === '' ? '' : lines[j].slice(2));
      j++;
    }
    while (acc.length && acc[acc.length - 1] === '') acc.pop();
    return [acc.join('\n'), j];
  };

  const pushKv = (list: KeyValue[], rest: string, enabled: boolean): void => {
    const [key, value] = splitKv(rest);
    list.push(row(key, value, enabled));
  };

  for (let i = 0; i < lines.length;) {
    const line = lines[i];

    if (expectMethod && req) {
      const sp = line.indexOf(' ');
      req.method = (sp < 0 ? line : line.slice(0, sp)).toUpperCase() as ApiRequest['method'];
      req.url = sp < 0 ? '' : line.slice(sp + 1);
      expectMethod = false;
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      flush();
      req = newRequest();
      pending = { name: line.slice(4).trim(), req, target: container() };
      expectMethod = true;
      i++;
      continue;
    }

    if (line.startsWith('== collection:')) {
      flush();
      col = { id: crypto.randomUUID(), name: line.slice(14).trim(), requests: [], folders: [] };
      collections.push(col);
      path = [];
      i++;
      continue;
    }

    if (line.startsWith('>> folder:')) {
      flush();
      path = line.slice(10).trim().split(FOLDER_SEP);
      container();
      i++;
      continue;
    }

    if (line.startsWith('#') || line.trim() === '') {
      i++;
      continue;
    }

    if (req) {
      if (line.startsWith('protocol:')) {
        req.protocol = line.slice(9).trim() as ApiRequest['protocol'];
      } else if (line.startsWith('autoToken:')) {
        req.autoToken = line.slice(10).trim() !== 'false';
      } else if (line.startsWith('auth.')) {
        applyAuthField(req.auth, line.slice(5));
      } else if (line.startsWith('auth:')) {
        req.auth.type = line.slice(5).trim() as Auth['type'];
      } else if (line.startsWith('bodyType:')) {
        req.bodyType = line.slice(9).trim() as ApiRequest['bodyType'];
      } else if (line.startsWith('header-off ')) {
        pushKv(req.headers, line.slice(11), false);
      } else if (line.startsWith('header ')) {
        pushKv(req.headers, line.slice(7), true);
      } else if (line.startsWith('query-off ')) {
        pushKv(req.params, line.slice(10), false);
      } else if (line.startsWith('query ')) {
        pushKv(req.params, line.slice(6), true);
      } else if (line.startsWith('form-off ')) {
        pushKv(req.formData, line.slice(9), false);
      } else if (line.startsWith('form ')) {
        pushKv(req.formData, line.slice(5), true);
      } else if (line === 'body:') {
        const [content, next] = readBlock(i + 1);
        req.body = content;
        i = next;
        continue;
      } else if (line === 'graphqlVars:') {
        const [content, next] = readBlock(i + 1);
        req.graphqlVars = content;
        i = next;
        continue;
      } else if (line === 'tests:') {
        const [content, next] = readBlock(i + 1);
        req.tests = content;
        i = next;
        continue;
      } else if (line === 'responseSchema:') {
        const [content, next] = readBlock(i + 1);
        req.responseSchema = content;
        i = next;
        continue;
      } else if (line === 'preScript:') {
        const [content, next] = readBlock(i + 1);
        req.preScript = content;
        i = next;
        continue;
      } else if (line === 'postScript:') {
        const [content, next] = readBlock(i + 1);
        req.postScript = content;
        i = next;
        continue;
      }
    }
    i++;
  }

  flush();
  return collections;
}
