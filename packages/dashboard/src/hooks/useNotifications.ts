import { useCallback, useRef, useEffect } from 'react';

export function useNotifications() {
  const permissionRef = useRef<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      permissionRef.current = Notification.permission;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') {
      permissionRef.current = 'granted';
      return true;
    }
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    permissionRef.current = result;
    return result === 'granted';
  }, []);

  const notify = useCallback((title: string, body?: string) => {
    if (typeof Notification === 'undefined') return;
    if (permissionRef.current !== 'granted') return;
    // Only notify when tab is not focused
    if (document.hasFocus()) return;
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'dead-air-dashboard',
      });
    } catch {
      // Notification API not available or blocked
    }
  }, []);

  return { requestPermission, notify };
}
