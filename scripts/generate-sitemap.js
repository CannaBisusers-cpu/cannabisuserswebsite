const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE_URL || process.env.NETLIFY_SITE_URL || 'https://cannabisusers.netlify.app';
const pages = [
  '/',
];

const urls = pages.map(p => `  <url>\n    <loc>${SITE.replace(/\/$/, '')}${p}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

const out = path.join(process.cwd(), 'public');
if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'sitemap.xml'), sitemap, 'utf8');
console.log('sitemap written to public/sitemap.xml');
