import supabase from '../config/supabase.js';

// BUY ASSET — called with authenticated user from middleware
export const buyAsset = async (req, res) => {
  try {
    const userId = req.user.id; // ✅ comes from requireAuth middleware, NOT req.body
    const { symbol, assetType, quantity, price, orderType, stopLoss, takeProfit } = req.body;

    if (!symbol || !quantity || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedQty = parseFloat(quantity);
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    // Get wallet balance
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletError || !wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const totalCost = parsedPrice * parsedQty;

    if (totalCost > wallet.balance) {
      return res.status(400).json({
        error: `Insufficient balance. Need $${totalCost.toFixed(2)}, have $${wallet.balance.toFixed(2)}`
      });
    }

    // Max 5x leverage check
    if (totalCost > (wallet.balance + wallet.loans) * 5) {
      return res.status(400).json({ error: 'Position too large. Max 5x leverage.' });
    }

    // Deduct from wallet
    const { error: walletUpdateErr } = await supabase
      .from('wallets')
      .update({
        balance: wallet.balance - totalCost,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (walletUpdateErr) {
      return res.status(400).json({ error: `Wallet update failed: ${walletUpdateErr.message}` });
    }

    // Create position
    const { data: position, error: positionError } = await supabase
      .from('positions')
      .insert([{
        user_id: userId,
        symbol,
        asset_type: assetType,
        quantity: parsedQty,
        entry_price: parsedPrice,
        stop_loss: stopLoss ?? null,
        take_profit: takeProfit ?? null,
        order_type: orderType || 'market',
        side: 'buy',
        status: 'open'
      }])
      .select()
      .maybeSingle();

    if (positionError) {
      return res.status(400).json({ error: positionError.message });
    }

    // Create trade record
    await supabase
      .from('trades')
      .insert([{
        user_id: userId,
        symbol,
        asset_type: assetType,
        quantity: parsedQty,
        entry_price: parsedPrice,
        side: 'buy',
        order_type: orderType || 'market',
        stop_loss: stopLoss ?? null,
        take_profit: takeProfit ?? null,
        status: 'open'
      }]);

    res.json({
      success: true,
      position,
      message: `Bought ${parsedQty} ${symbol} at $${parsedPrice}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// SELL ASSET — called with authenticated user from middleware
export const sellAsset = async (req, res) => {
  try {
    const userId = req.user.id; // ✅ from middleware
    const { symbol, assetType, quantity, price, orderType } = req.body;

    if (!symbol || !quantity || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedQty = parseFloat(quantity);
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    // Get wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletError || !wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const totalProceeds = parsedPrice * parsedQty;

    // Add to wallet
    await supabase
      .from('wallets')
      .update({
        balance: wallet.balance + totalProceeds,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    // Create position (short)
    const { data: position, error: positionError } = await supabase
      .from('positions')
      .insert([{
        user_id: userId,
        symbol,
        asset_type: assetType,
        quantity: parsedQty,
        entry_price: parsedPrice,
        order_type: orderType || 'market',
        side: 'sell',
        status: 'open'
      }])
      .select()
      .maybeSingle();

    if (positionError) {
      return res.status(400).json({ error: positionError.message });
    }

    // Create trade record
    await supabase
      .from('trades')
      .insert([{
        user_id: userId,
        symbol,
        asset_type: assetType,
        quantity: parsedQty,
        entry_price: parsedPrice,
        side: 'sell',
        order_type: orderType || 'market',
        status: 'open'
      }]);

    res.json({
      success: true,
      position,
      message: `Sold ${parsedQty} ${symbol} at $${parsedPrice}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// CLOSE POSITION — NEW endpoint called from frontend closePosition()
export const closePosition = async (req, res) => {
  try {
    const userId = req.user.id; // ✅ from middleware
    const { positionId, currentPrice } = req.body;

    if (!positionId || currentPrice === undefined) {
      return res.status(400).json({ error: 'positionId and currentPrice required' });
    }

    // Fetch position — verify it belongs to this user
    const { data: position, error: posErr } = await supabase
      .from('positions')
      .select('*')
      .eq('id', positionId)
      .eq('user_id', userId) // ✅ ownership check
      .eq('status', 'open')
      .maybeSingle();

    if (posErr || !position) {
      return res.status(404).json({ error: 'Position not found or already closed' });
    }

    const { data: wallet, error: walletErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletErr || !wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const price = parseFloat(currentPrice);

    const pnl =
      position.side === 'buy'
        ? (price - position.entry_price) * position.quantity
        : (position.entry_price - price) * position.quantity;

    const newBalance =
      position.side === 'buy'
        ? wallet.balance + position.quantity * price
        : wallet.balance + pnl;

    // Close position
    await supabase
      .from('positions')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', positionId);

    // Close matching trade
    await supabase
      .from('trades')
      .update({ status: 'closed', exit_price: price, pnl, closed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('symbol', position.symbol)
      .eq('status', 'open')
      .limit(1);

    // Update wallet
    await supabase
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    // Update leaderboard
    const { data: allTrades } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'closed');

    if (allTrades && allTrades.length > 0) {
      const wins = allTrades.filter(t => (t.pnl ?? 0) > 0).length;
      await supabase
        .from('leaderboard_entries')
        .update({
          total_pnl: allTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
          win_rate: (wins / allTrades.length) * 100,
          total_trades: allTrades.length,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    }

    res.json({ success: true, pnl, newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET TRADES — returns only authenticated user's trades
export const getTrades = async (req, res) => {
  try {
    const userId = req.user.id; // ✅ from middleware, ignore URL param

    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET POSITIONS — returns only authenticated user's positions
export const getPositions = async (req, res) => {
  try {
    const userId = req.user.id; // ✅ from middleware

    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open');

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};