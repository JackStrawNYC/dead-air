import { loadConfig as coreLoadConfig } from '@dead-air/core';
import type { DeadAirConfig } from '@dead-air/core';

let _config: DeadAirConfig | null = null;

export function loadConfig(): DeadAirConfig {
  if (_config) return _config;
  _config = coreLoadConfig();
  return _config;
}

export function getConfig(): DeadAirConfig {
  if (!_config) throw new Error('Config not loaded');
  return _config;
}
