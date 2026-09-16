import { createPortal } from 'react-dom';
import Button from './Button';
import type { Cookie } from '../types/request';
import { groupByDomain, newCookie } from '../config/cookies';

interface Props {
  cookies: Cookie[];
  enabled: boolean;
  onToggleEnabled: (value: boolean) => void;
  onAdd: (cookie: Cookie) => void;
  onUpdate: (id: string, patch: Partial<Cookie>) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export default function CookieJarModal({
  cookies,
  enabled,
  onToggleEnabled,
  onAdd,
  onUpdate,
  onDelete,
  onClearAll,
  onClose,
}: Props) {
  const groups = groupByDomain(cookies);

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cookie-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Cookie jar</h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <label className="auto-token cookie-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
            />
            Tự động gắn cookie khớp domain/path vào header <code>Cookie</code> khi gửi request
          </label>

          <div className="cookie-hint">
            Trình duyệt chặn đọc <code>Set-Cookie</code> qua CORS, nên cookie ở đây do bạn tự quản
            lý. Cookie được so khớp theo domain (khớp cả subdomain) và path của URL.
          </div>

          {cookies.length === 0 ? (
            <p className="side-empty">Chưa có cookie nào.</p>
          ) : (
            groups.map(([domain, list]) => (
              <div key={domain} className="cookie-group">
                <div className="cookie-domain">{domain}</div>
                <table className="cookie-table">
                  <thead>
                    <tr>
                      <th className="kv-check"></th>
                      <th>Name</th>
                      <th>Value</th>
                      <th>Domain</th>
                      <th>Path</th>
                      <th title="Chỉ gửi qua HTTPS/WSS">Secure</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.id}>
                        <td className="kv-check">
                          <input
                            type="checkbox"
                            checked={c.enabled}
                            onChange={(e) => onUpdate(c.id, { enabled: e.target.checked })}
                          />
                        </td>
                        <td>
                          <input
                            value={c.name}
                            placeholder="name"
                            onChange={(e) => onUpdate(c.id, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={c.value}
                            placeholder="value"
                            onChange={(e) => onUpdate(c.id, { value: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={c.domain}
                            placeholder="example.com"
                            onChange={(e) => onUpdate(c.id, { domain: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            value={c.path}
                            placeholder="/"
                            onChange={(e) => onUpdate(c.id, { path: e.target.value })}
                          />
                        </td>
                        <td className="kv-check">
                          <input
                            type="checkbox"
                            checked={c.secure}
                            onChange={(e) => onUpdate(c.id, { secure: e.target.checked })}
                          />
                        </td>
                        <td className="kv-del">
                          <button type="button" onClick={() => onDelete(c.id)} title="Xóa">
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>

        <div className="modal-foot cookie-foot">
          {cookies.length > 0 && <Button onClick={onClearAll}>Xóa tất cả</Button>}
          <Button onClick={() => onAdd(newCookie())}>+ Thêm cookie</Button>
          <Button onClick={onClose}>Xong</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
