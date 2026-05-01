import type { Command } from 'commander';
import { createLogger, visualizerPocRoot } from '@dead-air/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const log = createLogger('cli:generate-show');

/**
 * Validate date string is YYYY-MM-DD format.
 */
function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}

/**
 * Normalize a song title to the format used in song-identities.json.
 * Strips non-alphanumeric chars and lowercases.
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Determine era from show date year.
 */
function getEraFromYear(year: number): string {
  if (year <= 1967) return 'primal';
  if (year <= 1974) return 'classic';
  if (year <= 1976) return 'hiatus';
  if (year <= 1979) return 'classic'; // late classic
  if (year <= 1990) return 'brent_era';
  return 'revival';
}

/**
 * Default shader modes mapped by song character fallback.
 * Used when a song has no curated identity.
 */
const FALLBACK_MODES = [
  'liquid_light', 'tie_dye', 'aurora', 'concert_lighting',
  'oil_projector', 'vintage_film', 'inferno', 'deep_ocean',
];

interface SetlistEntry {
  title: string;
  set?: number;
  trackNumber?: number;
  segueInto?: boolean;
}

interface GeneratedSong {
  trackId: string;
  title: string;
  set: number;
  trackNumber: number;
  defaultMode: string;
  audioFile: string;
  palette: { primary: number; secondary: number; saturation?: number };
  songArt?: string;
  segueInto?: boolean;
  overlayOverrides?: { include: string[] };
}

interface GeneratedSetlist {
  date: string;
  venue: string;
  bandName: string;
  era: string;
  venueType: string;
  songs: GeneratedSong[];
}

export function registerGenerateShowCommand(program: Command): void {
  program
    .command('generate-show')
    .description(
      'Generate a show setlist.json from a date and setlist. ' +
      'Maps songs to curated identities, assigns shaders, and generates analysis stubs.',
    )
    .argument('<date>', 'Show date in YYYY-MM-DD format (e.g., 1977-05-09)')
    .option('--audio-dir <dir>', 'Directory containing audio files')
    .option('--setlist-file <path>', 'Manual setlist JSON file (array of {title, set, segueInto})')
    .option('--venue <name>', 'Venue name', 'Unknown Venue')
    .option('--venue-type <type>', 'Venue type (arena, theater, outdoor, club)', 'arena')
    .option('--output <path>', 'Output path for setlist.json')
    .option('--dry-run', 'Print generated setlist without writing')
    .action(
      async (
        date: string,
        options: {
          audioDir?: string;
          setlistFile?: string;
          venue?: string;
          venueType?: string;
          output?: string;
          dryRun?: boolean;
        },
      ) => {
        if (!isValidDate(date)) {
          console.error(
            `Error: Invalid date "${date}". Use YYYY-MM-DD format (e.g., 1977-05-09)`,
          );
          process.exit(1);
        }

        // Load song identities for lookup
        let songIdentities: Record<string, { preferredModes?: string[]; palette?: { primary: number; secondary: number; saturation?: number } }> = {};
        try {
          const identitiesPath = path.join(visualizerPocRoot(), 'data/song-identities.json');
          if (fs.existsSync(identitiesPath)) {
            songIdentities = JSON.parse(fs.readFileSync(identitiesPath, 'utf-8'));
            log.info(`Loaded ${Object.keys(songIdentities).length} song identities`);
          }
        } catch (e) {
          log.warn('Could not load song identities, using fallbacks');
        }

        // Load setlist
        let setlist: SetlistEntry[] = [];
        if (options.setlistFile) {
          try {
            const raw = fs.readFileSync(options.setlistFile, 'utf-8');
            setlist = JSON.parse(raw);
            log.info(`Loaded ${setlist.length} songs from setlist file`);
          } catch (e) {
            console.error(`Error reading setlist file: ${options.setlistFile}`);
            process.exit(1);
          }
        } else {
          console.error('Error: --setlist-file is required (setlist.fm API integration coming soon)');
          process.exit(1);
        }

        // Determine era
        const year = parseInt(date.substring(0, 4), 10);
        const era = getEraFromYear(year);
        const dateCompact = date.replace(/-/g, '').substring(2); // e.g., "77-05-09" → "770509"

        // Generate songs
        const songs: GeneratedSong[] = [];
        const setCounts: Record<number, number> = {};

        for (let i = 0; i < setlist.length; i++) {
          const entry = setlist[i];
          const set = entry.set ?? 1;
          setCounts[set] = (setCounts[set] ?? 0) + 1;
          const trackNum = setCounts[set];

          const trackId = `s${set}t${String(trackNum).padStart(2, '0')}`;
          const normalized = normalizeTitle(entry.title);
          const identity = songIdentities[normalized];

          // Default mode from identity or fallback
          const defaultMode = identity?.preferredModes?.[0]
            ?? FALLBACK_MODES[i % FALLBACK_MODES.length];

          // Palette from identity or auto-generate
          const palette = identity?.palette ?? {
            primary: (i * 47) % 360,
            secondary: ((i * 47) + 180) % 360,
          };

          // Audio file naming convention
          const audioFile = `gd${dateCompact}s${set}t${String(trackNum + 1).padStart(2, '0')}.mp3`;

          const song: GeneratedSong = {
            trackId,
            title: entry.title,
            set,
            trackNumber: trackNum,
            defaultMode,
            audioFile,
            palette,
          };

          if (entry.segueInto) {
            song.segueInto = true;
          }

          songs.push(song);

          const identityStatus = identity ? '✓ curated' : '○ fallback';
          log.info(`  ${trackId} ${entry.title} → ${defaultMode} (${identityStatus})`);
        }

        // Generate output
        const output: GeneratedSetlist = {
          date,
          venue: options.venue ?? 'Unknown Venue',
          bandName: 'Grateful Dead',
          era,
          venueType: options.venueType ?? 'arena',
          songs,
        };

        const jsonStr = JSON.stringify(output, null, 2);

        if (options.dryRun) {
          console.log(jsonStr);
          return;
        }

        // Write output
        const outputPath = options.output
          ?? path.resolve(process.cwd(), `setlist-${date}.json`);
        fs.writeFileSync(outputPath, jsonStr + '\n');
        log.info(`\nGenerated setlist written to: ${outputPath}`);
        log.info(`  ${songs.length} songs, era: ${era}`);
        log.info(`  ${songs.filter((s) => songIdentities[normalizeTitle(s.title)]).length}/${songs.length} songs have curated identities`);

        // Summary
        const curatedCount = songs.filter((s) => songIdentities[normalizeTitle(s.title)]).length;
        const fallbackCount = songs.length - curatedCount;
        console.log(`\n✓ Generated setlist for ${date}`);
        console.log(`  ${songs.length} songs (${curatedCount} curated, ${fallbackCount} fallback)`);
        console.log(`  Era: ${era}, Venue: ${options.venue}`);
        console.log(`  Output: ${outputPath}`);
        if (fallbackCount > 0) {
          console.log(`\n  Songs without curated identity (will use AI routing):`);
          songs
            .filter((s) => !songIdentities[normalizeTitle(s.title)])
            .forEach((s) => console.log(`    - ${s.title}`));
        }
      },
    );
}
