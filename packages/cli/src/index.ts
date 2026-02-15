#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '@dead-air/core';
import { registerCatalogCommand } from './commands/catalog.js';
import { registerProduceCommand } from './commands/produce.js';
import { registerPreviewCommand } from './commands/preview.js';
import { registerPublishCommand } from './commands/publish.js';
import { registerStatusCommand } from './commands/status.js';
import { registerIngestCommand } from './commands/ingest.js';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerScriptCommand } from './commands/script.js';

const program = new Command();

program
  .name('deadair')
  .description('Dead Air — Grateful Dead concert documentary pipeline')
  .version('0.1.0')
  .hook('preAction', () => {
    try {
      loadConfig();
    } catch {
      // Config is optional for --help and --version
    }
  });

registerIngestCommand(program);
registerAnalyzeCommand(program);
registerScriptCommand(program);
registerCatalogCommand(program);
registerProduceCommand(program);
registerPreviewCommand(program);
registerPublishCommand(program);
registerStatusCommand(program);

program.parse();
