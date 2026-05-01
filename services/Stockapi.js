import axios from 'axios';

// Yahoo Finance - FREE, no API key required
// Finnhub as backup (may have rate limits)
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'ctbvr11r01qtndd3n9vgctbvr11r01qtndd3n9w0';

/**
 * Fetch stock price from Yahoo Finance (primary - free, no auth)
 */
async function fetchFromYahoo(symbol) {
  const response = await axios.get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    {
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    }
  );

  const result = response.data?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta;
  const currentPrice = meta.regularMarketPrice || meta.previousClose;
  const previousClose = meta.chartPreviousClose || meta.previousClose;
  const change = currentPrice - previousClose;
  const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

  return {
    symbol,
    price: currentPrice,
    change: parseFloat(change.toFixed(4)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    high24h: meta.regularMarketDayHigh || currentPrice,
    low24h: meta.regularMarketDayLow || currentPrice,
    volume: meta.regularMarketVolume || 0,
    isLive: true,
  };
}

/**
 * Fetch stock price from Finnhub (backup)
 */
async function fetchFromFinnhub(symbol) {
  const response = await axios.get(
    `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
    { timeout: 5000 }
  );

  const data = response.data;
  if (!data.c || data.c === 0) return null;

  return {
    symbol,
    price: data.c,
    change: data.d || 0,
    changePercent: data.dp || 0,
    high24h: data.h || 0,
    low24h: data.l || 0,
    previousClose: data.pc || 0,
    isLive: true,
  };
}

/**
 * Fetch single stock - tries Yahoo first, then Finnhub
 */
export async function fetchStockPrice(symbol) {
  // Yahoo Finance uses different symbols for Indian stocks
  const yahooSymbol = symbol === 'RELIANCE' ? 'RELIANCE.NS'
    : symbol === 'INFOSYS' ? 'INFY.NS'
    : symbol;

  try {
    const data = await fetchFromYahoo(yahooSymbol);
    if (data) {
      return { ...data, symbol }; // return original symbol
    }
  } catch (err) {
    console.warn(`Yahoo failed for ${symbol}: ${err.message} — trying Finnhub`);
  }

  try {
    return await fetchFromFinnhub(symbol);
  } catch (err) {
    console.error(`Finnhub also failed for ${symbol}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch multiple stocks with rate limiting (avoid hammering APIs)
 */
export async function fetchMultipleStocks(symbols) {
  const results = [];

  for (const symbol of symbols) {
    const data = await fetchStockPrice(symbol);
    if (data && data.price > 0) {
      results.push(data);
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  return results;
}

export async function fetchCompanyInfo(symbol) {
  try {
    const response = await axios.get(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { timeout: 5000 }
    );
    return {
      name: response.data.name,
      industry: response.data.finnhubIndustry,
      logo: response.data.logo,
      country: response.data.country,
      exchange: response.data.exchange,
    };
  } catch (error) {
    return null;
  }
}