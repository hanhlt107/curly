import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PwaPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="pwa-toast" role="alert">
      <span className="pwa-toast-msg">
        {needRefresh ? 'Có bản cập nhật' : 'Sẵn sàng dùng offline'}
      </span>
      <div className="pwa-toast-actions">
        {needRefresh && (
          <button className="send-btn sm" onClick={() => updateServiceWorker(true)}>
            Tải lại
          </button>
        )}
        <button className="ghost-btn sm" onClick={close}>
          Bỏ qua
        </button>
      </div>
    </div>
  );
}
