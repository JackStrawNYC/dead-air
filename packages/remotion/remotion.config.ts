import { Config } from '@remotion/cli/config';
import { resolve } from 'path';

const root = process.cwd();

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setEntryPoint(resolve(root, 'src', 'entry.ts'));

// Serve data/ as static files so components can use staticFile() for assets
const dataDir = resolve(root, '..', '..', 'data');
Config.setPublicDir(dataDir);
