export function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (str == null) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function sanitizeParam(id: string): string {
  if (/[.]{2}|[/\\]/.test(id) || !/^[\w\-]+$/.test(id)) {
    throw Object.assign(new Error('Invalid parameter'), { status: 400 });
  }
  return id;
}
