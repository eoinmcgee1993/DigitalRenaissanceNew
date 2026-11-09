#!/usr/bin/env node
// Sends each post in content/queue/ to Buffer once, with the funnel CTAs from
// content/funnel.json appended in file order.
//
// Modes (DISPATCH_MODE):
//   draft (default) - creates Buffer drafts. Nothing goes public until someone
//                     approves it in Buffer.
//   queue           - adds the post to each channel's Buffer queue, so it goes
//                     out at the next queue slot with no further approval.
//
// Every successful send is written to content/dispatch-ledger.json straight
// away, keyed by queue file and channel. A file already in the ledger for a
// channel is never sent to that channel again, so re-runs, the 6-hourly
// schedule and partial failures cannot double-post. The ledger is written per
// post, not at the end, so a crash halfway through keeps what already went out.
//
// Env: BUFFER_API_KEY (publish.buffer.com/settings/api), BUFFER_CHANNEL_IDS
// (comma-separated channel ids), DISPATCH_MODE. Pass --dry-run to print the
// composed posts without calling Buffer or touching the ledger.
//
// API: Buffer's GraphQL API at https://api.buffer.com, createPost mutation,
// per developers.buffer.com as read on 9 Nov 2026.
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const queueDir = path.join(root, 'content', 'queue');
const funnelPath = path.join(root, 'content', 'funnel.json');
const ledgerPath = path.join(root, 'content', 'dispatch-ledger.json');
const API_URL = 'https://api.buffer.com';

const dryRun = process.argv.includes('--dry-run');
const mode = (process.env.DISPATCH_MODE || 'draft').trim();
if (!['draft', 'queue'].includes(mode)) {
  console.error(`[DISPATCH] DISPATCH_MODE must be "draft" or "queue", got "${mode}".`);
  process.exit(1);
}

// Minimal front matter: "key: value" lines between two "---" lines. The body is the post text.
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

function withCtas(body, tiers) {
  return `${body}\n\n${tiers.map((t) => t.text.trim()).join('\n')}`;
}

async function createPost(apiKey, input) {
  const query = `mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { id } }
      ... on MutationError { message }
    }
  }`;
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables: { input } }),
  });
  if (res.status === 429) {
    throw new Error(`Buffer rate limit hit; retry after ${res.headers.get('retry-after') || '?'}s. The next run picks up where this stopped.`);
  }
  // The body is not logged: on an auth failure it can echo request details.
  if (!res.ok) throw new Error(`Buffer returned HTTP ${res.status}.`);
  const json = await res.json();
  if (json.errors && json.errors.length) throw new Error(`Buffer GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
  const result = json.data && json.data.createPost;
  if (result && result.post && result.post.id) return result.post.id;
  throw new Error(`Buffer refused the post: ${(result && result.message) || 'unexpected response shape'}`);
}

async function main() {
  const tiers = JSON.parse(fs.readFileSync(funnelPath, 'utf8')).tiers;
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const files = fs.existsSync(queueDir)
    ? fs.readdirSync(queueDir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()
    : [];

  const channels = (process.env.BUFFER_CHANNEL_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const apiKey = (process.env.BUFFER_API_KEY || '').trim();

  if (dryRun) {
    for (const file of files) {
      const { body } = parsePost(fs.readFileSync(path.join(queueDir, file), 'utf8'));
      console.log(`----- ${file} (${mode}) -----\n${withCtas(body, tiers)}\n`);
    }
    console.log(`[DISPATCH] Dry run: ${files.length} queue file(s), nothing sent.`);
    return;
  }

  const pending = files.filter((f) => channels.length === 0 || channels.some((c) => !(ledger[f] && ledger[f][c])));
  if (pending.length === 0) {
    console.log('[DISPATCH] Nothing pending.');
    return;
  }
  if (!apiKey || channels.length === 0) {
    // A warning, not a failure: the workflow runs on every push, and Buffer may not be set up yet.
    console.log(`::warning::${pending.length} queued post(s) not sent: BUFFER_API_KEY and BUFFER_CHANNEL_IDS must both be set.`);
    return;
  }

  console.log(`[DISPATCH] Mode: ${mode}. ${pending.length} file(s), ${channels.length} channel(s).`);
  let failures = 0;
  for (const file of pending) {
    const { body } = parsePost(fs.readFileSync(path.join(queueDir, file), 'utf8'));
    if (!body) {
      console.error(`[DISPATCH] ${file}: empty post body, skipped.`);
      failures++;
      continue;
    }
    const text = withCtas(body, tiers);
    for (const channelId of channels) {
      if (ledger[file] && ledger[file][channelId]) continue;
      try {
        const postId = await createPost(apiKey, {
          text,
          channelId,
          schedulingType: 'automatic',
          mode: 'addToQueue',
          saveToDraft: mode === 'draft',
        });
        ledger[file] = ledger[file] || {};
        ledger[file][channelId] = { postId, mode, at: new Date().toISOString() };
        fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
        console.log(`[DISPATCH] ${file} -> ${channelId}: ${mode === 'draft' ? 'draft' : 'queued'} (${postId})`);
      } catch (err) {
        failures++;
        console.error(`[DISPATCH] ${file} -> ${channelId}: ${err.message}`);
        if (/rate limit/i.test(err.message)) {
          process.exitCode = 1;
          return;
        }
      }
    }
  }
  if (failures) {
    console.error(`[DISPATCH] ${failures} send(s) failed; they stay pending for the next run.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[DISPATCH] ${err.message}`);
  process.exit(1);
});
