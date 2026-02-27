import { Router } from 'express';
import showsRouter from './routes/shows.js';
import episodesRouter from './routes/episodes.js';
import pipelineRouter from './routes/pipeline.js';
import renderRouter from './routes/render.js';
import assetsRouter from './routes/assets.js';
import costsRouter from './routes/costs.js';
import visualizerRouter from './routes/visualizer.js';

const router = Router();

router.use('/shows', showsRouter);
router.use('/episodes', episodesRouter);
router.use('/pipeline', pipelineRouter);
router.use('/render', renderRouter);
router.use('/assets', assetsRouter);
router.use('/costs', costsRouter);
router.use('/visualizer', visualizerRouter);

export default router;
