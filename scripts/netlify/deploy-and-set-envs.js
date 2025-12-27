#!/usr/bin/env node
// Script to set Netlify site env vars and trigger a production deploy using Netlify CLI
// This script is designed to run in CI where NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID are set

const { execSync } = require('child_process');

function run(cmd) {
  console.log('>', cmd);
  execSync(cmd, { stdio: 'inherit', env: process.env });
}

function main() {
  const site = process.env.NETLIFY_SITE_ID;
  if (!site) {
    console.error('NETLIFY_SITE_ID is required');
    process.exit(1);
  }

  // Set recommended env vars if present
  const envVars = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'REDIS_URL'];
  envVars.forEach(k => {
    if (process.env[k]) {
      run(`npx netlify env:set ${k} "${process.env[k]}" --site ${site}`);
    }
  });

  // Trigger a production deploy
  run(`npx netlify deploy --site ${site} --prod --dir . --message "Deploy from CI: set envs & deploy"`);
}

main();
