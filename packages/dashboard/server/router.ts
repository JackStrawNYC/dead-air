import { Router } from 'express';
import showsRouter from './routes/shows.js';
import episodesRouter from './routes/episodes.js';
import pipelineRouter from './routes/pipeline.js';
import renderRouter from './routes/render.js';
import assetsRouter from './routes/assets.js';
import costsRouter from './routes/costs.js';
import visualizerRouter from './routes/visualizer.js';
import archiveRouter from './routes/archive.js';
import preflightRouter from './routes/preflight.js';
import assetReviewRouter from './routes/asset-review.js';
import batchRouter from './routes/batch.js';
import bridgeRouter from './routes/bridge.js';
import publishRouter from './routes/publish.js';

const router = Router();

router.use('/archive', archiveRouter);
router.use('/shows', showsRouter);
router.use('/episodes', episodesRouter);
router.use('/pipeline', pipelineRouter);
router.use('/render', renderRouter);
router.use('/assets', assetsRouter);
router.use('/costs', costsRouter);
router.use('/visualizer', visualizerRouter);
router.use('/preflight', preflightRouter);
router.use('/asset-review', assetReviewRouter);
router.use('/batch', batchRouter);
router.use('/bridge', bridgeRouter);
router.use('/publish', publishRouter);

export default router;
