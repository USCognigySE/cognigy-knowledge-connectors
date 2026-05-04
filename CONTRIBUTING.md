# Contributing

Thanks for considering a contribution. This repo is a personal collection of Cognigy.AI Knowledge Connectors, but PRs from other SEs and the wider community are welcome — especially for connectors that integrate knowledge sources Cognigy hasn't published officially.

## Workflow (Fork + Pull Request)

1. **Fork** this repo via the **Fork** button at the top of the [repo page](https://github.com/USCognigySE/cognigy-knowledge-connectors).
2. **Clone your fork** locally and create a feature branch:
   ```bash
   git clone https://github.com/<your-handle>/cognigy-knowledge-connectors.git
   cd cognigy-knowledge-connectors
   git checkout -b feature/<your-connector-name>
   ```
   For bug fixes against an existing connector, use `bug/<connector-name>-<short-desc>` instead.
3. **Make your changes** following the standards below.
4. **Commit and push** to your fork:
   ```bash
   git add <files>
   git commit -m "Add <Connector>: <one-line summary>"
   git push -u origin feature/<your-connector-name>
   ```
5. **Open a Pull Request** back to `USCognigySE/cognigy-knowledge-connectors:main`. The PR template will prompt you to confirm the checklist.
6. Address review comments. Once approved, your branch is merged into `main`.

If you're contributing something experimental and want feedback before doing the full polish pass, mark the PR as **Draft** — it's clear you're not asking for a final review yet.

## Standards

### Folder layout

Each connector lives in **its own folder at the repo root**, named for the source system (e.g. `freshdesk-knowledge/`, `service-now-knowledge/`, `microsoft-sharepoint-knowledge/`). Inside the folder:

```
<connector-name>/
├── README.md                          required — see below
├── package.json                       with "license": "MIT"
├── tsconfig.json
├── icon.png                           64×64 PNG, used as the connector icon
├── src/
│   ├── module.ts                      exports the extension
│   ├── connections/                   one file per Connection type
│   ├── knowledgeConnectors/           one file per Connector
│   └── lib/                           HTTP client, auth, chunker, extractors
└── <connector>.tar.gz                 the built package, checked in for convenience
```

### README requirements

The folder README must cover:

- **Title** (`# <Name> — Cognigy Knowledge Connector`)
- **One-paragraph description** of what gets ingested and on what schedule
- **What it ingests** section — content types, what's filtered in/out, what's not in v1
- **Third-party setup** (one-time) — how to create the API credentials/app registration on the source system
- **Build** instructions
- **Install into Cognigy.AI** steps
- **Configuration** tables — Connection fields and per-instance Knowledge Source fields
- **Sync semantics** — how upsert/delete reconciliation works, what `externalIdentifier` and `contentHashOrTimestamp` are set to
- **Troubleshooting** — common 401/403/404 cases and what to check

Look at [`freshdesk-knowledge/README.md`](./freshdesk-knowledge/README.md) or [`service-now-knowledge/README.md`](./service-now-knowledge/README.md) as templates.

### Code

- TypeScript, targeting `@cognigy/extension-tools`. Match the version used by the other connectors in the repo (currently `^0.17.0`).
- No `var` declarations. Prefer `const`; `let` only when reassignment is genuinely needed.
- No hardcoded credentials, instance URLs, or customer-specific identifiers in the source. Everything tenant-specific goes through Connection fields or Knowledge Source fields.
- Use `api.upsertKnowledgeSource` with a stable `externalIdentifier` and a meaningful `contentHashOrTimestamp` so re-syncs are cheap and idempotent.
- After the upsert loop, reconcile deletes — call `api.deleteKnowledgeSource` for any previously-created source whose identifier is no longer present at the upstream system.
- HTTP clients should retry on 429/503/504 with `Retry-After` honoured. 5 attempts with exponential backoff is the convention used elsewhere in the repo.
- HTML body extraction uses `html-to-text` with `a` ignored and `img/script/style` skipped — keep the chunker output paragraph-aware and ~1,200 chars with overlap.

### What NOT to commit

- **No customer names** anywhere — folder names, file names, sample data, commit messages, READMEs. If you're working on a customer-specific variant, keep it in a private fork.
- **No secrets** — `.env` files, API keys, OAuth client secrets, passwords. The repo `.gitignore` blocks `.env` patterns; double-check before pushing.
- **No `node_modules/`** (already gitignored).
- **No build artifacts other than the `.tar.gz`**. `dist/` and `build/` folders should not be committed; the `.tar.gz` is the only built output that lives in version control.

## Reporting bugs / requesting features

[Open an issue](https://github.com/USCognigySE/cognigy-knowledge-connectors/issues/new). Include the connector name, Cognigy.AI version, source-system version, what you expected, and what happened. For feature requests, link to the relevant Cognigy docs or upstream API docs you're targeting.

## License

By contributing, you agree your contribution is licensed under the [MIT License](./LICENSE) — same as the rest of the repo.
