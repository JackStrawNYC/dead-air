/**
 * ShowContext — React context for show metadata (venue, date, band, setlist).
 * Any overlay component can consume this via useShowContext() instead of
 * receiving show-specific props or hardcoding values.
 */

import React, { createContext, useContext, useMemo } from "react";
import type { ShowSetlist } from "./types";

// ─── Date formatting ───

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "1977-05-08" → "May 8, 1977" */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

/** "1977-05-08" → "5/8/77" */
export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(-2)}`;
}

/** "1977-05-08" → "05081977" (for ticket numbers etc.) */
export function formatDateCompact(iso: string): string {
  return iso.replace(/-/g, "").slice(4) + iso.slice(0, 4);
}

/** Numeric seed from ISO date: "1977-05-08" → 19770508 */
export function dateSeed(iso: string): number {
  return Number(iso.replace(/-/g, ""));
}

// ─── Show-level seed ───

/** djb2 hash for strings → positive integer */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Derive a show-level PRNG seed from date + venue. Stable across runs. */
export function deriveShowSeed(date: string, venue: string): number {
  return hashString(`${date}::${venue}`);
}

// ─── Setlist grouping ───

export interface SetlistSet {
  label: string;
  songs: string[];
}

/** Group songs[] by set number → array of { label, songs } */
function groupSets(songs: ShowSetlist["songs"]): SetlistSet[] {
  const groups = new Map<number, string[]>();
  for (const s of songs) {
    if (!groups.has(s.set)) groups.set(s.set, []);
    groups.get(s.set)!.push(s.title);
  }
  const result: SetlistSet[] = [];
  for (const [setNum, titles] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const label = setNum === 3 ? "Encore" : `Set ${toRoman(setNum)}`;
    result.push({ label, songs: titles });
  }
  return result;
}

function toRoman(n: number): string {
  if (n === 1) return "I";
  if (n === 2) return "II";
  if (n === 3) return "III";
  return String(n);
}

// ─── Venue parsing ───

/** "Barton Hall, Cornell University, Ithaca, NY" → "Barton Hall" */
function venueShort(venue: string): string {
  return venue.split(",")[0].trim();
}

/** "Barton Hall, Cornell University, Ithaca, NY" → "Ithaca, NY" (last two parts) */
function venueLocation(venue: string): string {
  const parts = venue.split(",").map((s) => s.trim());
  if (parts.length >= 3) return parts.slice(-2).join(", ");
  if (parts.length === 2) return parts[1];
  return venue;
}

// ─── Context type ───

export interface ShowContextValue {
  bandName: string;
  venue: string;
  venueShort: string;
  venueLocation: string;
  date: string;
  dateShort: string;
  dateRaw: string;
  dateSeed: number;
  /** Show-level PRNG seed (unique per show, salts all procedural generation) */
  showSeed: number;
  taperInfo: string;
  era: string;
  venueType: string;
  tourName: string;
  setlistSets: SetlistSet[];
}

const ShowContext = createContext<ShowContextValue | null>(null);

// ─── Provider ───

interface ProviderProps {
  show?: ShowSetlist;
  children: React.ReactNode;
}

export const ShowContextProvider: React.FC<ProviderProps> = ({ show, children }) => {
  const value = useMemo<ShowContextValue | null>(() => {
    if (!show) return null;
    return {
      bandName: show.bandName ?? "Grateful Dead",
      venue: show.venue,
      venueShort: venueShort(show.venue),
      venueLocation: venueLocation(show.venue),
      date: formatDateLong(show.date),
      dateShort: formatDateShort(show.date),
      dateRaw: show.date,
      dateSeed: dateSeed(show.date),
      showSeed: show.showSeed ?? deriveShowSeed(show.date, show.venue),
      taperInfo: show.taperInfo ?? "",
      era: show.era ?? "",
      venueType: show.venueType ?? "",
      tourName: show.tourName ?? "",
      setlistSets: groupSets(show.songs),
    };
  }, [show]);

  return <ShowContext.Provider value={value}>{children}</ShowContext.Provider>;
};

// ─── Hook ───

/** Access show metadata. Returns null if no ShowContextProvider is above. */
export function useShowContext(): ShowContextValue | null {
  return useContext(ShowContext);
}

/** Resolve showSeed from a ShowSetlist (for non-React code like scripts). */
export function getShowSeed(show: ShowSetlist): number {
  return show.showSeed ?? deriveShowSeed(show.date, show.venue);
}
