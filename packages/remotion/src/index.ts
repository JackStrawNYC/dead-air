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
export { CinematicLetterbox } from './components/CinematicLetterbox';
export { FilmLook } from './components/FilmLook';
export { DynamicGrade } from './components/DynamicGrade';
export type { GradeMood } from './components/DynamicGrade';
export { BreathingOverlay } from './components/BreathingOverlay';
export { ArchivalTexture } from './components/ArchivalTexture';
export { CrowdAmbience } from './components/CrowdAmbience';
export { CinematicLowerThird } from './components/CinematicLowerThird';
export { LightLeak } from './components/LightLeak';
export { StageLighting } from './components/StageLighting';
export { SetlistProgress } from './components/SetlistProgress';
export type { SongPosition } from './components/SetlistProgress';
export { VinylNoise } from './components/VinylNoise';
export { ParallaxBg } from './components/ParallaxBg';
export { CinematicGrade, MOOD_GRADE_PRESET } from './components/CinematicGrade';
export type { GradePreset } from './components/CinematicGrade';
export { SegmentErrorBoundary } from './components/SegmentErrorBoundary';
export { SafeLoopAudio, LoopedAudio } from './components/LoopedAudio';
export { DuckedBGM } from './components/DuckedBGM';
export { AmbientBed } from './components/AmbientBed';
export { TensionDrone } from './components/TensionDrone';
export type { DroneType } from './components/TensionDrone';

// Transitions
export { whipPan } from './transitions/whip-pan';
export { lightLeakTransition } from './transitions/light-leak-transition';
export { iris } from './transitions/iris';
export { zoomBlur } from './transitions/zoom-blur';
export { flashCut } from './transitions/flash-cut';
export { dipToBlack } from './transitions/dip-to-black';
export { filmBurn } from './transitions/film-burn';
export { diagonalWipe } from './transitions/diagonal-wipe';

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
export { smoothstepVolume, jCutVolume } from './utils/audio';
export { computeSilenceFactor, computePreSwellFactor } from './utils/silenceWindows';
export type { SilenceWindow, PreSwellWindow } from './utils/silenceWindows';
export { assignCameraPreset, getCameraSpeed } from './utils/cameraAssignment';
export type { CameraPreset } from './utils/cameraAssignment';

// Styles
export * from './styles/themes';
