import { useInstallPrompt } from '../config/pwa';
import Button from './Button';

export default function InstallButton({ className = '' }: { className?: string }) {
  const { canInstall, promptInstall } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <Button
      type="button"
      size="sm"
      className={className}
      onClick={promptInstall}
      title="Cài curly như một ứng dụng để dùng offline"
    >
      ⤓ Cài đặt ứng dụng
    </Button>
  );
}
