import express from 'express';
import supabase from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET WALLET
router.get('/wallet', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });

    if (!data) {
      // Auto-create wallet if missing
      const { data: newWallet, error: createErr } = await supabase
        .from('wallets')
        .insert([{
          user_id: userId,
          balance: 10000.00,
          total_deposited: 10000.00,
          loans: 0
        }])
        .select()
        .maybeSingle();

      if (createErr) return res.status(400).json({ error: createErr.message });
      return res.json(newWallet);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// INIT WALLET
router.post('/init-wallet', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: existing } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return res.json({ wallet: existing, message: 'Wallet already exists' });
    }

    const { data: wallet, error } = await supabase
      .from('wallets')
      .insert([{
        user_id: userId,
        balance: 10000.00,
        total_deposited: 10000.00,
        loans: 0
      }])
      .select()
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ wallet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD FUNDS
router.post('/add-funds/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    if (amount > 1000000) {
      return res.status(400).json({ error: 'Amount exceeds maximum allowed per transaction.' });
    }

    const { data: wallet, error: fetchError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const { data: updatedWallet, error: updateError } = await supabase
      .from('wallets')
      .update({
        balance: wallet.balance + amount,
        total_deposited: (wallet.total_deposited || 0) + amount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    res.json({
      success: true,
      wallet: updatedWallet,
      message: `Successfully added $${amount} to wallet`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TAKE LOAN
router.post('/take-loan/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const { data: wallet, error: fetchError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const newLoanTotal = (wallet.loans || 0) + amount;
    if (newLoanTotal > wallet.balance * 2) {
      return res.status(400).json({
        error: 'Loan amount too high. Maximum loan is 2x current balance.'
      });
    }

    const { data: updatedWallet, error: updateError } = await supabase
      .from('wallets')
      .update({
        balance: wallet.balance + amount,
        loans: (wallet.loans || 0) + amount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    res.json({
      success: true,
      wallet: updatedWallet,
      message: `Loan of $${amount} approved`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESET WALLET
router.post('/reset-wallet/:userId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    await supabase
      .from('positions')
      .update({
        status: 'closed',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('status', 'open');

    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .update({
        balance: 10000.00,
        total_deposited: 10000.00,
        loans: 0,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (walletError) {
      return res.status(400).json({ error: walletError.message });
    }

    res.json({
      success: true,
      wallet,
      message: 'Wallet reset to $10,000. All positions closed.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;