import type { ApiRequest } from '../types/request';
import { toCurl } from './curl';

export type SnippetLang = 'curl' | 'fetch' | 'axios' | 'python' | 'go';

export const SNIPPET_LANGS: { id: SnippetLang; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'JS fetch' },
  { id: 'axios', label: 'axios' },
  { id: 'python', label: 'Python' },
  { id: 'go', label: 'Go' },
];

function queryPairs(req: ApiRequest): [string, string][] {
  const out: [string, string][] = req.params
    .filter((p) => p.enabled && p.key.trim())
    .map((p): [string, string] => [p.key, p.value]);
  const { auth } = req;
  if (auth.type === 'apikey' && auth.apiKeyIn === 'query' && auth.apiKeyName.trim()) {
    out.push([auth.apiKeyName.trim(), auth.apiKeyValue]);
  }
  return out;
}

function fullUrl(req: ApiRequest): string {
  const enabled = queryPairs(req);
  if (!enabled.length) return req.url;
  const qs = enabled
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return req.url.includes('?') ? `${req.url}&${qs}` : `${req.url}?${qs}`;
}

function contentType(req: ApiRequest): string | null {
  if (req.bodyType === 'json' || req.bodyType === 'graphql') return 'application/json';
  if (req.bodyType === 'urlencoded') return 'application/x-www-form-urlencoded';
  return null;
}

function headerPairs(req: ApiRequest): [string, string][] {
  const out: [string, string][] = req.headers
    .filter((h) => h.enabled && h.key.trim())
    .map((h): [string, string] => [h.key, h.value]);
  const { auth } = req;
  if (auth.type === 'bearer' && auth.bearerToken.trim()) {
    out.push(['Authorization', `Bearer ${auth.bearerToken.trim()}`]);
  } else if (auth.type === 'basic') {
    out.push(['Authorization', `Basic ${btoa(`${auth.basicUser}:${auth.basicPass}`)}`]);
  } else if (auth.type === 'apikey' && auth.apiKeyIn === 'header' && auth.apiKeyName.trim()) {
    out.push([auth.apiKeyName.trim(), auth.apiKeyValue]);
  }
  const ct = contentType(req);
  if (ct && !out.some(([k]) => k.toLowerCase() === 'content-type')) {
    out.push(['Content-Type', ct]);
  }
  return out;
}

function bodyPairs(req: ApiRequest): [string, string][] {
  return req.formData
    .filter((p) => p.enabled && p.key.trim())
    .map((p): [string, string] => [p.key, p.value]);
}

function graphqlBody(req: ApiRequest): string {
  const payload: { query: string; variables?: unknown } = { query: req.body };
  if (req.graphqlVars.trim()) {
    try {
      payload.variables = JSON.parse(req.graphqlVars);
    } catch {
      payload.variables = req.graphqlVars;
    }
  }
  return JSON.stringify(payload);
}

function rawBody(req: ApiRequest): string {
  if (req.bodyType === 'graphql') return graphqlBody(req);
  if (req.bodyType === 'urlencoded') {
    return bodyPairs(req)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }
  return req.body;
}

function hasBody(req: ApiRequest): boolean {
  if (req.bodyType === 'none') return false;
  if (req.bodyType === 'form' || req.bodyType === 'urlencoded') return bodyPairs(req).length > 0;
  return req.body.trim() !== '';
}

function jsObject(pairs: [string, string][]): string {
  if (!pairs.length) return '{}';
  const inner = pairs.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  return `{\n${inner}\n  }`;
}

function pyDict(pairs: [string, string][], indent: string): string {
  if (!pairs.length) return '{}';
  const inner = pairs
    .map(([k, v]) => `${indent}    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(',\n');
  return `{\n${inner}\n${indent}}`;
}

function fetchSnippet(req: ApiRequest): string {
  const headers = headerPairs(req);
  const opts: string[] = [`  method: ${JSON.stringify(req.method)}`];
  if (headers.length) opts.push(`  headers: ${jsObject(headers)}`);
  if (req.bodyType === 'form' && bodyPairs(req).length) {
    const appends = bodyPairs(req)
      .map(([k, v]) => `body.append(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join('\n');
    opts.push('  body');
    return `const body = new FormData();\n${appends}\n\nconst res = await fetch(${JSON.stringify(fullUrl(req))}, {\n${opts.join(',\n')}\n});\nconst data = await res.json();\nconsole.log(data);`;
  }
  if (hasBody(req)) opts.push(`  body: ${JSON.stringify(rawBody(req))}`);
  return `const res = await fetch(${JSON.stringify(fullUrl(req))}, {\n${opts.join(',\n')}\n});\nconst data = await res.json();\nconsole.log(data);`;
}

function axiosSnippet(req: ApiRequest): string {
  const headers = headerPairs(req);
  const cfg: string[] = [
    `  method: ${JSON.stringify(req.method.toLowerCase())}`,
    `  url: ${JSON.stringify(fullUrl(req))}`,
  ];
  if (headers.length) cfg.push(`  headers: ${jsObject(headers)}`);
  if (req.bodyType === 'form' && bodyPairs(req).length) {
    const appends = bodyPairs(req)
      .map(([k, v]) => `data.append(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join('\n');
    cfg.push('  data');
    return `import axios from 'axios';\n\nconst data = new FormData();\n${appends}\n\nconst res = await axios({\n${cfg.join(',\n')}\n});\nconsole.log(res.data);`;
  }
  if (hasBody(req)) {
    const dataVal =
      req.bodyType === 'json' || req.bodyType === 'graphql'
        ? rawBody(req)
        : JSON.stringify(rawBody(req));
    cfg.push(`  data: ${dataVal}`);
  }
  return `import axios from 'axios';\n\nconst res = await axios({\n${cfg.join(',\n')}\n});\nconsole.log(res.data);`;
}

function pythonSnippet(req: ApiRequest): string {
  const headers = headerPairs(req).filter(([k]) => k.toLowerCase() !== 'content-type');
  const lines: string[] = ['import requests', ''];
  if (headers.length) {
    lines.push(`headers = ${pyDict(headers, '')}`);
  }
  const args = [`    ${JSON.stringify(fullUrl(req))}`];
  if (headers.length) args.push('    headers=headers');
  if (req.bodyType === 'json') {
    args.push(`    json=${req.body.trim() || '{}'}`);
  } else if (req.bodyType === 'graphql') {
    args.push(`    json=${graphqlBody(req)}`);
  } else if (req.bodyType === 'form' && bodyPairs(req).length) {
    args.push(`    files=${pyDict(bodyPairs(req), '    ')}`);
  } else if (req.bodyType === 'urlencoded' && bodyPairs(req).length) {
    args.push(`    data=${pyDict(bodyPairs(req), '    ')}`);
  } else if (hasBody(req)) {
    args.push(`    data=${JSON.stringify(rawBody(req))}`);
  }
  lines.push(`res = requests.${req.method.toLowerCase()}(\n${args.join(',\n')}\n)`);
  lines.push('print(res.status_code)');
  lines.push('print(res.json())');
  return lines.join('\n');
}

function goSnippet(req: ApiRequest): string {
  const headers = headerPairs(req);
  const body = hasBody(req);
  const bodyExpr = body ? `strings.NewReader(${JSON.stringify(rawBody(req))})` : 'nil';
  const setHeaders = headers
    .map(([k, v]) => `\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
    .join('\n');
  return [
    'package main',
    '',
    'import (',
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
    body ? '\t"strings"' : '',
    ')',
    '',
    'func main() {',
    `\treq, _ := http.NewRequest(${JSON.stringify(req.method)}, ${JSON.stringify(fullUrl(req))}, ${bodyExpr})`,
    setHeaders,
    '\tres, _ := http.DefaultClient.Do(req)',
    '\tdefer res.Body.Close()',
    '\tbody, _ := io.ReadAll(res.Body)',
    '\tfmt.Println(string(body))',
    '}',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export function generateSnippet(req: ApiRequest, lang: SnippetLang): string {
  switch (lang) {
    case 'curl':
      return toCurl(req);
    case 'fetch':
      return fetchSnippet(req);
    case 'axios':
      return axiosSnippet(req);
    case 'python':
      return pythonSnippet(req);
    case 'go':
      return goSnippet(req);
  }
}
