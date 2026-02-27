import { useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { ToastContext } from '../hooks/useToast';
import type { ToastMessage } from '../hooks/useToast';

let _nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = String(++_nextId);
    setToasts(prev => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 10000,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const colors: Record<string, { bg: string; border: string; text: string }> = {
    success: { bg: 'var(--green-dim)', border: 'var(--green)', text: 'var(--green)' },
    error: { bg: 'var(--red-dim)', border: 'var(--red)', text: 'var(--red)' },
    info: { bg: 'var(--blue-dim)', border: 'var(--blue)', text: 'var(--blue)' },
  };
  const c = colors[toast.type] || colors.info;

  return (
    <div
      style={{
        background: c.bg, border: `1px solid ${c.border}`, borderRadius: 'var(--radius)',
        padding: '10px 14px', fontSize: 13, color: c.text,
        pointerEvents: 'auto', cursor: 'pointer',
        boxShadow: 'var(--shadow-md)', maxWidth: 360,
        opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(20px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }}
      onClick={() => onDismiss(toast.id)}
    >
      {toast.text}
    </div>
  );
}
