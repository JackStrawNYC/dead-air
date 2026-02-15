// Ingest pipeline
export { orchestrateIngest } from './ingest/index.js';
export type { IngestOptions, IngestResult } from './ingest/index.js';

// Audio analysis pipeline
export { orchestrateAnalysis } from './audio/index.js';
export type { AnalyzeOptions, AnalyzeResult } from './audio/index.js';

// Script generation pipeline
export { orchestrateScript } from './script/index.js';
export type { ScriptOptions, ScriptResult } from './script/index.js';
