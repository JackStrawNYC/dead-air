// Ingest pipeline
export { orchestrateIngest } from './ingest/index.js';
export type { IngestOptions, IngestResult } from './ingest/index.js';

// Audio analysis pipeline
export { orchestrateAnalysis } from './audio/index.js';
export type { AnalyzeOptions, AnalyzeResult } from './audio/index.js';

// Show research pipeline
export { orchestrateResearch } from './research/index.js';
export type { ResearchOptions, ResearchResult } from './research/index.js';

// Script generation pipeline
export { orchestrateScript } from './script/index.js';
export type { ScriptOptions, ScriptResult } from './script/index.js';

// Asset generation pipeline
export { orchestrateAssetGeneration } from './assets/index.js';
export type { AssetGenOptions, AssetGenResult } from './assets/index.js';

// Render pipeline
export { orchestrateRender, buildCompositionProps } from './render/index.js';
export type { RenderPipelineOptions, RenderPipelineResult, EpisodeProps, SegmentProps } from './render/index.js';
