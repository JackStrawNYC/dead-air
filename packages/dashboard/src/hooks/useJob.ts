import { useMemo } from 'react';
import { useSSE } from './useSSE';
import type { StageTiming } from '../types';

export interface LogEntry {
  line: string;
  ts: number;
  stage?: string;
}

export function useJob(jobId: string | null) {
  const url = jobId ? `/api/pipeline/jobs/${jobId}/stream` : null;
  const { messages, connected, done } = useSSE(url);

  // Track which stage each log line belongs to
  const logEntries = useMemo<LogEntry[]>(() => {
    let activeStage: string | undefined;
    const entries: LogEntry[] = [];
    for (const m of messages) {
      if (m.event === 'stage') {
        activeStage = String(m.data.stage);
      } else if (m.event === 'log') {
        entries.push({
          line: String(m.data.line ?? ''),
          ts: Number(m.data.ts) || Date.now(),
          stage: activeStage,
        });
      }
    }
    return entries;
  }, [messages]);

  const log = useMemo(() => logEntries.map(e => e.line), [logEntries]);

  const currentStage = useMemo<string | null>(() => {
    const stageMessages = messages.filter(m => m.event === 'stage');
    return stageMessages.length > 0 ? String(stageMessages[stageMessages.length - 1].data.stage) : null;
  }, [messages]);

  const stageTimings = useMemo<Record<string, StageTiming>>(() => {
    const timingMessages = messages.filter(m => m.event === 'stage-timing');
    if (timingMessages.length === 0) return {};
    const last = timingMessages[timingMessages.length - 1];
    return (last.data.timings as Record<string, StageTiming>) || {};
  }, [messages]);

  const result = useMemo<{ success: boolean; error?: string } | null>(() => {
    const doneMsg = messages.find(m => m.event === 'done');
    if (!doneMsg) return null;
    return {
      success: Boolean(doneMsg.data.success),
      error: doneMsg.data.error ? String(doneMsg.data.error) : undefined,
    };
  }, [messages]);

  return { log, logEntries, currentStage, stageTimings, result, connected, done };
}
