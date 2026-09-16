import type { ApiRequest, Collection, Folder, KeyValue, SavedRequest } from '../types/request';

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

function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, '\\|') || '—').join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

function requestMd(saved: SavedRequest, level: number): string {
  const req = saved.request;
  const h = '#'.repeat(Math.min(level, 6));
  const out: string[] = [`${h} ${saved.name}`, '', `\`${req.method}\` \`${req.url || '—'}\``, ''];

  const params = enabledPairs(req.params);
  if (params.length) {
    out.push('**Query params**', '', mdTable(['Key', 'Value'], params), '');
  }
  const headers = enabledPairs(req.headers);
  if (headers.length) {
    out.push('**Headers**', '', mdTable(['Header', 'Value'], headers), '');
  }
  const auth = authSummary(req);
  if (auth) out.push(`**Auth:** ${auth}`, '');

  if (req.bodyType !== 'none') {
    out.push(`**Body** (${bodyLabel(req)})`, '');
    if (req.bodyType === 'form' || req.bodyType === 'urlencoded') {
      const fields = enabledPairs(req.formData);
      if (fields.length) out.push(mdTable(['Field', 'Value'], fields), '');
    } else if (req.body.trim()) {
      const lang = req.bodyType === 'json' || req.bodyType === 'graphql' ? 'json' : '';
      out.push('```' + lang, req.body.trim(), '```', '');
    }
    if (req.bodyType === 'graphql' && req.graphqlVars.trim()) {
      out.push('_Variables_', '', '```json', req.graphqlVars.trim(), '```', '');
    }
  }

  if (req.tests.trim()) out.push('**Tests**', '', '```', req.tests.trim(), '```', '');

  return out.join('\n');
}

function containerMd(
  container: { requests: SavedRequest[]; folders: Folder[] },
  level: number,
): string {
  const blocks: string[] = [];
  for (const f of container.folders) {
    blocks.push(`${'#'.repeat(Math.min(level, 6))} 🗂 ${f.name}`);
    blocks.push(containerMd(f, level + 1));
  }
  for (const r of container.requests) {
    blocks.push(requestMd(r, level));
  }
  return blocks.filter(Boolean).join('\n');
}

function countRequests(container: { requests: SavedRequest[]; folders: Folder[] }): number {
  let n = container.requests.length;
  for (const f of container.folders) n += countRequests(f);
  return n;
}

export function buildDocsMarkdown(collection: Collection): string {
  const total = countRequests(collection);
  const head = [
    `# ${collection.name}`,
    '',
    `_Tài liệu API tự động tạo bởi curly · ${total} request_`,
    '',
  ].join('\n');
  return `${head}\n${containerMd(collection, 2)}\n`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildDocsHtml(collection: Collection): string {
  const md = buildDocsMarkdown(collection);
  const body = renderHtmlBody(collection, 2);
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

function renderRequestHtml(saved: SavedRequest, level: number): string {
  const req = saved.request;
  const tag = `h${Math.min(level, 6)}`;
  const out: string[] = [`<${tag}>${escapeHtml(saved.name)}</${tag}>`];
  out.push(
    `<p class="method"><code>${escapeHtml(req.method)}</code> <code>${escapeHtml(req.url || '—')}</code></p>`,
  );

  const table = (caption: string, headers: string[], rows: [string, string][]) => {
    if (!rows.length) return;
    out.push(`<p><strong>${caption}</strong></p>`);
    out.push('<table><thead><tr>' + headers.map((h) => `<th>${h}</th>`).join('') + '</tr></thead>');
    out.push(
      '<tbody>' +
        rows
          .map(
            ([k, v]) => `<tr><td>${escapeHtml(k || '—')}</td><td>${escapeHtml(v || '—')}</td></tr>`,
          )
          .join('') +
        '</tbody></table>',
    );
  };
  table('Query params', ['Key', 'Value'], enabledPairs(req.params));
  table('Headers', ['Header', 'Value'], enabledPairs(req.headers));

  const auth = authSummary(req);
  if (auth) out.push(`<p><strong>Auth:</strong> ${escapeHtml(auth)}</p>`);

  if (req.bodyType !== 'none') {
    out.push(`<p><strong>Body</strong> (${escapeHtml(bodyLabel(req))})</p>`);
    if (req.bodyType === 'form' || req.bodyType === 'urlencoded') {
      table('', ['Field', 'Value'], enabledPairs(req.formData));
    } else if (req.body.trim()) {
      out.push(`<pre><code>${escapeHtml(req.body.trim())}</code></pre>`);
    }
  }
  return out.join('\n');
}

function renderHtmlBody(
  container: { name?: string; requests: SavedRequest[]; folders: Folder[] },
  level: number,
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
    blocks.push(renderHtmlBody(f, level + 1));
  }
  for (const r of container.requests) blocks.push(renderRequestHtml(r, level + 1));
  return blocks.join('\n');
}
