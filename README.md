# Digital Renaissance

The website at https://digital-renaissance.tech: plain HTML, no build step.

- `site/` is what gets published: `index.html`, `products.html` (`/products`),
  `blog.html` (`/blog`), plus `notes/` and `money-machine/`.
- `money-machine/` holds the tests and 3D-model build for the Money Machine
  page in `site/money-machine/`: `npm test` from inside that folder.
- `supabase/`, `CONTENT_OS.md` and `EDITORIAL_SYSTEM.md` are the content
  pipeline notes and schema.

## Deploying

Vercel serves the site: project `digital-renaissance-site` in the
`eoins-projects-99ff5888` team, linked to this repository. `vercel.json`
publishes `site/` with no build step and `cleanUrls` on, so `/products` serves
`products.html`. Every push to `main` deploys to production and every other
branch gets a preview. Netlify is no longer used; `scripts/v3-preflight.js`
fails if a `netlify.toml` comes back.

If the Git integration is unavailable, deploy from a checkout with the Vercel
CLI logged in: `npm run deploy:prebuilt`.

## V3 pipeline (`.github/workflows/v3-pipeline.yml`)

1. **Pre-flight** on every push and pull request: `node scripts/v3-preflight.js`
   checks `vercel.json`, the main pages, every same-site link, and that the
   dispatch files parse.
2. **Buffer dispatch** on `main` (push, every 6 hours, or by hand):
   `scripts/dispatch-buffer.js` takes each post in `content/queue/`, appends the
   CTAs from `content/funnel.json` and sends it to Buffer once per channel,
   recording it in `content/dispatch-ledger.json`.

| Setting | Where | What |
|---|---|---|
| `BUFFER_API_KEY` | repository secret | Key from publish.buffer.com/settings/api |
| `BUFFER_CHANNEL_IDS` | repository variable | Comma-separated Buffer channel ids |
| `DISPATCH_MODE` | repository variable | `draft` (default: Buffer drafts and Gumroad email drafts to approve) or `queue` (Buffer posts at the next queue slot and the Gumroad email is sent at once) |
| `GUMROAD_ACCESS_TOKEN` | repository secret | Already used by the launch gate |
| `GUMROAD_EMAIL_AUDIENCE` | repository variable | `followers` (default), `customers` or `all` |

Until the key and channels are set, dispatch logs a warning and sends nothing.
`node scripts/dispatch-buffer.js --dry-run` prints the composed posts.

### Gumroad

Gumroad is reached through the
[gumroad CLI](https://github.com/antiwork/gumroad-cli), the same tool its MCP
connector serves, pinned in the workflows.

- **Posts:** `scripts/publish-gumroad.js posts` emails each queued post (subject
  from its `title`) to your Gumroad audience, once.
- **Funnel products:** `scripts/publish-gumroad.js products` creates any product
  in `content/products.json` that Gumroad doesn't have yet, as an unpublished
  draft with no file. Upload the file in Gumroad (never into this public
  repository), then set `"publish": true` and merge; the next run publishes it.
- **$47 Blueprint:** run *Publish the Claude Operator Blueprint*
  (`.github/workflows/publish-blueprint.yml`) by hand and type `publish`. It
  runs the four gates with `PRE_PUBLISH=1`, publishes, runs all four gates, and
  unpublishes again if they fail.
