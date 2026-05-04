import express from 'express'
import { buyAsset, sellAsset, closePosition, getTrades, getPositions } from '../controllers/tradeController.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

router.post('/buy', requireAuth, buyAsset)
router.post('/sell', requireAuth, sellAsset)
router.post('/close', requireAuth, closePosition)
router.get('/trades', requireAuth, getTrades)
router.get('/positions', requireAuth, getPositions)

export default router
