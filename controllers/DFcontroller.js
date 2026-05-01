import supabase from '../config/supabase.js'
// ✅ GET WALLET
export const getWallet = async (req, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}


// ✅ GET POSITIONS
export const getPositions = async (req, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}


// ✅ GET TRADES
export const getTrades = async (req, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}


// ✅ GET WATCHLIST
export const getWatchlist = async (req, res) => {
  try {
    const userId = req.user.id

    const { data, error } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)

    if (error) throw error

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}