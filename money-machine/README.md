# Money Machine

A slot machine for business ideas, published with the Digital Renaissance site
at `/money-machine/`. Every spin lands a weird but commercially plausible
opportunity with a customer, an offer, an MVP, a first-customer tactic and a
Reality Scorecard. MAKE IT REAL turns it into a 12-part execution blueprint.

```
SPIN → DISCOVER → MUTATE → BUILD → CASH
```

The slot machine is the front door, not the product. The product is the
blueprint, and the engine behind it is built to be swapped for AI generation
later without touching the page.

## Where things live

| Path | What it is |
|---|---|
| `../site/money-machine/index.html` | Page, CSS, reveal overlay. No build step. |
| `../site/money-machine/app.js` | Controller: modes, spin flow, reveal, vault, share, export, sound. |
| `../site/money-machine/engine.js` | Pure idea engine: spin, mutations, scorecard, blueprint, codes. No DOM. |
| `../site/money-machine/banks.js` | Everything the machine can say: modes, niches, formats, stolen models. |
| `../site/money-machine/stage3d.js` | three.js stage: loads the model, paints reels, runs the choreography. |
| `../site/money-machine/money-machine.glb` | The rigged slot machine (built by `build-glb.js`). |
| `engine.test.js` | Node's built-in test suite for the engine and banks. |
| `tests/money-machine.spec.ts` | Playwright browser smoke tests for the published page. |
| `playwright.config.ts` | Local static server and Chromium test configuration. |
| `build-glb.js` | Builds the GLB from parts with three.js + GLTFExporter. |

The root `site/` directory is the published website. Keep the Money Machine
source and tests in their existing locations; the browser test server serves
`site/` without adding a build step.

## Tests

The project keeps two small layers of automated coverage:

- **Unit tests:** Node's built-in test runner exercises the pure idea engine,
  all base ideas, operation variants, code decoding and blueprint output.
- **Browser tests:** Playwright opens the real page over HTTP and checks the
  initial interface, a complete spin, the five-row Reality Scorecard, all 12
  blueprint sections, vault persistence and mode selection.

Browser tests deliberately disable WebGL so CI exercises the supported CSS
reel fallback. This avoids making the test suite depend on a GPU, a 3D model
CDN or a specific runner's graphics support. The production page still tries
the 3D stage first and falls back when it cannot initialise.

### Run locally

From this directory:

```bash
npm install
npx playwright install chromium

# Existing unit suite
npm test

# Browser suite
npm run test:e2e

# Both suites
npm run test:all

# Watch the browser
npm run test:e2e:headed

# Playwright's interactive runner
npm run test:e2e:ui
```

The Playwright config starts a local Python HTTP server for `../site` on
`http://127.0.0.1:4173`, then opens `/money-machine/`. Python 3 is required
for the test server. ES modules are served over HTTP because they do not load
reliably from `file://`.

GitHub Actions runs both suites on pushes and pull requests that touch the
Money Machine source, tests or workflow. The HTML Playwright report and failure
artifacts are retained for 14 days.

## How an idea is made

An idea is a small set of **genes**: mode, niche, pain, format (or stolen
model), name variant, sub-niche, market, trigger, pricing variant, lean level,
degen level, generation and an RNG seed. Everything on screen (card, scorecard,
blueprint, markdown, vault text) is derived from the genes, so a share link or
vault entry stores only the code.

Codes hold ids and list positions, so **treat the banks as append-only**.
Renaming an id or reordering a `sub`, `when` or `GEOS` list changes what old
links open. A code that no longer decodes shows as "retired" in the vault export.

## What plugs in next

The seams are deliberate; none of these exist yet.

- **AI generation:** replace or enrich `blueprint(genes)` with a call that
  takes the same genes and returns the same 12 sections. `engine.js` has no
  DOM, so it can run inside a serverless function.
- **Accounts and a synced vault:** the vault is `localStorage` behind
  `store.get/set` in `app.js`; point those two at an API.
- **Paid credits, Gumroad/Stripe:** gate `openBlueprint()` or AI calls; the
  vault export already carries the Gumroad link.
- **Affiliate offers:** each format's `stack` lists the tools a buyer would
  sign up for; that's where affiliate links attach.
