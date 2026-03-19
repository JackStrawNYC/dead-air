import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKEN_PATH = resolve(__dirname, '..', '..', '.youtube-token.json');

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];

interface YouTubeCredentials {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

function getCredentials(): YouTubeCredentials | null {
  const raw = process.env.YOUTUBE_CREDENTIALS;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getAuthClient() {
  const creds = getCredentials();
  if (!creds) throw new Error('YOUTUBE_CREDENTIALS env var not set');
  const client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uri,
  );

  // Load saved token if available
  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
    client.setCredentials(token);
  }

  return client;
}

export function getAuthUrl(): string {
  const creds = getCredentials();
  if (!creds) throw new Error('YOUTUBE_CREDENTIALS env var not set');
  const client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uri,
  );
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
}

export async function exchangeCode(code: string): Promise<void> {
  const client = getAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
}

export function hasToken(): boolean {
  return existsSync(TOKEN_PATH);
}

export async function uploadVideo(opts: {
  filePath: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: string;
  thumbnailPath?: string;
}): Promise<{ videoId: string; url: string }> {
  const auth = getAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: opts.title,
        description: opts.description || '',
        tags: opts.tags || [],
        categoryId: '10', // Music
      },
      status: {
        privacyStatus: opts.privacyStatus || 'unlisted',
      },
    },
    media: {
      body: createReadStream(opts.filePath),
    },
  });

  const videoId = response.data.id!;

  // Upload thumbnail if provided
  if (opts.thumbnailPath && existsSync(opts.thumbnailPath)) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: {
          body: createReadStream(opts.thumbnailPath),
        },
      });
    } catch {
      // Thumbnail upload is best-effort
    }
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
