# Minimal Test Connector — Cognigy Knowledge Connector

A diagnostic Knowledge Connector that does the simplest thing possible: creates one Knowledge Source containing a single hard-coded chunk that says "Hello world from the minimal test connector." No external systems, no auth, no paging, no HTML stripping.

## Why use it

Use this connector to **isolate Knowledge Store environment issues** before debugging a real connector. If this connector runs end-to-end and the chunk shows up in your Knowledge Store, then:

- Your Cognigy.AI installation supports Knowledge Connectors at the version you're on.
- The Knowledge Store is wired up correctly.
- The schedule fired (or **Sync now** worked).
- The build/upload path is healthy.

If this connector *doesn't* run, the problem is in Cognigy itself or in the upload, not in your real connector's external integration.

## What it does

- Creates one Knowledge Source named whatever you set in **Source name** (default: `Minimal Test`).
- Adds one chunk with the text `Hello world from the minimal test connector. This is a single chunk.`
- Tags the source with `["test"]`.
- Uses a `contentHashOrTimestamp` of the SHA-256 of the chunk text — so re-runs are no-ops unless the text changes.
- On each run, deletes any other Knowledge Source previously created by this connector instance (cleaning up after a renamed `sourceName`).

## Build

```bash
npm install
npm run build
```

Produces `minimal-test-connector.tar.gz`. Requires a 64×64 `icon.png` in the project root.

## Install into Cognigy.AI

1. **Manage → Extensions → Upload Extension**, upload the `.tar.gz`.
2. **Build → Knowledge** → open or create a Knowledge Store.
3. **+ Add Knowledge** → pick **Minimal Test Connector** from the Type list.
4. Optionally edit **Source name**, save.
5. Wait for the schedule, or click **Sync now**. Within a few seconds you should see one Knowledge Source with one chunk.

## Configuration

| Field | Required | Default | Notes |
|---|---|---|---|
| Source name | ✅ | `Minimal Test` | Display name of the created Knowledge Source. Changing it on a re-run will rename via delete+recreate. |

No Cognigy Connection is required — there are no external credentials.

## Repo layout

```
minimal-test-connector/
├── README.md
├── icon.png                              (drop in before build)
├── package.json
├── tsconfig.json
└── src/
    ├── module.ts
    └── knowledgeConnectors/
        └── minimalConnector.ts           the entire connector — ~45 lines
```
