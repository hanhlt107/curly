import { useEffect, useRef } from 'react';

export interface HotkeyHandlers {
  onSend: () => void;
  onSave: () => void;
  onPalette: () => void;
  onNewTab: () => void;
  onCloseTab: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
  onToggleSidebar: () => void;
  onFocusUrl: () => void;
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useHotkeys(handlers: HotkeyHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && !e.altKey) {
        if (!e.shiftKey && key === 'enter') {
          e.preventDefault();
          h.onSend();
          return;
        }
        if (!e.shiftKey && key === 's') {
          e.preventDefault();
          h.onSave();
          return;
        }
        if (!e.shiftKey && key === 'k') {
          e.preventDefault();
          h.onPalette();
          return;
        }
        return;
      }

      if (e.altKey && !mod && !e.shiftKey) {
        if (isEditable(e.target)) return;
        switch (key) {
          case 't':
            e.preventDefault();
            h.onNewTab();
            return;
          case 'w':
            e.preventDefault();
            h.onCloseTab();
            return;
          case 'b':
            e.preventDefault();
            h.onToggleSidebar();
            return;
          case 'l':
            e.preventDefault();
            h.onFocusUrl();
            return;
          case 'arrowright':
            e.preventDefault();
            h.onNextTab();
            return;
          case 'arrowleft':
            e.preventDefault();
            h.onPrevTab();
            return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
