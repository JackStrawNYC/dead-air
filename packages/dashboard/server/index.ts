import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { resolve } from 'path';
import { loadConfig } from './config.js';
import { getDb } from './db.js';
import router from './router.js';

const PORT = parseInt(process.env.DASHBOARD_PORT || '3400', 10);

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Mount API routes
app.use('/api', router);

// Serve data files (images, audio, etc.) from the data directory
app.use('/files', (_req, res, next) => {
  const config = loadConfig();
  express.static(config.paths.data)(_req, res, next);
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Global error handler — catches unhandled errors and sanitizeParam rejections
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[dashboard] Unhandled error:', err);
  const status = (err as { status?: number }).status || 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

// Initialize
const config = loadConfig();
getDb(); // ensure DB is ready

app.listen(PORT, () => {
  console.log(`[dashboard] API server listening on http://localhost:${PORT}`);
  console.log(`[dashboard] Data dir: ${config.paths.data}`);
  console.log(`[dashboard] Database: ${config.paths.database}`);
});
