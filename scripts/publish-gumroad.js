#!/usr/bin/env node
// Publishes to Gumroad through the gumroad CLI (github.com/antiwork/gumroad-cli),
// the same tool the MCP connector wraps. Two jobs:
//
//   posts     Each post in content/queue/ becomes a Gumroad audience email
//             with the funnel CTAs appended. DISPATCH_MODE=draft (default)
//             leaves it as a draft to send from Gumroad; queue sends it to
//             the audience straight away. Recorded in content/dispatch-ledger.json
//             under "gumroad", so each post is emailed once.
//   products  Makes sure every product in content/products.json exists. A
//             missing one is created as an unpublished draft with no file:
//             this repository is public, so a product's file never goes in it.
//             Upload the file in Gumroad, then set "publish": true in the
//             manifest; that reviewed commit is the only thing that publishes.
//
// The $47 Blueprint is not handled here: it goes live through
// .github/workflows/publish-blueprint.yml, behind the four-gate check.
//
// Env: GUMROAD_ACCESS_TOKEN, GUMROAD_BIN (default "gumroad"),
// GUMROAD_EMAIL_AUDIENCE (default "followers"), DISPATCH_MODE.
// --dry-run prints what would happen and passes --dry-run to every CLI write.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const queueDir = path.join(root, 'content', 'queue');
const ledgerPath = path.join(root, 'content', 'dispatch-ledger.json');
const funnelPath = path.join(root, 'content', 'funnel.json');
const productsPath = path.join(root, 'content', 'products.json');
const LEDGER_KEY = 'gumroad';

const job = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const bin = process.env.GUMROAD_BIN || 'gumroad';
const mode = (process.env.DISPATCH_MODE || 'draft').trim();
const audience = (process.env.GUMROAD_EMAIL_AUDIENCE || 'followers').trim();

// Every call is non-interactive JSON. Errors carry the CLI's own message, which
// is about the request, not the token: the CLI never prints it.
function gumroad(args, { write = false } = {}) {
  const full = [...args, '--json', '--no-input', '--quiet'];
  if (write && dryRun) full.push('--dry-run');
  try {
    const out = execFileSync(bin, full, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim() ? JSON.parse(out) : {};
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim().split('\n').slice(-3).join(' ');
    throw new Error(`gumroad ${args.slice(0, 2).join(' ')} failed: ${detail}`);
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Plain text to email HTML: blank lines split paragraphs, single newlines become
// <br>, bare URLs become links. Escaped first, so nothing in a post is markup.
function toHtml(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((para) => {
      const html = escapeHtml(para.trim())
        .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`)
        .replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .join('\n');
}

function parsePost(raw) {
  const meta = {};
  let body = raw;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].trim();
    }
    body = m[2];
  }
  return { meta, body: body.trim() };
}

function posts() {
  if (!['draft', 'queue'].includes(mode)) throw new Error(`DISPATCH_MODE must be "draft" or "queue", got "${mode}".`);
  if (!['all', 'customers', 'followers'].includes(audience)) {
    throw new Error(`GUMROAD_EMAIL_AUDIENCE must be all, customers or followers, got "${audience}".`);
  }
  const tiers = JSON.parse(fs.readFileSync(funnelPath, 'utf8')).tiers;
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const files = fs.existsSync(queueDir)
    ? fs.readdirSync(queueDir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()
    : [];
  const pending = files.filter((f) => !(ledger[f] && ledger[f][LEDGER_KEY]));
  if (pending.length === 0) return console.log('[GUMROAD] No posts pending.');

  let failures = 0;
  for (const file of pending) {
    const { meta, body } = parsePost(fs.readFileSync(path.join(queueDir, file), 'utf8'));
    // An email needs a subject; a social post does not. A post with no title is
    // social-only, so it is skipped, not failed, and no subject is invented.
    if (!meta.title || !body) {
      console.log(`[GUMROAD] ${file}: no title, so not emailed (social only).`);
      continue;
    }
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gumroad-')), 'email.html');
    fs.writeFileSync(tmp, toHtml(`${body}\n\n${tiers.map((t) => t.text.trim()).join('\n')}`));
    const args = ['emails', 'create', '--subject', meta.title, '--body', tmp, '--audience', audience];
    if (mode === 'queue') args.push('--send', '--yes');
    try {
      const res = gumroad(args, { write: true });
      if (dryRun) {
        console.log(`[GUMROAD] ${file}: would create email "${meta.title}" (${mode}, ${audience}).`);
        continue;
      }
      const id = res.email && res.email.id;
      if (!id) throw new Error('no email id in the CLI response');
      ledger[file] = ledger[file] || {};
      ledger[file][LEDGER_KEY] = { emailId: id, mode, audience, at: new Date().toISOString() };
      fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
      console.log(`[GUMROAD] ${file}: email ${mode === 'queue' ? 'sent' : 'drafted'} (${id}).`);
    } catch (err) {
      failures++;
      console.error(`[GUMROAD] ${file}: ${err.message}`);
    }
  }
  if (failures) process.exitCode = 1;
}

function matchesSlug(p, slug) {
  return (
    p.custom_permalink === slug ||
    p.short_url === slug ||
    String(p.short_url || '').endsWith(`/l/${slug}`) ||
    String(p.url || '').endsWith(`/l/${slug}`)
  );
}

function products() {
  const manifest = JSON.parse(fs.readFileSync(productsPath, 'utf8')).products;
  const live = gumroad(['products', 'list', '--all']).products || [];

  let failures = 0;
  for (const item of manifest) {
    try {
      const matches = live.filter((p) => matchesSlug(p, item.permalink) && p.deleted !== true);
      if (matches.length > 1) throw new Error(`${matches.length} products use the permalink; fix that in Gumroad first.`);
      let product = matches[0];

      if (!product) {
        const args = [
          'products', 'create', '--draft',
          '--name', item.name,
          '--price', String(item.price),
          '--custom-permalink', item.permalink,
        ];
        if (item.pay_what_you_want) args.push('--pay-what-you-want');
        if (item.description) args.push('--description', item.description);
        if (item.summary) args.push('--custom-summary', item.summary);
        const res = gumroad(args, { write: true });
        if (dryRun) {
          console.log(`[GUMROAD] ${item.permalink}: would create a draft.`);
          continue;
        }
        product = res.product || res;
        // Never published in the run that created it: it has no file yet, and
        // "publish": true may have been set before the product existed.
        console.log(`[GUMROAD] ${item.permalink}: created as a draft (${product.id}). Upload its file in Gumroad.`);
        continue;
      }

      if (item.publish === true && product.published !== true) {
        gumroad(['products', 'publish', product.id], { write: true });
        console.log(`[GUMROAD] ${item.permalink}: ${dryRun ? 'would publish' : 'published'}.`);
      } else {
        console.log(`[GUMROAD] ${item.permalink}: ${product.published ? 'live' : 'draft'}, nothing to do.`);
      }
    } catch (err) {
      failures++;
      console.error(`[GUMROAD] ${item.permalink}: ${err.message}`);
    }
  }
  if (failures) process.exitCode = 1;
}

if (!['posts', 'products'].includes(job)) {
  console.error('Usage: node scripts/publish-gumroad.js <posts|products> [--dry-run]');
  process.exit(1);
}
if (!dryRun && !(process.env.GUMROAD_ACCESS_TOKEN || '').trim()) {
  // A warning, not a failure, matching the Buffer step: the workflow runs on every push.
  console.log('::warning::GUMROAD_ACCESS_TOKEN is not set; nothing published to Gumroad.');
  process.exit(0);
}
try {
  if (job === 'posts') posts();
  else products();
} catch (err) {
  console.error(`[GUMROAD] ${err.message}`);
  process.exit(1);
}
