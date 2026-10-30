# DegenDev Dispatch Engine

The complete v1 safe-mode implementation kit is stored in [degendev-dispatch-v1-complete-kit.zip](./degendev-dispatch-v1-complete-kit.zip).

## Local validation

Extract the archive, then run:

```bash
unzip degendev-dispatch-v1-complete-kit.zip
cd degendev-dispatch-v1
node --test
```

The source bundle includes the PostgreSQL schema, token/security helpers, GitHub issue validation, SMTP outcome classification, unit tests, operator documentation and two inactive n8n safe-mode workflow blueprints.

## Important

This is not a live dispatch service. Workflow A is proposal-only. Workflow B deliberately fails closed with HTTP 501 until the reviewer authentication, token verification, atomic database claim, stale-issue recheck, daily cap and SMTP reconciliation are implemented and tested in the target environment.

Do not activate the n8n workflows or apply the SQL to a production database without completing the supplied acceptance checklist. No live credentials are included.
