<!-- Thanks for the PR! Please fill in the sections below before requesting review. -->

## What this changes

<!-- One paragraph: what is the new connector / fix / improvement, and why is it useful? -->

## Type of change

- [ ] New connector (new folder)
- [ ] Bug fix in an existing connector
- [ ] Enhancement to an existing connector (new field, ingest improvement, performance fix)
- [ ] Documentation only

## Checklist

<!-- Tick all that apply. If a box doesn't apply (e.g. doc-only PR), strike it through with ~~text~~. -->

- [ ] My code follows the structure and conventions in [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] The folder has a `README.md` covering setup, Connection, Source fields, sync semantics, and troubleshooting
- [ ] `package.json` has `"license": "MIT"`
- [ ] No customer names (or other identifying info) in folder names, code, samples, or commit messages
- [ ] No secrets — no `.env`, API keys, passwords, OAuth client secrets, or hardcoded tokens
- [ ] `node_modules/` and build/dist folders are not committed
- [ ] An `icon.png` (64×64) is included in the folder root
- [ ] `upsertKnowledgeSource` uses a stable `externalIdentifier` and a meaningful `contentHashOrTimestamp`
- [ ] Delete reconciliation is implemented (sources that disappeared upstream get cleaned up)
- [ ] HTTP client retries on 429/503/504 with `Retry-After` honoured

## Tested against

<!-- e.g. "Cognigy.AI 2026.5, ServiceNow Vancouver, ~500 KB articles" -->

- Cognigy.AI version:
- Source-system version:
- Node version:
- Approximate dataset size tested:

## Related issues / context

<!-- Link any issues this closes, upstream API docs you referenced, etc. -->
