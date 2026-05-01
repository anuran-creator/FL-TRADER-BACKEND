import 'dotenv/config'

import express from 'express'
import cors from 'cors'
import axios from 'axios'

import DFRoutes from './routes/DFroutes.js'
import userRoutes from './routes/userRoutes.js'
import tradeRoutes from './routes/tradeRoutes.js'
import supabase from './config/supabase.js'
import { fetchMultipleStocks } from './services/stockApi.js'

const app = express()

// ── CORS — allow localhost dev + any deployed frontend ───────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}))

app.use(express.json())

app.use('/data/dfroutes', DFRoutes)
app.use('/api/users', userRoutes)
app.use('/api/trade', tradeRoutes)

app.get('/', (req, res) => {
  res.send('Backend running 🚀')
})

app.get('/test-db', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*')
  if (error) return res.json({ error })
  res.json({ data })
})

// FOREX API
app.get('/api/forex', async (req, res) => {
  try {
    const response = await axios.get(
      `${process.env.FOREX_API_URL}?from=USD`
    )
    const rates = response.data.rates
    const formatted = Object.keys(rates).map((currency) => ({
      symbol: `USD/${currency}`,
      price: rates[currency],
    }))
    res.json(formatted)
  } catch (err) {
    res.status(500).json({ error: 'Forex fetch failed' })
  }
})

// LIVE STOCK MARKET DATA API
app.get('/api/stocks', async (req, res) => {
  try {
    const symbols = [
      'AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN',
      'META', 'NVDA', 'RELIANCE.NS', 'INFY'
    ];
    console.log('Fetching live stock prices...');
    const stocks = await fetchMultipleStocks(symbols);
    if (stocks.length === 0) {
      return res.status(500).json({ error: 'Failed to fetch stock data', fallback: true });
    }
    res.json(stocks);
  } catch (err) {
    console.error('Stock API error:', err.message);
    res.status(500).json({ error: 'Stock fetch failed' });
  }
});

// Test Supabase connection
app.get('/test-supabase', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('*')
    if (error) {
      console.error('❌ Supabase Error:', error.message)
      return res.status(500).json({ success: false, error: error.message })
    }
    console.log('✅ Supabase Working')
    res.json({ success: true, data })
  } catch (err) {
    console.error('💥 Server Error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📊 Stock API available at http://localhost:${PORT}/api/stocks`)
  console.log(`💱 Forex API available at http://localhost:${PORT}/api/forex`)
})