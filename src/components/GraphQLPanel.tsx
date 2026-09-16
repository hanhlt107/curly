import { useMemo, useRef, useState } from 'react';
import Button from './Button';
import type { ApiRequest, Cookie } from '../types/request';
import { resolveVars } from '../config/apiClient';
import { cachedSchema, loadSchema, type GqlSchema, type GqlType } from '../config/graphql';

interface Props {
  req: ApiRequest;
  vars: Record<string, string>;
  cookies: Cookie[];
  onBodyChange: (value: string) => void;
  onVarsChange: (value: string) => void;
}

interface RootField {
  root: string;
  name: string;
  type: string;
  args: string;
}

function rootFields(schema: GqlSchema): RootField[] {
  const out: RootField[] = [];
  const roots: [string | null, string][] = [
    [schema.queryType, 'query'],
    [schema.mutationType, 'mutation'],
    [schema.subscriptionType, 'subscription'],
  ];
  for (const [typeName, label] of roots) {
    if (!typeName) continue;
    const t = schema.types.find((x) => x.name === typeName);
    if (!t) continue;
    for (const f of t.fields) {
      out.push({
        root: label,
        name: f.name,
        type: f.type,
        args: f.args.map((a) => `${a.name}: ${a.type}`).join(', '),
      });
    }
  }
  return out;
}

export default function GraphQLPanel({ req, vars, cookies, onBodyChange, onVarsChange }: Props) {
  const queryRef = useRef<HTMLTextAreaElement>(null);
  const [schema, setSchema] = useState<GqlSchema | null>(
    () => cachedSchema(resolveVars(req.url, vars)) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedType, setSelectedType] = useState<GqlType | null>(null);

  const roots = useMemo(() => (schema ? rootFields(schema) : []), [schema]);
  const q = filter.trim().toLowerCase();
  const shownRoots = q ? roots.filter((r) => r.name.toLowerCase().includes(q)) : roots;
  const shownTypes = useMemo(() => {
    if (!schema) return [];
    const list = schema.types.filter((t) => t.kind === 'OBJECT' || t.kind === 'INPUT_OBJECT');
    return q ? list.filter((t) => t.name.toLowerCase().includes(q)) : list;
  }, [schema, q]);

  const introspect = async (force: boolean) => {
    if (!req.url.trim()) {
      setError('Chưa nhập URL endpoint GraphQL.');
      setOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    setOpen(true);
    try {
      const s = await loadSchema(req, vars, cookies, force);
      setSchema(s);
    } catch (err) {
      setSchema(null);
      setError((err as Error).message || 'Không lấy được schema.');
    } finally {
      setLoading(false);
    }
  };

  const insert = (text: string) => {
    const el = queryRef.current;
    const value = req.body;
    if (!el) {
      onBodyChange(value ? `${value}\n${text}` : text);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onBodyChange(next);
    const caret = start + text.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="gql-panel">
      <div className="gql-toolbar">
        <Button
          size="sm"
          onClick={() => (schema && !open ? setOpen(true) : introspect(false))}
          disabled={loading}
          title="Lấy schema qua introspection"
        >
          {loading ? <span className="btn-spinner" /> : '📖 Schema'}
        </Button>
        {schema && (
          <Button
            size="sm"
            onClick={() => introspect(true)}
            disabled={loading}
            title="Lấy lại schema mới nhất"
          >
            ↻ Làm mới
          </Button>
        )}
        {open && (
          <Button size="sm" onClick={() => setOpen(false)} title="Ẩn schema explorer">
            Ẩn
          </Button>
        )}
        {schema && <span className="gql-hint">Bấm vào field để chèn vào query</span>}
      </div>

      {open && (
        <div className="gql-schema">
          {error && <div className="gql-error">⚠ {error}</div>}
          {schema && (
            <>
              <input
                className="gql-search"
                placeholder="Lọc field / type…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                spellCheck={false}
              />
              <div className="gql-explorer">
                <div className="gql-col">
                  <div className="gql-col-head">Root fields</div>
                  <div className="gql-list">
                    {shownRoots.length === 0 && <div className="gql-muted">Không có</div>}
                    {shownRoots.map((r) => (
                      <button
                        key={`${r.root}.${r.name}`}
                        className="gql-item"
                        onClick={() => insert(r.name)}
                        title={`${r.root} · ${r.name}(${r.args}): ${r.type}`}
                      >
                        <span className={`gql-tag tag-${r.root}`}>{r.root}</span>
                        <span className="gql-name">{r.name}</span>
                        <span className="gql-type">{r.type}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="gql-col">
                  <div className="gql-col-head">Types</div>
                  <div className="gql-list">
                    {shownTypes.map((t) => (
                      <button
                        key={t.name}
                        className={`gql-item ${selectedType?.name === t.name ? 'active' : ''}`}
                        onClick={() => setSelectedType(t)}
                      >
                        <span className="gql-name">{t.name}</span>
                        <span className="gql-type">{t.kind.toLowerCase()}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="gql-col">
                  <div className="gql-col-head">{selectedType ? selectedType.name : 'Fields'}</div>
                  <div className="gql-list">
                    {!selectedType && <div className="gql-muted">Chọn một type</div>}
                    {selectedType?.fields.map((f) => (
                      <button
                        key={f.name}
                        className="gql-item"
                        onClick={() => insert(f.name)}
                        title={f.description ?? undefined}
                      >
                        <span className="gql-name">{f.name}</span>
                        <span className="gql-type">{f.type}</span>
                      </button>
                    ))}
                    {selectedType && selectedType.fields.length === 0 && (
                      <div className="gql-muted">
                        {selectedType.enumValues.length
                          ? selectedType.enumValues.join(', ')
                          : 'Không có field'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <label className="field-label">Query</label>
      <textarea
        ref={queryRef}
        className="body-input gql-query"
        value={req.body}
        placeholder={'query {\n  users {\n    id\n    name\n  }\n}'}
        onChange={(e) => onBodyChange(e.target.value)}
        spellCheck={false}
      />
      <label className="field-label">Variables (JSON)</label>
      <textarea
        className="body-input gql-vars"
        value={req.graphqlVars}
        placeholder={'{\n  "id": 1\n}'}
        onChange={(e) => onVarsChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
