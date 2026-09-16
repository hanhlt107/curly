export interface SchemaError {
  path: string;
  message: string;
}

export interface SchemaResult {
  ok: boolean;
  errors: SchemaError[];
}

type JsonSchema = Record<string, unknown>;

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
}

function joinPath(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`;
  return base ? `${base}.${key}` : key;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

function validateNode(
  schema: JsonSchema,
  value: unknown,
  path: string,
  errors: SchemaError[],
): void {
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push({
        path: path || '(root)',
        message: `phải là kiểu ${types.join(' | ')}, nhận ${typeOf(value)}`,
      });
      return;
    }
  }

  if (Array.isArray(schema.enum)) {
    const allowed = schema.enum as unknown[];
    if (!allowed.some((a) => deepEqual(a, value))) {
      errors.push({
        path: path || '(root)',
        message: `phải là một trong ${allowed.map((a) => JSON.stringify(a)).join(', ')}`,
      });
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push({ path: path || '(root)', message: `phải >= ${schema.minimum}` });
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push({ path: path || '(root)', message: `phải <= ${schema.maximum}` });
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push({ path: path || '(root)', message: `độ dài phải >= ${schema.minLength}` });
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push({ path: path || '(root)', message: `độ dài phải <= ${schema.maxLength}` });
    }
  }

  if (Array.isArray(value) && schema.items && typeof schema.items === 'object') {
    const itemSchema = schema.items as JsonSchema;
    value.forEach((item, i) => validateNode(itemSchema, item, joinPath(path, i), errors));
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties as Record<string, JsonSchema>) ?? {};

    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in obj)) {
          errors.push({ path: joinPath(path, key), message: 'thiếu trường bắt buộc' });
        }
      }
    }

    for (const [key, propSchema] of Object.entries(props)) {
      if (key in obj) validateNode(propSchema, obj[key], joinPath(path, key), errors);
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) {
          errors.push({ path: joinPath(path, key), message: 'trường không được phép' });
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const extra = schema.additionalProperties as JsonSchema;
      for (const key of Object.keys(obj)) {
        if (!(key in props)) validateNode(extra, obj[key], joinPath(path, key), errors);
      }
    }
  }
}

/** Kiểm tra dữ liệu theo JSON Schema (chuỗi). Trả về lỗi parse schema nếu có. */
export function validateSchema(schemaText: string, data: unknown): SchemaResult {
  let schema: JsonSchema;
  try {
    schema = JSON.parse(schemaText) as JsonSchema;
  } catch {
    return { ok: false, errors: [{ path: '(schema)', message: 'JSON Schema không hợp lệ' }] };
  }
  if (!schema || typeof schema !== 'object') {
    return { ok: false, errors: [{ path: '(schema)', message: 'Schema phải là một object' }] };
  }
  const errors: SchemaError[] = [];
  validateNode(schema, data, '', errors);
  return { ok: errors.length === 0, errors };
}

export const SCHEMA_PLACEHOLDER = `{
  "type": "object",
  "required": ["id", "name"],
  "properties": {
    "id": { "type": "integer", "minimum": 1 },
    "name": { "type": "string", "minLength": 1 },
    "role": { "type": "string", "enum": ["admin", "user"] }
  },
  "additionalProperties": true
}`;
