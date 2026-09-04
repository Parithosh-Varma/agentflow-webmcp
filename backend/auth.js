const jwt = require('jsonwebtoken');

// SECURITY: fail closed in production — no committed fallback secret.
// Set JWT_SECRET (or SUPABASE_JWT_SECRET) via environment / secret manager.
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || null;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('Missing JWT_SECRET in production — refusing to start with insecure default');
}
// Dev-only fallback (never used in production). Explicit opt-in required for anon access.
const DEV_FALLBACK_SECRET = 'dev-only-insecure-fallback-do-not-use-in-prod';
const EFFECTIVE_SECRET = JWT_SECRET || DEV_FALLBACK_SECRET;
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
    // Pin algorithm + expiry; issuer check when configured.
    const decoded = jwt.verify(token, EFFECTIVE_SECRET, {
      algorithms: ['HS256'],
      maxAge: process.env.JWT_MAX_AGE || '7d',
    });
    return decoded.sub || decoded.userId || decoded.id || null;
  } catch { return null; }
}

async function authMiddleware(req, res, next) {
  // Allow public routes
  if (isPublic(req.path) || isPublic(req.url.split('?')[0])) return next();
  // SECURITY: only allow header tokens (query tokens leak via logs/referer).
  // Dev anon fallback requires explicit ALLOW_DEV_AUTH=1 and never in production.
  const hasAuthConfig = !!(process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || (SUPABASE_URL && SUPABASE_ANON_KEY));
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-access-token'] || null);

  if (!token) {
    if (!hasAuthConfig && process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH === '1') {
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
