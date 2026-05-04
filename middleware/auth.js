import jwt from 'jsonwebtoken'
import supabase from '../config/supabase.js'

export const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token provided' })

    // First try Supabase auth
    const { data, error } = await supabase.auth.getUser(token)
    if (!error && data?.user) {
      req.user = data.user
      return next()
    }

    // Fallback: decode JWT manually
    const decoded = jwt.decode(token)
    if (!decoded || !decoded.sub) {
      return res.status(401).json({ error: 'Invalid token' })
    }
    req.user = { id: decoded.sub, email: decoded.email || '', ...decoded }
    return next()

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}