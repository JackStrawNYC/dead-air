import { useMemo } from 'react';
import { useSSE } from './useSSE';

export interface LogEntry {
  line: string;
  ts: number;
}

export function useJob(jobId: string | null) {
  const url = jobId ? `/api/pipeline/jobs/${jobId}/stream` : null;
  const { messages, connected, done } = useSSE(url);

  const logEntries = useMemo<LogEntry[]>(
    () => messages.filter(m => m.event === 'log').map(m => ({
      line: m.data.line,
      ts: m.data.ts || Date.now(),
    })),
    [messages],
  );

  const log = useMemo(() => logEntries.map(e => e.line), [logEntries]);

  const currentStage = useMemo(() => {
    const stageMessages = messages.filter(m => m.event === 'stage');
    return stageMessages.length > 0 ? stageMessages[stageMessages.length - 1].data.stage : null;
  }, [messages]);

  const result = useMemo(() => {
    const doneMsg = messages.find(m => m.event === 'done');
    return doneMsg ? doneMsg.data : null;
  }, [messages]);

  return { log, logEntries, currentStage, result, connected, done };
}
