/**
 * Minimal remotion mock for unit tests.
 * Only stubs the hooks/functions used by utility modules.
 */
export function useCurrentFrame() {
  return 0;
}
export function useVideoConfig() {
  return { width: 1920, height: 1080, fps: 30, durationInFrames: 9000 };
}
export function interpolate(
  input: number,
  inputRange: number[],
  outputRange: number[],
  options?: { extrapolateLeft?: string; extrapolateRight?: string },
) {
  void options;
  if (inputRange.length < 2 || outputRange.length < 2) return outputRange[0] ?? 0;
  if (input <= inputRange[0]) return outputRange[0];
  if (input >= inputRange[inputRange.length - 1]) return outputRange[outputRange.length - 1];
  for (let i = 0; i < inputRange.length - 1; i++) {
    if (input >= inputRange[i] && input <= inputRange[i + 1]) {
      const t = (input - inputRange[i]) / (inputRange[i + 1] - inputRange[i]);
      return outputRange[i] + t * (outputRange[i + 1] - outputRange[i]);
    }
  }
  return outputRange[0];
}
export const Easing = {
  inOut: (fn: (t: number) => number) => fn,
  out: (fn: (t: number) => number) => fn,
  cubic: (t: number) => t,
};
export const Audio = () => null;
export const Img = () => null;
export function staticFile(path: string) {
  return path;
}
