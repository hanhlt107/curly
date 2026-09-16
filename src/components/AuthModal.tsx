import { useState } from 'react';
import Button from './Button';
import type { AuthState } from '../hooks/useAuth';

interface Props {
  auth: AuthState;
  onClose: () => void;
}

type Mode = 'signin' | 'signup';

export default function AuthModal({ auth, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError('Nhập email và mật khẩu');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        await auth.signUpWithPassword(email.trim(), password);
        setNotice('Đã tạo tài khoản. Kiểm tra email để xác nhận nếu được yêu cầu.');
      } else {
        await auth.signInWithPassword(email.trim(), password);
        onClose();
      }
    } catch (err) {
      setError((err as Error).message || 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    try {
      await auth.signInWithGoogle();
    } catch (err) {
      setError((err as Error).message || 'Đăng nhập Google thất bại');
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{mode === 'signin' ? 'Đăng nhập' : 'Tạo tài khoản'}</h3>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="side-empty" style={{ marginTop: 0 }}>
            Đăng nhập để đồng bộ collection và biến môi trường lên cloud. Không đăng nhập vẫn dùng
            được bình thường, dữ liệu lưu trên trình duyệt.
          </p>

          <Button block onClick={google} disabled={busy}>
            Tiếp tục với Google
          </Button>

          <div className="auth-divider">hoặc</div>

          <label className="field-label">Email</label>
          <input
            className="field"
            type="email"
            value={email}
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="field-label">Mật khẩu</label>
          <input
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />

          {error && <p className="auth-error">{error}</p>}
          {notice && <p className="auth-notice">{notice}</p>}
        </div>
        <div className="modal-foot auth-foot">
          <button
            className="link-btn"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'signin' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
          </button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? <span className="btn-spinner" /> : mode === 'signin' ? 'Đăng nhập' : 'Đăng ký'}
          </Button>
        </div>
      </div>
    </div>
  );
}
