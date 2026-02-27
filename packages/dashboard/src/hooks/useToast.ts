import { createContext, useContext, useCallback } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export interface ToastContextValue {
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], text: string) => void;
  removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export function useToast() {
  const ctx = useContext(ToastContext);
  const toast = useCallback((type: ToastMessage['type'], text: string) => {
    ctx.addToast(type, text);
  }, [ctx]);
  return toast;
}
