import type {
  ApiRequest,
  Collection,
  Folder,
  HistoryEntry,
  KeyValue,
  SavedRequest,
} from '../types/request';

interface ExampleResp {
  status: number;
  contentType: string;
  data: unknown;
  raw: string;
}

function enabledPairs(list: KeyValue[]): [string, string][] {
  return list.filter((p) => p.enabled && p.key.trim()).map((p) => [p.key, p.value]);
}

function authSummary(req: ApiRequest): string {
  switch (req.auth.type) {
    case 'bearer':
      return 'Bearer token';
    case 'basic':
      return 'Basic auth';
    case 'apikey':
      return `API key (${req.auth.apiKeyIn}: ${req.auth.apiKeyName || '—'})`;
    default:
      return '';
  }
}

function bodyLabel(req: ApiRequest): string {
  switch (req.bodyType) {
    case 'json':
      return 'JSON';
    case 'raw':
      return 'Raw';
    case 'graphql':
      return 'GraphQL';
    case 'form':
      return 'Form-data';
    case 'urlencoded':
      return 'URL-encoded';
    default:
      return '';
  }
}

function contentTypeOf(req: ApiRequest): string {
  const explicit = req.headers.find(
    (h) => h.enabled && h.key.trim().toLowerCase() === 'content-type',
  );
  if (explicit && explicit.value.trim()) return explicit.value.trim();
  switch (req.bodyType) {
    case 'json':
    case 'graphql':
      return 'application/json';
    case 'form':
      return 'multipart/form-data';
    case 'urlencoded':
      return 'application/x-www-form-urlencoded';
    case 'raw':
      return 'text/plain';
    default:
      return 'None';
  }
}

function scalarType(raw: string): string {
  const v = raw.trim();
  if (v === '' || v.includes('{{')) return 'string';
  if (/^-?\d+$/.test(v) || /^-?\d*\.\d+$/.test(v)) return 'number';
  if (v === 'true' || v === 'false') return 'boolean';
  return 'string';
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

function splitUrl(url: string): { path: string; query: [string, string][] } {
  const qIndex = url.indexOf('?');
  const rawPath = qIndex >= 0 ? url.slice(0, qIndex) : url;
  const rawQuery = qIndex >= 0 ? url.slice(qIndex + 1) : '';
  let path = rawPath;
  try {
    path = new URL(rawPath).pathname || rawPath;
  } catch {
    path = rawPath;
  }
  const query: [string, string][] = [];
  for (const part of rawQuery.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = decode(eq >= 0 ? part.slice(0, eq) : part);
    const v = eq >= 0 ? decode(part.slice(eq + 1)) : '';
    if (k) query.push([k, v]);
  }
  return { path, query };
}

function queryParams(req: ApiRequest): { path: string; params: [string, string][] } {
  const { path, query } = splitUrl(req.url);
  const seen = new Set<string>();
  const params: [string, string][] = [];
  for (const [k, v] of [...query, ...enabledPairs(req.params)]) {
    if (seen.has(k)) continue;
    seen.add(k);
    params.push([k, v]);
  }
  return { path, params };
}

function jsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  return t === 'object' ? 'object' : t;
}

function sampleCell(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array (${v.length})`;
  if (typeof v === 'object') return 'object';
  const s = String(v);
  return s.length > 48 ? s.slice(0, 47) + '…' : s;
}

function responseObjects(data: unknown): { label: string; rows: string[][] }[] {
  const tables: { label: string; rows: string[][] }[] = [];
  const walk = (value: unknown, label: string, depth: number) => {
    let obj: Record<string, unknown> | null = null;
    if (Array.isArray(value)) {
      const first = value.find((x) => x && typeof x === 'object' && !Array.isArray(x));
      if (first) obj = first as Record<string, unknown>;
    } else if (value && typeof value === 'object') {
      obj = value as Record<string, unknown>;
    }
    if (!obj) return;
    const entries = Object.entries(obj);
    if (!entries.length) return;
    tables.push({
      label,
      rows: entries.map(([k, v]) => [k, jsonType(v), sampleCell(v)]),
    });
    if (depth < 2) {
      for (const [k, v] of entries) {
        if (v && typeof v === 'object') walk(v, `${label} → ${k}`, depth + 1);
      }
    }
  };
  walk(data, 'data', 0);
  return tables;
}

function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, '\\|') || '—').join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

function normPath(url: string): string {
  const { path } = splitUrl(url);
  return path.replace(/\/+$/, '');
}

function respFromHistory(req: ApiRequest, history: HistoryEntry[]): ExampleResp | null {
  const reqPath = normPath(req.url);
  for (const h of history) {
    if (!h.response) continue;
    if ((h.method || h.request.method) !== req.method) continue;
    const hUrl = h.url || h.request.url || '';
    const hPath = normPath(hUrl);
    if (hUrl === req.url || (reqPath && (hPath === reqPath || hPath.endsWith(reqPath)))) {
      const headers = h.response.headers || {};
      const ct = headers['content-type'] || headers['Content-Type'] || '';
      return {
        status: h.response.status,
        contentType: ct,
        data: h.response.data,
        raw: h.response.raw,
      };
    }
  }
  return null;
}

function exampleResponse(req: ApiRequest, history: HistoryEntry[]): ExampleResp | null {
  if (req.snapshot) {
    return {
      status: req.snapshot.status,
      contentType: req.snapshot.contentType,
      data: req.snapshot.data,
      raw: req.snapshot.raw,
    };
  }
  return respFromHistory(req, history);
}

function sampleJson(ex: ExampleResp): string {
  if (ex.raw && ex.raw.trim()) return ex.raw.trim();
  try {
    return JSON.stringify(ex.data, null, 2);
  } catch {
    return '';
  }
}

function requestMd(saved: SavedRequest, level: number, history: HistoryEntry[]): string {
  const req = saved.request;
  const h = '#'.repeat(Math.min(level, 6));
  const sub = '#'.repeat(Math.min(level + 1, 6));
  const { path, params } = queryParams(req);
  const ex = exampleResponse(req, history);
  const out: string[] = [`${h} ${saved.name}`, '', `\`${req.method}\` \`${req.url || '—'}\``, ''];

  out.push(`${sub} HTTP request`, '');
  out.push(`- **URL:** \`${path || '—'}\``);
  out.push(`- **Method:** \`${req.method}\``);
  out.push(`- **Content-Type:** \`${contentTypeOf(req)}\``);
  const respType = ex?.contentType?.split(';')[0].trim();
  out.push(`- **Response Type:** \`${respType || 'application/json'}\``, '');

  const headers = enabledPairs(req.headers);
  if (headers.length) {
    out.push(`${sub} Tham số header`, '');
    out.push(
      mdTable(
        ['Header', 'Giá trị', 'Bắt buộc'],
        headers.map(([k, v]) => [k, v, 'có']),
      ),
      '',
    );
  }

  if (params.length) {
    out.push(`${sub} Tham số truy vấn (Query params)`, '');
    out.push(
      mdTable(
        ['Tên tham số', 'Kiểu dữ liệu', 'Giá trị mẫu'],
        params.map(([k, v]) => [k, scalarType(v), v]),
      ),
      '',
    );
  }

  const auth = authSummary(req);
  if (auth) out.push(`**Auth:** ${auth}`, '');

  if (req.bodyType !== 'none') {
    out.push(`${sub} Body (${bodyLabel(req)})`, '');
    if (req.bodyType === 'form' || req.bodyType === 'urlencoded') {
      const fields = enabledPairs(req.formData);
      if (fields.length)
        out.push(
          mdTable(
            ['Field', 'Kiểu dữ liệu', 'Giá trị mẫu'],
            fields.map(([k, v]) => [k, scalarType(v), v]),
          ),
          '',
        );
    } else if (req.body.trim()) {
      const lang = req.bodyType === 'json' || req.bodyType === 'graphql' ? 'json' : '';
      out.push('```' + lang, req.body.trim(), '```', '');
    }
    if (req.bodyType === 'graphql' && req.graphqlVars.trim()) {
      out.push('_Variables_', '', '```json', req.graphqlVars.trim(), '```', '');
    }
  }

  if (req.tests.trim()) out.push(`${sub} Tests`, '', '```', req.tests.trim(), '```', '');

  if (ex) {
    out.push(`${sub} Phản hồi (Response)`, '');
    out.push(`- **Status:** \`${ex.status}\``, '');
    const sample = sampleJson(ex);
    if (sample) out.push('```json', sample, '```', '');
    const tables = responseObjects(ex.data);
    if (tables.length) {
      out.push('**Chi tiết tham số response**', '');
      for (const t of tables) {
        out.push(
          `_${t.label}_`,
          '',
          mdTable(['Tên thuộc tính', 'Kiểu dữ liệu', 'Giá trị mẫu'], t.rows),
          '',
        );
      }
    }
  }

  return out.join('\n');
}

function containerMd(
  container: { requests: SavedRequest[]; folders: Folder[] },
  level: number,
  history: HistoryEntry[],
): string {
  const blocks: string[] = [];
  for (const f of container.folders) {
    blocks.push(`${'#'.repeat(Math.min(level, 6))} 🗂 ${f.name}`);
    blocks.push(containerMd(f, level + 1, history));
  }
  for (const r of container.requests) {
    blocks.push(requestMd(r, level, history));
  }
  return blocks.filter(Boolean).join('\n\n');
}

function countRequests(container: { requests: SavedRequest[]; folders: Folder[] }): number {
  let n = container.requests.length;
  for (const f of container.folders) n += countRequests(f);
  return n;
}

export function buildDocsMarkdown(collection: Collection, history: HistoryEntry[] = []): string {
  const total = countRequests(collection);
  const head = [
    `# ${collection.name}`,
    '',
    `_Tài liệu API tự động tạo bởi curly · ${total} request_`,
    '',
  ].join('\n');
  return `${head}\n${containerMd(collection, 2, history)}\n`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlTable(headers: string[], rows: string[][]): string {
  return (
    '<table><thead><tr>' +
    headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('') +
    '</tr></thead><tbody>' +
    rows
      .map((r) => '<tr>' + r.map((c) => `<td>${escapeHtml(c || '—')}</td>`).join('') + '</tr>')
      .join('') +
    '</tbody></table>'
  );
}

export function buildDocsHtml(collection: Collection, history: HistoryEntry[] = []): string {
  const md = buildDocsMarkdown(collection, history);
  const body = renderHtmlBody(collection, 2, history);
  return [
    '<!doctype html>',
    '<html lang="vi">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(collection.name)} — API docs</title>`,
    '<style>',
    'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:900px;margin:0 auto;padding:32px 20px;color:#1b1f2a;line-height:1.6}',
    'h1,h2,h3,h4,h5,h6{line-height:1.25}',
    'code{background:#f0f1f5;padding:2px 6px;border-radius:5px;font-size:0.9em}',
    'pre{background:#0d1117;color:#e6edf3;padding:14px 16px;border-radius:8px;overflow:auto}',
    'pre code{background:none;padding:0;color:inherit}',
    'table{border-collapse:collapse;width:100%;margin:8px 0}',
    'th,td{border:1px solid #d5d8e0;padding:6px 10px;text-align:left;font-size:14px}',
    'th{background:#f5f6fa}',
    '.method{font-weight:700}',
    'ul.meta{list-style:none;padding:0;margin:8px 0}',
    'ul.meta li{margin:2px 0}',
    '</style>',
    '</head>',
    '<body>',
    body,
    '<hr />',
    `<details><summary>Markdown</summary><pre><code>${escapeHtml(md)}</code></pre></details>`,
    '</body>',
    '</html>',
  ].join('\n');
}

function renderRequestHtml(saved: SavedRequest, level: number, history: HistoryEntry[]): string {
  const req = saved.request;
  const tag = `h${Math.min(level, 6)}`;
  const subTag = `h${Math.min(level + 1, 6)}`;
  const { path, params } = queryParams(req);
  const ex = exampleResponse(req, history);
  const out: string[] = [`<${tag}>${escapeHtml(saved.name)}</${tag}>`];
  out.push(
    `<p class="method"><code>${escapeHtml(req.method)}</code> <code>${escapeHtml(req.url || '—')}</code></p>`,
  );

  const respType = ex?.contentType?.split(';')[0].trim();
  out.push(`<${subTag}>HTTP request</${subTag}>`);
  out.push(
    '<ul class="meta">' +
      `<li><strong>URL:</strong> <code>${escapeHtml(path || '—')}</code></li>` +
      `<li><strong>Method:</strong> <code>${escapeHtml(req.method)}</code></li>` +
      `<li><strong>Content-Type:</strong> <code>${escapeHtml(contentTypeOf(req))}</code></li>` +
      `<li><strong>Response Type:</strong> <code>${escapeHtml(respType || 'application/json')}</code></li>` +
      '</ul>',
  );

  const headers = enabledPairs(req.headers);
  if (headers.length) {
    out.push(`<${subTag}>Tham số header</${subTag}>`);
    out.push(
      htmlTable(
        ['Header', 'Giá trị', 'Bắt buộc'],
        headers.map(([k, v]) => [k, v, 'có']),
      ),
    );
  }

  if (params.length) {
    out.push(`<${subTag}>Tham số truy vấn (Query params)</${subTag}>`);
    out.push(
      htmlTable(
        ['Tên tham số', 'Kiểu dữ liệu', 'Giá trị mẫu'],
        params.map(([k, v]) => [k, scalarType(v), v]),
      ),
    );
  }

  const auth = authSummary(req);
  if (auth) out.push(`<p><strong>Auth:</strong> ${escapeHtml(auth)}</p>`);

  if (req.bodyType !== 'none') {
    out.push(`<${subTag}>Body (${escapeHtml(bodyLabel(req))})</${subTag}>`);
    if (req.bodyType === 'form' || req.bodyType === 'urlencoded') {
      const fields = enabledPairs(req.formData);
      if (fields.length)
        out.push(
          htmlTable(
            ['Field', 'Kiểu dữ liệu', 'Giá trị mẫu'],
            fields.map(([k, v]) => [k, scalarType(v), v]),
          ),
        );
    } else if (req.body.trim()) {
      out.push(`<pre><code>${escapeHtml(req.body.trim())}</code></pre>`);
    }
  }

  if (ex) {
    out.push(`<${subTag}>Phản hồi (Response)</${subTag}>`);
    out.push(`<p><strong>Status:</strong> <code>${escapeHtml(String(ex.status))}</code></p>`);
    const sample = sampleJson(ex);
    if (sample) out.push(`<pre><code>${escapeHtml(sample)}</code></pre>`);
    const tables = responseObjects(ex.data);
    if (tables.length) {
      out.push('<p><strong>Chi tiết tham số response</strong></p>');
      for (const t of tables) {
        out.push(`<p><em>${escapeHtml(t.label)}</em></p>`);
        out.push(htmlTable(['Tên thuộc tính', 'Kiểu dữ liệu', 'Giá trị mẫu'], t.rows));
      }
    }
  }
  return out.join('\n');
}

function renderHtmlBody(
  container: { name?: string; requests: SavedRequest[]; folders: Folder[] },
  level: number,
  history: HistoryEntry[],
): string {
  const blocks: string[] = [];
  if (level === 2 && container.name) {
    blocks.push(`<h1>${escapeHtml(container.name)}</h1>`);
    blocks.push(
      `<p><em>Tài liệu API tự động tạo bởi curly · ${countRequests({ requests: container.requests, folders: container.folders })} request</em></p>`,
    );
  }
  for (const f of container.folders) {
    blocks.push(`<h${Math.min(level, 6)}>🗂 ${escapeHtml(f.name)}</h${Math.min(level, 6)}>`);
    blocks.push(renderHtmlBody(f, level + 1, history));
  }
  for (const r of container.requests) blocks.push(renderRequestHtml(r, level + 1, history));
  return blocks.join('\n');
}
