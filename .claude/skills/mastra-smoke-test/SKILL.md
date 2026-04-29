---
name: mastra-smoke-test
description: Smoke test Mastra projects locally or deploy to staging/production. Tests Studio UI, agents, tools, workflows, traces, memory, and more. Supports both local development and cloud deployments.
---

# Mastra Smoke Test

Comprehensive smoke testing for Mastra projects.

## Alpha Release Readiness

Before release smoke testing, confirm there is an alpha package release available to test. Do not create the smoke-test project until the alpha publish workflow has completed and the intended packages are installable.

### 1. Find the versioning PR

Prefer the standard Changesets release branch:

```bash
gh pr view changeset-release/main \
  --json number,title,state,url,headRefName,baseRefName,isDraft,mergeable,reviewDecision,updatedAt,mergedAt,mergeCommit
```

Expected shape:

```text
title: chore: version packages (alpha)
head: changeset-release/main
base: main
```

If that branch lookup fails, search open and recently merged PRs:

```bash
gh pr list --state open --search 'version packages alpha in:title' --limit 20
gh pr list --state merged --search 'version packages alpha in:title' --limit 20
```

After identifying the versioning PR, offer to open it in the user's browser using the GitHub CLI when helpful:

```bash
gh pr view <pr-number> --web
```

Use `gh pr view --web` instead of browser automation when the user asks to open the PR, because it opens the page in the user's normal browser/session.

### 2. If the versioning PR is open

The user must review, approve, and merge the versioning PR. The agent may check readiness and advise, but should not merge the PR without explicit user instruction.

Check readiness:

```bash
gh pr view <pr-number> --json number,title,isDraft,mergeable,reviewDecision,url
gh pr checks <pr-number> --watch=false
```

If checks are still running, wait:

```bash
gh pr checks <pr-number> --watch --interval 30
```

Before telling the user it is ready to merge, spot check the versioning diff yourself and advise the user to spot check it too. Prefer the helper script:

```bash
.claude/skills/mastra-smoke-test/scripts/check-versioning-pr.sh <pr-number> --workspace "$SMOKE_DIR"
```

Or inspect manually:

```bash
gh pr diff <pr-number> --name-only
gh pr diff <pr-number> -- package.json '**/package.json' '.changeset/**'
```

Check:

- package versions look intentional
- there are no unintended major version bumps or breaking-change releases
- changelog entries match the PRs expected in the alpha
- CI is green and the PR is not a draft

Summarize your spot-check findings for the user before they approve/merge.

If the PR is ready, tell the user to approve and merge it in GitHub, or ask whether they want you to merge it. If branch protection rejects the merge because review is required, stop and ask for the required approval.

### 3. If the versioning PR is already merged

Do not recreate or re-merge it. Confirm it merged into `main`, then continue directly to the alpha publish workflow.

```bash
gh pr view changeset-release/main \
  --json number,title,state,mergedAt,mergeCommit,url
```

If the branch no longer resolves, search recently merged versioning PRs:

```bash
gh pr list \
  --state merged \
  --limit 20 \
  --search 'version packages alpha in:title'
```

Treat the merge commit on `main` as the release source.

### 4. Confirm or run the alpha publish workflow

Merging the alpha versioning PR to `main` should automatically kick off the `Publish to npm` workflow on a `push` event. Check for that run first; do not manually trigger a duplicate publish if the automatic run is already in progress.

```bash
gh run list --workflow "Publish to npm" --branch main --limit 5
```

Inspect the newest run. The alpha path should be the `prerelease` job, with `snapshot`, `stable`, and `enter_prerelease` skipped:

```bash
gh run view <run-id> --json name,event,status,conclusion,workflowName,headBranch,headSha,jobs,url --jq .
```

Watch it:

```bash
gh run watch <run-id>
```

Offer to open the prerelease run in the user's browser when helpful:

```bash
gh run view <run-id> --web
```

Use `gh run view --web` instead of browser automation when the user asks to open the run, because it opens the page in the user's normal browser/session.

Only if no automatic publish run started after the merge should you inspect workflows and ask the user before manually triggering one:

```bash
gh workflow list
gh workflow view "Publish to npm"
gh workflow run "Publish to npm" --ref main
```

### 5. Confirm alpha is published

Before smoke testing, confirm the alpha package is installable:

```bash
npm view @mastra/core@alpha version
```

Only then create the smoke-test project with the alpha tag/version.

## Stable Release Smoke

After the stable/full release publishes, run smoke again against the published stable packages. Do not rely on alpha smoke as final stable-release signoff because the stable publish path, npm dist-tags, generated project install path, and package versions are distinct release surfaces.

### 1. Confirm the stable publish workflow completed

Inspect the full release run. The stable path should complete successfully, with snapshot/prerelease jobs skipped when this is a normal full release.

```bash
gh run view <run-id> --json name,event,status,conclusion,workflowName,headBranch,headSha,jobs,url --jq .
gh run watch <run-id>
```

If the run fails or is cancelled, stop and report the failed job/step before creating a fresh smoke project.

#### Recovery from partial stable publish

If the stable publish fails after some packages published, treat it as a partial release and do not create a new versioning PR or bump versions. First identify the failed step and whether npm `latest` is split across old and new versions.

Common recovery flow:

1. Record which packages already reached npm `latest` and which are still old.
2. Rerun the same stable `Publish to npm` workflow from the same release commit on `main`.
3. After the rerun succeeds, verify all intended package versions are on npm `latest`.
4. Verify release git tags were created after the successful publish.
5. Only then run final stable smoke against `create-mastra@latest`.

The `Add tags` step runs after publish:

```bash
pnpm changeset-cli tag
git push origin --tags
```

It creates and pushes git tags only for packages Changesets considers part of the current release/version bump, not every package in the monorepo. The tags look like `@mastra/core@1.29.0`, `mastra@1.7.0`, and `create-mastra@1.7.0`. If the first publish attempt fails before `Add tags`, the rerun should create tags for the full changed-package release set after npm publish completes.

Verify changed-package tags, not every workspace package:

```bash
git fetch --tags
# Spot-check release-critical tags
git tag -l '@mastra/core@<version>'
git tag -l 'mastra@<version>'
git tag -l 'create-mastra@<version>'
git tag -l '@mastra/server@<version>'
git tag -l '@mastra/playground-ui@<version>'
```

If a package version is on npm `latest` but its expected release tag is missing after a successful rerun, stop and report it before smoke testing.

### 2. Confirm stable packages are installable

Check the published `latest` versions and make sure they match the intended stable release versions:

```bash
npm view @mastra/core@latest version
npm view mastra@latest version
npm view create-mastra@latest version
```

If npm returns the previous stable version, wait for publish/registry propagation and retry. Do not run final stable smoke against stale `latest` packages.

### 3. Create a fresh stable smoke project

Use the same dated workspace, but create a separate project from the alpha project so dependency resolution and generated files prove the stable release path independently.

```bash
SMOKE_DATE=$(date +%F)
SMOKE_DIR="$HOME/mastra-smoke-tests/$SMOKE_DATE"
mkdir -p "$SMOKE_DIR/logs"

cd "$SMOKE_DIR"
pnpm create mastra@latest stable-smoke-project -c agents,tools,workflows,scorers -l openai -e
cd stable-smoke-project
pnpm run dev
```

If an existing dev server is holding port `4111` or a DuckDB lock, stop that process before starting the stable project. Do not run alpha and stable smoke projects against the same generated project directory or storage file.

### 4. Rerun the required smoke coverage

For stable release signoff, rerun at least:

- mandatory local checklist: setup, agents, tools, workflows, traces, scorers, memory, MCP, errors
- Local Studio browser smoke: shell/version, agent chat, tool execution, workflow run, traces, scorers, MCP
- targeted release-scope checks identified from the PR categorization, especially any checks added because the generated project does not cover changed features

Append stable results to the dated `smoke-report.md` in a separate section from alpha results and clearly record the package versions tested.

## Release Smoke Scope Discovery

For release smoke testing, first create a dated workspace, determine what changed since the last release, then use that to add targeted checks on top of the mandatory checklist.

### 0. Create a dated smoke-test workspace

Keep all release smoke-test artifacts together in a date-stamped folder. Put the PR export, scope notes, logs, and generated Mastra project in this folder.

If the smoke-test workspace is outside the repo and your filesystem tool cannot read/write it, request access to the parent directory first (for example `~/mastra-smoke-tests`) instead of retrying failed file operations.

```bash
SMOKE_DATE=$(date +%F)
SMOKE_DIR="$HOME/mastra-smoke-tests/$SMOKE_DATE"
mkdir -p "$SMOKE_DIR"
```

Use this layout:

```text
~/mastra-smoke-tests/YYYY-MM-DD/
  merged-prs.tsv
  smoke-scope.md
  smoke-project/        # generated Mastra app for runtime smoke testing
  logs/                 # optional command output, curl responses, screenshots, etc.
```

The helper script automates workspace creation, release metadata capture, PR export, previous TSV backup, and a `smoke-scope.md` stub:

```bash
.claude/skills/mastra-smoke-test/scripts/discover-release-scope.sh --release-tag '@mastra/core@1.28.0'
```

Use the manual commands below when you need custom paging/date windows or want to inspect each step directly.

### 1. Identify the last release baseline

Prefer GitHub releases because release tags can be created before the release is published:

```bash
gh release list --limit 20
```

Pick the most recent production release tag (usually `@mastra/core@x.y.z`). Then inspect it:

```bash
RELEASE_TAG='@mastra/core@1.28.0'
gh release view "$RELEASE_TAG" --json tagName,name,createdAt,publishedAt,targetCommitish,url --jq .
git show -s --format='%H%n%ci%n%D%n%s' "$RELEASE_TAG"
```

Use the release `createdAt` timestamp as the default cutoff. If the release was created long before publishing and the user specifically asks for "since it went live," use `publishedAt` instead and state that assumption.

### 2. List merged PRs since the cutoff

Exclude Dependabot, sort oldest-to-newest, and keep PR number, author, title, labels, and merge time:

```bash
CUTOFF='2026-04-24T08:53:08Z'

gh pr list \
  --state merged \
  --limit 200 \
  --search "merged:>=$CUTOFF -author:app/dependabot" \
  --json number,title,author,mergedAt,labels \
  --jq '. | sort_by(.mergedAt) | .[] | [.mergedAt, ("#"+(.number|tostring)), .author.login, .title, (([.labels[].name] | join(",")))] | @tsv' \
  > "$SMOKE_DIR/merged-prs.tsv"
```

If there may be more than 200 PRs, page or narrow by date ranges; do not silently truncate the release scope. Append every page/date range to `$SMOKE_DIR/merged-prs.tsv`. The helper script warns when the export reaches its `--limit` value.

For ambiguous PRs, inspect changed files before categorizing:

```bash
gh pr view <pr-number> --json number,title,files --jq '{number,title,files:[.files[].path]}'
```

Optional cross-check against first-parent history:

```bash
git log --first-parent --reverse --pretty=format:'%h%x09%ci%x09%s' "$RELEASE_TAG"..main
```

### 3. Categorize the PRs

Group every non-Dependabot merged PR into these buckets. A PR may belong to multiple buckets if needed.

| Category                                 | Match by title/files                                                                         | Smoke implication                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Core agent loop / processors / streaming | `packages/core/src/agent`, `loop`, `processors`, streaming, tripwire, model output           | Agents, tools, errors, traces, `/generate`, `/stream`, targeted processor behavior    |
| Tools                                    | tool execution, `ToolCallFilter`, dynamic tools, approval                                    | Tools page/API, agent tool calls, approval edge cases                                 |
| Workflows / background tasks             | `workflows`, background task progress, `start-async`, datasets/experiments                   | Workflows page/API, traces, long-running/progress behavior                            |
| Memory                                   | `memory`, threads, resourceId, recall, working/observational memory                          | Memory two-call persistence, thread/resource isolation                                |
| Server / adapters / API routes           | `packages/server`, `server-adapters`, Hono/Fastify/Express/Koa, custom routes, `/api` prefix | Local API smoke, deployed server smoke, custom route and 404/error checks             |
| CLI / create-mastra / deploy             | `create-mastra`, `packages/cli`, deploy, generated project setup                             | Fresh project creation, install, dev start, deploy flow                               |
| Studio / Playground / Observability UI   | `packages/playground`, `packages/playground-ui`, traces/logs/metrics UI, theme               | Browser Studio smoke, observability/logs/metrics pages, visual regressions            |
| Agent Builder / auth / permissions       | agent builder, stored agents/skills, visibility, ownership, auth/session, avatars            | Authenticated cloud Studio smoke, permissions/share/publish/avatar flows              |
| MCP / A2A                                | `packages/mcp`, MCP server/client, A2A                                                       | MCP page/API, targeted MCP/A2A integration check                                      |
| Storage / providers                      | stores, Redis, S3, Azure, Blob, MSSQL, Chroma, schema/migrations, package contents            | Package import/build smoke; targeted provider check with real service when available  |
| Mastra Code / TUI                        | `mastracode`, TUI, model packs, subagents, evals                                             | Mastra Code-specific smoke, not standard app smoke                                    |
| Docs/examples/content-only               | docs, examples, videos, guide-only changes                                                   | Docs build/link check; app smoke only if example code changed                         |

### 4. Convert categories into a smoke plan

Use full smoke as the baseline, but do **not** stop at the default generated-project happy path. The goal is to prove the **actual changed feature or bug fix** works in the published package, not just that a nearby happy path still works.

For every material PR, ask:

1. What user-visible behavior, API behavior, persistence behavior, or integration path changed?
2. Does the generated smoke project execute that exact path?
3. If not, what is the smallest targeted check that proves the changed behavior?
4. What evidence will show the fix worked, not merely that the app did not crash?

If the default project does not exercise the changed feature, add a targeted check or explicitly record why it cannot be tested in this environment.

- **Always for release:** setup, agents, tools, workflows, traces, scorers, memory, MCP, errors.
- **If CLI/create-mastra changed:** create a brand-new project at `$SMOKE_DIR/smoke-project` with the release tag and run `pnpm run dev`.
- **If server/adapters/API changed:** add curl checks for `/health`, `/api/agents`, `/generate`, `/stream` if applicable, tool execute, workflow start, custom routes, and invalid routes. If route prefixing changed, add or use a custom route and verify built-in `/api/*` routes remain reserved.
- **If agent streaming changed:** test `/stream`, `resume-stream`, `streamUntilIdle`, abort/length/error behavior, or another endpoint that actually uses the changed streaming path.
- **If tools changed:** test the exact changed tool behavior, such as dynamic tools, approval functions, `requireApproval`, programmatic tool calls, or preserved args. A single static weather tool call is not enough for dynamic/approval/tool-merge changes.
- **If workflows changed:** test the exact changed behavior, such as suspend/resume, background task progress, long-running runs, dataset/experiment workflows, or `start-async` output shape.
- **If memory changed:** test thread/resource isolation plus the changed memory mode, such as current-thread recall defaults, observational memory boundaries, or agent network incompatibility. A basic two-call memory check is necessary but may not be sufficient. If the change only affects memory under a specific storage backend, configure the smoke project to use that backend; do not count the default LibSQL/in-memory project as coverage.
- **If memory storage migrations changed:** run an end-to-end migration smoke against the affected backend. Start the real service locally when feasible (for example Postgres in Docker), configure the generated project to use the released storage package, create or modify schema to mimic the pre-fix state, restart the Mastra server so auto-init/migration runs, then verify the missing column/table/index is restored and a real memory/agent operation succeeds.
- **If forked subagents changed:** create or use a Mastra Code/subagent scenario that proves parent thread/resource inheritance and prompt cache prefix behavior. Do not assume a normal agent run covers forked subagents.
- **If Studio/Playground changed:** run browser smoke for the affected pages, especially observability traces/logs/metrics and theme/layout changes.
- **If auth/permissions/Agent Builder changed:** prefer staging/production cloud smoke with an authenticated user and targeted permission flows. Local create-mastra usually does not cover stored agents/skills, starring, visibility, avatar upload, or server-side session refresh.
- **If MCP/A2A changed:** default empty MCP state is only a baseline. For SDK/client/server or schema-validator changes, run a targeted MCP/A2A integration check with a configured server/client when feasible.
- **If storage/provider packages changed:** at minimum verify package installation/import. If the changed provider can run locally in Docker (Postgres, Redis, MSSQL, etc.), run a provider-backed smoke against the released package rather than stopping at import. For provider schema/migration fixes, explicitly simulate an old/broken schema and prove auto-migration repairs it.
- **If Mastra Code changed:** run a separate Mastra Code/TUI smoke path; do not assume standard create-mastra smoke covers it.
- **If docs/examples changed:** run docs validation or example-specific checks; do not replace runtime smoke with docs-only checks.

Add a **Coverage vs Changes** table to `$SMOKE_DIR/smoke-scope.md` before testing. For each material PR or grouped feature area, include:

| Feature / PRs | Generated project covers it? | Targeted check to run | Result / reason omitted |
| --- | --- | --- | --- |
| Example: `resume-stream` | No | Call resume-stream after starting a stream and verify resumed chunks/final response | PASS/FAIL or blocked reason |
| Example: tool approval change | No | Configure a tool with `requireApproval`, trigger it from an agent, approve/reject, verify the changed approval behavior | PASS/FAIL or blocked reason |
| Example: Playground save persistence | No | Edit the affected Studio/Agent Builder form, save, reload/refetch, verify the changed field persists | PASS/FAIL or blocked reason |
| Example: PG OM migration column | No | Run Postgres in Docker, configure smoke project with `@mastra/pg`, drop old/missing column, restart, verify migration restores it and memory/OM writes succeed | PASS/FAIL or blocked reason |
| Example: default weather tool | Yes | Agent/tool smoke | PASS |

Write the scope analysis to `$SMOKE_DIR/smoke-scope.md` before running tests so it is not trapped in terminal output. Include:

- release baseline tag and cutoff timestamp
- command used to collect PRs
- categorized PR table with PR number, title, author, merged time, and category
- targeted smoke plan derived from the categories
- coverage-vs-changes table showing what the generated project covers naturally and what needs targeted checks
- any omitted PRs/commits and why, including Dependabot, direct non-PR commits, cloud-only features, missing credentials, or product areas outside create-mastra

Report the category summary and the coverage-vs-changes summary before running tests so the user can see why each targeted check is included and where the default smoke project is insufficient.

### Targeted feature smoke pattern

When a PR changes a specific feature, smoke the smallest real scenario that proves that feature. Avoid vague substitutes like "agent chat works" for a streaming fix, "tools list loads" for a tool approval fix, or "Studio loads" for a persistence/save bug.

Pattern:

1. Identify the exact changed path from the PR title, files, changelog, and tests.
2. Configure or modify the smoke project so that path is reachable with the released package.
3. Trigger the behavior through the public API or UI a user would use.
4. Assert the before/after condition that would have failed before the fix.
5. Capture concrete evidence: response fields, stream chunks, persisted rows, saved config after reload, trace/span contents, or visible UI text.
6. If the feature requires cloud auth, external credentials, or a separate product like Mastra Code, either run that targeted environment or mark it `PARTIAL`/`NOT COVERED` with the exact reason.

Examples:

- For streaming fixes: call `/stream` or `resume-stream`, inspect event chunks and final response shape.
- For tool approval/dynamic tool fixes: configure the affected tool mode, run an agent that triggers it, and verify approval/rejection or dynamic resolution behavior.
- For workflow fixes: run the specific workflow mode changed, such as suspend/resume, background progress, or long-running output shape.
- For Studio persistence fixes: change the affected form field, save, reload/refetch, and verify the value persisted.
- For observability fixes: generate the affected run type and verify trace/span/scores/logs include the corrected data.
- For CLI/create fixes: create a fresh project with the published CLI and verify generated files/dependencies/scripts match the intended output.

### Storage/provider migration smoke pattern

When a release includes a fix for a storage backend, schema migration, or backend-specific memory behavior, do a real backend smoke whenever the service can be run locally. Package unit tests are useful evidence but are not a substitute for release smoke.

Pattern:

1. Start the backend with Docker and record the connection string in `$SMOKE_DIR/logs/`.
2. Add the released provider package to the generated smoke project, for example `pnpm add @mastra/pg@alpha`.
3. Configure the generated project to use that provider for the affected domain, for example `PostgresStore` as default storage for memory/threads/messages/OM.
4. Enable the feature that uses the changed path, for example observational memory on an agent.
5. If the bug was a migration/backcompat bug, mutate the database to mimic the old broken state, such as dropping a newly added column.
6. Restart the Mastra dev server to trigger provider initialization/auto-migration.
7. Verify the schema was repaired and run a real API/browser flow that writes and reads through that backend.
8. Record backend row counts or schema checks plus user-visible API evidence in `smoke-report.md`.

Example Postgres OM migration check:

```bash
docker run -d --name mastra-smoke-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=mastra \
  -p 5544:5432 \
  pgvector/pgvector:0.8.2-pg16

pnpm add @mastra/pg@alpha pg
# Configure PostgresStore({ connectionString: 'postgresql://postgres:postgres@localhost:5544/mastra' })
# Enable observationalMemory on an agent.

# After first startup creates tables, simulate an old schema:
docker exec mastra-smoke-pg psql -U postgres -d mastra \
  -c 'ALTER TABLE "mastra_observational_memory" DROP COLUMN IF EXISTS "reflectedObservationLineCount";'

# Restart Mastra, then verify auto-migration restored the column:
docker exec mastra-smoke-pg psql -U postgres -d mastra -Atc \
  "select column_name from information_schema.columns where table_name='mastra_observational_memory' and column_name='reflectedObservationLineCount'"
```

Pass criteria for this class of check:

- the released provider package installs and imports
- the generated project starts against the real backend
- the intentionally missing/old schema element is restored by initialization/migration
- real agent/memory/tool/workflow API calls using that backend succeed
- backend tables contain expected persisted rows

## ⚠️ Mandatory Test Checklist

**Use `task_write` to track progress.** Run ALL tests unless `--test` specifies otherwise.

**Do not skip tests unless you hit an actual blocker.** "Seemed complex" or "wasn't sure" are not valid reasons. Attempt everything - only stop a test when you literally cannot proceed. Report what you tried and what blocked you.

| #   | Test              | Reference                       | When Required                |
| --- | ----------------- | ------------------------------- | ---------------------------- |
| 1   | **Setup**         | `references/tests/setup.md`     | Always                       |
| 2   | **Agents**        | `references/tests/agents.md`    | `--test agents` or full      |
| 3   | **Tools**         | `references/tests/tools.md`     | `--test tools` or full       |
| 4   | **Workflows**     | `references/tests/workflows.md` | `--test workflows` or full   |
| 5   | **Traces**        | `references/tests/traces.md`    | `--test traces` or full      |
| 6   | **Scorers**       | `references/tests/scorers.md`   | `--test scorers` or full     |
| 7   | **Memory**        | `references/tests/memory.md`    | `--test memory` or full      |
| 8   | **MCP**           | `references/tests/mcp.md`       | `--test mcp` or full         |
| 9   | **Errors**        | `references/tests/errors.md`    | `--test errors` or full      |
| 10  | **Studio Deploy** | `references/tests/studio.md`    | `--test studio` (cloud only) |
| 11  | **Server Deploy** | `references/tests/server.md`    | `--test server` (cloud only) |

### Execution Flow

1. **Read the reference file** for each test you're about to run
2. **Execute the steps** in that reference file
3. **Mark the test complete** before moving to the next

### Partial Testing (`--test`)

If `--test` is provided:

1. Always run **Setup** (step 1)
2. Run **only** the specified test(s)
3. Skip other tests

Example: `--test agents,traces` → Run steps 1, 2, and 5 only.

## Local Studio Browser Smoke

For local release smoke tests, do **both** API/curl checks and a Studio browser pass unless `--skip-browser` is explicitly requested or browser access is genuinely blocked. API checks prove runtime endpoints work; browser checks prove the Playground/Studio UI can load, submit forms, and display results.

Before opening the browser:

1. Confirm the dev server is alive on the expected port:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4111
   lsof -i :4111 || true
   ```

2. If the process died, restart it from the generated project and wait for readiness:

   ```bash
   cd "$SMOKE_DIR/smoke-project"
   pnpm run dev > "$SMOKE_DIR/logs/dev-server-browser.log" 2>&1 &

   for i in {1..60}; do
     code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4111 || true)
     [ "$code" = 200 ] && break
     sleep 1
   done
   ```

3. Use browser tools to navigate to `http://localhost:4111`. If `networkidle` times out but `domcontentloaded` succeeds and the UI is usable, continue and note the timeout.

Recommended browser task list:

```text
1. Verify Studio shell loads
2. Smoke test agent chat UI
3. Smoke test tools UI
4. Smoke test workflows UI
5. Smoke test observability, scorers, and MCP pages
6. Report browser smoke results
```

Run these page checks:

| Area | Route | What to verify |
| --- | --- | --- |
| Studio shell | `/` or `/agents` | Sidebar/nav visible, Mastra version visible, no crash/error overlay |
| Agents | `/agents` → agent chat | Agent list shows expected agent, chat input is visible, sending `What's the weather in Tokyo?` returns a coherent response, tool call badge/result appears when expected |
| Tools | `/tools` → tool detail | Tool list shows `get-weather`, input form renders, submitting a city such as `Paris` displays JSON result with weather fields |
| Workflows | `/workflows` → workflow detail | Workflow list shows `weather-workflow`, graph/details render, running with a city such as `Berlin` completes as `success`, steps show timings/output controls |
| Traces | `/observability` | Recent agent/workflow traces appear, including runs triggered during the browser pass |
| Scorers | `/scorers` | Registered scorers appear with names/descriptions, e.g. Tool Call Accuracy, Completeness, Translation Quality |
| MCP | `/mcps` | Page loads. Empty state is a pass for default templates: `No MCP Servers yet` |

If a browser interaction does not expose enough text in the accessibility snapshot, inspect `document.body.innerText` or take a screenshot, then record the visible evidence. Do not rely only on API output for browser smoke.

Append browser results to `$SMOKE_DIR/smoke-report.md` with a separate section, for example:

```md
## Studio Browser Smoke Results

| Area | Result | Evidence |
| --- | --- | --- |
| Studio shell | PASS | Browser loaded localhost:4111; sidebar/nav visible; version shown |
| Agents UI | PASS | Weather Agent chat returned Tokyo weather and displayed tool call |
| Tools UI | PASS | get-weather form returned Paris weather JSON |
| Workflows UI | PASS | weather-workflow Berlin run completed as success |
| Traces UI | PASS | Recent agent/workflow traces listed |
| Scorers UI | PASS | Expected scorers listed |
| MCP UI | PASS | Expected empty MCP state shown |
```

Call out separately whether browser smoke was local Studio only or cloud Studio/deployed server.

---

## Usage

```text
# Full smoke test
smoke test --env local --existing-project ~/my-app
smoke test --env staging -d ~/projects -n test-app

# Partial testing
smoke test --env local --existing-project ~/my-app --test agents
smoke test --env production --existing-project ~/my-app --test studio,server,traces

# Multi-environment: same project, different targets
smoke test --env staging --existing-project ~/my-app   # Uses .mastra-project-staging.json
smoke test --env production --existing-project ~/my-app # Uses .mastra-project.json
```

## Multi-Environment Support

One project can target all environments using separate config files:

| Environment | Config File                    | What Happens                    |
| ----------- | ------------------------------ | ------------------------------- |
| Local       | N/A                            | `pnpm dev` → localhost:4111     |
| Staging     | `.mastra-project-staging.json` | Deploys to staging.mastra.cloud |
| Production  | `.mastra-project.json`         | Deploys to mastra.cloud         |

See `references/tests/setup.md` for setup details.

## Parameters

| Parameter            | Required | Default                | Description                      |
| -------------------- | -------- | ---------------------- | -------------------------------- |
| `--env`              | **Yes**  | -                      | `local`, `staging`, `production` |
| `--directory`        | \*       | `~/mastra-smoke-tests` | Parent dir for new project       |
| `--name`             | \*       | -                      | Project name                     |
| `--existing-project` | \*       | -                      | Path to existing project         |
| `--tag`              | No       | `latest`               | Version tag (e.g., `alpha`)      |
| `--pm`               | No       | `pnpm`                 | Package manager                  |
| `--llm`              | No       | `openai`               | LLM provider                     |
| `--db`               | No       | `libsql`               | Storage: `libsql`, `pg`, `turso` |
| `--test`             | No       | (full)                 | Specific test(s) to run          |
| `--browser-agent`    | No       | `false`                | Add browser agent                |
| `--skip-browser`     | No       | `false`                | Curl-only (no browser UI)        |
| `--byok`             | No       | `false`                | Test bring-your-own-key          |

\* Either `--directory` + `--name` OR `--existing-project` required

## Test Options (`--test`)

| Option      | Description              | Environments |
| ----------- | ------------------------ | ------------ |
| `agents`    | Agent page and chat      | All          |
| `tools`     | Tools page and execution | All          |
| `workflows` | Workflows page and run   | All          |
| `traces`    | Observability/traces     | All          |
| `scorers`   | Evaluation/scorers page  | All          |
| `memory`    | Conversation persistence | All          |
| `mcp`       | MCP servers page         | All          |
| `errors`    | Error handling           | All          |
| `studio`    | Studio deploy only       | Cloud        |
| `server`    | Server deploy only       | Cloud        |

## Prerequisites

**All environments:**

- Node.js + package manager
- LLM API key in env or `.env`

**Local (`--env local`):**

- Browser tools enabled (`/browser on`)

**Cloud (`--env staging/production`):**

- Mastra platform account

## Quick Start Flow

```text
1. Setup      → Read references/tests/setup.md, create/verify project
2. Start      → `pnpm run dev` (local) or deploy (cloud)
3. Test       → For each test, read its reference file and execute
4. Verify     → Check all items in reference file's checklist
5. Report     → Summarize pass/fail for each test
```

## References

| File                                | Purpose                               |
| ----------------------------------- | ------------------------------------- |
| `references/tests/*.md`             | Detailed steps for each test          |
| `references/local-setup.md`         | Local dev server setup                |
| `references/cloud-deploy.md`        | Cloud deploy details                  |
| `references/cloud-advanced.md`      | BYOK, storage testing                 |
| `references/common-errors.md`       | Troubleshooting                       |
| `references/gcp-debugging.md`       | Infrastructure debugging              |
| `scripts/test-server.sh`            | Server API test script                |
| `scripts/discover-release-scope.sh` | Release PR scope discovery            |
| `scripts/check-versioning-pr.sh`    | Alpha versioning PR spot-check helper |

## Platform Dashboards

- **Production**: `https://projects.mastra.ai`
- **Staging**: `https://projects.staging.mastra.ai`

> For Gateway API testing (memory, threads, BYOK via gateway), use `platform-smoke-test`.

## Result Reporting

After testing, provide:

```md
## Smoke Test Results

**Environment**: local/staging/production
**Project**: <name>

| Test   | Status | Notes |
| ------ | ------ | ----- |
| Setup  | ✅/❌  |       |
| Agents | ✅/❌  |       |
| Tools  | ✅/❌  |       |
| ...    |        |       |

**Issues Found**: (list any)
**Warnings**: (list any deploy/runtime warnings)
**Skipped Tests**: (list with reason - e.g., "Server Deploy - not applicable in local environment")
```
