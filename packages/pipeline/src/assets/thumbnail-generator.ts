import sharp from 'sharp';
import { createLogger } from '@dead-air/core';

const log = createLogger('assets:thumbnail');

export interface ThumbnailOptions {
  imageBuffer: Buffer;
  showDate: string;
  venue: string | null;
  episodeTitle: string;
}

export interface ThumbnailResult {
  compositeBuffer: Buffer;
}

/**
 * Format a date string like "1977-05-08" into "MAY 8, 1977".
 */
function formatDate(dateStr: string): string {
  const months = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  ];
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${months[month - 1]} ${day}, ${year}`;
}

/**
 * Escape XML special characters for use in SVG text.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Composite text overlay onto a hero image for YouTube thumbnail.
 */
export async function compositeThumbnail(
  options: ThumbnailOptions,
): Promise<ThumbnailResult> {
  const { imageBuffer, showDate, venue, episodeTitle } = options;

  const width = 1920;
  const height = 1080;
  const dateFormatted = formatDate(showDate);
  const venueText = venue ? escapeXml(venue) : '';
  const titleText = escapeXml(episodeTitle);

  // SVG overlay with gradient bar and text
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bottomGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.85)" />
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="2" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.8)" />
      </filter>
    </defs>
    <!-- Bottom gradient bar -->
    <rect x="0" y="${height - 300}" width="${width}" height="300" fill="url(#bottomGrad)" />
    <!-- DEAD AIR branding top-left -->
    <text x="60" y="80" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="bold" fill="white" filter="url(#shadow)" letter-spacing="8">DEAD AIR</text>
    <!-- Date -->
    <text x="60" y="${height - 160}" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="bold" fill="white" filter="url(#shadow)">${escapeXml(dateFormatted)}</text>
    <!-- Venue -->
    ${venueText ? `<text x="60" y="${height - 95}" font-family="Arial, Helvetica, sans-serif" font-size="36" fill="rgba(255,255,255,0.9)" filter="url(#shadow)">${venueText}</text>` : ''}
    <!-- Title -->
    <text x="60" y="${height - 40}" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="rgba(255,215,0,0.95)" filter="url(#shadow)">${titleText}</text>
  </svg>`;

  const svgBuffer = Buffer.from(svg);

  // Resize base image and composite
  const compositeBuffer = await sharp(imageBuffer)
    .resize(width, height, { fit: 'cover' })
    .composite([{ input: svgBuffer, gravity: 'northwest' }])
    .png()
    .toBuffer();

  log.info(`Thumbnail composited: ${compositeBuffer.length} bytes`);

  return { compositeBuffer };
}
