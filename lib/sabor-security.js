// lib/sabor-security.js — Shared security utilities for SABOR API
//
// Three layers of protection:
//   1. App Key Gate — X-Sabor-Key header (shared secret in Flutter app, blocks bots)
//   2. Per-IP Rate Limiter — in-memory sliding window per Vercel instance
//   3. RevenueCat Tier Verification — server-side entitlement check, 5-min cache

// ── 1. App Key Gate ──────────────────────────────────────────────────────────
// Set SABOR_APP_KEY in Vercel env vars. Until it's set, gate is open (dev mode).
// After setting it: add `X-Sabor-Key: <value>` to every Flutter API call.
export function checkAppKey(req) {
  const appKey = process.env.SABOR_APP_KEY;
  if (!appKey) return true; // Not configured yet — passthrough (deploy Flutter key first)
  return req.headers['x-sabor-key'] === appKey;
}

// ── 2. Per-IP Rate Limiter ───────────────────────────────────────────────────
// In-memory, per Vercel function instance. Resets on cold start.
// Sufficient for small-scale abuse prevention — upgrade to Vercel KV if traffic scales.
const _rateBuckets = new Map();

// Clean up stale entries every 5 minutes to prevent memory growth
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [key, entry] of _rateBuckets.entries()) {
    if (entry.windowStart < cutoff) _rateBuckets.delete(key);
  }
}, 5 * 60_000);

/**
 * Check if a request is within rate limits.
 * @param {string} ip - Client IP address
 * @param {string} endpoint - Endpoint identifier (e.g. 'search', 'home-feed')
 * @param {number} max - Max requests per window
 * @param {number} windowMs - Window duration in milliseconds (default 60s)
 * @returns {{ allowed: boolean, retryAfter?: number, remaining?: number }}
 */
export function checkRateLimit(ip, endpoint, max, windowMs = 60_000) {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  const entry = _rateBuckets.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    _rateBuckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    const retryAfter = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: max - entry.count };
}

// ── 3. RevenueCat Tier Verification ─────────────────────────────────────────
// Set REVENUECAT_SECRET_KEY in Vercel env vars (use the secret key, NOT public key).
// Until it's set, server falls back to the client-sent tier (backwards compatible).
const _rcCache = new Map();
const RC_CACHE_TTL = 5 * 60_000; // 5 minutes — stays well under RC rate limits

/**
 * Verify a user's subscription tier via RevenueCat REST API.
 * Returns 'premium' | 'credits' | 'free', or null if RC is not configured.
 * When null is returned, callers should fall back to the client-sent tier.
 *
 * @param {string|null} rcUserId - RevenueCat app user ID (= Firebase UID in SABOR)
 * @returns {Promise<'premium'|'credits'|'free'|null>}
 */
export async function verifyTierFromRC(rcUserId) {
  const rcSecret = process.env.REVENUECAT_SECRET_KEY;
  // RC is configured but no user ID → fail safe to free (never trust client-sent tier)
  if (!rcUserId) return rcSecret ? 'free' : null;
  if (!rcSecret) return null; // RC not configured — caller uses client-sent tier

  // Serve from cache if still fresh
  const cached = _rcCache.get(rcUserId);
  if (cached && Date.now() - cached.cachedAt < RC_CACHE_TTL) {
    return cached.tier;
  }

  try {
    const resp = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}`,
      {
        headers: {
          Authorization: `Bearer ${rcSecret}`,
          'X-Platform': 'ios',
          'Content-Type': 'application/json',
        },
      }
    );

    if (!resp.ok) {
      console.warn(`[RC] Verification failed for ${rcUserId}: HTTP ${resp.status}`);
      return 'free'; // Fail safe on RC errors — never grant premium for free
    }

    const data = await resp.json();
    const entitlements = data.subscriber?.entitlements || {};

    let tier = 'free';
    if (entitlements['sabor_premium']?.is_active) {
      tier = 'premium';
    } else if (entitlements['sabor_credits']?.is_active) {
      tier = 'credits';
    }

    _rcCache.set(rcUserId, { tier, cachedAt: Date.now() });
    return tier;
  } catch (e) {
    console.error('[RC] Verification error:', e.message);
    return 'free'; // Fail safe
  }
}

// ── IP Extraction ────────────────────────────────────────────────────────────
// Vercel sets x-forwarded-for with the real client IP.
export function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}
