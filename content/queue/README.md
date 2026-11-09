# Dispatch queue

Each `.md` file here (other than this README) is one social post.
`scripts/dispatch-buffer.js` appends the CTAs from `../funnel.json` and sends it
to every channel in `BUFFER_CHANNEL_IDS`, once. `../dispatch-ledger.json` records
what has gone where, and the workflow commits it back.

```markdown
---
title: For your own reference; not posted
---
The post text, exactly as it should appear before the CTAs.
```

Mind the length: with all three CTAs appended a post is well over X's 280
characters, so X channels will reject it. Buffer reports that per channel and
the post stays pending.

Run `node scripts/dispatch-buffer.js --dry-run` to see the composed posts
without sending anything.
