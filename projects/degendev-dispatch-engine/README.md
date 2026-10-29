# DegenDev Dispatch Engine v1.0

Safety-first proposal workflow for verified public GitHub issues.

## Safety invariants
- Proposal generation never sends email.
- Human approval is mandatory; an authenticated single-use token and atomic database claim are required before dispatch.
- GitHub issue freshness must be checked immediately before dispatch.
- A transactionally enforced daily cap starts at 5.
- Persist a stable Message-ID and dispatch attempt before SMTP begins.
- Ambiguous SMTP outcome after DATA may have started becomes dispatch_unknown and is never auto-retried.
- Approval-page GETs are read-only. Authenticated POST only; token digests, not raw tokens, are stored.
- Append-only proposal_events audit log.
- No unattended sending, no LinkedIn dispatch, no automatic retries.

## Contents
- sql/001_init.sql: Neon/PostgreSQL schema, audit trail, dispatch ledger and atomic claim helpers.
- src/security.mjs: HMAC token creation/verification and SHA-256 digest.
- src/issue-validation.mjs: canonical issue URL parsing and stale checks.
- src/smtp-outcome.mjs: SMTP outcome classification.
- tests/security.test.mjs: Node test suite.
- docs/OPERATIONS.md: integration and acceptance checklist.

## Status
Database schema is installed and verified in the dedicated Neon project `degendev-dispatch-engine` (AWS ap-southeast-1, PostgreSQL 17). Local unit tests pass. n8n, GitHub API credentials, reviewer identity provider, Apollo, reverse proxy and SMTP still require environment-specific credentials/configuration and live acceptance testing. Do not describe this as live email automation until those tests pass.

## Deployment
Apply SQL only to the dedicated project. Store secrets in n8n credentials or a secret manager. Never commit populated environment files. Use a test mail sink first. Legal basis, sender identification and opt-out wording must be reviewed and supplied by the operator.
