import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ConfirmModal from './ConfirmModal';
import PromptModal from './PromptModal';
import {
  DialogsContext,
  type ConfirmOptions,
  type PromptOptions,
  type ToastKind,
} from '../hooks/useDialogs';

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface PromptState {
  options: PromptOptions;
  resolve: (value: string | null) => void;
}

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export default function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setConfirmState({ options, resolve })),
    [],
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => setPromptState({ options, resolve })),
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = ++toastId.current;
      setToasts((list) => [...list, { id, message, kind }]);
      setTimeout(() => dismissToast(id), 4000);
    },
    [dismissToast],
  );

  const resolveConfirm = useCallback((result: boolean) => {
    setConfirmState((s) => {
      s?.resolve(result);
      return null;
    });
  }, []);

  const resolvePrompt = useCallback((result: string | null) => {
    setPromptState((s) => {
      s?.resolve(result);
      return null;
    });
  }, []);

  const api = useMemo(() => ({ confirm, prompt, toast }), [confirm, prompt, toast]);

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {confirmState && <ConfirmModal options={confirmState.options} onResolve={resolveConfirm} />}
      {promptState && <PromptModal options={promptState.options} onResolve={resolvePrompt} />}
      {toasts.length > 0 &&
        createPortal(
          <div className="toast-stack">
            {toasts.map((t) => (
              <div key={t.id} className={`toast toast-${t.kind}`} role="alert">
                <span className="toast-msg">{t.message}</span>
                <button className="toast-x" onClick={() => dismissToast(t.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </DialogsContext.Provider>
  );
}
