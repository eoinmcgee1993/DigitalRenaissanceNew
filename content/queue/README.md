# Dispatch queue

Each `.md` file here (other than this README) is one post. The pipeline
appends the CTAs from `../funnel.json` and sends it, once each, to:

- every Buffer channel in `BUFFER_CHANNEL_IDS` (`scripts/dispatch-buffer.js`);
- your Gumroad audience as an email, with `title` as the subject
  (`scripts/publish-gumroad.js posts`). A post without a `title` is not emailed.

`../dispatch-ledger.json` records what has gone where, and the workflow commits
it back. With `DISPATCH_MODE` unset both are drafts; `queue` posts to Buffer's
queue and sends the Gumroad email straight away.

```markdown
---
title: The email subject on Gumroad (not part of the social post)
---
The post text, exactly as it should appear before the CTAs.
```

Mind the length: with all three CTAs appended a post is well over X's 280
characters, so X channels will reject it. Buffer reports that per channel and
the post stays pending.

Run `node scripts/dispatch-buffer.js --dry-run` to see the composed posts
without sending anything.
