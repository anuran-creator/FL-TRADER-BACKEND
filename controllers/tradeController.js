import supabase from '../config/supabase.js';

// BUY ASSET
export const buyAsset = async (req, res) => {
  try {
    const userId = req.user.id;
    const { symbol, assetType, quantity, price, orderType, stopLoss, takeProfit } = req.body;

    if (!symbol || !quantity || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedQty = parseFloat(quantity);
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedQty) || parsedQty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    if (isNaN(parsedPrice) || parsedPrice <= 0) return res.status(400).json({ error: 'Invalid price' });

    const { data: wallet, error: walletError } = await supabase
      .from('wallets').select('*').eq('user_id', userId).maybeSingle();

    if (walletError || !wallet) return res.status(404).json({ error: 'Wallet not found' });

    const totalCost = parsedPrice * parsedQty;

    if (totalCost > wallet.balance) {
      return res.status(400).json({
        error: `Insufficient balance. Need $${totalCost.toFixed(2)}, have $${wallet.balance.toFixed(2)}`
      });
    }

    const { error: walletUpdateErr } = await supabase
      .from('wallets')
      .update({ balance: wallet.balance - totalCost, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (walletUpdateErr) return res.status(400).json({ error: walletUpdateErr.message });

    const { data: position, error: positionError } = await supabase
      .from('positions')
      .insert([{
        user_id: userId, symbol,
        asset_type: assetType || 'stock',
        quantity: parsedQty,
        entry_price: parsedPrice,
        stop_loss: stopLoss ?? null,
        take_profit: takeProfit ?? null,
        order_type: orderType || 'market',
        side: 'buy',
        status: 'open'
      }])
      .select().maybeSingle();

    if (positionError) {
      await supabase.from('wallets')
        .update({ balance: wallet.balance, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      return res.status(400).json({ error: positionError.message });
    }

    await supabase.from('trades').insert([{
      user_id: userId, symbol,
      asset_type: assetType || 'stock',
      quantity: parsedQty,
      entry_price: parsedPrice,
      side: 'buy',
      order_type: orderType || 'market',
      stop_loss: stopLoss ?? null,
      take_profit: takeProfit ?? null,
      status: 'open'
    }]);

    res.json({ success: true, position, message: `Bought ${parsedQty} ${symbol} at $${parsedPrice}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// SELL ASSET
// Case 1: User ke paas buy position hai → wo close hoga (normal sell)
// Case 2: User ke paas buy position nahi hai → SHORT position open hogi
export const sellAsset = async (req, res) => {
  try {
    const userId = req.user.id;
    const { symbol, assetType, quantity, price, orderType } = req.body;

    if (!symbol || !quantity || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedQty = parseFloat(quantity);
    const parsedPrice = parseFloat(price);

    if (isNaN(parsedQty) || parsedQty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    if (isNaN(parsedPrice) || parsedPrice <= 0) return res.status(400).json({ error: 'Invalid price' });

    // Check existing buy positions
    const { data: openBuyPositions, error: posErr } = await supabase
      .from('positions').select('*')
      .eq('user_id', userId).eq('symbol', symbol)
      .eq('side', 'buy').eq('status', 'open');

    if (posErr) return res.status(500).json({ error: 'Failed to fetch positions' });

    const totalHeld = (openBuyPositions || []).reduce((sum, p) => sum + p.quantity, 0);

    const { data: wallet, error: walletError } = await supabase
      .from('wallets').select('*').eq('user_id', userId).maybeSingle();

    if (walletError || !wallet) return res.status(404).json({ error: 'Wallet not found' });

    // ── CASE 1: Normal sell (close existing buy positions) ──
    if (totalHeld > 0) {
      const qtyToClose = Math.min(parsedQty, totalHeld);
      const qtyToShort = parsedQty - qtyToClose; // remaining goes to short

      const sortedPositions = [...(openBuyPositions || [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      let remainingToSell = qtyToClose;
      let totalPnl = 0;
      const originalEntryPrice = sortedPositions[0]?.entry_price ?? parsedPrice;

      for (const pos of sortedPositions) {
        if (remainingToSell <= 0) break;
        const sellQty = Math.min(pos.quantity, remainingToSell);
        totalPnl += (parsedPrice - pos.entry_price) * sellQty;
        remainingToSell -= sellQty;

        if (sellQty >= pos.quantity) {
          await supabase.from('positions')
            .update({ status: 'closed', updated_at: new Date().toISOString() })
            .eq('id', pos.id);
        } else {
          await supabase.from('positions')
            .update({ quantity: pos.quantity - sellQty, updated_at: new Date().toISOString() })
            .eq('id', pos.id);
        }
      }

      // Wallet mein proceeds add karo
      await supabase.from('wallets')
        .update({ balance: wallet.balance + (parsedPrice * qtyToClose), updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      // Trade record
      await supabase.from('trades').insert([{
        user_id: userId, symbol,
        asset_type: assetType || 'stock',
        quantity: qtyToClose,
        entry_price: originalEntryPrice,
        exit_price: parsedPrice,
        pnl: totalPnl,
        side: 'sell',
        order_type: orderType || 'market',
        status: 'closed',
        closed_at: new Date().toISOString()
      }]);

      // Agar remaining qty hai toh short open karo
      if (qtyToShort > 0) {
        const margin = parsedPrice * qtyToShort * 0.1; // 10% margin required
        if (wallet.balance + (parsedPrice * qtyToClose) < margin) {
          return res.status(400).json({ error: 'Insufficient margin for short position' });
        }

        await supabase.from('positions').insert([{
          user_id: userId, symbol,
          asset_type: assetType || 'stock',
          quantity: qtyToShort,
          entry_price: parsedPrice,
          order_type: orderType || 'market',
          side: 'sell',
          status: 'open'
        }]);
      }

      await updateLeaderboard(userId);

      return res.json({
        success: true,
        pnl: totalPnl,
        shortOpened: qtyToShort > 0,
        message: `Sold ${qtyToClose} ${symbol}. P&L: $${totalPnl.toFixed(2)}${qtyToShort > 0 ? `. Short opened: ${qtyToShort}` : ''}`
      });
    }

    // ── CASE 2: Pure Short Sell (koi buy position nahi) ──
    const margin = parsedPrice * parsedQty * 0.1; // 10% margin
    if (wallet.balance < margin) {
      return res.status(400).json({
        error: `Insufficient margin. Need $${margin.toFixed(2)} (10%) for short position.`
      });
    }

    // Short position open karo
    const { data: shortPosition, error: shortErr } = await supabase
      .from('positions')
      .insert([{
        user_id: userId, symbol,
        asset_type: assetType || 'stock',
        quantity: parsedQty,
        entry_price: parsedPrice,
        order_type: orderType || 'market',
        side: 'sell',
        status: 'open'
      }])
      .select().maybeSingle();

    if (shortErr) return res.status(400).json({ error: shortErr.message });

    // Trade record for short open
    await supabase.from('trades').insert([{
      user_id: userId, symbol,
      asset_type: assetType || 'stock',
      quantity: parsedQty,
      entry_price: parsedPrice,
      side: 'sell',
      order_type: orderType || 'market',
      status: 'open'
    }]);

    res.json({
      success: true,
      position: shortPosition,
      message: `Short opened: ${parsedQty} ${symbol} at $${parsedPrice}`
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// CLOSE POSITION (buy karo short ko close karne ke liye)
export const closePosition = async (req, res) => {
  try {
    const userId = req.user.id;
    const { positionId, currentPrice } = req.body;

    if (!positionId || currentPrice === undefined) {
      return res.status(400).json({ error: 'positionId and currentPrice required' });
    }

    const parsedPrice = parseFloat(currentPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) return res.status(400).json({ error: 'Invalid currentPrice' });

    const { data: position, error: posErr } = await supabase
      .from('positions').select('*')
      .eq('id', positionId).eq('user_id', userId).eq('status', 'open').maybeSingle();

    if (posErr || !position) return res.status(404).json({ error: 'Position not found or already closed' });

    const { data: wallet, error: walletErr } = await supabase
      .from('wallets').select('*').eq('user_id', userId).maybeSingle();

    if (walletErr || !wallet) return res.status(404).json({ error: 'Wallet not found' });

    // Buy position: profit = price gaya upar
    // Sell (short) position: profit = price gaya neeche
    const pnl = position.side === 'buy'
      ? (parsedPrice - position.entry_price) * position.quantity
      : (position.entry_price - parsedPrice) * position.quantity;

    const newBalance = position.side === 'buy'
      ? wallet.balance + position.quantity * parsedPrice
      : wallet.balance + pnl; // short close: sirf pnl milta hai

    await supabase.from('positions')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', positionId);

    await supabase.from('trades').insert([{
      user_id: userId,
      symbol: position.symbol,
      asset_type: position.asset_type,
      quantity: position.quantity,
      entry_price: position.entry_price,
      exit_price: parsedPrice,
      pnl,
      side: position.side,
      order_type: position.order_type || 'market',
      status: 'closed',
      closed_at: new Date().toISOString()
    }]);

    await supabase.from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    await updateLeaderboard(userId);

    res.json({ success: true, pnl, newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Helper: leaderboard update
async function updateLeaderboard(userId) {
  const { data: allTrades } = await supabase
    .from('trades').select('pnl').eq('user_id', userId).eq('status', 'closed');

  if (allTrades && allTrades.length > 0) {
    const wins = allTrades.filter(t => (t.pnl ?? 0) > 0).length;
    await supabase.from('leaderboard_entries').update({
      total_pnl: allTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
      win_rate: (wins / allTrades.length) * 100,
      total_trades: allTrades.length,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
  }
}

export const getTrades = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase.from('trades').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPositions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase.from('positions').select('*')
      .eq('user_id', userId).eq('status', 'open');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};