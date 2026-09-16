export type TypeLang = 'typescript' | 'go' | 'python';

export const TYPE_LANGS: { id: TypeLang; label: string }[] = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'go', label: 'Go' },
  { id: 'python', label: 'Python' },
];

type Prim = 'string' | 'integer' | 'number' | 'boolean' | 'null' | 'any';

interface Field {
  key: string;
  type: Inferred;
  optional: boolean;
}

type Inferred =
  { t: 'prim'; name: Prim } | { t: 'array'; el: Inferred } | { t: 'object'; fields: Field[] };

function prim(name: Prim): Inferred {
  return { t: 'prim', name };
}

function infer(value: unknown): Inferred {
  if (value === null || value === undefined) return prim('null');
  if (Array.isArray(value)) {
    if (!value.length) return { t: 'array', el: prim('any') };
    return { t: 'array', el: value.map(infer).reduce(merge) };
  }
  if (typeof value === 'object') {
    const fields: Field[] = Object.entries(value as Record<string, unknown>).map(([key, v]) => ({
      key,
      type: infer(v),
      optional: false,
    }));
    return { t: 'object', fields };
  }
  if (typeof value === 'number') return prim(Number.isInteger(value) ? 'integer' : 'number');
  if (typeof value === 'boolean') return prim('boolean');
  return prim('string');
}

function merge(a: Inferred, b: Inferred): Inferred {
  if (a.t === 'prim' && a.name === 'null') return b;
  if (b.t === 'prim' && b.name === 'null') return a;
  if (a.t === 'prim' && b.t === 'prim') {
    if (a.name === b.name) return a;
    const nums = new Set([a.name, b.name]);
    if (nums.has('integer') && nums.has('number')) return prim('number');
    return prim('any');
  }
  if (a.t === 'array' && b.t === 'array') return { t: 'array', el: merge(a.el, b.el) };
  if (a.t === 'object' && b.t === 'object') {
    const keys = new Set([...a.fields.map((f) => f.key), ...b.fields.map((f) => f.key)]);
    const fields: Field[] = [];
    for (const key of keys) {
      const fa = a.fields.find((f) => f.key === key);
      const fb = b.fields.find((f) => f.key === key);
      if (fa && fb) {
        fields.push({ key, type: merge(fa.type, fb.type), optional: fa.optional || fb.optional });
      } else {
        const only = (fa ?? fb) as Field;
        fields.push({ key, type: only.type, optional: true });
      }
    }
    return { t: 'object', fields };
  }
  return prim('any');
}

function pascal(raw: string): string {
  const parts = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  if (!name) return 'Item';
  return /^[0-9]/.test(name) ? `T${name}` : name;
}

function singular(name: string): string {
  return name.endsWith('s') && name.length > 1 ? name.slice(0, -1) : name;
}

function uniqueName(base: string, used: Set<string>): string {
  let name = base;
  let n = 2;
  while (used.has(name)) name = `${base}${n++}`;
  used.add(name);
  return name;
}

function isIdent(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function tsRef(node: Inferred, hint: string, used: Set<string>, decls: string[]): string {
  switch (node.t) {
    case 'prim':
      return {
        string: 'string',
        integer: 'number',
        number: 'number',
        boolean: 'boolean',
        null: 'null',
        any: 'unknown',
      }[node.name];
    case 'array':
      return `${tsRef(node.el, singular(hint), used, decls)}[]`;
    case 'object': {
      const name = uniqueName(pascal(hint), used);
      const lines = node.fields.map((f) => {
        const ref = tsRef(f.type, f.key, used, decls);
        const key = isIdent(f.key) ? f.key : JSON.stringify(f.key);
        return `  ${key}${f.optional ? '?' : ''}: ${ref};`;
      });
      decls.push(`interface ${name} {\n${lines.join('\n')}\n}`);
      return name;
    }
  }
}

function goType(node: Inferred, hint: string, used: Set<string>, decls: string[]): string {
  switch (node.t) {
    case 'prim':
      return {
        string: 'string',
        integer: 'int64',
        number: 'float64',
        boolean: 'bool',
        null: 'interface{}',
        any: 'interface{}',
      }[node.name];
    case 'array':
      return `[]${goType(node.el, singular(hint), used, decls)}`;
    case 'object': {
      const name = uniqueName(pascal(hint), used);
      const lines = node.fields.map((f) => {
        const ref = goType(f.type, f.key, used, decls);
        const opt = f.optional ? ',omitempty' : '';
        return `\t${pascal(f.key)} ${ref} \`json:"${f.key}${opt}"\``;
      });
      decls.push(`type ${name} struct {\n${lines.join('\n')}\n}`);
      return name;
    }
  }
}

function pyType(node: Inferred, hint: string, used: Set<string>, decls: string[]): string {
  switch (node.t) {
    case 'prim':
      return {
        string: 'str',
        integer: 'int',
        number: 'float',
        boolean: 'bool',
        null: 'Any',
        any: 'Any',
      }[node.name];
    case 'array':
      return `List[${pyType(node.el, singular(hint), used, decls)}]`;
    case 'object': {
      const name = uniqueName(pascal(hint), used);
      const sorted = [...node.fields].sort((a, b) => Number(a.optional) - Number(b.optional));
      const lines = sorted.map((f) => {
        const ref = pyType(f.type, f.key, used, decls);
        const field = isIdent(f.key) ? f.key : f.key.replace(/[^A-Za-z0-9_]/g, '_');
        return f.optional ? `    ${field}: Optional[${ref}] = None` : `    ${field}: ${ref}`;
      });
      const body = lines.length ? lines.join('\n') : '    pass';
      decls.push(`@dataclass\nclass ${name}:\n${body}`);
      return name;
    }
  }
}

export function generateTypes(data: unknown, rootName: string, lang: TypeLang): string {
  const root = pascal(rootName || 'Root');
  const node = infer(data);
  const used = new Set<string>();
  const decls: string[] = [];

  if (lang === 'typescript') {
    if (node.t === 'object') {
      tsRef({ ...node }, root, used, decls);
    } else {
      const ref = tsRef(node, root, used, decls);
      decls.push(`type ${root} = ${ref};`);
    }
    return decls.join('\n\n');
  }

  if (lang === 'go') {
    if (node.t === 'object') {
      goType({ ...node }, root, used, decls);
    } else {
      const ref = goType(node, root, used, decls);
      decls.push(`type ${root} = ${ref}`);
    }
    return decls.join('\n\n');
  }

  const header =
    'from __future__ import annotations\nfrom dataclasses import dataclass\nfrom typing import Any, List, Optional';
  if (node.t === 'object') {
    pyType({ ...node }, root, used, decls);
  } else {
    const ref = pyType(node, root, used, decls);
    decls.push(`${root} = ${ref}`);
  }
  return `${header}\n\n\n${decls.join('\n\n\n')}`;
}
