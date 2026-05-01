import express from 'express';
import {
  buyAsset,
  sellAsset,
  closePosition,
  getTrades,
  getPositions,
} from '../controllers/tradeController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// ✅ All trade routes protected — requireAuth verifies JWT from Supabase
router.post('/buy', requireAuth, buyAsset);
router.post('/sell', requireAuth, sellAsset);
router.post('/close', requireAuth, closePosition);        // NEW: close position
router.get('/trades', requireAuth, getTrades);            // no userId in URL — taken from token
router.get('/positions', requireAuth, getPositions);      // same

export default router;