import express from 'express'
import { getWallet, getPositions, getTrades, getWatchlist } from '../controllers/DFcontroller.js'

const router = express.Router()

router.get('/wallet', getWallet)
router.get('/positions', getPositions)
router.get('/trades', getTrades)
router.get('/watchlist', getWatchlist)

export default router
