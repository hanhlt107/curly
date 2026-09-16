import { useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import { DYNAMIC_VARS, resolveDynamic } from '../config/dynamicVars';
import type { CustomDynamicVar } from '../types/request';

interface Props {
  customVars: CustomDynamicVar[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<CustomDynamicVar>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function DynamicVarsModal({
  customVars,
  onAdd,
  onUpdate,
  onDelete,
  onClose,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [samples, setSamples] = useState<Record<string, string>>({});

  const copy = (token: string) => {
    const text = `{{${token}}}`;
    navigator.clipboard?.writeText(text);
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 1200);
  };

  const preview = (v: CustomDynamicVar) => {
    const out = v.name ? resolveDynamic('$' + v.name) : null;
    setSamples((s) => ({ ...s, [v.id]: out ?? '(chưa sinh được)' }));
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal dynvars-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Biến động</h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="dynvars-hint">
            Chèn các biến này vào URL, header, param, body hay biến GraphQL. Giá trị được sinh mới
            mỗi lần Send. Bấm để copy.
          </p>
          <table className="dynvars-table">
            <tbody>
              {DYNAMIC_VARS.map((v) => (
                <tr key={v.token} onClick={() => copy(v.token)}>
                  <td className="dynvars-token">
                    <code>{`{{${v.token}}}`}</code>
                  </td>
                  <td className="dynvars-desc">{v.desc}</td>
                  <td className="dynvars-copy">{copied === v.token ? '✓ Đã copy' : 'Copy'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="dynvars-custom-head">
            <h4>Biến động của bạn</h4>
            <Button size="sm" onClick={onAdd}>
              + Thêm biến
            </Button>
          </div>
          <p className="dynvars-hint">
            Đặt tên rồi viết mẫu sinh — có thể ghép các biến có sẵn, ví dụ{' '}
            <code>{'user{{$randomInt:1:999}}@corp.com'}</code>. Dùng bằng <code>{'{{$tên}}'}</code>.
          </p>
          {customVars.length === 0 ? (
            <p className="dynvars-empty">Chưa có biến động nào. Bấm “Thêm biến” để tạo.</p>
          ) : (
            <div className="dynvars-custom-list">
              {customVars.map((v) => (
                <div className="dynvars-custom-row" key={v.id}>
                  <div className="dynvars-custom-fields">
                    <label className="dynvars-field">
                      <span>Tên</span>
                      <div className="dynvars-name-input">
                        <span className="dynvars-name-prefix">$</span>
                        <input
                          value={v.name}
                          placeholder="myEmail"
                          onChange={(e) => onUpdate(v.id, { name: e.target.value })}
                        />
                      </div>
                    </label>
                    <label className="dynvars-field grow">
                      <span>Mẫu sinh</span>
                      <input
                        value={v.template}
                        placeholder="user{{$randomInt:1:999}}@corp.com"
                        onChange={(e) => onUpdate(v.id, { template: e.target.value })}
                      />
                    </label>
                    <label className="dynvars-field grow">
                      <span>Mô tả</span>
                      <input
                        value={v.desc}
                        placeholder="Email nội bộ ngẫu nhiên"
                        onChange={(e) => onUpdate(v.id, { desc: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="dynvars-custom-actions">
                    {v.name && (
                      <Button size="sm" onClick={() => copy('$' + v.name)}>
                        {copied === '$' + v.name ? '✓' : `Copy {{$${v.name}}}`}
                      </Button>
                    )}
                    <Button size="sm" disabled={!v.name} onClick={() => preview(v)}>
                      Thử
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => onDelete(v.id)}>
                      Xóa
                    </Button>
                  </div>
                  {samples[v.id] != null && (
                    <div className="dynvars-sample">
                      <span>→</span> <code>{samples[v.id]}</code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <Button onClick={onClose}>Xong</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
