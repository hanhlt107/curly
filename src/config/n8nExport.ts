import type { ApiRequest, Auth, Collection, KeyValue } from '../types/request';
import { locateRequests } from './collections';

export interface N8nExportOptions {
  name?: string;
  everyMinutes?: number;
  webhookUrl?: string;
}

const DISCORD_PLACEHOLDER = 'https://discord.com/api/webhooks/REPLACE_ME';

interface N8nNode {
  parameters: Record<string, unknown>;
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  continueOnFail?: boolean;
  alwaysOutputData?: boolean;
}

type Connections = Record<string, { main: { node: string; type: 'main'; index: number }[][] }>;

function uid(): string {
  return crypto.randomUUID();
}

function enabledKv(list: KeyValue[]): { name: string; value: string }[] {
  return list
    .filter((p) => p.enabled && p.key.trim())
    .map((p) => ({ name: p.key.trim(), value: p.value }));
}

function b64(text: string): string {
  // Export chỉ chạy trong trình duyệt (thao tác của người dùng) nên btoa luôn có sẵn.
  return btoa(unescape(encodeURIComponent(text)));
}

function applyAuth(
  auth: Auth,
  headers: { name: string; value: string }[],
  query: { name: string; value: string }[],
): void {
  if (auth.type === 'bearer' && auth.bearerToken) {
    headers.push({ name: 'Authorization', value: `Bearer ${auth.bearerToken}` });
  } else if (auth.type === 'basic') {
    headers.push({ name: 'Authorization', value: `Basic ${b64(`${auth.basicUser}:${auth.basicPass}`)}` });
  } else if (auth.type === 'apikey' && auth.apiKeyName) {
    const row = { name: auth.apiKeyName, value: auth.apiKeyValue };
    if (auth.apiKeyIn === 'query') query.push(row);
    else headers.push(row);
  }
}

function bodyParams(req: ApiRequest): Record<string, unknown> {
  switch (req.bodyType) {
    case 'json':
      return { sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: req.body };
    case 'raw':
      return { sendBody: true, contentType: 'raw', rawContentType: 'text/plain', body: req.body };
    case 'graphql': {
      let variables: unknown = {};
      try {
        variables = req.graphqlVars ? JSON.parse(req.graphqlVars) : {};
      } catch {
        variables = {};
      }
      const payload = JSON.stringify({ query: req.body, variables });
      return { sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: payload };
    }
    case 'form':
      return {
        sendBody: true,
        contentType: 'multipart-form-data',
        bodyParameters: { parameters: enabledKv(req.formData) },
      };
    case 'urlencoded':
      return {
        sendBody: true,
        contentType: 'form-urlencoded',
        bodyParameters: { parameters: enabledKv(req.formData) },
      };
    default:
      return {};
  }
}

function httpNode(name: string, req: ApiRequest, position: [number, number]): N8nNode {
  const headers = enabledKv(req.headers);
  const query = enabledKv(req.params);
  applyAuth(req.auth, headers, query);

  const parameters: Record<string, unknown> = {
    method: req.method,
    url: req.url,
    ...bodyParams(req),
    options: { response: { response: { fullResponse: true, neverError: true } } },
  };
  if (headers.length) {
    parameters.sendHeaders = true;
    parameters.specifyHeaders = 'keypair';
    parameters.headerParameters = { parameters: headers };
  }
  if (query.length) {
    parameters.sendQuery = true;
    parameters.specifyQuery = 'keypair';
    parameters.queryParameters = { parameters: query };
  }

  return {
    parameters,
    id: uid(),
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    continueOnFail: true,
    alwaysOutputData: true,
  };
}

/** Các assertion sẽ được kiểm tra lại bên trong n8n. Mirror cú pháp của src/config/tests.ts. */
function assertionLines(req: ApiRequest): string[] {
  const raw = (req.tests ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  // Không có assertion → giám sát uptime tối thiểu: coi 4xx/5xx là lỗi.
  return raw.length ? raw : ['status < 400'];
}

/** Bộ chấm assertion nhúng vào Code node của n8n (chạy lại logic của curly). */
const CHECK_EVALUATOR = `
function getPath(data, path) {
  const parts = String(path).split('.').filter(Boolean);
  let cur = data;
  for (const p of parts) {
    if (cur == null) return undefined;
    const m = p.match(/^(\\w+)\\[(\\d+)\\]$/);
    if (m) { cur = cur[m[1]]; if (Array.isArray(cur)) cur = cur[Number(m[2])]; continue; }
    if (/^\\d+$/.test(p) && Array.isArray(cur)) cur = cur[Number(p)];
    else cur = cur[p];
  }
  return cur;
}
function cmp(a, op, b) {
  if (op === '>') return a > b;
  if (op === '<') return a < b;
  if (op === '>=') return a >= b;
  if (op === '<=') return a <= b;
  return a === b;
}
function evalLine(line, ctx) {
  const t = line.trim();
  if (!t || t.startsWith('#')) return null;
  let m;
  if ((m = t.match(/^status\\s*(>=|<=|>|<)\\s*(\\d+)$/i)))
    return { name: t, passed: cmp(ctx.status, m[1], Number(m[2])) };
  if ((m = t.match(/^status\\s*(===?|!=)\\s*(\\d+)$/i))) {
    const eq = ctx.status === Number(m[2]);
    return { name: t, passed: m[1] === '!=' ? !eq : eq };
  }
  if ((m = t.match(/^body\\s+contains\\s+(.+)$/i))) {
    const needle = m[1].replace(/^["']|["']$/g, '');
    return { name: t, passed: ctx.raw.includes(needle) };
  }
  if ((m = t.match(/^body\\s+matches\\s+\\/(.+)\\/([a-z]*)$/i))) {
    try { return { name: t, passed: new RegExp(m[1], m[2]).test(ctx.raw) }; }
    catch { return { name: t, passed: false, message: 'regex không hợp lệ' }; }
  }
  if ((m = t.match(/^header\\s+([\\w-]+)\\s*(===?|!=|contains)\\s*(.+)$/i))) {
    const actual = ctx.headers[m[1].toLowerCase()] || '';
    const exp = m[3].trim().replace(/^["']|["']$/g, '');
    const op = m[2].toLowerCase();
    const ok = op === 'contains' ? actual.toLowerCase().includes(exp.toLowerCase())
      : op === '!=' ? actual !== exp : actual === exp;
    return { name: t, passed: ok, message: ok ? undefined : 'nhận "' + actual + '"' };
  }
  if ((m = t.match(/^json\\s+([\\w.\\[\\]]+)\\s*(>=|<=|>|<)\\s*(-?\\d+(?:\\.\\d+)?)$/i))) {
    const num = Number(getPath(ctx.data, m[1]));
    return { name: t, passed: !Number.isNaN(num) && cmp(num, m[2], Number(m[3])) };
  }
  if ((m = t.match(/^json\\s+([\\w.\\[\\]]+)\\s*(===?|!=)\\s*(.+)$/i))) {
    const actual = getPath(ctx.data, m[1]);
    let exp = m[3].trim().replace(/^["']|["']$/g, '');
    if (/^\\d+(\\.\\d+)?$/.test(m[3].trim())) exp = Number(m[3].trim());
    else if (m[3].trim() === 'true') exp = true;
    else if (m[3].trim() === 'false') exp = false;
    const eq = actual === exp || String(actual) === String(exp);
    return { name: t, passed: m[2] === '!=' ? !eq : eq, message: eq ? undefined : 'nhận ' + JSON.stringify(actual) };
  }
  // time <...>: n8n HTTP Request không cung cấp thời gian phản hồi → bỏ qua.
  if (/^time\\s*(>=|<=|>|<)/i.test(t)) return null;
  return { name: t, passed: false, message: 'không hiểu cú pháp' };
}
`.trim();

function checkNode(name: string, reqName: string, lines: string[], position: [number, number]): N8nNode {
  const jsCode = `${CHECK_EVALUATOR}

const lines = ${JSON.stringify(lines)};
const reqName = ${JSON.stringify(reqName)};
const r = $input.first().json;
const status = r.statusCode != null ? r.statusCode : (r.status != null ? r.status : 0);
const rawHeaders = r.headers || {};
const headers = {};
for (const k in rawHeaders) headers[k.toLowerCase()] = String(rawHeaders[k]);
const body = r.body !== undefined ? r.body : r;
const raw = typeof body === 'string' ? body : JSON.stringify(body == null ? '' : body);
let data = body;
if (typeof body === 'string') { try { data = JSON.parse(body); } catch (e) { data = body; } }
const ctx = { status, headers, raw, data };

const failures = [];
for (const line of lines) {
  const res = evalLine(line, ctx);
  if (res && !res.passed) failures.push(res.name + (res.message ? ' — ' + res.message : ''));
}
if (failures.length === 0) return [];
const text = '🔴 **' + reqName + '** lỗi (HTTP ' + status + ')\\n'
  + failures.map(f => '• ' + f).join('\\n');
return [{ json: { request: reqName, status, failures, text } }];`;

  return {
    parameters: { jsCode },
    id: uid(),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
}

function scheduleNode(everyMinutes: number, position: [number, number]): N8nNode {
  return {
    parameters: {
      rule: { interval: [{ field: 'minutes', minutesInterval: everyMinutes }] },
    },
    id: uid(),
    name: 'Lịch giám sát',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position,
  };
}

function discordNode(webhookUrl: string, position: [number, number]): N8nNode {
  return {
    parameters: {
      method: 'POST',
      url: webhookUrl,
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ content: $json.text }) }}',
      options: {},
    },
    id: uid(),
    name: 'Cảnh báo Discord',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
  };
}

function stickyNode(everyMinutes: number, hasPlaceholder: boolean, position: [number, number]): N8nNode {
  const lines = [
    '## Giám sát API — sinh từ curly',
    '',
    `Chạy mỗi **${everyMinutes} phút**. Mỗi request được gọi lại và kiểm tra assertion;`,
    'nếu lỗi sẽ gửi cảnh báo vào Discord.',
    '',
    '**Cần chỉnh sau khi import:**',
    hasPlaceholder
      ? '1. Node **Cảnh báo Discord** → dán Webhook URL thật (đang là REPLACE_ME).'
      : '1. Kiểm tra lại Webhook URL trong node **Cảnh báo Discord**.',
    '2. Nếu URL có biến `{{ }}` của curly, thay bằng giá trị thật hoặc n8n expression.',
    '3. Bấm **Publish** để bật giám sát tự động.',
  ];
  return {
    parameters: { content: lines.join('\n'), height: 320, width: 420, color: 4 },
    id: uid(),
    name: 'Hướng dẫn',
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position,
  };
}

export function buildN8nWorkflow(collections: Collection[], opts: N8nExportOptions = {}): unknown {
  const everyMinutes = Math.max(1, opts.everyMinutes ?? 15);
  const webhookUrl = opts.webhookUrl?.trim() || DISCORD_PLACEHOLDER;
  const located = locateRequests(collections).filter((l) => l.saved.request.protocol === 'http');

  const nodes: N8nNode[] = [];
  const connections: Connections = {};
  const connect = (from: string, to: string) => {
    (connections[from] ??= { main: [[]] }).main[0].push({ node: to, type: 'main', index: 0 });
  };

  nodes.push(stickyNode(everyMinutes, webhookUrl === DISCORD_PLACEHOLDER, [0, -60]));
  const schedule = scheduleNode(everyMinutes, [460, 300]);
  nodes.push(schedule);
  const discord = discordNode(webhookUrl, [1180, 300]);

  const stepY = 200;
  const startY = 100;
  located.forEach((loc, i) => {
    const y = startY + i * stepY;
    const label = loc.saved.name || `Request ${i + 1}`;
    const http = httpNode(`↗ ${label}`.slice(0, 60), loc.saved.request, [700, y]);
    const check = checkNode(
      `✓ ${label}`.slice(0, 60),
      loc.path ? `${loc.path} / ${label}` : label,
      assertionLines(loc.saved.request),
      [940, y],
    );
    nodes.push(http, check);
    connect(schedule.name, http.name);
    connect(http.name, check.name);
    connect(check.name, discord.name);
  });

  nodes.push(discord);

  return {
    name: opts.name?.trim() || 'curly · Giám sát API',
    nodes,
    connections,
    active: false,
    settings: { executionOrder: 'v1' },
    meta: { generatedBy: 'curly' },
  };
}

export function n8nWorkflowFilename(): string {
  return `curly-monitor-${new Date().toISOString().slice(0, 10)}.json`;
}
