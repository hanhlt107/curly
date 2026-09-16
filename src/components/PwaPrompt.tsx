import { useRegisterSW } from 'virtual:pwa-register/react';
import Button from './Button';

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
          <Button variant="primary" size="sm" onClick={() => updateServiceWorker(true)}>
            Tải lại
          </Button>
        )}
        <Button size="sm" onClick={close}>
          Bỏ qua
        </Button>
      </div>
    </div>
  );
}
