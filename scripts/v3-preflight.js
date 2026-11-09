#!/usr/bin/env node
// Pre-flight check for the Vercel deploy.
//
// The site is plain HTML with no build step, so there is nothing to compile.
// What can break a deploy here is configuration and links, so that is what this
// checks: vercel.json serves the right folder, the main pages exist, every
// same-site link resolves to a file Vercel will serve, Netlify config has not
// come back, and the dispatch queue and funnel files parse.
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const errors = [];
const fail = (msg) => errors.push(msg);

// 1. vercel.json
let outDir = null;
try {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  outDir = path.join(root, config.outputDirectory || '');
  if (config.outputDirectory !== 'site') fail(`vercel.json outputDirectory is "${config.outputDirectory}", expected "site".`);
  // Netlify served /products from products.html on its own; Vercel only does so with cleanUrls.
  if (config.cleanUrls !== true) fail('vercel.json must set cleanUrls: true, or /products and /blog return 404.');
} catch (err) {
  fail(`vercel.json is missing or invalid: ${err.message}`);
}

// 2. Netlify must not come back: its config would silently take over any site linked to this repo.
for (const leftover of ['netlify.toml', 'netlify', '_redirects', 'site/_redirects']) {
  if (fs.existsSync(path.join(root, leftover))) fail(`Netlify leftover found: ${leftover}`);
}

// 3. Required pages and same-site links.
if (outDir && fs.existsSync(outDir)) {
  for (const page of ['index.html', 'products.html', 'blog.html']) {
    if (!fs.existsSync(path.join(outDir, page))) fail(`Missing page: site/${page}`);
  }

  const htmlFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) htmlFiles.push(full);
    }
  })(outDir);

  // How Vercel resolves a path with cleanUrls: the file itself, name.html, or name/index.html.
  const served = (p) => [p, `${p}.html`, path.join(p, 'index.html')].some((c) => fs.existsSync(c) && fs.statSync(c).isFile());

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    for (const [, ref] of html.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
      if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref) || ref.includes('${')) continue;
      const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
      if (!clean) continue;
      const target = clean.startsWith('/') ? path.join(outDir, clean) : path.join(path.dirname(file), clean);
      if (!served(target)) fail(`${path.relative(root, file)}: link "${ref}" does not resolve to a file in site/`);
    }
  }
} else {
  fail('Output directory site/ does not exist.');
}

// 4. Dispatch inputs must parse, so a bad edit fails the PR rather than the post run.
const funnelPath = path.join(root, 'content', 'funnel.json');
try {
  const funnel = JSON.parse(fs.readFileSync(funnelPath, 'utf8'));
  if (!Array.isArray(funnel.tiers) || funnel.tiers.length === 0) fail('content/funnel.json needs a non-empty "tiers" array.');
  for (const t of funnel.tiers || []) {
    if (!t.id || typeof t.text !== 'string' || !t.text.trim()) fail(`content/funnel.json: every tier needs an id and text (${JSON.stringify(t)}).`);
  }
} catch (err) {
  fail(`content/funnel.json is missing or invalid: ${err.message}`);
}
const productsPath = path.join(root, 'content', 'products.json');
try {
  const { products } = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
  if (!Array.isArray(products)) fail('content/products.json needs a "products" array.');
  for (const p of products || []) {
    if (!/^[a-z0-9-]+$/.test(p.permalink || '') || !p.name || !(Number(p.price) >= 0)) {
      fail(`content/products.json: every product needs a lowercase permalink, a name and a price (${JSON.stringify(p)}).`);
    }
  }
} catch (err) {
  fail(`content/products.json is missing or invalid: ${err.message}`);
}
const ledgerPath = path.join(root, 'content', 'dispatch-ledger.json');
try {
  JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
} catch (err) {
  fail(`content/dispatch-ledger.json is missing or invalid: ${err.message}`);
}

if (errors.length) {
  console.error('[V3 PRE-FLIGHT] FAILED');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('[V3 PRE-FLIGHT] Passed: vercel.json, pages, same-site links, no Netlify config, dispatch inputs.');
