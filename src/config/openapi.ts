import type {
  ApiRequest,
  Collection,
  Environment,
  Folder,
  KeyValue,
  SavedRequest,
} from '../types/request';
import { blankRequest } from '../types/request';
import type { ImportResult } from './workspace';

type JObj = Record<string, unknown>;

function row(key = '', value = ''): KeyValue {
  return { id: crypto.randomUUID(), enabled: true, key, value };
}

function asObj(v: unknown): JObj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JObj) : {};
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function toStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function stripComment(line: string): string {
  let inS = false;
  let inD = false;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD && (k === 0 || /\s/.test(line[k - 1])))
      return line.slice(0, k);
  }
  return line;
}

function indentOf(s: string): number {
  let n = 0;
  while (n < s.length && s[n] === ' ') n++;
  return n;
}

function findColon(s: string): number {
  let inS = false;
  let inD = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === ':' && !inS && !inD && (k + 1 >= s.length || s[k + 1] === ' ')) return k;
  }
  return -1;
}

function isInlineMap(s: string): boolean {
  if (s.startsWith('[') || s.startsWith('{')) return false;
  return findColon(s) >= 0;
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inS = false;
  let inD = false;
  let buf = '';
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    if (!inS && !inD) {
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth--;
      else if (c === sep && depth === 0) {
        out.push(buf);
        buf = '';
        continue;
      }
    }
    buf += c;
  }
  if (buf.trim() || out.length) out.push(buf);
  return out;
}

function unescapeDouble(s: string): string {
  return s.replace(/\\(["\\/nrt])/g, (_, c) => {
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    return c;
  });
}

function scalar(raw: string): unknown {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d*\.\d+$/.test(s)) return Number(s);
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) return unescapeDouble(s.slice(1, -1));
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
    return s.slice(1, -1).replace(/''/g, "'");
  if (s.startsWith('[')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return splitTopLevel(inner, ',').map(scalar);
  }
  if (s.startsWith('{')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return {};
    const obj: JObj = {};
    for (const part of splitTopLevel(inner, ',')) {
      const ci = findColon(part) >= 0 ? findColon(part) : part.indexOf(':');
      if (ci < 0) continue;
      obj[String(scalar(part.slice(0, ci)))] = scalar(part.slice(ci + 1));
    }
    return obj;
  }
  return s;
}

function splitKey(text: string): { key: string; rest: string } {
  if (text[0] === '"' || text[0] === "'") {
    const q = text[0];
    let j = 1;
    let buf = '';
    while (j < text.length && text[j] !== q) {
      buf += text[j];
      j++;
    }
    const after = text.slice(j + 1).trimStart();
    return { key: buf, rest: after.startsWith(':') ? after.slice(1).trim() : '' };
  }
  const ci = findColon(text);
  if (ci < 0) return { key: text.trim(), rest: '' };
  return { key: text.slice(0, ci).trim(), rest: text.slice(ci + 1).trim() };
}

interface YamlLine {
  indent: number;
  text: string;
}

function convertYaml(text: string): unknown {
  const lines: YamlLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stripped = stripComment(raw);
    if (stripped.trim() === '') continue;
    lines.push({ indent: indentOf(stripped), text: stripped.trim() });
  }
  if (!lines.length) return {};
  let i = 0;

  const isSeqLine = (l: YamlLine) => l.text === '-' || l.text.startsWith('- ');

  const parseNode = (indent: number): unknown =>
    isSeqLine(lines[i]) ? parseSeq(indent) : parseMap(indent);

  function readBlockScalar(indent: number, fold: boolean): string {
    const parts: string[] = [];
    while (i < lines.length && lines[i].indent > indent) {
      parts.push(lines[i].text);
      i++;
    }
    return parts.join(fold ? ' ' : '\n');
  }

  function parseSeq(indent: number): unknown[] {
    const arr: unknown[] = [];
    while (i < lines.length && lines[i].indent === indent && isSeqLine(lines[i])) {
      const line = lines[i];
      if (line.text === '-') {
        i++;
        if (i < lines.length && lines[i].indent > indent) arr.push(parseNode(lines[i].indent));
        else arr.push(null);
        continue;
      }
      const rest = line.text.slice(2).trim();
      if (isInlineMap(rest) || rest.startsWith('- ')) {
        const childIndent = line.indent + 2;
        lines[i] = { indent: childIndent, text: rest };
        arr.push(parseNode(childIndent));
      } else {
        arr.push(scalar(rest));
        i++;
      }
    }
    return arr;
  }

  function parseMap(indent: number): JObj {
    const obj: JObj = {};
    while (i < lines.length && lines[i].indent === indent && !isSeqLine(lines[i])) {
      const { key, rest } = splitKey(lines[i].text);
      if (rest === '' || /^[|>][+-]?$/.test(rest)) {
        i++;
        if (rest.startsWith('|') || rest.startsWith('>')) {
          obj[key] = readBlockScalar(indent, rest.startsWith('>'));
        } else if (i < lines.length && lines[i].indent > indent) {
          obj[key] = parseNode(lines[i].indent);
        } else if (i < lines.length && lines[i].indent === indent && isSeqLine(lines[i])) {
          obj[key] = parseSeq(indent);
        } else {
          obj[key] = null;
        }
      } else {
        obj[key] = scalar(rest);
        i++;
      }
    }
    return obj;
  }

  return parseNode(lines[0].indent);
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function makeResolver(doc: JObj) {
  return function resolveRef(ref: string): JObj | undefined {
    if (!ref.startsWith('#/')) return undefined;
    const parts = ref
      .slice(2)
      .split('/')
      .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let node: unknown = doc;
    for (const p of parts) {
      if (node == null || typeof node !== 'object') return undefined;
      node = (node as JObj)[p];
    }
    return asObj(node);
  };
}

function exampleFromSchema(
  schema: unknown,
  resolve: (ref: string) => JObj | undefined,
  seen: Set<string>,
): unknown {
  if (!schema || typeof schema !== 'object') return null;
  const s = schema as JObj;
  if (typeof s.$ref === 'string') {
    if (seen.has(s.$ref)) return null;
    return exampleFromSchema(resolve(s.$ref), resolve, new Set([...seen, s.$ref]));
  }
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];

  if (Array.isArray(s.allOf)) {
    const merged: JObj = {};
    for (const part of s.allOf) {
      const ex = exampleFromSchema(part, resolve, seen);
      if (ex && typeof ex === 'object' && !Array.isArray(ex)) Object.assign(merged, ex);
    }
    return merged;
  }
  if (Array.isArray(s.oneOf) && s.oneOf.length) return exampleFromSchema(s.oneOf[0], resolve, seen);
  if (Array.isArray(s.anyOf) && s.anyOf.length) return exampleFromSchema(s.anyOf[0], resolve, seen);

  const type = s.type || (s.properties ? 'object' : undefined);
  if (type === 'object' || s.properties) {
    const obj: JObj = {};
    const props = asObj(s.properties);
    for (const [k, v] of Object.entries(props)) obj[k] = exampleFromSchema(v, resolve, seen);
    return obj;
  }
  if (type === 'array') return [exampleFromSchema(s.items ?? {}, resolve, seen)];
  if (type === 'string') {
    if (s.format === 'date-time') return '2020-01-01T00:00:00Z';
    if (s.format === 'date') return '2020-01-01';
    if (s.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
    if (s.format === 'email') return 'user@example.com';
    return 'string';
  }
  if (type === 'integer' || type === 'number') return 0;
  if (type === 'boolean') return false;
  return null;
}

function paramValue(p: JObj): string {
  if (p.example !== undefined) return toStr(p.example);
  const schema = asObj(p.schema);
  if (schema.example !== undefined) return toStr(schema.example);
  if (schema.default !== undefined) return toStr(schema.default);
  if (Array.isArray(schema.enum) && schema.enum.length) return toStr(schema.enum[0]);
  if (p.default !== undefined) return toStr(p.default);
  return '';
}

function applySecurity(req: ApiRequest, scheme: JObj, isV3: boolean): void {
  const type = String(scheme.type ?? '').toLowerCase();
  if (isV3 && type === 'http') {
    const s = String(scheme.scheme ?? '').toLowerCase();
    if (s === 'bearer') req.auth.type = 'bearer';
    else if (s === 'basic') req.auth.type = 'basic';
    return;
  }
  if (type === 'basic') {
    req.auth.type = 'basic';
    return;
  }
  if (type === 'apikey') {
    req.auth.type = 'apikey';
    req.auth.apiKeyName = toStr(scheme.name) || 'X-API-Key';
    req.auth.apiKeyIn = scheme.in === 'query' ? 'query' : 'header';
  }
}

export function parseOpenApiSpec(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = convertYaml(text);
  }
  const doc = asObj(parsed);
  if (!doc.paths || typeof doc.paths !== 'object') {
    throw new Error('File không phải OpenAPI (v3) hoặc Swagger (v2) hợp lệ.');
  }

  const isV3 = typeof doc.openapi === 'string' && doc.openapi.startsWith('3');
  const resolve = makeResolver(doc);

  let baseUrl = '';
  if (isV3) {
    baseUrl = toStr(asObj(asArr(doc.servers)[0]).url);
  } else {
    const scheme = toStr(asArr(doc.schemes)[0] ?? 'https');
    const host = toStr(doc.host);
    const basePath = toStr(doc.basePath);
    baseUrl = host ? `${scheme}://${host}${basePath}` : basePath;
  }
  const urlPrefix = baseUrl ? '{{baseUrl}}' : '';

  const securitySchemes = isV3
    ? asObj(asObj(doc.components).securitySchemes)
    : asObj(doc.securityDefinitions);
  const consumes = asArr(doc.consumes).map(toStr);

  const buildRequest = (
    method: string,
    path: string,
    op: JObj,
    commonParams: unknown[],
  ): ApiRequest => {
    const req = blankRequest();
    req.method = method.toUpperCase() as ApiRequest['method'];
    req.url = `${urlPrefix}${path}`;

    const rawParams = [...commonParams, ...asArr(op.parameters)].map((raw) => {
      const p = asObj(raw);
      return typeof p.$ref === 'string' ? (resolve(p.$ref) ?? p) : p;
    });
    const query: KeyValue[] = [];
    const headers: KeyValue[] = [];
    const formFields: KeyValue[] = [];
    let v2Body: unknown = null;
    for (const p of rawParams) {
      if (p.in === 'query') query.push(row(toStr(p.name), paramValue(p)));
      else if (p.in === 'header') headers.push(row(toStr(p.name), paramValue(p)));
      else if (p.in === 'formData') formFields.push(row(toStr(p.name), paramValue(p)));
      else if (p.in === 'body') v2Body = p.schema ?? null;
    }

    if (isV3 && op.requestBody) {
      let rb = asObj(op.requestBody);
      if (typeof rb.$ref === 'string') rb = resolve(rb.$ref) ?? rb;
      const content = asObj(rb.content);
      const keys = Object.keys(content);
      const jsonKey = keys.find((k) => /json/i.test(k)) ?? keys[0];
      if (jsonKey) {
        const media = asObj(content[jsonKey]);
        if (/urlencoded/i.test(jsonKey) || /form-data/i.test(jsonKey)) {
          const props = asObj(asObj(media.schema).properties);
          for (const k of Object.keys(props)) formFields.push(row(k, ''));
          req.bodyType = /urlencoded/i.test(jsonKey) ? 'urlencoded' : 'form';
        } else {
          const ex = media.example ?? exampleFromSchema(media.schema, resolve, new Set());
          if (ex !== undefined) {
            req.bodyType = 'json';
            req.body = JSON.stringify(ex, null, 2);
            headers.push(row('Content-Type', 'application/json'));
          }
        }
      }
    } else if (!isV3 && v2Body) {
      const ex = exampleFromSchema(v2Body, resolve, new Set());
      if (ex !== undefined) {
        req.bodyType = 'json';
        req.body = JSON.stringify(ex, null, 2);
        headers.push(row('Content-Type', 'application/json'));
      }
    } else if (!isV3 && formFields.length) {
      req.bodyType = consumes.some((c) => /urlencoded/i.test(c)) ? 'urlencoded' : 'form';
    }

    if (query.length) req.params = [...query, row()];
    if (headers.length) req.headers = [...headers, row()];
    if (formFields.length) req.formData = [...formFields, row()];

    const security = asArr(op.security).length ? asArr(op.security) : asArr(doc.security);
    if (security.length) {
      const first = asObj(security[0]);
      const schemeName = Object.keys(first)[0];
      const scheme = schemeName ? asObj(securitySchemes[schemeName]) : {};
      if (Object.keys(scheme).length) applySecurity(req, scheme, isV3);
    }

    return req;
  };

  const tagOrder = asArr(doc.tags)
    .map((t) => toStr(asObj(t).name))
    .filter(Boolean);
  const byTag = new Map<string, SavedRequest[]>();
  const rootRequests: SavedRequest[] = [];

  const paths = asObj(doc.paths);
  for (const [path, rawItem] of Object.entries(paths)) {
    const pathItem = asObj(rawItem);
    const commonParams = asArr(pathItem.parameters);
    for (const method of HTTP_METHODS) {
      const op = asObj(pathItem[method]);
      if (!Object.keys(op).length) continue;
      const request = buildRequest(method, path, op, commonParams);
      const name = toStr(op.summary) || toStr(op.operationId) || `${method.toUpperCase()} ${path}`;
      const saved: SavedRequest = { id: crypto.randomUUID(), name, request };
      const tags = asArr(op.tags);
      const tag = tags.length ? toStr(tags[0]) : '';
      if (tag) {
        if (!byTag.has(tag)) byTag.set(tag, []);
        byTag.get(tag)!.push(saved);
      } else {
        rootRequests.push(saved);
      }
    }
  }

  const orderedTags = [
    ...tagOrder.filter((t) => byTag.has(t)),
    ...[...byTag.keys()].filter((t) => !tagOrder.includes(t)),
  ];
  const folders: Folder[] = orderedTags.map((tag) => ({
    id: crypto.randomUUID(),
    name: tag,
    requests: byTag.get(tag) ?? [],
    folders: [],
  }));

  const title = toStr(asObj(doc.info).title) || 'OpenAPI';
  const collection: Collection = {
    id: crypto.randomUUID(),
    name: title,
    requests: rootRequests,
    folders,
  };

  const environments: Environment[] = baseUrl
    ? [{ id: crypto.randomUUID(), name: `${title} env`, variables: [row('baseUrl', baseUrl)] }]
    : [];

  return { collections: [collection], environments };
}
