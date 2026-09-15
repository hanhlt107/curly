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

function fullUrl(req: ApiRequest): string {
  const enabled = req.params.filter((p) => p.enabled && p.key.trim());
  if (!enabled.length) return req.url;
  const qs = enabled
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  return req.url.includes('?') ? `${req.url}&${qs}` : `${req.url}?${qs}`;
}

function headerPairs(req: ApiRequest): [string, string][] {
  const out: [string, string][] = req.headers
    .filter((h) => h.enabled && h.key.trim())
    .map((h): [string, string] => [h.key, h.value]);
  const { auth } = req;
  if (auth.type === 'bearer' && auth.bearerToken.trim()) {
    out.push(['Authorization', `Bearer ${auth.bearerToken.trim()}`]);
  } else if (auth.type === 'basic') {
    out.push(['Authorization', `Basic <base64(${auth.basicUser}:${auth.basicPass})>`]);
  } else if (auth.type === 'apikey' && auth.apiKeyIn === 'header' && auth.apiKeyName.trim()) {
    out.push([auth.apiKeyName.trim(), auth.apiKeyValue]);
  }
  if (req.bodyType === 'json' && !out.some(([k]) => k.toLowerCase() === 'content-type')) {
    out.push(['Content-Type', 'application/json']);
  }
  return out;
}

function hasBody(req: ApiRequest): boolean {
  return req.bodyType !== 'none' && req.body.trim() !== '';
}

function jsObject(pairs: [string, string][]): string {
  if (!pairs.length) return '{}';
  const inner = pairs.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  return `{\n${inner}\n  }`;
}

function fetchSnippet(req: ApiRequest): string {
  const headers = headerPairs(req);
  const opts: string[] = [`  method: ${JSON.stringify(req.method)}`];
  if (headers.length) opts.push(`  headers: ${jsObject(headers)}`);
  if (hasBody(req)) opts.push(`  body: ${JSON.stringify(req.body)}`);
  return `const res = await fetch(${JSON.stringify(fullUrl(req))}, {\n${opts.join(',\n')}\n});\nconst data = await res.json();\nconsole.log(data);`;
}

function axiosSnippet(req: ApiRequest): string {
  const headers = headerPairs(req);
  const cfg: string[] = [
    `  method: ${JSON.stringify(req.method.toLowerCase())}`,
    `  url: ${JSON.stringify(fullUrl(req))}`,
  ];
  if (headers.length) cfg.push(`  headers: ${jsObject(headers)}`);
  if (hasBody(req)) {
    const dataVal = req.bodyType === 'json' ? req.body : JSON.stringify(req.body);
    cfg.push(`  data: ${dataVal}`);
  }
  return `import axios from 'axios';\n\nconst res = await axios({\n${cfg.join(',\n')}\n});\nconsole.log(res.data);`;
}

function pythonSnippet(req: ApiRequest): string {
  const headers = headerPairs(req);
  const lines: string[] = ['import requests', ''];
  if (headers.length) {
    const hs = headers
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(',\n');
    lines.push(`headers = {\n${hs}\n}`);
  }
  const args = [`    ${JSON.stringify(fullUrl(req))}`];
  if (headers.length) args.push('    headers=headers');
  if (hasBody(req)) {
    if (req.bodyType === 'json') args.push(`    data=${JSON.stringify(req.body)}`);
    else args.push(`    data=${JSON.stringify(req.body)}`);
  }
  lines.push(`res = requests.${req.method.toLowerCase()}(\n${args.join(',\n')}\n)`);
  lines.push('print(res.status_code)');
  lines.push('print(res.json())');
  return lines.join('\n');
}

function goSnippet(req: ApiRequest): string {
  const headers = headerPairs(req);
  const bodyExpr = hasBody(req) ? `strings.NewReader(${JSON.stringify(req.body)})` : 'nil';
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
    hasBody(req) ? '\t"strings"' : '',
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
