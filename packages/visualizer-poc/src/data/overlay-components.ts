/**
 * Overlay Component Map — maps overlay names to their React components + layer.
 * This file centralizes all overlay imports so SongVisualizer can render dynamically.
 *
 * Components with special props (SongTitle, ConcertInfo, SetlistScroll, FilmGrain)
 * are NOT included here — they remain hardcoded in SongVisualizer.tsx.
 *
 * 352 selectable keepers (2026-03-20). Component files preserved in src/components/.
 */
import React from "react";
import type { EnhancedFrameData } from "./types";

// ─── Layer 1: Atmospheric (8) ───
import { CosmicStarfield } from "../components/CosmicStarfield";
import { TieDyeWash } from "../components/TieDyeWash";
import { LavaLamp } from "../components/LavaLamp";
import { Fireflies } from "../components/Fireflies";
import { LighterWave } from "../components/LighterWave";
import { CrowdDance } from "../components/CrowdDance";
import { GlowSticks } from "../components/GlowSticks";
import { GodRays } from "../components/GodRays";

// ─── Layer 2: Sacred / Center-stage (13) ───
import { BreathingStealie } from "../components/BreathingStealie";
import { ThirteenPointBolt } from "../components/ThirteenPointBolt";
import { StealYourFaceOff } from "../components/StealYourFaceOff";
import { SkullKaleidoscope } from "../components/SkullKaleidoscope";
import { SkeletonRoses } from "../components/SkeletonRoses";
import { SacredGeometry } from "../components/SacredGeometry";
import { DarkStarPortal } from "../components/DarkStarPortal";
import { FractalZoom } from "../components/FractalZoom";
import { MandalaGenerator } from "../components/MandalaGenerator";
import { RoseOverlay } from "../components/RoseOverlay";
import { StainedGlass } from "../components/StainedGlass";
import { DreamCatcher } from "../components/DreamCatcher";
import { StealieFade } from "../components/StealieFade";

// ─── Layer 3: Reactive (6) ───
import { LightningBoltOverlay } from "../components/LightningBoltOverlay";
import { ParticleExplosion } from "../components/ParticleExplosion";
import { LaserShow } from "../components/LaserShow";
import { EmberRise } from "../components/EmberRise";
import { WallOfSound } from "../components/WallOfSound";
import { PhilZone } from "../components/PhilZone";

// ─── Layer 4: Geometric / Physics (10) ───
import { VoronoiFlow } from "../components/VoronoiFlow";
import { PenroseTiling } from "../components/PenroseTiling";
import { MoirePattern } from "../components/MoirePattern";
import { OpArtPatterns } from "../components/OpArtPatterns";
import { BatikPattern } from "../components/BatikPattern";
import { VortexSpiral } from "../components/VortexSpiral";
import { SpiralArms } from "../components/SpiralArms";
import { SunMandala } from "../components/SunMandala";
import { MoireInterference } from "../components/MoireInterference";
import { LissajousCurves } from "../components/LissajousCurves";

// ─── Layer 2: Dead Culture additions (3) ───
import { RoseGarden } from "../components/RoseGarden";
import { StealYourFaceKaleidoscope } from "../components/StealYourFaceKaleidoscope";

// ─── Layer 5: Song References (3) + Dead Culture ───
import { SunMoonMotif } from "../components/SunMoonMotif";
import { ChinaCatSunflower } from "../components/ChinaCatSunflower";
import { SugarMagnolia } from "../components/SugarMagnolia";
import { BoxOfRain } from "../components/BoxOfRain";

// ─── Layer 6: Character / Dead Culture (13) ───
import { BearParade } from "../components/BearParade";
import { SkeletonBand } from "../components/SkeletonBand";
import { MarchingTerrapins } from "../components/MarchingTerrapins";
import { Bertha } from "../components/Bertha";
import { JerryGuitar } from "../components/JerryGuitar";
import { VWBusParade } from "../components/VWBusParade";
import { CosmicCharlie } from "../components/CosmicCharlie";
import { JerrySpotlight } from "../components/JerrySpotlight";
import { BobWeir } from "../components/BobWeir";
import { DrumCircle } from "../components/DrumCircle";
import { DancingTerrapinOverlay } from "../components/DancingTerrapinOverlay";
import { SkeletonCouple } from "../components/SkeletonCouple";
import { DeadIcons } from "../components/DeadIcons";

// ─── Layer 7: Show Artifacts (3) ───
import { VenueMarquee } from "../components/VenueMarquee";
import { TapeTrader } from "../components/TapeTrader";
import { TourPosterGallery } from "../components/TourPosterGallery";

// ─── Phase 9 Wave 3: New Overlays ───
import { RainDrops } from "../components/RainDrops";
import { FogBank } from "../components/FogBank";
import { TidalPool } from "../components/TidalPool";
import { VineGrowth } from "../components/VineGrowth";
import { PhilLesh } from "../components/PhilLesh";
import { DrummersDuo } from "../components/DrummersDuo";
import { BassWaveform } from "../components/BassWaveform";
import { TicketStub } from "../components/TicketStub";

// ─── Dead Culture Iconography (6) ───
import { SkullRoses } from "../components/SkullRoses";
import { EgyptianEye } from "../components/EgyptianEye";
import { TerrapinStation } from "../components/TerrapinStation";
import { SunflowerStealie } from "../components/SunflowerStealie";
import { CosmicEagle } from "../components/CosmicEagle";
import { WaveOfLight } from "../components/WaveOfLight";

// ─── Layer 9: Music Visualization HUD (10) ───
import { VUMeters } from "../components/VUMeters";
import { Oscilloscope } from "../components/Oscilloscope";
import { SpectrumAnalyzer } from "../components/SpectrumAnalyzer";
import { PianoRoll } from "../components/PianoRoll";
import { Seismograph } from "../components/Seismograph";
import { Oscillator } from "../components/Oscillator";
import { RadialSpectrum } from "../components/RadialSpectrum";
import { BeatGrid } from "../components/BeatGrid";
import { StemSeparation } from "../components/StemSeparation";
import { WaterfallSpectrogram } from "../components/WaterfallSpectrogram";

// ─── Remaining Library (269) ───
import { Abacus } from "../components/Abacus";
import { AlchemySymbols } from "../components/AlchemySymbols";
import { Altimeter } from "../components/Altimeter";
import { AmericanBeauty } from "../components/AmericanBeauty";
import { Amplifier } from "../components/Amplifier";
import { Anemone } from "../components/Anemone";
import { Anvil } from "../components/Anvil";
import { Aqueduct } from "../components/Aqueduct";
import { ArtDeco } from "../components/ArtDeco";
import { ArtNouveau } from "../components/ArtNouveau";
import { AsciiRain } from "../components/AsciiRain";
import { AstrolabeOverlay } from "../components/AstrolabeOverlay";
import { AuroraBorealis } from "../components/AuroraBorealis";
import { AztecCalendar } from "../components/AztecCalendar";
import { BambooForest } from "../components/BambooForest";
import { BicycleWheels } from "../components/BicycleWheels";
import { BinaryStream } from "../components/BinaryStream";
import { BirdMigration } from "../components/BirdMigration";
import { BlackHole } from "../components/BlackHole";
import { BookPages } from "../components/BookPages";
import { BootlegLabel } from "../components/BootlegLabel";
import { BubbleChamber } from "../components/BubbleChamber";
import { BubbleRise } from "../components/BubbleRise";
import { BumperStickers } from "../components/BumperStickers";
import { ButterflySwarm } from "../components/ButterflySwarm";
import { CactusGarden } from "../components/CactusGarden";
import { CampfireSparks } from "../components/CampfireSparks";
import { CandleFlicker } from "../components/CandleFlicker";
import { CarouselHorses } from "../components/CarouselHorses";
import { CassetteReels } from "../components/CassetteReels";
import { Caterpillar } from "../components/Caterpillar";
import { Cathedral } from "../components/Cathedral";
import { Caustics } from "../components/Caustics";
import { CavePaintings } from "../components/CavePaintings";
import { CelticKnot } from "../components/CelticKnot";
import { ChakraStack } from "../components/ChakraStack";
import { ChalkBoard } from "../components/ChalkBoard";
import { Chameleon } from "../components/Chameleon";
import { CherryBlossom } from "../components/CherryBlossom";
import { ChessPieces } from "../components/ChessPieces";
import { Chronograph } from "../components/Chronograph";
import { CircuitBoard } from "../components/CircuitBoard";
import { CitySkyline } from "../components/CitySkyline";
import { Clockwork } from "../components/Clockwork";
import { CoffeeSwirl } from "../components/CoffeeSwirl";
import { Colosseum } from "../components/Colosseum";
import { CometTail } from "../components/CometTail";
import { ComicExplosions } from "../components/ComicExplosions";
import { Compass } from "../components/Compass";
import { CompassNeedle } from "../components/CompassNeedle";
import { CompassRose } from "../components/CompassRose";
import { Confetti } from "../components/Confetti";
import { ConfettiCannon } from "../components/ConfettiCannon";
import { Constellation } from "../components/Constellation";
import { ConveyorBelt } from "../components/ConveyorBelt";
import { CoralReef } from "../components/CoralReef";
import { Crane } from "../components/Crane";
import { CrowdSilhouette } from "../components/CrowdSilhouette";
import { CrystalFormation } from "../components/CrystalFormation";
import { CrystalGrowth } from "../components/CrystalGrowth";
import { CuckooClockOverlay } from "../components/CuckooClockOverlay";
import { DNAHelix } from "../components/DNAHelix";
import { DesertMirage } from "../components/DesertMirage";
import { Dewdrops } from "../components/Dewdrops";
import { Diatoms } from "../components/Diatoms";
import { DiceRoll } from "../components/DiceRoll";
import { DoublePendulum } from "../components/DoublePendulum";
import { DragonBreath } from "../components/DragonBreath";
import { Dragonfly } from "../components/Dragonfly";
import { DrumCircles } from "../components/DrumCircles";
import { EclipseCorona } from "../components/EclipseCorona";
import { EnergyEffects } from "../components/EnergyEffects";
import { EuropeTour } from "../components/EuropeTour";
import { FernUnfurl } from "../components/FernUnfurl";
import { FerrisWheel } from "../components/FerrisWheel";
import { FestivalTent } from "../components/FestivalTent";
import { FibonacciSpiral } from "../components/FibonacciSpiral";
import { FilmBurn } from "../components/FilmBurn";
import { FilmStrip } from "../components/FilmStrip";
import { FlightInstruments } from "../components/FlightInstruments";
import { Flock } from "../components/Flock";
import { FogLaser } from "../components/FogLaser";
import { FogMachine } from "../components/FogMachine";
import { FrostCrystals } from "../components/FrostCrystals";
import { GalaxyArm } from "../components/GalaxyArm";
import { GameOfLife } from "../components/GameOfLife";
import { GarciaQuotes } from "../components/GarciaQuotes";
import { GearWorks } from "../components/GearWorks";
import { GeyserEruption } from "../components/GeyserEruption";
import { GothicArch } from "../components/GothicArch";
import { GraffitiTag } from "../components/GraffitiTag";
import { Gyroscope } from "../components/Gyroscope";
import { HeartbeatEKG } from "../components/HeartbeatEKG";
import { HeatShimmer } from "../components/HeatShimmer";
import { Hieroglyphs } from "../components/Hieroglyphs";
import { HighwaySign } from "../components/HighwaySign";
import { HilbertCurve } from "../components/HilbertCurve";
import { HologramGlitch } from "../components/HologramGlitch";
import { HolographicDisc } from "../components/HolographicDisc";
import { HoneycombGrid } from "../components/HoneycombGrid";
import { HookahSmoke } from "../components/HookahSmoke";
import { HotAirBalloons } from "../components/HotAirBalloons";
import { Hourglass } from "../components/Hourglass";
import { Hydraulic } from "../components/Hydraulic";
import { IcebergFloat } from "../components/IcebergFloat";
import { Ikat } from "../components/Ikat";
import { InkDrop } from "../components/InkDrop";
import { Jellyfish } from "../components/Jellyfish";
import { JellyfishSwarm } from "../components/JellyfishSwarm";
import { KaleidoscopeFilter } from "../components/KaleidoscopeFilter";
import { KoiPond } from "../components/KoiPond";
import { Ladybug } from "../components/Ladybug";
import { Lanterns } from "../components/Lanterns";
import { LavaFlow } from "../components/LavaFlow";
import { LensFlare } from "../components/LensFlare";
import { Lighthouse } from "../components/Lighthouse";
import { LiquidMetal } from "../components/LiquidMetal";
import { LoadingBars } from "../components/LoadingBars";
import { LorenzAttractor } from "../components/LorenzAttractor";
import { LotScene } from "../components/LotScene";
import { LotusOpen } from "../components/LotusOpen";
import { LyricFlash } from "../components/LyricFlash";
import { Macrame } from "../components/Macrame";
import { MantraScroll } from "../components/MantraScroll";
import { MarqueeLights } from "../components/MarqueeLights";
import { MatrixRain } from "../components/MatrixRain";
import { MemphisDesign } from "../components/MemphisDesign";
import { MengerSponge } from "../components/MengerSponge";
import { MeteorShower } from "../components/MeteorShower";
import { Metronome } from "../components/Metronome";
import { MolecularBonds } from "../components/MolecularBonds";
import { MoonPhases } from "../components/MoonPhases";
import { MoshPit } from "../components/MoshPit";
import { MotelSign } from "../components/MotelSign";
import { Moth } from "../components/Moth";
import { MountainRange } from "../components/MountainRange";
import { MushroomBloom } from "../components/MushroomBloom";
import { MushroomForest } from "../components/MushroomForest";
import { NebulaCloud } from "../components/NebulaCloud";
import { NeonCarousel } from "../components/NeonCarousel";
import { NeonSign } from "../components/NeonSign";
import { NeuralNetwork } from "../components/NeuralNetwork";
import { NewtonsCradle } from "../components/NewtonsCradle";
import { NixieTubes } from "../components/NixieTubes";
import { NorthernLights } from "../components/NorthernLights";
import { Obelisk } from "../components/Obelisk";
import { OceanWaves } from "../components/OceanWaves";
import { Octopus } from "../components/Octopus";
import { OilSlick } from "../components/OilSlick";
import { Orrery } from "../components/Orrery";
import { Pagoda } from "../components/Pagoda";
import { Paisley } from "../components/Paisley";
import { PaperAirplanes } from "../components/PaperAirplanes";
import { PaperCranes } from "../components/PaperCranes";
import { PeaceSignShower } from "../components/PeaceSignShower";
import { Peacock } from "../components/Peacock";
import { PendulumWave } from "../components/PendulumWave";
import { PhoenixWings } from "../components/PhoenixWings";
import { PinballMachine } from "../components/PinballMachine";
import { Pinwheel } from "../components/Pinwheel";
import { Piston } from "../components/Piston";
import { PixelExplosion } from "../components/PixelExplosion";
import { PlanetaryRings } from "../components/PlanetaryRings";
import { PlasmaBall } from "../components/PlasmaBall";
import { PocketWatch } from "../components/PocketWatch";
import { Pointillism } from "../components/Pointillism";
import { PolaroidDevelop } from "../components/PolaroidDevelop";
import { PollenDrift } from "../components/PollenDrift";
import { Porthole } from "../components/Porthole";
import { PostcardStack } from "../components/PostcardStack";
import { PrayerFlags } from "../components/PrayerFlags";
import { PrismRainbow } from "../components/PrismRainbow";
import { PsychedelicBorder } from "../components/PsychedelicBorder";
import { Pulsar } from "../components/Pulsar";
import { PyramidBeams } from "../components/PyramidBeams";
import { Pyrotechnics } from "../components/Pyrotechnics";
import { Radar } from "../components/Radar";
import { RainOnGlass } from "../components/RainOnGlass";
import { RainbowArc } from "../components/RainbowArc";
import { Rainsplash } from "../components/Rainsplash";
import { RansomNote } from "../components/RansomNote";
import { ReactionDiffusion } from "../components/ReactionDiffusion";
import { RetroTV } from "../components/RetroTV";
import { RippleLotus } from "../components/RippleLotus";
import { RipplePool } from "../components/RipplePool";
import { RomanColumns } from "../components/RomanColumns";
import { RuneCircle } from "../components/RuneCircle";
import { SailingShips } from "../components/SailingShips";
import { SandTimer } from "../components/SandTimer";
import { Sandstorm } from "../components/Sandstorm";
import { SaxophoneKeys } from "../components/SaxophoneKeys";
import { Scorpion } from "../components/Scorpion";
import { Screensaver } from "../components/Screensaver";
import { SeaTurtles } from "../components/SeaTurtles";
import { Seahorses } from "../components/Seahorses";
import { SeaweedForest } from "../components/SeaweedForest";
import { Sextant } from "../components/Sextant";
import { ShadowPuppets } from "../components/ShadowPuppets";
import { SheetMusic } from "../components/SheetMusic";
import { ShootingStar } from "../components/ShootingStar";
import { SkullRosesOverlay } from "../components/SkullRosesOverlay";
import { Slinky } from "../components/Slinky";
import { SmokeWisps } from "../components/SmokeWisps";
import { Snowfall } from "../components/Snowfall";
import { SoapBubbles } from "../components/SoapBubbles";
import { SolarEclipse } from "../components/SolarEclipse";
import { SolarFlare } from "../components/SolarFlare";
import { SongReactiveEffects } from "../components/SongReactiveEffects";
import { SpaceDrums } from "../components/SpaceDrums";
import { SpiderWeb } from "../components/SpiderWeb";
import { SpinningTop } from "../components/SpinningTop";
import { SpiritWisps } from "../components/SpiritWisps";
import { Spirograph } from "../components/Spirograph";
import { SpotlightFollow } from "../components/SpotlightFollow";
import { StageDive } from "../components/StageDive";
import { StageLights } from "../components/StageLights";
import { StalactiteCave } from "../components/StalactiteCave";
import { StampCollection } from "../components/StampCollection";
import { SteamTrain } from "../components/SteamTrain";
import { SteamValve } from "../components/SteamValve";
import { Streamers } from "../components/Streamers";
import { Sundial } from "../components/Sundial";
import { Supernova } from "../components/Supernova";
import { SynthPatch } from "../components/SynthPatch";
import { Tambourine } from "../components/Tambourine";
import { TapestryWeave } from "../components/TapestryWeave";
import { TarotReveal } from "../components/TarotReveal";
import { TelescopeView } from "../components/TelescopeView";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { TeslaCoil } from "../components/TeslaCoil";
import { ThirdEye } from "../components/ThirdEye";
import { Thunderhead } from "../components/Thunderhead";
import { TicketStubAnimated } from "../components/TicketStubAnimated";
import { TidePool } from "../components/TidePool";
import { Topography } from "../components/Topography";
import { Totem } from "../components/Totem";
import { TouchOfGrey } from "../components/TouchOfGrey";
import { TrailMap } from "../components/TrailMap";
import { Transistor } from "../components/Transistor";
import { TreeOfLife } from "../components/TreeOfLife";
import { TreeSilhouette } from "../components/TreeSilhouette";
import { Tumbleweed } from "../components/Tumbleweed";
import { TunnelVision } from "../components/TunnelVision";
import { Turbine } from "../components/Turbine";
import { Turntable } from "../components/Turntable";
import { TypewriterKeys } from "../components/TypewriterKeys";
import { UFOBeam } from "../components/UFOBeam";
import { UncleSam } from "../components/UncleSam";
import { VacuumTube } from "../components/VacuumTube";
import { VaporTrails } from "../components/VaporTrails";
import { VintageMap } from "../components/VintageMap";
import { VinylGrooves } from "../components/VinylGrooves";
import { VolcanoFlow } from "../components/VolcanoFlow";
import { WarholGrid } from "../components/WarholGrid";
import { WarpDrive } from "../components/WarpDrive";
import { WaterClock } from "../components/WaterClock";
import { WaterfallMist } from "../components/WaterfallMist";
import { WeatherVane } from "../components/WeatherVane";
import { WeldingSparks } from "../components/WeldingSparks";
import { Whirlpool } from "../components/Whirlpool";
import { WindChimes } from "../components/WindChimes";
import { Windmill } from "../components/Windmill";
import { WireframeDodecahedron } from "../components/WireframeDodecahedron";
import { WormholeTransit } from "../components/WormholeTransit";
import { YoYo } from "../components/YoYo";
import { ZenRipples } from "../components/ZenRipples";
import { Zeppelin } from "../components/Zeppelin";
import { ZodiacWheel } from "../components/ZodiacWheel";

// ─── Layer 10: Distortion (1) ───
import { VHSGlitch } from "../components/VHSGlitch";

/**
 * Standard overlay component: takes only { frames: EnhancedFrameData[] }
 * Components with custom props (SongTitle, ConcertInfo, SetlistScroll, FilmGrain)
 * are handled separately in SongVisualizer.tsx.
 */
export interface OverlayComponentEntry {
  Component: React.ComponentType<{ frames: EnhancedFrameData[] }>;
  layer: number;
  /** Render context: 'dom' for HTML/CSS overlays, 'glsl' for Three.js shader overlays */
  renderContext?: 'dom' | 'glsl';
}

export const OVERLAY_COMPONENTS: Record<string, OverlayComponentEntry> = {
  // Layer 1: Atmospheric
  CosmicStarfield:   { Component: CosmicStarfield, layer: 1 },
  TieDyeWash:        { Component: TieDyeWash, layer: 1 },
  LavaLamp:          { Component: LavaLamp, layer: 1 },
  Fireflies:         { Component: Fireflies, layer: 1 },
  LighterWave:       { Component: LighterWave, layer: 1 },
  CrowdDance:        { Component: CrowdDance, layer: 1 },
  GlowSticks:        { Component: GlowSticks, layer: 1 },
  GodRays:           { Component: GodRays, layer: 1 },

  // Layer 2: Sacred / Center-stage
  BreathingStealie:  { Component: BreathingStealie, layer: 2 },
  ThirteenPointBolt: { Component: ThirteenPointBolt, layer: 2 },
  StealYourFaceOff:  { Component: StealYourFaceOff, layer: 2 },
  SkullKaleidoscope: { Component: SkullKaleidoscope, layer: 2 },
  SkeletonRoses:     { Component: SkeletonRoses, layer: 2 },
  SacredGeometry:    { Component: SacredGeometry, layer: 2 },
  DarkStarPortal:    { Component: DarkStarPortal, layer: 2 },
  FractalZoom:       { Component: FractalZoom, layer: 2 },
  MandalaGenerator:  { Component: MandalaGenerator, layer: 2 },
  RoseOverlay:       { Component: RoseOverlay, layer: 2 },
  StainedGlass:      { Component: StainedGlass, layer: 2 },
  DreamCatcher:      { Component: DreamCatcher, layer: 2 },
  StealieFade:       { Component: StealieFade, layer: 2 },
  RoseGarden:        { Component: RoseGarden, layer: 2 },
  StealYourFaceKaleidoscope: { Component: StealYourFaceKaleidoscope, layer: 2 },

  // Layer 3: Reactive
  LightningBoltOverlay: { Component: LightningBoltOverlay, layer: 3 },
  ParticleExplosion:   { Component: ParticleExplosion, layer: 3 },
  LaserShow:           { Component: LaserShow, layer: 3 },
  EmberRise:           { Component: EmberRise, layer: 3 },
  WallOfSound:         { Component: WallOfSound, layer: 3 },
  PhilZone:            { Component: PhilZone, layer: 3 },

  // Layer 4: Geometric / Physics
  VoronoiFlow:       { Component: VoronoiFlow, layer: 4 },
  PenroseTiling:     { Component: PenroseTiling, layer: 4 },
  MoirePattern:      { Component: MoirePattern, layer: 4 },
  OpArtPatterns:     { Component: OpArtPatterns, layer: 4 },
  BatikPattern:      { Component: BatikPattern, layer: 4 },
  VortexSpiral:      { Component: VortexSpiral, layer: 4 },
  SpiralArms:        { Component: SpiralArms, layer: 4 },
  SunMandala:        { Component: SunMandala, layer: 4 },
  MoireInterference: { Component: MoireInterference, layer: 4 },
  LissajousCurves:   { Component: LissajousCurves, layer: 4 },

  // Layer 5: Song References + Dead Culture
  SunMoonMotif:      { Component: SunMoonMotif, layer: 5 },
  ChinaCatSunflower: { Component: ChinaCatSunflower, layer: 5 },
  SugarMagnolia:     { Component: SugarMagnolia, layer: 5 },
  BoxOfRain:         { Component: BoxOfRain, layer: 5 },

  // Layer 6: Character / Dead Culture
  BearParade:        { Component: BearParade, layer: 6 },
  SkeletonBand:      { Component: SkeletonBand, layer: 6 },
  MarchingTerrapins: { Component: MarchingTerrapins, layer: 6 },
  Bertha:            { Component: Bertha, layer: 6 },
  JerryGuitar:       { Component: JerryGuitar, layer: 6 },
  VWBusParade:       { Component: VWBusParade, layer: 6 },
  CosmicCharlie:     { Component: CosmicCharlie, layer: 6 },
  JerrySpotlight:    { Component: JerrySpotlight, layer: 6 },
  BobWeir:           { Component: BobWeir, layer: 6 },
  DrumCircle:        { Component: DrumCircle, layer: 6 },
  DancingTerrapinOverlay: { Component: DancingTerrapinOverlay, layer: 6 },
  SkeletonCouple:    { Component: SkeletonCouple, layer: 6 },
  DeadIcons:         { Component: DeadIcons as React.ComponentType<{ frames: EnhancedFrameData[] }>, layer: 6 },

  // Layer 7: Show Artifacts
  VenueMarquee:      { Component: VenueMarquee, layer: 7 },
  TapeTrader:        { Component: TapeTrader, layer: 7 },
  TourPosterGallery: { Component: TourPosterGallery, layer: 7 },

  // Layer 9: Music Visualization HUD
  VUMeters:              { Component: VUMeters, layer: 9 },
  Oscilloscope:          { Component: Oscilloscope, layer: 9 },
  SpectrumAnalyzer:      { Component: SpectrumAnalyzer, layer: 9 },
  PianoRoll:             { Component: PianoRoll, layer: 9 },
  Seismograph:           { Component: Seismograph, layer: 9 },
  Oscillator:            { Component: Oscillator, layer: 9 },
  RadialSpectrum:        { Component: RadialSpectrum, layer: 9 },
  BeatGrid:              { Component: BeatGrid, layer: 9 },
  StemSeparation:        { Component: StemSeparation, layer: 9 },
  WaterfallSpectrogram:  { Component: WaterfallSpectrogram, layer: 9 },

  // Remaining Library
  Abacus:                  { Component: Abacus, layer: 9 },
  AlchemySymbols:          { Component: AlchemySymbols, layer: 2 },
  Altimeter:               { Component: Altimeter, layer: 9 },
  AmericanBeauty:          { Component: AmericanBeauty, layer: 1 },
  Amplifier:               { Component: Amplifier, layer: 9 },
  Anemone:                 { Component: Anemone, layer: 5 },
  Anvil:                   { Component: Anvil, layer: 3 },
  Aqueduct:                { Component: Aqueduct, layer: 4 },
  ArtDeco:                 { Component: ArtDeco, layer: 4 },
  ArtNouveau:              { Component: ArtNouveau, layer: 4 },
  AsciiRain:               { Component: AsciiRain, layer: 1 },
  AstrolabeOverlay:        { Component: AstrolabeOverlay, layer: 9 },
  AuroraBorealis:          { Component: AuroraBorealis, layer: 1 },
  AztecCalendar:           { Component: AztecCalendar, layer: 2 },
  BambooForest:            { Component: BambooForest, layer: 5 },
  BicycleWheels:           { Component: BicycleWheels, layer: 4 },
  BinaryStream:            { Component: BinaryStream, layer: 1 },
  BirdMigration:           { Component: BirdMigration, layer: 5 },
  BlackHole:               { Component: BlackHole, layer: 1 },
  BookPages:               { Component: BookPages, layer: 7 },
  BootlegLabel:            { Component: BootlegLabel, layer: 7 },
  BubbleChamber:           { Component: BubbleChamber, layer: 1 },
  BubbleRise:              { Component: BubbleRise, layer: 1 },
  BumperStickers:          { Component: BumperStickers, layer: 7 },
  ButterflySwarm:          { Component: ButterflySwarm, layer: 5 },
  CactusGarden:            { Component: CactusGarden, layer: 5 },
  CampfireSparks:          { Component: CampfireSparks, layer: 3 },
  CandleFlicker:           { Component: CandleFlicker, layer: 1 },
  CarouselHorses:          { Component: CarouselHorses, layer: 6 },
  CassetteReels:           { Component: CassetteReels, layer: 7 },
  Caterpillar:             { Component: Caterpillar, layer: 5 },
  Cathedral:               { Component: Cathedral, layer: 4 },
  Caustics:                { Component: Caustics, layer: 1 },
  CavePaintings:           { Component: CavePaintings, layer: 5 },
  CelticKnot:              { Component: CelticKnot, layer: 2 },
  ChakraStack:             { Component: ChakraStack, layer: 2 },
  ChalkBoard:              { Component: ChalkBoard, layer: 7 },
  Chameleon:               { Component: Chameleon, layer: 5 },
  CherryBlossom:           { Component: CherryBlossom, layer: 5 },
  ChessPieces:             { Component: ChessPieces, layer: 4 },
  Chronograph:             { Component: Chronograph, layer: 9 },
  CircuitBoard:            { Component: CircuitBoard, layer: 4 },
  CitySkyline:             { Component: CitySkyline, layer: 4 },
  Clockwork:               { Component: Clockwork, layer: 9 },
  CoffeeSwirl:             { Component: CoffeeSwirl, layer: 1 },
  Colosseum:               { Component: Colosseum, layer: 4 },
  CometTail:               { Component: CometTail, layer: 1 },
  ComicExplosions:         { Component: ComicExplosions, layer: 3 },
  Compass:                 { Component: Compass, layer: 9 },
  CompassNeedle:           { Component: CompassNeedle, layer: 9 },
  CompassRose:             { Component: CompassRose, layer: 9 },
  Confetti:                { Component: Confetti, layer: 3 },
  ConfettiCannon:          { Component: ConfettiCannon, layer: 3 },
  Constellation:           { Component: Constellation, layer: 1 },
  ConveyorBelt:            { Component: ConveyorBelt, layer: 4 },
  CoralReef:               { Component: CoralReef, layer: 5 },
  Crane:                   { Component: Crane, layer: 5 },
  CrowdSilhouette:         { Component: CrowdSilhouette, layer: 6 },
  CrystalFormation:        { Component: CrystalFormation, layer: 2 },
  CrystalGrowth:           { Component: CrystalGrowth, layer: 2 },
  CuckooClockOverlay:      { Component: CuckooClockOverlay, layer: 1 },
  DNAHelix:                { Component: DNAHelix, layer: 4 },
  DesertMirage:            { Component: DesertMirage, layer: 10 },
  Dewdrops:                { Component: Dewdrops, layer: 1 },
  Diatoms:                 { Component: Diatoms, layer: 5 },
  DiceRoll:                { Component: DiceRoll, layer: 4 },
  DoublePendulum:          { Component: DoublePendulum, layer: 4 },
  DragonBreath:            { Component: DragonBreath, layer: 3 },
  Dragonfly:               { Component: Dragonfly, layer: 5 },
  DrumCircles:             { Component: DrumCircles, layer: 6 },
  EclipseCorona:           { Component: EclipseCorona, layer: 1 },
  EnergyEffects:           { Component: EnergyEffects, layer: 3 },
  EuropeTour:              { Component: EuropeTour, layer: 7 },
  FernUnfurl:              { Component: FernUnfurl, layer: 5 },
  FerrisWheel:             { Component: FerrisWheel, layer: 4 },
  FestivalTent:            { Component: FestivalTent, layer: 1 },
  FibonacciSpiral:         { Component: FibonacciSpiral, layer: 2 },
  FilmBurn:                { Component: FilmBurn, layer: 10 },
  FilmStrip:               { Component: FilmStrip, layer: 10 },
  FlightInstruments:       { Component: FlightInstruments, layer: 9 },
  Flock:                   { Component: Flock, layer: 5 },
  FogLaser:                { Component: FogLaser, layer: 1 },
  FogMachine:              { Component: FogMachine, layer: 1 },
  FrostCrystals:           { Component: FrostCrystals, layer: 1 },
  GalaxyArm:               { Component: GalaxyArm, layer: 1 },
  GameOfLife:              { Component: GameOfLife, layer: 4 },
  GarciaQuotes:            { Component: GarciaQuotes, layer: 7 },
  GearWorks:               { Component: GearWorks, layer: 4 },
  GeyserEruption:          { Component: GeyserEruption, layer: 3 },
  GothicArch:              { Component: GothicArch, layer: 4 },
  GraffitiTag:             { Component: GraffitiTag, layer: 10 },
  Gyroscope:               { Component: Gyroscope, layer: 4 },
  HeartbeatEKG:            { Component: HeartbeatEKG, layer: 9 },
  HeatShimmer:             { Component: HeatShimmer, layer: 10 },
  Hieroglyphs:             { Component: Hieroglyphs, layer: 2 },
  HighwaySign:             { Component: HighwaySign, layer: 7 },
  HilbertCurve:            { Component: HilbertCurve, layer: 4 },
  HologramGlitch:          { Component: HologramGlitch, layer: 10 },
  HolographicDisc:         { Component: HolographicDisc, layer: 1 },
  HoneycombGrid:           { Component: HoneycombGrid, layer: 4 },
  HookahSmoke:             { Component: HookahSmoke, layer: 1 },
  HotAirBalloons:          { Component: HotAirBalloons, layer: 1 },
  Hourglass:               { Component: Hourglass, layer: 1 },
  Hydraulic:               { Component: Hydraulic, layer: 4 },
  IcebergFloat:            { Component: IcebergFloat, layer: 1 },
  Ikat:                    { Component: Ikat, layer: 2 },
  InkDrop:                 { Component: InkDrop, layer: 1 },
  Jellyfish:               { Component: Jellyfish, layer: 5 },
  JellyfishSwarm:          { Component: JellyfishSwarm, layer: 5 },
  KaleidoscopeFilter:      { Component: KaleidoscopeFilter, layer: 2 },
  KoiPond:                 { Component: KoiPond, layer: 5 },
  Ladybug:                 { Component: Ladybug, layer: 5 },
  Lanterns:                { Component: Lanterns, layer: 1 },
  LavaFlow:                { Component: LavaFlow, layer: 3 },
  LensFlare:               { Component: LensFlare, layer: 10 },
  Lighthouse:              { Component: Lighthouse, layer: 4 },
  LiquidMetal:             { Component: LiquidMetal, layer: 3 },
  LoadingBars:             { Component: LoadingBars, layer: 9 },
  LorenzAttractor:         { Component: LorenzAttractor, layer: 4 },
  LotScene:                { Component: LotScene, layer: 6 },
  LotusOpen:               { Component: LotusOpen, layer: 5 },
  LyricFlash:              { Component: LyricFlash, layer: 7 },
  Macrame:                 { Component: Macrame, layer: 2 },
  MantraScroll:            { Component: MantraScroll, layer: 7 },
  MarqueeLights:           { Component: MarqueeLights, layer: 7 },
  MatrixRain:              { Component: MatrixRain, layer: 1 },
  MemphisDesign:           { Component: MemphisDesign, layer: 4 },
  MengerSponge:            { Component: MengerSponge, layer: 4 },
  MeteorShower:            { Component: MeteorShower, layer: 1 },
  Metronome:               { Component: Metronome, layer: 9 },
  MolecularBonds:          { Component: MolecularBonds, layer: 4 },
  MoonPhases:              { Component: MoonPhases, layer: 1 },
  MoshPit:                 { Component: MoshPit, layer: 6 },
  MotelSign:               { Component: MotelSign, layer: 7 },
  Moth:                    { Component: Moth, layer: 5 },
  MountainRange:           { Component: MountainRange, layer: 5 },
  MushroomBloom:           { Component: MushroomBloom, layer: 5 },
  MushroomForest:          { Component: MushroomForest, layer: 5 },
  NebulaCloud:             { Component: NebulaCloud, layer: 1 },
  NeonCarousel:            { Component: NeonCarousel, layer: 1 },
  NeonSign:                { Component: NeonSign, layer: 1 },
  NeuralNetwork:           { Component: NeuralNetwork, layer: 4 },
  NewtonsCradle:           { Component: NewtonsCradle, layer: 4 },
  NixieTubes:              { Component: NixieTubes, layer: 9 },
  NorthernLights:          { Component: NorthernLights, layer: 1 },
  Obelisk:                 { Component: Obelisk, layer: 4 },
  OceanWaves:              { Component: OceanWaves, layer: 1 },
  Octopus:                 { Component: Octopus, layer: 5 },
  OilSlick:                { Component: OilSlick, layer: 1 },
  Orrery:                  { Component: Orrery, layer: 1 },
  Pagoda:                  { Component: Pagoda, layer: 4 },
  Paisley:                 { Component: Paisley, layer: 4 },
  PaperAirplanes:          { Component: PaperAirplanes, layer: 1 },
  PaperCranes:             { Component: PaperCranes, layer: 5 },
  PeaceSignShower:         { Component: PeaceSignShower, layer: 2 },
  Peacock:                 { Component: Peacock, layer: 5 },
  PendulumWave:            { Component: PendulumWave, layer: 4 },
  PhoenixWings:            { Component: PhoenixWings, layer: 5 },
  PinballMachine:          { Component: PinballMachine, layer: 3 },
  Pinwheel:                { Component: Pinwheel, layer: 4 },
  Piston:                  { Component: Piston, layer: 4 },
  PixelExplosion:          { Component: PixelExplosion, layer: 3 },
  PlanetaryRings:          { Component: PlanetaryRings, layer: 1 },
  PlasmaBall:              { Component: PlasmaBall, layer: 3 },
  PocketWatch:             { Component: PocketWatch, layer: 9 },
  Pointillism:             { Component: Pointillism, layer: 4 },
  PolaroidDevelop:         { Component: PolaroidDevelop, layer: 7 },
  PollenDrift:             { Component: PollenDrift, layer: 1 },
  Porthole:                { Component: Porthole, layer: 1 },
  PostcardStack:           { Component: PostcardStack, layer: 7 },
  PrayerFlags:             { Component: PrayerFlags, layer: 2 },
  PrismRainbow:            { Component: PrismRainbow, layer: 1 },
  PsychedelicBorder:       { Component: PsychedelicBorder, layer: 10 },
  Pulsar:                  { Component: Pulsar, layer: 1 },
  PyramidBeams:            { Component: PyramidBeams, layer: 1 },
  Pyrotechnics:            { Component: Pyrotechnics, layer: 3 },
  Radar:                   { Component: Radar, layer: 9 },
  RainOnGlass:             { Component: RainOnGlass, layer: 1 },
  RainbowArc:              { Component: RainbowArc, layer: 1 },
  Rainsplash:              { Component: Rainsplash, layer: 1 },
  RansomNote:              { Component: RansomNote, layer: 7 },
  ReactionDiffusion:       { Component: ReactionDiffusion, layer: 1 },
  RetroTV:                 { Component: RetroTV, layer: 7 },
  RippleLotus:             { Component: RippleLotus, layer: 1 },
  RipplePool:              { Component: RipplePool, layer: 1 },
  RomanColumns:            { Component: RomanColumns, layer: 4 },
  RuneCircle:              { Component: RuneCircle, layer: 2 },
  SailingShips:            { Component: SailingShips, layer: 1 },
  SandTimer:               { Component: SandTimer, layer: 1 },
  Sandstorm:               { Component: Sandstorm, layer: 1 },
  SaxophoneKeys:           { Component: SaxophoneKeys, layer: 1 },
  Scorpion:                { Component: Scorpion, layer: 5 },
  Screensaver:             { Component: Screensaver, layer: 7 },
  SeaTurtles:              { Component: SeaTurtles, layer: 5 },
  Seahorses:               { Component: Seahorses, layer: 6 },
  SeaweedForest:           { Component: SeaweedForest, layer: 5 },
  Sextant:                 { Component: Sextant, layer: 9 },
  ShadowPuppets:           { Component: ShadowPuppets, layer: 6 },
  SheetMusic:              { Component: SheetMusic, layer: 9 },
  ShootingStar:            { Component: ShootingStar, layer: 1 },
  SkullRosesOverlay:       { Component: SkullRosesOverlay, layer: 1 },
  Slinky:                  { Component: Slinky, layer: 4 },
  SmokeWisps:              { Component: SmokeWisps, layer: 1 },
  Snowfall:                { Component: Snowfall, layer: 1 },
  SoapBubbles:             { Component: SoapBubbles, layer: 1 },
  SolarEclipse:            { Component: SolarEclipse, layer: 1 },
  SolarFlare:              { Component: SolarFlare, layer: 1 },
  SongReactiveEffects:     { Component: SongReactiveEffects, layer: 3 },
  SpaceDrums:              { Component: SpaceDrums, layer: 2 },
  SpiderWeb:               { Component: SpiderWeb, layer: 5 },
  SpinningTop:             { Component: SpinningTop, layer: 4 },
  SpiritWisps:             { Component: SpiritWisps, layer: 1 },
  Spirograph:              { Component: Spirograph, layer: 4 },
  SpotlightFollow:         { Component: SpotlightFollow, layer: 3 },
  StageDive:               { Component: StageDive, layer: 6 },
  StageLights:             { Component: StageLights, layer: 3 },
  StalactiteCave:          { Component: StalactiteCave, layer: 1 },
  StampCollection:         { Component: StampCollection, layer: 7 },
  SteamTrain:              { Component: SteamTrain, layer: 4 },
  SteamValve:              { Component: SteamValve, layer: 4 },
  Streamers:               { Component: Streamers, layer: 1 },
  Sundial:                 { Component: Sundial, layer: 9 },
  Supernova:               { Component: Supernova, layer: 3 },
  SynthPatch:              { Component: SynthPatch, layer: 9 },
  Tambourine:              { Component: Tambourine, layer: 3 },
  TapestryWeave:           { Component: TapestryWeave, layer: 2 },
  TarotReveal:             { Component: TarotReveal, layer: 2 },
  TelescopeView:           { Component: TelescopeView, layer: 1 },
  TerminalPrompt:          { Component: TerminalPrompt, layer: 7 },
  TeslaCoil:               { Component: TeslaCoil, layer: 3 },
  ThirdEye:                { Component: ThirdEye, layer: 2 },
  Thunderhead:             { Component: Thunderhead, layer: 1 },
  TicketStubAnimated:      { Component: TicketStubAnimated, layer: 7 },
  TidePool:                { Component: TidePool, layer: 1 },
  Topography:              { Component: Topography, layer: 5 },
  Totem:                   { Component: Totem, layer: 2 },
  TouchOfGrey:             { Component: TouchOfGrey, layer: 6 },
  TrailMap:                { Component: TrailMap, layer: 7 },
  Transistor:              { Component: Transistor, layer: 1 },
  TreeOfLife:              { Component: TreeOfLife, layer: 5 },
  TreeSilhouette:          { Component: TreeSilhouette, layer: 5 },
  Tumbleweed:              { Component: Tumbleweed, layer: 1 },
  TunnelVision:            { Component: TunnelVision, layer: 10 },
  Turbine:                 { Component: Turbine, layer: 4 },
  Turntable:               { Component: Turntable, layer: 7 },
  TypewriterKeys:          { Component: TypewriterKeys, layer: 7 },
  UFOBeam:                 { Component: UFOBeam, layer: 1 },
  UncleSam:                { Component: UncleSam, layer: 6 },
  VacuumTube:              { Component: VacuumTube, layer: 1 },
  VaporTrails:             { Component: VaporTrails, layer: 1 },
  VintageMap:              { Component: VintageMap, layer: 7 },
  VinylGrooves:            { Component: VinylGrooves, layer: 7 },
  VolcanoFlow:             { Component: VolcanoFlow, layer: 3 },
  WarholGrid:              { Component: WarholGrid, layer: 4 },
  WarpDrive:               { Component: WarpDrive, layer: 1 },
  WaterClock:              { Component: WaterClock, layer: 1 },
  WaterfallMist:           { Component: WaterfallMist, layer: 1 },
  WeatherVane:             { Component: WeatherVane, layer: 1 },
  WeldingSparks:           { Component: WeldingSparks, layer: 3 },
  Whirlpool:               { Component: Whirlpool, layer: 1 },
  WindChimes:              { Component: WindChimes, layer: 1 },
  Windmill:                { Component: Windmill, layer: 1 },
  WireframeDodecahedron:   { Component: WireframeDodecahedron, layer: 4 },
  WormholeTransit:         { Component: WormholeTransit, layer: 1 },
  YoYo:                    { Component: YoYo, layer: 4 },
  ZenRipples:              { Component: ZenRipples, layer: 1 },
  Zeppelin:                { Component: Zeppelin, layer: 1 },
  ZodiacWheel:             { Component: ZodiacWheel, layer: 2 },

  // Layer 10: Distortion
  VHSGlitch:           { Component: VHSGlitch, layer: 10 },

  // Phase 9 Wave 3: New Overlays
  RainDrops:           { Component: RainDrops, layer: 1 },
  FogBank:             { Component: FogBank, layer: 1 },
  TidalPool:           { Component: TidalPool, layer: 5 },
  VineGrowth:          { Component: VineGrowth, layer: 5 },
  PhilLesh:            { Component: PhilLesh, layer: 6 },
  DrummersDuo:         { Component: DrummersDuo, layer: 6 },
  BassWaveform:        { Component: BassWaveform, layer: 3 },
  TicketStub:          { Component: TicketStub as React.ComponentType<{ frames: EnhancedFrameData[] }>, layer: 7 },

  // Dead Culture Iconography
  SkullRoses:          { Component: SkullRoses, layer: 2 },
  EgyptianEye:         { Component: EgyptianEye, layer: 2 },
  TerrapinStation:     { Component: TerrapinStation, layer: 6 },
  SunflowerStealie:    { Component: SunflowerStealie, layer: 2 },
  CosmicEagle:         { Component: CosmicEagle, layer: 5 },
  WaveOfLight:         { Component: WaveOfLight, layer: 3 },
};
