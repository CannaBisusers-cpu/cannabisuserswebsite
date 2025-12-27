# cannabisuserswebsite

A lightweight static site with a Netlify serverless proxy for Twitch API calls.

## What I changed ✅
- Added `index.html` (single copy; previous client-side secrets removed).
- Added a Netlify serverless function at `netlify/functions/twitch.js` that proxies Twitch API requests server-side using env vars (prevents exposing tokens).
- Added `.env.example` and `netlify.toml`.

## Environment variables 🔒
Set these in your deployment platform (Netlify site settings, or in your local dev env when using `netlify dev`):

```
TWITCH_CLIENT_ID=your_twitch_client_id_here
TWITCH_OAUTH=Bearer your_oauth_token_here
```

**Important:** If you previously accidentally committed an OAuth token, rotate (revoke + reissue) it immediately.

## How it works ⚙️
- Client calls the serverless proxy at `/.netlify/functions/twitch` with `?type=user&login=...` or `?type=videos&user_id=...`/`?type=clips&broadcaster_id=...`.
- The function attaches server-side `TWITCH_CLIENT_ID` and an **App Access Token** (fetched via client credentials) or `TWITCH_OAUTH` header and forwards the request to the Twitch API.
- No tokens are stored in or served to the browser.

**New (recommended)**: If you set `TWITCH_CLIENT_SECRET` alongside `TWITCH_CLIENT_ID`, the function will automatically request an App Access Token from Twitch using the client credentials flow and cache/refresh it as needed. This avoids storing long-lived tokens in environment variables.

## Deployment notes 📦
- For Netlify: add the two env vars to Site settings -> Build & deploy -> Environment.
- Locally, use `netlify dev` (requires `netlify-cli`) and a `.env` file during development.

---

## CI & local safety checks 🔒
I added a repository secret scanner and test workflow to help prevent accidental token commits and to run tests automatically.

- Run the secret scanner locally:

```
npm ci
npm run scan-secrets
```

- Pre-commit hook (optional): the repo includes a Husky pre-commit file that runs `npm run scan-secrets && npm test`. To enable it locally run:

```
npm ci
npm run prepare
npx husky install
```

- GitHub Actions:
  - `.github/workflows/scan-secrets.yml` - runs `npm run scan-secrets` on push and PR
  - `.github/workflows/test.yml` - runs `npm test` on PRs

## Tests
Unit tests for the Netlify function are in `test/twitch.test.js` (Jest). Run:

```
npm ci
npm test
```

If you'd like, I can also add a caching layer backed by an external store (Redis) for more durable caching across cold starts, and add more advanced rate-limiting with Redis for global limits.

---

If you'd like, I can also:
- Add a small CI check to prevent commits containing `TWITCH_OAUTH` patterns.
- Implement caching for the function to reduce API calls and rate-limit risk.

