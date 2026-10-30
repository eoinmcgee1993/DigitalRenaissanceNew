# Digital Renaissance Operations

This repository now contains two separate operational components:

- **Ops Suite dashboard:** served from `/ops-suite/`. It is a UI prototype. ROI, latency and agent activity are simulated and must not be treated as live business metrics.
- **DegenDev Dispatch Engine:** the supplied safe-mode implementation kit is stored at `degendev-dispatch/degendev-dispatch-v1-complete-kit.zip`, with extraction and validation instructions in `degendev-dispatch/README.md`. Review the bundled environment guide and operations checklist before importing workflows or applying SQL.

## Safety boundary

No outbound email is enabled by this repository change. Keep the intake workflow in proposal-only mode. The review workflow must remain disabled until authenticated reviewer identity, token validation, database transactions, single-use approval, suppression checks and concurrency-safe daily limits have been verified in the target n8n instance.

Do not add secrets, SMTP credentials, live database URLs, private keys or production tokens to Git. Use the target platform's secret manager.

## Ops Suite tests

From `ops-suite/`:

```bash
npm install
npx playwright install chromium
npm test
```

The Playwright web server serves the existing `site/` directory on port 3000 and tests `/ops-suite/`.

## Dispatch kit

The supplied Complete Kit contains safe-mode n8n workflow exports, SQL schema, security helpers and tests. Import and validate against the target n8n version before use. Apply SQL only to a dedicated database after review. The workflow JSON is a blueprint, not a live deployment.
