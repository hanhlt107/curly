import { useState } from 'react';

export type ModalName =
  | 'auth'
  | 'save'
  | 'code'
  | 'cookie'
  | 'mock'
  | 'multiEnv'
  | 'workflow'
  | 'env'
  | 'palette'
  | 'dynVars'
  | 'share'
  | 'live';

export function useModals() {
  const [open, setOpen] = useState<Partial<Record<ModalName, boolean>>>({});
  return {
    isOpen: (m: ModalName) => !!open[m],
    open: (m: ModalName) => setOpen((s) => ({ ...s, [m]: true })),
    close: (m: ModalName) => setOpen((s) => ({ ...s, [m]: false })),
    toggle: (m: ModalName) => setOpen((s) => ({ ...s, [m]: !s[m] })),
  };
}
