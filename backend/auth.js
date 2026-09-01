const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch {}
}

const PUBLIC_ROUTES = [
  '/api/health',
  '/api/metrics',
  '/api/stats',
  '/api/cache/stats',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google',
  '/api/auth/verify-access',
  '/api/auth/check-access',
  '/demo-key.json',
];

function isPublic(path) {
  return PUBLIC_ROUTES.some(r => path === r || path.startsWith(r + '/') || path.startsWith(r + '?'));
}

async function verifySupabaseToken(token) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch { return null; }
}

function verifyLocalJwt(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.sub || decoded.userId || decoded.id || null;
  } catch { return null; }
}

async function authMiddleware(req, res, next) {
  // Allow public routes
  if (isPublic(req.path) || isPublic(req.url.split('?')[0])) return next();
  // Allow if no auth configured and in dev (graceful fallback)
  const hasAuthConfig = !!(process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || (SUPABASE_URL && SUPABASE_ANON_KEY));
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-access-token'] || req.query.token || null);

  if (!token) {
    if (!hasAuthConfig && process.env.NODE_ENV !== 'production') {
      // dev open — attach anonymous user
      req.userId = 'dev-anon';
      req.user = { id: 'dev-anon', email: 'dev@local' };
      return next();
    }
    return res.status(401).json({ success: false, error: 'Unauthorized: missing token' });
  }

  // Try Supabase first, then local JWT
  let userId = null;
  if (supabase) userId = await verifySupabaseToken(token);
  if (!userId) userId = verifyLocalJwt(token);

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  req.userId = userId;
  req.user = { id: userId };
  next();
}

module.exports = { authMiddleware, verifyLocalJwt, verifySupabaseToken, isPublic };
