import { useMemo } from 'react';
import { useSSE } from './useSSE';

export function useRenderProgress(episodeId: string | null) {
  const url = episodeId ? `/api/render/${episodeId}/progress` : null;
  const { messages, connected, done } = useSSE(url);

  const progress = useMemo(() => {
    const progressMessages = messages.filter(m => m.event === 'progress');
    if (progressMessages.length === 0) return { completed: 0, total: 0 };
    const data = progressMessages[progressMessages.length - 1].data;
    return { completed: Number(data.completed) || 0, total: Number(data.total) || 0 };
  }, [messages]);

  return { ...progress, connected, done };
}
