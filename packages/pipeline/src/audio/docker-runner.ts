import { execFileSync } from 'child_process';
import { dirname, basename } from 'path';
import { createLogger } from '@dead-air/core';

const log = createLogger('audio:docker');

export type ExecutionMode = 'auto' | 'docker' | 'local';

interface DockerExecOptions {
  image: string;
  command: string;
  input: string;
  volumeMounts: string[];
  maxBuffer?: number;
  timeout?: number;
}

/** Cache Docker availability per image for the lifetime of the process. */
const dockerAvailableCache = new Map<string, boolean>();

/**
 * Check if a Docker image is available locally.
 */
export function isDockerAvailable(image: string): boolean {
  const cached = dockerAvailableCache.get(image);
  if (cached !== undefined) return cached;

  try {
    execFileSync('docker', ['image', 'inspect', image], {
      stdio: 'ignore',
      timeout: 10_000,
    });
    dockerAvailableCache.set(image, true);
    log.info(`Docker image '${image}' is available`);
    return true;
  } catch {
    dockerAvailableCache.set(image, false);
    log.info(`Docker image '${image}' not found`);
    return false;
  }
}

/**
 * Resolve execution mode: 'auto' checks Docker availability and falls back to 'local'.
 */
export function resolveMode(
  preferred: ExecutionMode,
  image: string,
): 'docker' | 'local' {
  if (preferred === 'docker') return 'docker';
  if (preferred === 'local') return 'local';
  // auto: use Docker if available
  return isDockerAvailable(image) ? 'docker' : 'local';
}

/**
 * Rewrite a host audio path to the container mount point.
 * e.g. /Users/foo/data/audio/1977-05-08/track01.flac → /data/audio/track01.flac
 */
export function toContainerPath(hostPath: string): string {
  return `/data/audio/${basename(hostPath)}`;
}

/**
 * Build a read-only volume mount string for the parent directory of a host file.
 * e.g. /Users/foo/data/audio/1977-05-08/track01.flac → /Users/foo/data/audio/1977-05-08:/data/audio:ro
 */
export function buildVolumeMount(hostPath: string): string {
  return `${dirname(hostPath)}:/data/audio:ro`;
}

/**
 * Execute a command inside a Docker container with JSON on stdin/stdout.
 */
export function execViaDocker(options: DockerExecOptions): string {
  const {
    image,
    command,
    input,
    volumeMounts,
    maxBuffer = 50 * 1024 * 1024,
    timeout = 300_000,
  } = options;

  const args = ['run', '--rm', '-i'];
  for (const mount of volumeMounts) {
    args.push('-v', mount);
  }
  args.push(image, command);

  log.info(`Docker: ${image} ${command}`);

  const result = execFileSync('docker', args, {
    input,
    maxBuffer,
    timeout,
  });

  return result.toString();
}
