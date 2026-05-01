/**
 * Re-export shim — the canonical implementation lives in @dead-air/audio-core.
 * This file exists so existing intra-package imports keep working without
 * touching every call site at once. Audit Wave 2.3 phase B (consumer
 * migration). Delete this file once all consumers import directly from the
 * shared package.
 */
export * from "@dead-air/audio-core/math";
