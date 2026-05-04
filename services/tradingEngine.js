// 🧠 TRADE ENGINE (PURE LOGIC ONLY)

function calculateBuy({ balance, price, quantity }) {
  if (quantity <= 0) throw new Error('Quantity must be greater than 0')
  const cost = price * quantity
  if (balance < cost) throw new Error('Insufficient balance')
  return { cost, newBalance: balance - cost }
}

function calculateSell({ position, price, quantity }) {
  if (!position || position.quantity <= 0) throw new Error('No position found')
  if (quantity <= 0) throw new Error('Quantity must be greater than 0')
  if (position.quantity < quantity) throw new Error('Not enough quantity to sell')
  const revenue = price * quantity
  return { revenue, newQuantity: position.quantity - quantity }
}

function updatePositionAfterBuy(position, price, quantity) {
  if (!position) return { quantity, avgPrice: price }
  const totalCost = position.avgPrice * position.quantity + price * quantity
  const totalQty = position.quantity + quantity
  return { quantity: totalQty, avgPrice: totalCost / totalQty }
}

function updatePositionAfterSell(position, quantity) {
  const remainingQty = position.quantity - quantity
  if (remainingQty === 0) return null
  return { ...position, quantity: remainingQty }
}

function calculateProfit({ avgPrice, sellPrice, quantity }) {
  return (sellPrice - avgPrice) * quantity
}

export { calculateBuy, calculateSell, updatePositionAfterBuy, updatePositionAfterSell, calculateProfit }
