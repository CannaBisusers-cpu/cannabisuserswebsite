// Redis helper for caching, token storage, and rate limiting
const Redis = require('ioredis');

let redis;
function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url);
  return redis;
}

async function getCached(url) {
  const r = getRedis();
  if (!r) return null;
  const v = await r.get(`twitch:cache:${url}`);
  return v ? JSON.parse(v) : null;
}

async function setCached(url, data, ttlSeconds) {
  const r = getRedis();
  if (!r) return;
  await r.set(`twitch:cache:${url}`, JSON.stringify(data), 'EX', ttlSeconds);
}

async function getAppTokenFromRedis() {
  const r = getRedis();
  if (!r) return null;
  const t = await r.get('twitch:app_token');
  return t;
}

async function setAppTokenInRedis(token, expiresIn) {
  const r = getRedis();
  if (!r) return;
  await r.set('twitch:app_token', token, 'EX', Math.max(60, Math.floor(expiresIn - 30)));
}

// Sliding window rate limiter using Redis INCR and EXPIRE
async function allowRequest(key, windowSec, maxRequests) {
  const r = getRedis();
  if (!r) return true; // no redis; allow based on in-memory rate limiter elsewhere
  const count = await r.incr(key);
  if (count === 1) {
    await r.expire(key, windowSec);
  }
  return count <= maxRequests;
}

module.exports = {
  getRedis, getCached, setCached, getAppTokenFromRedis, setAppTokenInRedis, allowRequest
};
