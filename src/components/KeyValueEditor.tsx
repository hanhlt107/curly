import type { KeyValue } from '../types/request';

interface Props {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  keyPlaceholder?: string;
}

export function newRow(): KeyValue {
  return { id: crypto.randomUUID(), enabled: true, key: '', value: '' };
}

export default function KeyValueEditor({ items, onChange, keyPlaceholder = 'Key' }: Props) {
  const rows = items.length ? items : [newRow()];

  const update = (id: string, patch: Partial<KeyValue>) =>
    onChange(rows.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const remove = (id: string) => onChange(rows.filter((it) => it.id !== id));

  return (
    <table className="kv-table">
      <tbody>
        {rows.map((it) => (
          <tr key={it.id}>
            <td className="kv-check">
              <input
                type="checkbox"
                checked={it.enabled}
                onChange={(e) => update(it.id, { enabled: e.target.checked })}
              />
            </td>
            <td>
              <input
                value={it.key}
                placeholder={keyPlaceholder}
                onChange={(e) => {
                  const isLast = rows[rows.length - 1].id === it.id;
                  const next = rows.map((r) =>
                    r.id === it.id ? { ...r, key: e.target.value } : r,
                  );
                  if (isLast && e.target.value) next.push(newRow());
                  onChange(next);
                }}
              />
            </td>
            <td>
              <input
                value={it.value}
                placeholder="Value"
                onChange={(e) => update(it.id, { value: e.target.value })}
              />
            </td>
            <td className="kv-del">
              <button type="button" onClick={() => remove(it.id)} title="Xóa">
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
