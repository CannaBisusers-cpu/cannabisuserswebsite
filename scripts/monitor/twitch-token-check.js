#!/usr/bin/env node
// Check Twitch client credentials by requesting an App Access Token.
// If check fails, create a GitHub Issue or POST to ALERT_WEBHOOK if provided.

const fetch = global.fetch || require('node-fetch');
const core = require('@actions/core');
const { Octokit } = require('@octokit/rest');

async function checkToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const alertWebhook = process.env.ALERT_WEBHOOK;
  const repo = process.env.GITHUB_REPOSITORY; // owner/repo

  if (!clientId || !clientSecret) {
    console.log('TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET not set; skipping token check');
    return;
  }

  const url = 'https://id.twitch.tv/oauth2/token';
  const body = `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;

  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json();
    if (!r.ok) {
      const msg = `Twitch token endpoint returned ${r.status}: ${JSON.stringify(j)}`;
      console.error(msg);
      await notify(msg);
      process.exit(1);
    }

    // success: check expires_in
    const expires = j.expires_in || 0;
    console.log(`Token fetched successfully; expires_in=${expires}s`);
    // if expires very short, warn
    if (expires < 3600) {
      const msg = `Token short-lived: expires_in=${expires}s`; console.warn(msg); await notify(msg);
    }
  } catch (err) {
    const msg = `Error checking Twitch token: ${err.message}`;
    console.error(msg);
    await notify(msg);
    process.exit(1);
  }

  async function notify(message) {
    if (alertWebhook) {
      try { await fetch(alertWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: message }) }); } catch (e) { console.error('Webhook notify failed', e.message); }
    } else if (process.env.GITHUB_TOKEN && repo) {
      const [owner, name] = repo.split('/');
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      await octokit.issues.create({ owner, repo: name, title: 'Twitch token check failed', body: message });
    } else {
      console.warn('No ALERT_WEBHOOK or GITHUB_TOKEN available — cannot notify');
    }
  }
}

checkToken();
