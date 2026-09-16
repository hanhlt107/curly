import { createContext, useContext } from 'react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface PromptOptions {
  title?: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

export type ToastKind = 'error' | 'info' | 'success';

export interface DialogsContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  toast: (message: string, kind?: ToastKind) => void;
}

export const DialogsContext = createContext<DialogsContextValue | null>(null);

export function useDialogs(): DialogsContextValue {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error('useDialogs phải được dùng bên trong DialogProvider');
  return ctx;
}
