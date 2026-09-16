import type { ApiRequest, Cookie } from '../types/request';
import { resolveVars, sendRequest } from './apiClient';

export const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types { ...FullType }
  }
}
fragment FullType on __Type {
  kind
  name
  description
  fields(includeDeprecated: true) {
    name
    description
    args { ...InputValue }
    type { ...TypeRef }
  }
  inputFields { ...InputValue }
  enumValues(includeDeprecated: true) { name }
}
fragment InputValue on __InputValue {
  name
  type { ...TypeRef }
}
fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
    }
  }
}`;

export interface GqlArg {
  name: string;
  type: string;
}

export interface GqlField {
  name: string;
  type: string;
  description: string | null;
  args: GqlArg[];
}

export interface GqlType {
  name: string;
  kind: string;
  description: string | null;
  fields: GqlField[];
  enumValues: string[];
}

export interface GqlSchema {
  queryType: string | null;
  mutationType: string | null;
  subscriptionType: string | null;
  types: GqlType[];
}

type JObj = Record<string, unknown>;

function asObj(v: unknown): JObj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JObj) : {};
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function typeRefName(v: unknown): string {
  const t = asObj(v);
  const kind = str(t.kind);
  if (kind === 'NON_NULL') return typeRefName(t.ofType) + '!';
  if (kind === 'LIST') return '[' + typeRefName(t.ofType) + ']';
  return str(t.name);
}

function parseField(v: unknown): GqlField {
  const f = asObj(v);
  return {
    name: str(f.name),
    type: typeRefName(f.type),
    description: strOrNull(f.description),
    args: asArr(f.args).map((a) => {
      const arg = asObj(a);
      return { name: str(arg.name), type: typeRefName(arg.type) };
    }),
  };
}

function parseSchema(v: unknown): GqlSchema {
  const s = asObj(v);
  const types: GqlType[] = asArr(s.types)
    .map(asObj)
    .filter((t) => str(t.name) && !str(t.name).startsWith('__'))
    .map((t) => ({
      name: str(t.name),
      kind: str(t.kind),
      description: strOrNull(t.description),
      fields: asArr(t.fields).map(parseField),
      enumValues: asArr(t.enumValues).map((e) => str(asObj(e).name)),
    }));
  return {
    queryType: strOrNull(asObj(s.queryType).name),
    mutationType: strOrNull(asObj(s.mutationType).name),
    subscriptionType: strOrNull(asObj(s.subscriptionType).name),
    types,
  };
}

export async function introspect(
  req: ApiRequest,
  vars: Record<string, string> = {},
  cookies: Cookie[] = [],
): Promise<GqlSchema> {
  const introReq: ApiRequest = {
    ...req,
    method: 'POST',
    bodyType: 'graphql',
    body: INTROSPECTION_QUERY,
    graphqlVars: '',
  };
  let res;
  try {
    res = await sendRequest(introReq, vars, cookies);
  } catch {
    throw new Error('Không gọi được endpoint GraphQL. Kiểm tra URL, mạng, hoặc CORS.');
  }
  if (res.status >= 400) {
    throw new Error(`Endpoint trả về HTTP ${res.status} — có thể không hỗ trợ introspection.`);
  }
  const body = asObj(res.data);
  const schema = asObj(asObj(body.data).__schema);
  if (!Object.keys(schema).length) {
    if (asArr(body.errors).length) {
      throw new Error('Endpoint từ chối introspection (có thể đã tắt vì lý do bảo mật).');
    }
    throw new Error('Phản hồi không phải schema GraphQL hợp lệ.');
  }
  return parseSchema(schema);
}

const cache = new Map<string, GqlSchema>();

export async function loadSchema(
  req: ApiRequest,
  vars: Record<string, string> = {},
  cookies: Cookie[] = [],
  force = false,
): Promise<GqlSchema> {
  const url = resolveVars(req.url, vars).trim();
  if (!force && url && cache.has(url)) return cache.get(url) as GqlSchema;
  const schema = await introspect(req, vars, cookies);
  if (url) cache.set(url, schema);
  return schema;
}

export function cachedSchema(url: string): GqlSchema | undefined {
  return cache.get(url.trim());
}
