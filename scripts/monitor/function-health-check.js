#!/usr/bin/env node
// Fetch the Netlify site domain via Netlify API and call the function health endpoint.
// If repeated failures, notify via ALERT_WEBHOOK or create a GH issue.

const fetch = global.fetch || require('node-fetch');
const { Octokit } = require('@octokit/rest');

async function run() {
  const netlifyToken = process.env.NETLIFY_AUTH_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  const alertWebhook = process.env.ALERT_WEBHOOK;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!netlifyToken || !siteId) {
    console.log('NETLIFY_AUTH_TOKEN or NETLIFY_SITE_ID not set; skipping function health check');
    return;
  }

  try {
    const siteResp = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, { headers: { Authorization: `Bearer ${netlifyToken}` } });
    if (!siteResp.ok) throw new Error(`Netlify site lookup failed: ${siteResp.status}`);
    const site = await siteResp.json();
    const url = site.ssl_url || site.url;
    if (!url) throw new Error('Could not determine site URL');

    const fnUrl = `${url}/.netlify/functions/twitch?type=user&login=cannabisusers`;
    const r = await fetch(fnUrl, { method: 'GET' });
    if (!r.ok) {
      const body = await r.text();
      const msg = `Function health check failed: ${r.status} ${body}`;
      console.error(msg);
      await notify(msg);
      process.exit(1);
    }

    console.log('Function health OK');
  } catch (err) {
    const msg = `Function health check error: ${err.message}`;
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
      await octokit.issues.create({ owner, repo: name, title: 'Function health check failed', body: message });
    } else {
      console.warn('No ALERT_WEBHOOK or GITHUB_TOKEN available — cannot notify');
    }
  }
}

run();
