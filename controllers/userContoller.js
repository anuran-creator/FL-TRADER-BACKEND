import supabase from '../config/supabase.js'

// CREATE USER
export const createUser = async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email required' })

    const { data: user, error: userError } = await supabase
      .from('users').insert([{ email }]).select().maybeSingle()
    if (userError) return res.status(400).json({ error: userError.message })

    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .insert([{ user_id: user.id, balance: 0, total_deposited: 0, loans: 0 }])
      .select().maybeSingle()
    if (walletError) return res.status(400).json({ error: walletError.message })

    res.json({ user, wallet })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// GET WALLET
export const getWallet = async (req, res) => {
  try {
    const { userId } = req.params
    const { data, error } = await supabase.from('wallets').select('*').eq('user_id', userId).maybeSingle()
    if (error) return res.status(400).json({ error: error.message })
    res.json(data || { balance: 0, total_deposited: 0, loans: 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
