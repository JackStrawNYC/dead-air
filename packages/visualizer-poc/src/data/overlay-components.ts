/**
 * Overlay Component Map — maps overlay names to their React components + layer.
 * This file centralizes all overlay imports so SongVisualizer can render dynamically.
 *
 * Components with special props (SongTitle, ConcertInfo, SetlistScroll, FilmGrain)
 * are NOT included here — they remain hardcoded in SongVisualizer.tsx.
 */
import React from "react";
import type { EnhancedFrameData } from "./types";

// ─── Layer 1: Atmospheric ───
import { CosmicStarfield } from "../components/CosmicStarfield";
import { TieDyeWash } from "../components/TieDyeWash";
import { LavaLamp } from "../components/LavaLamp";
import { SmokeWisps } from "../components/SmokeWisps";
import { AuroraBorealis } from "../components/AuroraBorealis";
import { Fireflies } from "../components/Fireflies";
import { OilSlick } from "../components/OilSlick";
import { OceanWaves } from "../components/OceanWaves";
import { PollenDrift } from "../components/PollenDrift";
import { NebulaCloud } from "../components/NebulaCloud";
import { Snowfall } from "../components/Snowfall";
import { Sandstorm } from "../components/Sandstorm";
import { Pointillism } from "../components/Pointillism";
import { CampfireSparks } from "../components/CampfireSparks";
import { CandleFlicker } from "../components/CandleFlicker";
import { GodRays } from "../components/GodRays";
import { Caustics } from "../components/Caustics";
import { WaterfallMist } from "../components/WaterfallMist";
import { HookahSmoke } from "../components/HookahSmoke";
import { FogMachine } from "../components/FogMachine";
import { VaporTrails } from "../components/VaporTrails";
import { DragonBreath } from "../components/DragonBreath";
import { SpiritWisps } from "../components/SpiritWisps";
import { ZenRipples } from "../components/ZenRipples";
import { TreeSilhouette } from "../components/TreeSilhouette";
import { MountainRange } from "../components/MountainRange";
import { CitySkyline } from "../components/CitySkyline";
import { RainbowArc } from "../components/RainbowArc";
import { FrostCrystals } from "../components/FrostCrystals";
import { HeatShimmer } from "../components/HeatShimmer";
import { DesertMirage } from "../components/DesertMirage";
import { IcebergFloat } from "../components/IcebergFloat";
import { NorthernLights } from "../components/NorthernLights";
import { Topography } from "../components/Topography";
import { FestivalTent } from "../components/FestivalTent";

// ─── Layer 2: Sacred / Center-stage ───
import { BreathingStealie } from "../components/BreathingStealie";
import { SacredGeometry } from "../components/SacredGeometry";
import { SkullKaleidoscope } from "../components/SkullKaleidoscope";
import { FractalZoom } from "../components/FractalZoom";
import { Spirograph } from "../components/Spirograph";
import { LissajousCurves } from "../components/LissajousCurves";
import { MandalaGenerator } from "../components/MandalaGenerator";
import { ThirdEye } from "../components/ThirdEye";
import { DarkStarPortal } from "../components/DarkStarPortal";
import { StealYourFaceOff } from "../components/StealYourFaceOff";
import { GearWorks } from "../components/GearWorks";
import { Clockwork } from "../components/Clockwork";
import { CompassRose } from "../components/CompassRose";
import { StainedGlass } from "../components/StainedGlass";
import { RuneCircle } from "../components/RuneCircle";
import { CelticKnot } from "../components/CelticKnot";
import { LotusOpen } from "../components/LotusOpen";
import { ZodiacWheel } from "../components/ZodiacWheel";
import { CavePaintings } from "../components/CavePaintings";
import { AztecCalendar } from "../components/AztecCalendar";
import { PyramidBeams } from "../components/PyramidBeams";
import { RomanColumns } from "../components/RomanColumns";
import { Hieroglyphs } from "../components/Hieroglyphs";
import { Hourglass } from "../components/Hourglass";
import { Totem } from "../components/Totem";
import { Abacus } from "../components/Abacus";
import { Lanterns } from "../components/Lanterns";
import { Cathedral } from "../components/Cathedral";
import { Pagoda } from "../components/Pagoda";
import { Colosseum } from "../components/Colosseum";
import { Obelisk } from "../components/Obelisk";
import { GothicArch } from "../components/GothicArch";
import { AstrolabeOverlay } from "../components/AstrolabeOverlay";
import { SunMandala } from "../components/SunMandala";
import { Sundial } from "../components/Sundial";
import { ThirteenPointBolt } from "../components/ThirteenPointBolt";
import { SpaceDrums } from "../components/SpaceDrums";

// ─── Layer 3: Song-reactive ───
import { SongReactiveEffects } from "../components/SongReactiveEffects";
import { EnergyEffects } from "../components/EnergyEffects";
import { WallOfSound } from "../components/WallOfSound";
import { Oscilloscope } from "../components/Oscilloscope";
import { SpectrumAnalyzer } from "../components/SpectrumAnalyzer";
import { GuitarStrings } from "../components/GuitarStrings";
import { DrumCircles } from "../components/DrumCircles";
import { ParticleExplosion } from "../components/ParticleExplosion";
import { RipplePool } from "../components/RipplePool";
import { EmberRise } from "../components/EmberRise";
import { InkDrop } from "../components/InkDrop";
import { PlasmaBall } from "../components/PlasmaBall";
import { LaserShow } from "../components/LaserShow";
import { PianoRoll } from "../components/PianoRoll";
import { VUMeters } from "../components/VUMeters";
import { SheetMusic } from "../components/SheetMusic";
import { Amplifier } from "../components/Amplifier";
import { Seismograph } from "../components/Seismograph";
import { TypewriterKeys } from "../components/TypewriterKeys";
import { Whirlpool } from "../components/Whirlpool";
import { SaxophoneKeys } from "../components/SaxophoneKeys";
import { Tambourine } from "../components/Tambourine";
import { WindChimes } from "../components/WindChimes";
import { Turntable } from "../components/Turntable";
import { PinballMachine } from "../components/PinballMachine";
import { Metronome } from "../components/Metronome";
import { Oscillator } from "../components/Oscillator";
import { SynthPatch } from "../components/SynthPatch";
import { StageLights } from "../components/StageLights";
import { SpotlightFollow } from "../components/SpotlightFollow";
import { FogLaser } from "../components/FogLaser";

// ─── Layer 4: Geometric / Physics ───
import { OpArtPatterns } from "../components/OpArtPatterns";
import { MoireInterference } from "../components/MoireInterference";
import { TunnelVision } from "../components/TunnelVision";
import { VortexSpiral } from "../components/VortexSpiral";
import { WormholeTransit } from "../components/WormholeTransit";
import { WireframeDodecahedron } from "../components/WireframeDodecahedron";
import { KaleidoscopeFilter } from "../components/KaleidoscopeFilter";
import { DoublePendulum } from "../components/DoublePendulum";
import { LorenzAttractor } from "../components/LorenzAttractor";
import { PendulumWave } from "../components/PendulumWave";
import { GameOfLife } from "../components/GameOfLife";
import { ReactionDiffusion } from "../components/ReactionDiffusion";
import { VoronoiFlow } from "../components/VoronoiFlow";
import { FibonacciSpiral } from "../components/FibonacciSpiral";
import { PenroseTiling } from "../components/PenroseTiling";
import { MengerSponge } from "../components/MengerSponge";
import { HilbertCurve } from "../components/HilbertCurve";
import { MoirePattern } from "../components/MoirePattern";
import { MolecularBonds } from "../components/MolecularBonds";
import { BubbleChamber } from "../components/BubbleChamber";
import { CrystalGrowth } from "../components/CrystalGrowth";
import { Diatoms } from "../components/Diatoms";
import { TapestryWeave } from "../components/TapestryWeave";
import { BatikPattern } from "../components/BatikPattern";
import { Paisley } from "../components/Paisley";
import { Ikat } from "../components/Ikat";
import { Macrame } from "../components/Macrame";
import { ArtNouveau } from "../components/ArtNouveau";
import { ArtDeco } from "../components/ArtDeco";
import { MemphisDesign } from "../components/MemphisDesign";
import { NewtonsCradle } from "../components/NewtonsCradle";
import { Gyroscope } from "../components/Gyroscope";
import { YoYo } from "../components/YoYo";
import { Slinky } from "../components/Slinky";
import { SpinningTop } from "../components/SpinningTop";
import { Piston } from "../components/Piston";
import { Turbine } from "../components/Turbine";
import { ConveyorBelt } from "../components/ConveyorBelt";
import { Hydraulic } from "../components/Hydraulic";
import { CircuitBoard } from "../components/CircuitBoard";
import { Transistor } from "../components/Transistor";

// ─── Layer 5: Nature / Cosmic / Space ───
import { SolarFlare } from "../components/SolarFlare";
import { JellyfishSwarm } from "../components/JellyfishSwarm";
import { CrystalFormation } from "../components/CrystalFormation";
import { SugarMagnolia } from "../components/SugarMagnolia";
import { ChinaCatSunflower } from "../components/ChinaCatSunflower";
import { BoxOfRain } from "../components/BoxOfRain";
import { RippleLotus } from "../components/RippleLotus";
import { LighterWave } from "../components/LighterWave";
import { MeteorShower } from "../components/MeteorShower";
import { Constellation } from "../components/Constellation";
import { PlanetaryRings } from "../components/PlanetaryRings";
import { DNAHelix } from "../components/DNAHelix";
import { TreeOfLife } from "../components/TreeOfLife";
import { Thunderhead } from "../components/Thunderhead";
import { Rainsplash } from "../components/Rainsplash";
import { BubbleRise } from "../components/BubbleRise";
import { VineGrowth } from "../components/VineGrowth";
import { FernUnfurl } from "../components/FernUnfurl";
import { MushroomBloom } from "../components/MushroomBloom";
import { ButterflySwarm } from "../components/ButterflySwarm";
import { Jellyfish } from "../components/Jellyfish";
import { Flock } from "../components/Flock";
import { SpiderWeb } from "../components/SpiderWeb";
import { RainOnGlass } from "../components/RainOnGlass";
import { Dewdrops } from "../components/Dewdrops";
import { CherryBlossom } from "../components/CherryBlossom";
import { KoiPond } from "../components/KoiPond";
import { BambooForest } from "../components/BambooForest";
import { PaperCranes } from "../components/PaperCranes";
import { PaperAirplanes } from "../components/PaperAirplanes";
import { BirdMigration } from "../components/BirdMigration";
import { Pinwheel } from "../components/Pinwheel";
import { CoralReef } from "../components/CoralReef";
import { SeaweedForest } from "../components/SeaweedForest";
import { SeaTurtles } from "../components/SeaTurtles";
import { Seahorses } from "../components/Seahorses";
import { Anemone } from "../components/Anemone";
import { SolarEclipse } from "../components/SolarEclipse";
import { CometTail } from "../components/CometTail";
import { TelescopeView } from "../components/TelescopeView";
import { GeyserEruption } from "../components/GeyserEruption";
import { TidePool } from "../components/TidePool";
import { StalactiteCave } from "../components/StalactiteCave";
import { VolcanoFlow } from "../components/VolcanoFlow";
import { LavaFlow } from "../components/LavaFlow";
import { ShadowPuppets } from "../components/ShadowPuppets";
import { UFOBeam } from "../components/UFOBeam";
import { BlackHole } from "../components/BlackHole";
import { WarpDrive } from "../components/WarpDrive";
import { Supernova } from "../components/Supernova";
import { CoffeeSwirl } from "../components/CoffeeSwirl";
import { SoapBubbles } from "../components/SoapBubbles";
import { Tumbleweed } from "../components/Tumbleweed";
import { CactusGarden } from "../components/CactusGarden";
import { Dragonfly } from "../components/Dragonfly";
import { Caterpillar } from "../components/Caterpillar";
import { Ladybug } from "../components/Ladybug";
import { Scorpion } from "../components/Scorpion";
import { Chameleon } from "../components/Chameleon";
import { Octopus } from "../components/Octopus";
import { Peacock } from "../components/Peacock";
import { Moth } from "../components/Moth";
import { MoonPhases } from "../components/MoonPhases";
import { ShootingStar } from "../components/ShootingStar";
import { EclipseCorona } from "../components/EclipseCorona";
import { GalaxyArm } from "../components/GalaxyArm";
import { Pulsar } from "../components/Pulsar";
import { Orrery } from "../components/Orrery";

// ─── Layer 6: Character parades / Dead album art ───
import { SkeletonBand } from "../components/SkeletonBand";
import { DeadIcons } from "../components/DeadIcons";
import { BearParade } from "../components/BearParade";
import { MushroomForest } from "../components/MushroomForest";
import { MarchingTerrapins } from "../components/MarchingTerrapins";
import { CosmicCharlie } from "../components/CosmicCharlie";
import { SkeletonCouple } from "../components/SkeletonCouple";
import { UncleSam } from "../components/UncleSam";
import { LotScene } from "../components/LotScene";
import { CrowdSilhouette } from "../components/CrowdSilhouette";
import { Bertha } from "../components/Bertha";
import { AmericanBeauty } from "../components/AmericanBeauty";
import { TouchOfGrey } from "../components/TouchOfGrey";
import { EuropeTour } from "../components/EuropeTour";
import { PhoenixWings } from "../components/PhoenixWings";
import { AlchemySymbols } from "../components/AlchemySymbols";
import { TarotReveal } from "../components/TarotReveal";
import { HotAirBalloons } from "../components/HotAirBalloons";
import { SteamTrain } from "../components/SteamTrain";
import { SailingShips } from "../components/SailingShips";
import { BicycleWheels } from "../components/BicycleWheels";
import { Zeppelin } from "../components/Zeppelin";
import { CarouselHorses } from "../components/CarouselHorses";
import { FerrisWheel } from "../components/FerrisWheel";
import { DreamCatcher } from "../components/DreamCatcher";
import { PrayerFlags } from "../components/PrayerFlags";
import { Lighthouse } from "../components/Lighthouse";
import { Windmill } from "../components/Windmill";
import { Aqueduct } from "../components/Aqueduct";
import { Crane } from "../components/Crane";
import { MoshPit } from "../components/MoshPit";
import { StageDive } from "../components/StageDive";
import { JerryGuitar } from "../components/JerryGuitar";
import { VWBusParade } from "../components/VWBusParade";
import { SkeletonRoses } from "../components/SkeletonRoses";

// ─── Layer 7: Frame & info (standard-prop overlays only) ───
import { PsychedelicBorder } from "../components/PsychedelicBorder";
import { BumperStickers } from "../components/BumperStickers";
import { BootlegLabel } from "../components/BootlegLabel";
import { TourPosterGallery } from "../components/TourPosterGallery";
import { TicketStubAnimated } from "../components/TicketStubAnimated";
import { ChakraStack } from "../components/ChakraStack";
import { PeaceSignShower } from "../components/PeaceSignShower";
import { WarholGrid } from "../components/WarholGrid";
import { ComicExplosions } from "../components/ComicExplosions";
import { Radar } from "../components/Radar";
import { PolaroidDevelop } from "../components/PolaroidDevelop";
import { LensFlare } from "../components/LensFlare";
import { PrismRainbow } from "../components/PrismRainbow";
import { NeonSign } from "../components/NeonSign";
import { GraffitiTag } from "../components/GraffitiTag";
import { ChalkBoard } from "../components/ChalkBoard";
import { Confetti } from "../components/Confetti";
import { ConfettiCannon } from "../components/ConfettiCannon";
import { Streamers } from "../components/Streamers";
import { NeonCarousel } from "../components/NeonCarousel";
import { PostcardStack } from "../components/PostcardStack";
import { StampCollection } from "../components/StampCollection";
import { VintageMap } from "../components/VintageMap";
import { CompassNeedle } from "../components/CompassNeedle";
import { MarqueeLights } from "../components/MarqueeLights";
import { DiceRoll } from "../components/DiceRoll";
import { ChessPieces } from "../components/ChessPieces";
import { MotelSign } from "../components/MotelSign";
import { HighwaySign } from "../components/HighwaySign";
import { HoneycombGrid } from "../components/HoneycombGrid";
import { Compass } from "../components/Compass";
import { Altimeter } from "../components/Altimeter";
import { FlightInstruments } from "../components/FlightInstruments";
import { TrailMap } from "../components/TrailMap";
import { WeatherVane } from "../components/WeatherVane";
import { Sextant } from "../components/Sextant";
import { Porthole } from "../components/Porthole";
import { CuckooClockOverlay } from "../components/CuckooClockOverlay";
import { SandTimer } from "../components/SandTimer";
import { Chronograph } from "../components/Chronograph";
import { PocketWatch } from "../components/PocketWatch";
import { WaterClock } from "../components/WaterClock";
import { Pyrotechnics } from "../components/Pyrotechnics";
import { GlowSticks } from "../components/GlowSticks";
import { SteamValve } from "../components/SteamValve";
import { Anvil } from "../components/Anvil";
import { WeldingSparks } from "../components/WeldingSparks";

// ─── Layer 8: Typography ───
import { LyricFlash } from "../components/LyricFlash";
import { GarciaQuotes } from "../components/GarciaQuotes";
import { MantraScroll } from "../components/MantraScroll";
import { AsciiRain } from "../components/AsciiRain";
import { RansomNote } from "../components/RansomNote";
import { BookPages } from "../components/BookPages";
import { BinaryStream } from "../components/BinaryStream";

// ─── Layer 9: HUD ───
import { CassetteReels } from "../components/CassetteReels";
import { NixieTubes } from "../components/NixieTubes";
import { HeartbeatEKG } from "../components/HeartbeatEKG";
import { NeuralNetwork } from "../components/NeuralNetwork";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { LoadingBars } from "../components/LoadingBars";
import { SpiralArms } from "../components/SpiralArms";
import { VacuumTube } from "../components/VacuumTube";
import { TeslaCoil } from "../components/TeslaCoil";
import { HolographicDisc } from "../components/HolographicDisc";

// ─── Layer 10: Distortion ───
import { LiquidMetal } from "../components/LiquidMetal";
import { ChromaticAberration } from "../components/ChromaticAberration";
import { ChromaticSplit } from "../components/ChromaticSplit";
import { HologramGlitch } from "../components/HologramGlitch";
import { VHSGlitch } from "../components/VHSGlitch";
import { FilmBurn } from "../components/FilmBurn";
import { RetroTV } from "../components/RetroTV";
import { VinylGrooves } from "../components/VinylGrooves";
import { FilmStrip } from "../components/FilmStrip";
import { PixelExplosion } from "../components/PixelExplosion";
import { Screensaver } from "../components/Screensaver";
import { MatrixRain } from "../components/MatrixRain";

/**
 * Standard overlay component: takes only { frames: EnhancedFrameData[] }
 * Components with custom props (SongTitle, ConcertInfo, SetlistScroll, FilmGrain)
 * are handled separately in SongVisualizer.tsx.
 */
export interface OverlayComponentEntry {
  Component: React.ComponentType<{ frames: EnhancedFrameData[] }>;
  layer: number;
}

export const OVERLAY_COMPONENTS: Record<string, OverlayComponentEntry> = {
  // Layer 1: Atmospheric
  CosmicStarfield:   { Component: CosmicStarfield, layer: 1 },
  TieDyeWash:        { Component: TieDyeWash, layer: 1 },
  LavaLamp:          { Component: LavaLamp, layer: 1 },
  SmokeWisps:        { Component: SmokeWisps, layer: 1 },
  AuroraBorealis:    { Component: AuroraBorealis, layer: 1 },
  Fireflies:         { Component: Fireflies, layer: 1 },
  OilSlick:          { Component: OilSlick, layer: 1 },
  OceanWaves:        { Component: OceanWaves, layer: 1 },
  PollenDrift:       { Component: PollenDrift, layer: 1 },
  NebulaCloud:       { Component: NebulaCloud, layer: 1 },
  Snowfall:          { Component: Snowfall, layer: 1 },
  Sandstorm:         { Component: Sandstorm, layer: 1 },
  Pointillism:       { Component: Pointillism, layer: 1 },
  CampfireSparks:    { Component: CampfireSparks, layer: 1 },
  CandleFlicker:     { Component: CandleFlicker, layer: 1 },
  GodRays:           { Component: GodRays, layer: 1 },
  Caustics:          { Component: Caustics, layer: 1 },
  WaterfallMist:     { Component: WaterfallMist, layer: 1 },
  HookahSmoke:       { Component: HookahSmoke, layer: 1 },
  FogMachine:        { Component: FogMachine, layer: 1 },
  VaporTrails:       { Component: VaporTrails, layer: 1 },
  DragonBreath:      { Component: DragonBreath, layer: 1 },
  SpiritWisps:       { Component: SpiritWisps, layer: 1 },
  ZenRipples:        { Component: ZenRipples, layer: 1 },
  TreeSilhouette:    { Component: TreeSilhouette, layer: 1 },
  MountainRange:     { Component: MountainRange, layer: 1 },
  CitySkyline:       { Component: CitySkyline, layer: 1 },
  RainbowArc:        { Component: RainbowArc, layer: 1 },
  FrostCrystals:     { Component: FrostCrystals, layer: 1 },
  HeatShimmer:       { Component: HeatShimmer, layer: 1 },
  DesertMirage:      { Component: DesertMirage, layer: 1 },
  IcebergFloat:      { Component: IcebergFloat, layer: 1 },
  NorthernLights:    { Component: NorthernLights, layer: 1 },
  Topography:        { Component: Topography, layer: 1 },
  FestivalTent:      { Component: FestivalTent, layer: 1 },

  // Layer 2: Sacred / Center-stage
  BreathingStealie:  { Component: BreathingStealie, layer: 2 },
  SacredGeometry:    { Component: SacredGeometry, layer: 2 },
  SkullKaleidoscope: { Component: SkullKaleidoscope, layer: 2 },
  FractalZoom:       { Component: FractalZoom, layer: 2 },
  Spirograph:        { Component: Spirograph, layer: 2 },
  LissajousCurves:   { Component: LissajousCurves, layer: 2 },
  MandalaGenerator:  { Component: MandalaGenerator, layer: 2 },
  ThirdEye:          { Component: ThirdEye, layer: 2 },
  DarkStarPortal:    { Component: DarkStarPortal, layer: 2 },
  StealYourFaceOff:  { Component: StealYourFaceOff, layer: 2 },
  GearWorks:         { Component: GearWorks, layer: 2 },
  Clockwork:         { Component: Clockwork, layer: 2 },
  CompassRose:       { Component: CompassRose, layer: 2 },
  StainedGlass:      { Component: StainedGlass, layer: 2 },
  RuneCircle:        { Component: RuneCircle, layer: 2 },
  CelticKnot:        { Component: CelticKnot, layer: 2 },
  LotusOpen:         { Component: LotusOpen, layer: 2 },
  ZodiacWheel:       { Component: ZodiacWheel, layer: 2 },
  CavePaintings:     { Component: CavePaintings, layer: 2 },
  AztecCalendar:     { Component: AztecCalendar, layer: 2 },
  PyramidBeams:      { Component: PyramidBeams, layer: 2 },
  RomanColumns:      { Component: RomanColumns, layer: 2 },
  Hieroglyphs:       { Component: Hieroglyphs, layer: 2 },
  Hourglass:         { Component: Hourglass, layer: 2 },
  Totem:             { Component: Totem, layer: 2 },
  Abacus:            { Component: Abacus, layer: 2 },
  Lanterns:          { Component: Lanterns, layer: 2 },
  Cathedral:         { Component: Cathedral, layer: 2 },
  Pagoda:            { Component: Pagoda, layer: 2 },
  Colosseum:         { Component: Colosseum, layer: 2 },
  Obelisk:           { Component: Obelisk, layer: 2 },
  GothicArch:        { Component: GothicArch, layer: 2 },
  AstrolabeOverlay:  { Component: AstrolabeOverlay, layer: 2 },
  SunMandala:        { Component: SunMandala, layer: 2 },
  Sundial:           { Component: Sundial, layer: 2 },
  ThirteenPointBolt: { Component: ThirteenPointBolt, layer: 2 },
  SpaceDrums:        { Component: SpaceDrums, layer: 2 },

  // Layer 3: Song-reactive
  SongReactiveEffects: { Component: SongReactiveEffects, layer: 3 },
  EnergyEffects:       { Component: EnergyEffects, layer: 3 },
  WallOfSound:         { Component: WallOfSound, layer: 3 },
  Oscilloscope:        { Component: Oscilloscope, layer: 3 },
  SpectrumAnalyzer:    { Component: SpectrumAnalyzer, layer: 3 },
  GuitarStrings:       { Component: GuitarStrings, layer: 3 },
  DrumCircles:         { Component: DrumCircles, layer: 3 },
  ParticleExplosion:   { Component: ParticleExplosion, layer: 3 },
  RipplePool:          { Component: RipplePool, layer: 3 },
  EmberRise:           { Component: EmberRise, layer: 3 },
  InkDrop:             { Component: InkDrop, layer: 3 },
  PlasmaBall:          { Component: PlasmaBall, layer: 3 },
  LaserShow:           { Component: LaserShow, layer: 3 },
  PianoRoll:           { Component: PianoRoll, layer: 3 },
  VUMeters:            { Component: VUMeters, layer: 3 },
  SheetMusic:          { Component: SheetMusic, layer: 3 },
  Amplifier:           { Component: Amplifier, layer: 3 },
  Seismograph:         { Component: Seismograph, layer: 3 },
  TypewriterKeys:      { Component: TypewriterKeys, layer: 3 },
  Whirlpool:           { Component: Whirlpool, layer: 3 },
  SaxophoneKeys:       { Component: SaxophoneKeys, layer: 3 },
  Tambourine:          { Component: Tambourine, layer: 3 },
  WindChimes:          { Component: WindChimes, layer: 3 },
  Turntable:           { Component: Turntable, layer: 3 },
  PinballMachine:      { Component: PinballMachine, layer: 3 },
  Metronome:           { Component: Metronome, layer: 3 },
  Oscillator:          { Component: Oscillator, layer: 3 },
  SynthPatch:          { Component: SynthPatch, layer: 3 },
  StageLights:         { Component: StageLights, layer: 3 },
  SpotlightFollow:     { Component: SpotlightFollow, layer: 3 },
  FogLaser:            { Component: FogLaser, layer: 3 },

  // Layer 4: Geometric / Physics
  OpArtPatterns:         { Component: OpArtPatterns, layer: 4 },
  MoireInterference:     { Component: MoireInterference, layer: 4 },
  TunnelVision:          { Component: TunnelVision, layer: 4 },
  VortexSpiral:          { Component: VortexSpiral, layer: 4 },
  WormholeTransit:       { Component: WormholeTransit, layer: 4 },
  WireframeDodecahedron: { Component: WireframeDodecahedron, layer: 4 },
  KaleidoscopeFilter:    { Component: KaleidoscopeFilter, layer: 4 },
  DoublePendulum:        { Component: DoublePendulum, layer: 4 },
  LorenzAttractor:       { Component: LorenzAttractor, layer: 4 },
  PendulumWave:          { Component: PendulumWave, layer: 4 },
  GameOfLife:            { Component: GameOfLife, layer: 4 },
  ReactionDiffusion:     { Component: ReactionDiffusion, layer: 4 },
  VoronoiFlow:           { Component: VoronoiFlow, layer: 4 },
  FibonacciSpiral:       { Component: FibonacciSpiral, layer: 4 },
  PenroseTiling:         { Component: PenroseTiling, layer: 4 },
  MengerSponge:          { Component: MengerSponge, layer: 4 },
  HilbertCurve:          { Component: HilbertCurve, layer: 4 },
  MoirePattern:          { Component: MoirePattern, layer: 4 },
  MolecularBonds:        { Component: MolecularBonds, layer: 4 },
  BubbleChamber:         { Component: BubbleChamber, layer: 4 },
  CrystalGrowth:         { Component: CrystalGrowth, layer: 4 },
  Diatoms:               { Component: Diatoms, layer: 4 },
  TapestryWeave:         { Component: TapestryWeave, layer: 4 },
  BatikPattern:          { Component: BatikPattern, layer: 4 },
  Paisley:               { Component: Paisley, layer: 4 },
  Ikat:                  { Component: Ikat, layer: 4 },
  Macrame:               { Component: Macrame, layer: 4 },
  ArtNouveau:            { Component: ArtNouveau, layer: 4 },
  ArtDeco:               { Component: ArtDeco, layer: 4 },
  MemphisDesign:         { Component: MemphisDesign, layer: 4 },
  NewtonsCradle:         { Component: NewtonsCradle, layer: 4 },
  Gyroscope:             { Component: Gyroscope, layer: 4 },
  YoYo:                  { Component: YoYo, layer: 4 },
  Slinky:                { Component: Slinky, layer: 4 },
  SpinningTop:           { Component: SpinningTop, layer: 4 },
  Piston:                { Component: Piston, layer: 4 },
  Turbine:               { Component: Turbine, layer: 4 },
  ConveyorBelt:          { Component: ConveyorBelt, layer: 4 },
  Hydraulic:             { Component: Hydraulic, layer: 4 },
  CircuitBoard:          { Component: CircuitBoard, layer: 4 },
  Transistor:            { Component: Transistor, layer: 4 },

  // Layer 5: Nature / Cosmic / Space
  SolarFlare:        { Component: SolarFlare, layer: 5 },
  JellyfishSwarm:    { Component: JellyfishSwarm, layer: 5 },
  CrystalFormation:  { Component: CrystalFormation, layer: 5 },
  SugarMagnolia:     { Component: SugarMagnolia, layer: 5 },
  ChinaCatSunflower: { Component: ChinaCatSunflower, layer: 5 },
  BoxOfRain:         { Component: BoxOfRain, layer: 5 },
  RippleLotus:       { Component: RippleLotus, layer: 5 },
  LighterWave:       { Component: LighterWave, layer: 5 },
  MeteorShower:      { Component: MeteorShower, layer: 5 },
  Constellation:     { Component: Constellation, layer: 5 },
  PlanetaryRings:    { Component: PlanetaryRings, layer: 5 },
  DNAHelix:          { Component: DNAHelix, layer: 5 },
  TreeOfLife:        { Component: TreeOfLife, layer: 5 },
  Thunderhead:       { Component: Thunderhead, layer: 5 },
  Rainsplash:        { Component: Rainsplash, layer: 5 },
  BubbleRise:        { Component: BubbleRise, layer: 5 },
  VineGrowth:        { Component: VineGrowth, layer: 5 },
  FernUnfurl:        { Component: FernUnfurl, layer: 5 },
  MushroomBloom:     { Component: MushroomBloom, layer: 5 },
  ButterflySwarm:    { Component: ButterflySwarm, layer: 5 },
  Jellyfish:         { Component: Jellyfish, layer: 5 },
  Flock:             { Component: Flock, layer: 5 },
  SpiderWeb:         { Component: SpiderWeb, layer: 5 },
  RainOnGlass:       { Component: RainOnGlass, layer: 5 },
  Dewdrops:          { Component: Dewdrops, layer: 5 },
  CherryBlossom:     { Component: CherryBlossom, layer: 5 },
  KoiPond:           { Component: KoiPond, layer: 5 },
  BambooForest:      { Component: BambooForest, layer: 5 },
  PaperCranes:       { Component: PaperCranes, layer: 5 },
  PaperAirplanes:    { Component: PaperAirplanes, layer: 5 },
  BirdMigration:     { Component: BirdMigration, layer: 5 },
  Pinwheel:          { Component: Pinwheel, layer: 5 },
  CoralReef:         { Component: CoralReef, layer: 5 },
  SeaweedForest:     { Component: SeaweedForest, layer: 5 },
  SeaTurtles:        { Component: SeaTurtles, layer: 5 },
  Seahorses:         { Component: Seahorses, layer: 5 },
  Anemone:           { Component: Anemone, layer: 5 },
  SolarEclipse:      { Component: SolarEclipse, layer: 5 },
  CometTail:         { Component: CometTail, layer: 5 },
  TelescopeView:     { Component: TelescopeView, layer: 5 },
  GeyserEruption:    { Component: GeyserEruption, layer: 5 },
  TidePool:          { Component: TidePool, layer: 5 },
  StalactiteCave:    { Component: StalactiteCave, layer: 5 },
  VolcanoFlow:       { Component: VolcanoFlow, layer: 5 },
  LavaFlow:          { Component: LavaFlow, layer: 5 },
  ShadowPuppets:     { Component: ShadowPuppets, layer: 5 },
  UFOBeam:           { Component: UFOBeam, layer: 5 },
  BlackHole:         { Component: BlackHole, layer: 5 },
  WarpDrive:         { Component: WarpDrive, layer: 5 },
  Supernova:         { Component: Supernova, layer: 5 },
  CoffeeSwirl:       { Component: CoffeeSwirl, layer: 5 },
  SoapBubbles:       { Component: SoapBubbles, layer: 5 },
  Tumbleweed:        { Component: Tumbleweed, layer: 5 },
  CactusGarden:      { Component: CactusGarden, layer: 5 },
  Dragonfly:         { Component: Dragonfly, layer: 5 },
  Caterpillar:       { Component: Caterpillar, layer: 5 },
  Ladybug:           { Component: Ladybug, layer: 5 },
  Scorpion:          { Component: Scorpion, layer: 5 },
  Chameleon:         { Component: Chameleon, layer: 5 },
  Octopus:           { Component: Octopus, layer: 5 },
  Peacock:           { Component: Peacock, layer: 5 },
  Moth:              { Component: Moth, layer: 5 },
  MoonPhases:        { Component: MoonPhases, layer: 5 },
  ShootingStar:      { Component: ShootingStar, layer: 5 },
  EclipseCorona:     { Component: EclipseCorona, layer: 5 },
  GalaxyArm:         { Component: GalaxyArm, layer: 5 },
  Pulsar:            { Component: Pulsar, layer: 5 },
  Orrery:            { Component: Orrery, layer: 5 },

  // Layer 6: Character parades / Dead album art
  SkeletonBand:      { Component: SkeletonBand, layer: 6 },
  DeadIcons:         { Component: DeadIcons, layer: 6 },
  BearParade:        { Component: BearParade, layer: 6 },
  MushroomForest:    { Component: MushroomForest, layer: 6 },
  MarchingTerrapins: { Component: MarchingTerrapins, layer: 6 },
  CosmicCharlie:     { Component: CosmicCharlie, layer: 6 },
  SkeletonCouple:    { Component: SkeletonCouple, layer: 6 },
  UncleSam:          { Component: UncleSam, layer: 6 },
  LotScene:          { Component: LotScene, layer: 6 },
  CrowdSilhouette:   { Component: CrowdSilhouette, layer: 6 },
  Bertha:            { Component: Bertha, layer: 6 },
  AmericanBeauty:    { Component: AmericanBeauty, layer: 6 },
  TouchOfGrey:       { Component: TouchOfGrey, layer: 6 },
  EuropeTour:        { Component: EuropeTour, layer: 6 },
  PhoenixWings:      { Component: PhoenixWings, layer: 6 },
  AlchemySymbols:    { Component: AlchemySymbols, layer: 6 },
  TarotReveal:       { Component: TarotReveal, layer: 6 },
  HotAirBalloons:    { Component: HotAirBalloons, layer: 6 },
  SteamTrain:        { Component: SteamTrain, layer: 6 },
  SailingShips:      { Component: SailingShips, layer: 6 },
  BicycleWheels:     { Component: BicycleWheels, layer: 6 },
  Zeppelin:          { Component: Zeppelin, layer: 6 },
  CarouselHorses:    { Component: CarouselHorses, layer: 6 },
  FerrisWheel:       { Component: FerrisWheel, layer: 6 },
  DreamCatcher:      { Component: DreamCatcher, layer: 6 },
  PrayerFlags:       { Component: PrayerFlags, layer: 6 },
  Lighthouse:        { Component: Lighthouse, layer: 6 },
  Windmill:          { Component: Windmill, layer: 6 },
  Aqueduct:          { Component: Aqueduct, layer: 6 },
  Crane:             { Component: Crane, layer: 6 },
  MoshPit:           { Component: MoshPit, layer: 6 },
  StageDive:         { Component: StageDive, layer: 6 },
  JerryGuitar:       { Component: JerryGuitar, layer: 6 },
  VWBusParade:       { Component: VWBusParade, layer: 6 },
  SkeletonRoses:     { Component: SkeletonRoses, layer: 2 },

  // Layer 7: Frame & info (standard-prop only; SongTitle/ConcertInfo/SetlistScroll/FilmGrain excluded)
  PsychedelicBorder:  { Component: PsychedelicBorder, layer: 7 },
  BumperStickers:     { Component: BumperStickers, layer: 7 },
  BootlegLabel:       { Component: BootlegLabel, layer: 7 },
  TourPosterGallery:  { Component: TourPosterGallery, layer: 7 },
  TicketStubAnimated: { Component: TicketStubAnimated, layer: 7 },
  ChakraStack:        { Component: ChakraStack, layer: 7 },
  PeaceSignShower:    { Component: PeaceSignShower, layer: 7 },
  WarholGrid:         { Component: WarholGrid, layer: 7 },
  ComicExplosions:    { Component: ComicExplosions, layer: 7 },
  Radar:              { Component: Radar, layer: 7 },
  PolaroidDevelop:    { Component: PolaroidDevelop, layer: 7 },
  LensFlare:          { Component: LensFlare, layer: 7 },
  PrismRainbow:       { Component: PrismRainbow, layer: 7 },
  NeonSign:           { Component: NeonSign, layer: 7 },
  GraffitiTag:        { Component: GraffitiTag, layer: 7 },
  ChalkBoard:         { Component: ChalkBoard, layer: 7 },
  Confetti:           { Component: Confetti, layer: 7 },
  ConfettiCannon:     { Component: ConfettiCannon, layer: 7 },
  Streamers:          { Component: Streamers, layer: 7 },
  NeonCarousel:       { Component: NeonCarousel, layer: 7 },
  PostcardStack:      { Component: PostcardStack, layer: 7 },
  StampCollection:    { Component: StampCollection, layer: 7 },
  VintageMap:         { Component: VintageMap, layer: 7 },
  CompassNeedle:      { Component: CompassNeedle, layer: 7 },
  MarqueeLights:      { Component: MarqueeLights, layer: 7 },
  DiceRoll:           { Component: DiceRoll, layer: 7 },
  ChessPieces:        { Component: ChessPieces, layer: 7 },
  MotelSign:          { Component: MotelSign, layer: 7 },
  HighwaySign:        { Component: HighwaySign, layer: 7 },
  HoneycombGrid:      { Component: HoneycombGrid, layer: 7 },
  Compass:            { Component: Compass, layer: 7 },
  Altimeter:          { Component: Altimeter, layer: 7 },
  FlightInstruments:  { Component: FlightInstruments, layer: 7 },
  TrailMap:           { Component: TrailMap, layer: 7 },
  WeatherVane:        { Component: WeatherVane, layer: 7 },
  Sextant:            { Component: Sextant, layer: 7 },
  Porthole:           { Component: Porthole, layer: 7 },
  CuckooClockOverlay: { Component: CuckooClockOverlay, layer: 7 },
  SandTimer:          { Component: SandTimer, layer: 7 },
  Chronograph:        { Component: Chronograph, layer: 7 },
  PocketWatch:        { Component: PocketWatch, layer: 7 },
  WaterClock:         { Component: WaterClock, layer: 7 },
  Pyrotechnics:       { Component: Pyrotechnics, layer: 7 },
  GlowSticks:         { Component: GlowSticks, layer: 7 },
  SteamValve:         { Component: SteamValve, layer: 7 },
  Anvil:              { Component: Anvil, layer: 7 },
  WeldingSparks:      { Component: WeldingSparks, layer: 7 },

  // Layer 8: Typography
  LyricFlash:    { Component: LyricFlash, layer: 8 },
  GarciaQuotes:  { Component: GarciaQuotes, layer: 8 },
  MantraScroll:  { Component: MantraScroll, layer: 8 },
  AsciiRain:     { Component: AsciiRain, layer: 8 },
  RansomNote:    { Component: RansomNote, layer: 8 },
  BookPages:     { Component: BookPages, layer: 8 },
  BinaryStream:  { Component: BinaryStream, layer: 8 },

  // Layer 9: HUD
  CassetteReels:   { Component: CassetteReels, layer: 9 },
  NixieTubes:      { Component: NixieTubes, layer: 9 },
  HeartbeatEKG:    { Component: HeartbeatEKG, layer: 9 },
  NeuralNetwork:   { Component: NeuralNetwork, layer: 9 },
  TerminalPrompt:  { Component: TerminalPrompt, layer: 9 },
  LoadingBars:     { Component: LoadingBars, layer: 9 },
  SpiralArms:      { Component: SpiralArms, layer: 9 },
  VacuumTube:      { Component: VacuumTube, layer: 9 },
  TeslaCoil:       { Component: TeslaCoil, layer: 9 },
  HolographicDisc: { Component: HolographicDisc, layer: 9 },

  // Layer 10: Distortion
  LiquidMetal:         { Component: LiquidMetal, layer: 10 },
  ChromaticAberration: { Component: ChromaticAberration, layer: 10 },
  ChromaticSplit:      { Component: ChromaticSplit, layer: 10 },
  HologramGlitch:      { Component: HologramGlitch, layer: 10 },
  VHSGlitch:           { Component: VHSGlitch, layer: 10 },
  FilmBurn:            { Component: FilmBurn, layer: 10 },
  RetroTV:             { Component: RetroTV, layer: 10 },
  VinylGrooves:        { Component: VinylGrooves, layer: 10 },
  FilmStrip:           { Component: FilmStrip, layer: 10 },
  PixelExplosion:      { Component: PixelExplosion, layer: 10 },
  Screensaver:         { Component: Screensaver, layer: 10 },
  MatrixRain:          { Component: MatrixRain, layer: 10 },
};

// ─── Parametric Overlays (50 variants across 7 families) ───
import { PARAMETRIC_COMPONENTS } from "../components/parametric";
Object.assign(OVERLAY_COMPONENTS, PARAMETRIC_COMPONENTS);
