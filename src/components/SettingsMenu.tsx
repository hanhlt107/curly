import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import type { Environment } from '../types/request';

interface Props {
  cookiesCount: number;
  onOpenCookies: () => void;
  mockMode: boolean;
  mocksCount: number;
  onOpenMock: () => void;
  onExport: () => void;
  onExportCode: () => void;
  onImport: () => void;
  onOpenShare: () => void;
  onOpenLive: () => void;
  environments: Environment[];
  activeEnvId: string | null;
  onSelectEnv: (id: string | null) => void;
  onManageEnv: () => void;
  authEnabled: boolean;
  authEmail: string | null;
  syncStatus: string;
  syncLabel: string;
  onSignIn: () => void;
  onSignOut: () => void;
}

export default function SettingsMenu({
  cookiesCount,
  onOpenCookies,
  mockMode,
  mocksCount,
  onOpenMock,
  onExport,
  onExportCode,
  onImport,
  onOpenShare,
  onOpenLive,
  environments,
  activeEnvId,
  onSelectEnv,
  onManageEnv,
  authEnabled,
  authEmail,
  syncStatus,
  syncLabel,
  onSignIn,
  onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  const activeEnvName = environments.find((e) => e.id === activeEnvId)?.name ?? 'No Environment';

  return (
    <div className={`settings-menu ${open ? 'open' : ''}`} ref={ref}>
      <Button
        type="button"
        size="sm"
        className="settings-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Cài đặt"
      >
        <span className="settings-gear">⚙</span> Setting
        <span className="settings-caret">▾</span>
      </Button>
      {open && (
        <div className="settings-panel" role="menu">
          <button className="settings-item" role="menuitem" onClick={() => run(onOpenCookies)}>
            <span className="settings-ico">🍪</span>
            <span className="settings-txt">Cookies</span>
            {cookiesCount > 0 && <span className="pill">{cookiesCount}</span>}
          </button>

          <button
            className={`settings-item ${mockMode ? 'mock-on' : ''}`}
            role="menuitem"
            onClick={() => run(onOpenMock)}
          >
            <span className="settings-ico">🎭</span>
            <span className="settings-txt">Mock</span>
            {mockMode && <span className="pill pill-mock">ON</span>}
            {!mockMode && mocksCount > 0 && <span className="pill">{mocksCount}</span>}
          </button>

          <div className="settings-sep" />

          <button className="settings-item" role="menuitem" onClick={() => run(onExport)}>
            <span className="settings-ico">↥</span>
            <span className="settings-txt">Export workspace</span>
          </button>
          <button className="settings-item" role="menuitem" onClick={() => run(onExportCode)}>
            <span className="settings-ico">⌗</span>
            <span className="settings-txt">Export tests-as-code</span>
          </button>
          <button className="settings-item" role="menuitem" onClick={() => run(onImport)}>
            <span className="settings-ico">↧</span>
            <span className="settings-txt">Import workspace / Postman</span>
          </button>
          <button className="settings-item" role="menuitem" onClick={() => run(onOpenShare)}>
            <span className="settings-ico">⇄</span>
            <span className="settings-txt">Chia sẻ P2P</span>
          </button>
          <button className="settings-item" role="menuitem" onClick={() => run(onOpenLive)}>
            <span className="settings-ico">🎙️</span>
            <span className="settings-txt">Live share request</span>
          </button>

          <div className="settings-sep" />

          <div className="settings-section-label">Môi trường · {activeEnvName}</div>
          <div className="settings-env-list">
            <button
              className={`settings-item settings-env ${activeEnvId == null ? 'sel' : ''}`}
              role="menuitemradio"
              aria-checked={activeEnvId == null}
              onClick={() => run(() => onSelectEnv(null))}
            >
              <span className="settings-txt">No Environment</span>
              {activeEnvId == null && <span className="settings-check">✓</span>}
            </button>
            {environments.map((e) => (
              <button
                key={e.id}
                className={`settings-item settings-env ${e.id === activeEnvId ? 'sel' : ''}`}
                role="menuitemradio"
                aria-checked={e.id === activeEnvId}
                onClick={() => run(() => onSelectEnv(e.id))}
              >
                <span className="settings-txt">{e.name}</span>
                {e.id === activeEnvId && <span className="settings-check">✓</span>}
              </button>
            ))}
          </div>
          <button className="settings-item" role="menuitem" onClick={() => run(onManageEnv)}>
            <span className="settings-ico">◈</span>
            <span className="settings-txt">Quản lý môi trường</span>
          </button>

          {authEnabled && (
            <>
              <div className="settings-sep" />
              {authEmail != null ? (
                <div className="settings-account">
                  <div className="settings-account-row">
                    <span className={`sync-dot ${syncStatus}`} title={syncLabel} />
                    <span className="account-email" title={authEmail}>
                      {authEmail}
                    </span>
                  </div>
                  <button className="settings-item" role="menuitem" onClick={() => run(onSignOut)}>
                    <span className="settings-ico">⎋</span>
                    <span className="settings-txt">Đăng xuất</span>
                  </button>
                </div>
              ) : (
                <button className="settings-item" role="menuitem" onClick={() => run(onSignIn)}>
                  <span className="settings-ico">→</span>
                  <span className="settings-txt">Đăng nhập</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
