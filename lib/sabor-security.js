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
// Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
// Falls back to in-memory sliding window (resets on cold start) without those vars.
// To enable persistent rate limiting: create a free database at upstash.com,
// then add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel env vars.

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// In-memory fallback
const _rateBuckets = new Map();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [key, entry] of _rateBuckets.entries()) {
    if (entry.windowStart < cutoff) _rateBuckets.delete(key);
  }
}, 5 * 60_000);

function _memoryRateLimit(ip, endpoint, max, windowMs) {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  const entry = _rateBuckets.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    _rateBuckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: max - 1 };
  }
  if (entry.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - entry.windowStart)) / 1000) };
  }
  entry.count++;
  return { allowed: true, remaining: max - entry.count };
}

// Upstash limiter cache — one Ratelimit instance per (max, windowMs) combo
const _upstashLimiters = new Map();

function _getUpstashLimiter(max, windowMs) {
  const key = `${max}:${windowMs}`;
  if (!_upstashLimiters.has(key)) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    _upstashLimiters.set(key, new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowMs}ms`),
      prefix: 'sabor_rl',
    }));
  }
  return _upstashLimiters.get(key);
}

export async function checkRateLimit(ip, endpoint, max, windowMs = 60_000) {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return _memoryRateLimit(ip, endpoint, max, windowMs);
  }
  try {
    const limiter = _getUpstashLimiter(max, windowMs);
    const { success, remaining, reset } = await limiter.limit(`${ip}:${endpoint}`);
    return {
      allowed: success,
      remaining,
      retryAfter: success ? undefined : Math.ceil((reset - Date.now()) / 1000),
    };
  } catch (e) {
    console.error('Upstash rate limit error, falling back to memory:', e.message);
    return _memoryRateLimit(ip, endpoint, max, windowMs);
  }
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
