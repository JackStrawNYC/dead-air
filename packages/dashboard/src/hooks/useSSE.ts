import { useEffect, useRef, useState, useCallback } from 'react';

interface SSEMessage {
  event: string;
  data: any;
}

export function useSSE(url: string | null) {
  const [messages, setMessages] = useState<SSEMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!url) return;

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const handleEvent = (type: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setMessages(prev => [...prev, { event: type, data }]);
        if (type === 'done') {
          setDone(true);
          es.close();
        }
      } catch { /* ignore parse errors */ }
    };

    es.addEventListener('log', handleEvent('log'));
    es.addEventListener('stage', handleEvent('stage'));
    es.addEventListener('done', handleEvent('done'));
    es.addEventListener('progress', handleEvent('progress'));
    es.addEventListener('ping', () => {}); // keepalive

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  const reset = useCallback(() => {
    setMessages([]);
    setDone(false);
    setConnected(false);
  }, []);

  return { messages, connected, done, reset };
}
