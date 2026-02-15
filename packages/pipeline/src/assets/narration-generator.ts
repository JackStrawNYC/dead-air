import { createLogger } from '@dead-air/core';

const log = createLogger('assets:narration');

export interface NarrationOptions {
  text: string;
  voiceId: string;
  apiKey: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

export interface NarrationResult {
  audioBuffer: Buffer;
  characterCount: number;
  cost: number;
}

// ElevenLabs pricing: ~$0.30 per 1000 characters (Starter plan)
const COST_PER_CHAR = 0.30 / 1000;

/**
 * Generate narration audio via ElevenLabs TTS API.
 */
export async function generateNarration(
  options: NarrationOptions,
): Promise<NarrationResult> {
  const {
    text,
    voiceId,
    apiKey,
    modelId = 'eleven_multilingual_v2',
    stability = 0.5,
    similarityBoost = 0.75,
  } = options;

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  log.info(`Generating narration (${text.length} chars)...`);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability, similarity_boost: similarityBoost },
      }),
    });

    if (response.status === 429 && attempt === 0) {
      log.warn('Rate limited by ElevenLabs, retrying in 5s...');
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      lastError = new Error(
        `ElevenLabs API error ${response.status}: ${body}`,
      );
      if (attempt === 0) {
        log.warn(`ElevenLabs error, retrying: ${lastError.message}`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw lastError;
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const cost = text.length * COST_PER_CHAR;

    log.info(`Narration generated: ${audioBuffer.length} bytes, $${cost.toFixed(4)}`);

    return {
      audioBuffer,
      characterCount: text.length,
      cost,
    };
  }

  throw lastError ?? new Error('Narration generation failed');
}
