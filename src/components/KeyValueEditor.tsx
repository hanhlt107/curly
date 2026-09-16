import { useState } from 'react';
import type { KeyValue } from '../types/request';

interface Props {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  keyPlaceholder?: string;
  allowSecret?: boolean;
}

export function newRow(): KeyValue {
  return { id: crypto.randomUUID(), enabled: true, key: '', value: '' };
}

export default function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = 'Key',
  allowSecret = false,
}: Props) {
  const rows = items.length ? items : [newRow()];
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const update = (id: string, patch: Partial<KeyValue>) =>
    onChange(rows.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const remove = (id: string) => onChange(rows.filter((it) => it.id !== id));

  return (
    <table className="kv-table">
      <tbody>
        {rows.map((it) => {
          const isSecret = allowSecret && !!it.secret;
          const show = revealed[it.id];
          return (
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
                    const value = e.target.value;
                    const isLast = rows[rows.length - 1].id === it.id;
                    const wasEmpty = it.key === '';
                    const next = rows.map((r) => (r.id === it.id ? { ...r, key: value } : r));
                    if (isLast && wasEmpty && value) next.push(newRow());
                    onChange(next);
                  }}
                />
              </td>
              <td>
                <input
                  type={isSecret && !show ? 'password' : 'text'}
                  value={it.value}
                  placeholder="Value"
                  onChange={(e) => update(it.id, { value: e.target.value })}
                />
              </td>
              {allowSecret && (
                <>
                  <td className="kv-secret">
                    <button
                      type="button"
                      className={`kv-lock ${isSecret ? 'on' : ''}`}
                      title={isSecret ? 'Biến bí mật (bấm để tắt)' : 'Đánh dấu là bí mật'}
                      onClick={() => update(it.id, { secret: !it.secret })}
                    >
                      {isSecret ? '🔒' : '🔓'}
                    </button>
                  </td>
                  <td className="kv-secret">
                    {isSecret && (
                      <button
                        type="button"
                        className="kv-reveal"
                        title={show ? 'Ẩn giá trị' : 'Hiện giá trị'}
                        onClick={() => setRevealed((p) => ({ ...p, [it.id]: !p[it.id] }))}
                      >
                        {show ? '🙈' : '👁'}
                      </button>
                    )}
                  </td>
                </>
              )}
              <td className="kv-del">
                <button type="button" onClick={() => remove(it.id)} title="Xóa">
                  ×
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
