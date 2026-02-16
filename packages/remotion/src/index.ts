// @dead-air/remotion — Video compositions

export { RemotionRoot } from './Root';
export { Episode } from './Episode';
export type { EpisodeProps, SegmentProps } from './Episode';

// Components
export { KenBurns } from './components/KenBurns';
export { TextOverlay } from './components/TextOverlay';
export { SongMetadata } from './components/SongMetadata';
export { Branding } from './components/Branding';
export { FilmGrain } from './components/FilmGrain';
export { VintageFilter } from './components/VintageFilter';
export { WaveformBar } from './components/WaveformBar';
export { AnimatedTitle } from './components/AnimatedTitle';

// Compositions
export { ColdOpen } from './compositions/ColdOpen';
export { ColdOpenV2 } from './compositions/ColdOpenV2';
export { BrandIntro } from './compositions/BrandIntro';
export { NarrationSegment } from './compositions/NarrationSegment';
export { ConcertSegment } from './compositions/ConcertSegment';
export { ContextSegment } from './compositions/ContextSegment';
export { EndScreen } from './compositions/EndScreen';
export { ChapterCard } from './compositions/ChapterCard';
export { ShortsComposition } from './compositions/ShortsComposition';

// Utils
export { sampleEnergy, normalizeEnergy } from './utils/energy';

// Styles
export * from './styles/themes';
