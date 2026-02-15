import { Config } from '@remotion/cli/config';
import { resolve } from 'path';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setEntryPoint(resolve(import.meta.dirname ?? __dirname, 'src', 'entry.ts'));

// Serve data/ as static files so components can use staticFile() for assets
const dataDir = resolve(import.meta.dirname ?? __dirname, '..', '..', 'data');
Config.setPublicDir(dataDir);
