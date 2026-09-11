import type { ApiKeyIn, Auth, AuthType } from '../types/request';

interface Props {
  auth: Auth;
  onChange: (patch: Partial<Auth>) => void;
}

const TYPES: { value: AuthType; label: string }[] = [
  { value: 'none', label: 'No Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apikey', label: 'API Key' },
];

export default function AuthPanel({ auth, onChange }: Props) {
  return (
    <div className="auth-panel">
      <div className="auth-type">
        <label>Kiểu</label>
        <select value={auth.type} onChange={(e) => onChange({ type: e.target.value as AuthType })}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {auth.type === 'none' && <p className="auth-hint">Request này không kèm xác thực.</p>}

      {auth.type === 'bearer' && (
        <div className="auth-fields">
          <label>Token</label>
          <input
            value={auth.bearerToken}
            placeholder="{{token}} hoặc dán token"
            onChange={(e) => onChange({ bearerToken: e.target.value })}
          />
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="auth-fields">
          <label>Username</label>
          <input
            value={auth.basicUser}
            onChange={(e) => onChange({ basicUser: e.target.value })}
          />
          <label>Password</label>
          <input
            type="password"
            value={auth.basicPass}
            onChange={(e) => onChange({ basicPass: e.target.value })}
          />
        </div>
      )}

      {auth.type === 'apikey' && (
        <div className="auth-fields">
          <label>Key</label>
          <input
            value={auth.apiKeyName}
            placeholder="X-API-Key"
            onChange={(e) => onChange({ apiKeyName: e.target.value })}
          />
          <label>Value</label>
          <input
            value={auth.apiKeyValue}
            onChange={(e) => onChange({ apiKeyValue: e.target.value })}
          />
          <label>Gắn vào</label>
          <select
            value={auth.apiKeyIn}
            onChange={(e) => onChange({ apiKeyIn: e.target.value as ApiKeyIn })}
          >
            <option value="header">Header</option>
            <option value="query">Query param</option>
          </select>
        </div>
      )}
    </div>
  );
}
