import { useInstallPrompt } from '../config/pwa';

export default function InstallButton({ className = 'ghost-btn sm' }: { className?: string }) {
  const { canInstall, promptInstall } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button
      type="button"
      className={className}
      onClick={promptInstall}
      title="Cài curly như một ứng dụng để dùng offline"
    >
      ⤓ Cài đặt ứng dụng
    </button>
  );
}
