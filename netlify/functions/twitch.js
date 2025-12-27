
// Netlify serverless function to proxy Twitch API calls
// Supports: ?type=user&login=...  |  ?type=videos&user_id=...  |  ?type=clips&broadcaster_id=...

// Simple in-memory cache, token management and rate-limiting to protect Twitch API and improve performance.
// Cache is process-local (works across warm invocations). TTLs configured per endpoint.

const CACHE = new Map(); // key -> { data, expiry }
let requestTimestamps = []; // timestamps in ms for sliding-window rate limit
const RATE = { windowMs: 60_000, max: 120 }; // 120 requests per minute by default

let APP_TOKEN = null;
let APP_TOKEN_EXPIRY = 0; // ms epoch

function now() { return Date.now(); }

async function fetchAppAccessToken(clientId, clientSecret) {
  const url = `https://id.twitch.tv/oauth2/token`;
  const body = `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`token endpoint error: ${JSON.stringify(json)}`);
  return json; // { access_token, expires_in, ... }
}

async function getAppToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (APP_TOKEN && APP_TOKEN_EXPIRY > now()) return APP_TOKEN;
  const j = await fetchAppAccessToken(clientId, clientSecret);
  APP_TOKEN = j.access_token;
  // subtract a small buffer
  APP_TOKEN_EXPIRY = now() + (j.expires_in ? (j.expires_in - 30) * 1000 : 50 * 60 * 1000);
  return APP_TOKEN;
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const type = q.type;

    const clientId = process.env.TWITCH_CLIENT_ID;

    // Obtain authorization token: prefer server-side client_credentials (app token) if configured,
    // otherwise fall back to a provided TWITCH_OAUTH (Bearer token).
    let token = null;
    if (process.env.TWITCH_CLIENT_SECRET) {
      token = await getAppToken();
    } else if (process.env.TWITCH_OAUTH) {
      token = process.env.TWITCH_OAUTH.replace(/^Bearer\s+/i, '');
    }

    if (!clientId || !token) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Twitch credentials not configured on server' })
      };
    }

    const headers = {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`
    };

    let url;
    let cacheTTL = 60 * 5; // default 5 minutes
    if (type === 'user') {
      const login = q.login;
      if (!login) return { statusCode: 400, body: JSON.stringify({ error: 'missing login' }) };
      url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`;
      cacheTTL = 60 * 60; // 1 hour for user metadata
    } else if (type === 'videos') {
      const user_id = q.user_id;
      if (!user_id) return { statusCode: 400, body: JSON.stringify({ error: 'missing user_id' }) };
      url = `https://api.twitch.tv/helix/videos?user_id=${encodeURIComponent(user_id)}&first=6&type=archive`;
      cacheTTL = 60 * 5;
    } else if (type === 'clips') {
      const broadcaster_id = q.broadcaster_id;
      if (!broadcaster_id) return { statusCode: 400, body: JSON.stringify({ error: 'missing broadcaster_id' }) };
      url = `https://api.twitch.tv/helix/clips?broadcaster_id=${encodeURIComponent(broadcaster_id)}&first=6`;
      cacheTTL = 60 * 5;
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'missing or invalid type parameter' }) };
    }

    // Prune old timestamps (in-memory fallback)
    const t = now();
    requestTimestamps = requestTimestamps.filter(ts => (t - ts) < RATE.windowMs);

    // If Redis is configured, prefer Redis-backed cache + rate-limit
    const redisHelper = require('./twitch-redis');
    const useRedis = !!process.env.REDIS_URL && redisHelper.getRedis();

    if (useRedis) {
      // Try Redis cache
      const cachedRedis = await redisHelper.getCached(url);
      if (cachedRedis) {
        return { statusCode: 200, headers: { 'X-Cache': 'HIT-REDIS' }, body: JSON.stringify(cachedRedis) };
      }

      // Rate limiting via Redis
      const rlKey = `twitch:rl:${Math.floor(t / RATE.windowMs)}:${type}`;
      const allowed = await redisHelper.allowRequest(rlKey, Math.floor(RATE.windowMs / 1000), RATE.max);
      if (!allowed) {
        // return stale if available
        if (cachedRedis) {
          return { statusCode: 200, headers: { 'X-Cache': 'HIT-REDIS', 'X-Rate-Limited': 'true' }, body: JSON.stringify(cachedRedis) };
        }
        return { statusCode: 429, body: JSON.stringify({ error: 'rate limited - try again later' }) };
      }

      // Request via fetch and cache to Redis
      requestTimestamps.push(t);
      const resp = await fetch(url, { headers });
      const json = await resp.json();

      if (resp.status >= 400) {
        // try stale
        if (cachedRedis) return { statusCode: 200, headers: { 'X-Cache': 'HIT-REDIS', 'X-Cache-Stale': 'true' }, body: JSON.stringify(cachedRedis) };
        return { statusCode: resp.status, body: JSON.stringify(json) };
      }

      await redisHelper.setCached(url, json, cacheTTL);
      return { statusCode: 200, headers: { 'X-Cache': 'MISS-REDIS' }, body: JSON.stringify(json) };
    }

    // If no Redis, proceed with in-memory caching/rate-limiting
    // If rate limited, try to return cached stale entry; otherwise 429
    if (requestTimestamps.length >= RATE.max) {
      if (cached) {
        return {
          statusCode: 200,
          headers: { 'X-Cache': 'HIT', 'X-Cache-Stale': 'true', 'X-Rate-Limited': 'true' },
          body: JSON.stringify(cached.data)
        };
      }
      return { statusCode: 429, body: JSON.stringify({ error: 'rate limited - try again later' }) };
    }

    // Make request and store in cache
    requestTimestamps.push(t);
    const resp = await fetch(url, { headers });
    const json = await resp.json();

    // If fetch failed but we have a stale cache, return stale cached data
    if (resp.status >= 400) {
      if (cached) {
        return {
          statusCode: 200,
          headers: { 'X-Cache': 'HIT', 'X-Cache-Stale': 'true' },
          body: JSON.stringify(cached.data)
        };
      }
      return { statusCode: resp.status, body: JSON.stringify(json) };
    }

    // Success - cache and return
    CACHE.set(url, { data: json, expiry: t + cacheTTL * 1000 });

    return {
      statusCode: 200,
      headers: { 'X-Cache': 'MISS' },
      body: JSON.stringify(json)
    };
  } catch (err) {
    // On unexpected error, attempt to return any cached data
    const q = event.queryStringParameters || {};
    const type = q.type || 'unknown';
    try {
      const urlFallback = event.rawUrl || null;
      // Find any cache entry (best-effort)
      const cachedAny = Array.from(CACHE.values())[0];
      if (cachedAny) {
        return {
          statusCode: 200,
          headers: { 'X-Cache': 'HIT', 'X-Error': 'true' },
          body: JSON.stringify(cachedAny.data)
        };
      }
    } catch (e) {
      // ignore
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
