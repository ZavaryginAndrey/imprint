# W1 — Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `platform/` — an npm workspace with the domain package (copied from `web/`), a Cloudflare Worker with a SQLite Durable Object, and a React web app — plus lint, CI, ADRs and a live "hello DO" deploy to dev.

**Architecture:** `packages/domain` is pure TypeScript (the W0 tools registry and the modules it stands on), consumed as TS source by `apps/worker` (Hono + Durable Object `UserStore`, bundled by wrangler) and `apps/web` (React 19 + Vite). The worker serves the built web app as static assets in the `dev`/`prod` environments; locally and in tests it runs without assets.

**Tech Stack:** Node ≥ 22, npm workspaces, TypeScript ^5.6 (strict, `verbatimModuleSyntax`), Vitest ~3.2, zod ^3.25, wrangler ^4.20, `@cloudflare/vitest-pool-workers` ^0.8, `@cloudflare/workers-types` ^4.20250901, Hono ^4.7, React ^19.1, Vite ^6.3, `@vitejs/plugin-react` ^4.5, ESLint ^9.22 + typescript-eslint ^8.

**Spec:** [docs/superpowers/specs/2026-09-28-web-platform-roadmap-design.md](../specs/2026-09-28-web-platform-roadmap-design.md) · phase file [imprint2.0/W1-foundation.md](../../../imprint2.0/W1-foundation.md)

## Global Constraints

- **Prerequisite:** W0 ([web tools plan](2026-09-28-web-tools.md)) is fully executed: `web/src/tools/index.ts` exists and `cd web && npx vitest run` is green. If not — stop, W1 cannot start.
- All paths are relative to the repo root. Run platform commands from `platform/`. On Windows use the Bash tool (Git Bash) or `npm.cmd` in PowerShell — `npm.ps1` is blocked by execution policy.
- **`web/` is frozen**: never modify anything under `web/`. W1 only copies from it.
- **Never modify or delete existing tests** (user policy). Copied test files are new files and must stay **byte-identical** to their `web/src` originals.
- `packages/domain` must not import Cloudflare, React, DOM or Node APIs, and must not reference `localStorage`, `window`, `document`, `process`, `Buffer` or `require(` in non-test source.
- Pinned majors (above). Exact versions come from `npm install`; commit `platform/package-lock.json`.
- Cloudflare: local and test runs use the top-level wrangler config (no assets, no remote resources). Only `--env dev` / `--env prod` touch Cloudflare; worker names `imprint-dev` / `imprint-prod` (P8). Stay on the Workers **Free** plan in W1.
- `PLAN.md`, `.claude/launch.json`, `app/**`, `gradle/**` carry the user's uncommitted work — **never stage them**. Commit only the exact paths listed in each task.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Lint limit: non-test source files ≤ 300 lines (`max-lines`, blank lines and comments skipped).

## Review Focus

1. **Domain code that touches browser or Node globals** (`localStorage`, `window`, `process`…) — would crash in the worker at runtime while typechecking fine. Pinned in Task 1 (`purity.test.ts`).
2. **A copied file silently diverging from `web/`** (edited import, reformatted test) — "behaviour unchanged" must be provable. Pinned in Task 1 Step 6 (`diff` of every copied file).
3. **An unknown `/api/*` path answered with the SPA's `index.html`** instead of a JSON 404 — agents and the web store would parse HTML as data. Pinned in Task 3 (`/api/nope` → 404 JSON).
4. **The web page when the worker is down or returns garbage** — must show "сервер недоступен", not crash or hang. Pinned in Task 4 (`health.test.ts`: network error, 500, malformed JSON).
5. **Domain code that works in Node but not in the workerd runtime** (an API the purity regex does not list) — the worker would fail only after deploy. Pinned in Task 3 (the worker test runs `runTool` inside the real Durable Object on workerd).

---

## File Structure

| File | Responsibility |
|---|---|
| `platform/package.json` | Workspace root: workspaces, shared dev tools, `check`/`deploy:*` scripts |
| `platform/tsconfig.base.json` | Shared strict compiler options |
| `platform/.gitignore` | `node_modules`, `dist`, `.wrangler` |
| `platform/eslint.config.js` | typescript-eslint for apps + `max-lines` everywhere |
| `platform/packages/domain/**` | Copied domain + `draft.ts` (pure subset) + `index.ts` barrel + purity/smoke tests |
| `platform/apps/worker/wrangler.jsonc` | Local/test config + `dev`/`prod` envs with assets |
| `platform/apps/worker/src/env.ts` | `Env` bindings type |
| `platform/apps/worker/src/userStore.ts` | Durable Object `UserStore` (SQLite `meta`, `hello()` RPC) |
| `platform/apps/worker/src/index.ts` | Hono app: `/health`, `/api/hello`, `/api/*` 404, assets fallback |
| `platform/apps/worker/test/worker.test.ts` | Worker tests on the real workerd runtime |
| `platform/apps/web/**` | React app: `probe.ts`, `health.ts`, `App.tsx`, `main.tsx`, Vite config with proxy |
| `.github/workflows/platform.yml`, `platform-release.yml` | CI check + dev deploy; prod deploy on tag |
| `platform/docs/adr/000-template.md` … `006-environments.md` | ADR 001–004, 006 |
| `platform/README.md`, `platform/CLAUDE.md` | Commands, principles, pointers |
| `CLAUDE.md` (modify) | One pointer to `platform/` |
| `HISTORY.md`, `imprint2.0/W1-foundation.md` (modify, Task 7) | Close the phase |

---

### Task 1: Workspace root + domain package

**Files:**
- Create: `platform/package.json`, `platform/tsconfig.base.json`, `platform/.gitignore`
- Create: `platform/packages/domain/package.json`, `platform/packages/domain/tsconfig.json`
- Copy (unchanged): from `web/src/` into `platform/packages/domain/src/` — `types.ts`, `merge.ts`, `completion.ts`, `compose.ts`, `edit.ts`, `recurrence.ts`, `completion.test.ts`, `compose.test.ts`, `edit.test.ts`, `merge.test.ts`, `recurrence.test.ts`, and every file in `web/src/tools/` **except** `browserContext.ts`
- Create: `platform/packages/domain/src/draft.ts` (pure subset of `web/src/draft.ts`), `platform/packages/domain/src/index.ts`
- Test: `platform/packages/domain/src/purity.test.ts`, `platform/packages/domain/src/index.test.ts`

**Interfaces:**
- Consumes: W0's `web/src/**` as listed.
- Produces: package `@imprint/domain` (`exports: { ".": "./src/index.ts" }`) exporting everything from `types`, `merge`, `completion`, `recurrence`, `compose`, `edit`, `draft`; plus `ALL_TOOLS`, `runTool` (`tools/index`), `memoryContext`, `MemoryContext`, `MemoryOptions` (`tools/memoryContext`), `ToolContext` (type), `ToolDef`, `defineTool` (`tools/define`), `ToolResult`, `ToolOk`, `ToolFail`, `ToolError`, `Reason` (types), `GROUP_PALETTE`, `colorForId`, `javaStringHashCode` (`tools/palette`).
- Root scripts later tasks rely on: `typecheck`, `test`, `lint`, `build`, `check`, `deploy:dev`, `deploy:prod`.

- [ ] **Step 1: Check the prerequisite**

Run: `cd web && npx vitest run && ls src/tools/index.ts src/tools/browserContext.ts`
Expected: all tests PASS; both files listed. Otherwise stop (W0 not done).

- [ ] **Step 2: Create the workspace root**

`platform/package.json`:

```json
{
  "name": "imprint-platform",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "eslint .",
    "build": "npm run build --workspaces --if-present",
    "check": "npm run typecheck && npm run lint && npm run test && npm run build",
    "deploy:dev": "npm run build -w @imprint/web && npm run deploy:dev -w @imprint/worker",
    "deploy:prod": "npm run build -w @imprint/web && npm run deploy:prod -w @imprint/worker"
  }
}
```

`platform/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  }
}
```

`platform/.gitignore`:

```
node_modules/
dist/
.wrangler/
*.local
```

- [ ] **Step 3: Create the domain package shell**

`platform/packages/domain/package.json`:

```json
{
  "name": "@imprint/domain",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  }
}
```

`platform/packages/domain/tsconfig.json` (DOM lib only so `crypto` typechecks, as in `web/`; the purity test forbids actually using DOM globals):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "types": ["node"]
  },
  "include": ["src"]
}
```

Install (from `platform/`):

```bash
npm install -w @imprint/domain zod@^3.25.0
npm install -D typescript@^5.6.3 vitest@~3.2.0 @types/node@^22
```

Expected: `platform/package-lock.json` and `platform/node_modules/` created; `zod` in the domain package's `dependencies`, the rest in the root `devDependencies`.

- [ ] **Step 4: Copy the domain from `web/`**

```bash
cd platform/packages/domain && mkdir -p src/tools
for f in types merge completion compose edit recurrence; do cp ../../../web/src/$f.ts src/; done
for f in completion compose edit merge recurrence; do cp ../../../web/src/$f.test.ts src/; done
for f in ../../../web/src/tools/*.ts; do [ "$(basename "$f")" = browserContext.ts ] || cp "$f" src/tools/; done
ls src src/tools
```

Expected: no `browserContext.ts` in `src/tools`; `draft.ts` not yet present.

- [ ] **Step 5: Write `src/draft.ts` — the pure part of `web/src/draft.ts`**

Copy `DEFAULT_SETTINGS`, `Draft`, `isEmptyDraft` and `draftToSnapshot` **verbatim** from `web/src/draft.ts` (post-W0). Leave out everything that touches `localStorage` (`KEY`, `loadDraft`, `save`, `appendContribution`, `upsertTask`, `upsertGroup`, `appendEvent`, `clearDraft`). The expected result:

```ts
import type { BackupData, Group, Settings, Task, TaskEvent } from "./types";

/**
 * The pure half of `web/src/draft.ts`: a peer's own rows and their encoding as a [BackupData]
 * snapshot. The `localStorage` half stays in the frozen `web/` — the platform keeps rows in the
 * user's Durable Object (W2), and `memoryContext` keeps them in memory.
 */

export interface Draft {
  tasks: Task[];
  groups: Group[];
  events: TaskEvent[];
}

/** Defaults mirror `com.imprint.app.data.Settings` — present only so `BackupJson.decode` won't throw. */
const DEFAULT_SETTINGS: Settings = {
  dayRemindersEnabled: true,
  dayStartHour: 9,
  dayStartMinute: 0,
  dayEndHour: 21,
  dayEndMinute: 0,
  dayIntervalMinutes: 180,
  eveningEnabled: true,
  eveningHour: 22,
  eveningMinute: 0,
  resetHour: 4,
  resetMinute: 0,
  overlayEnabled: true,
  dynamicTheme: true,
};

/** True when the draft holds nothing to push — no task, group or event rows. */
export function isEmptyDraft(draft: Draft): boolean {
  return draft.tasks.length === 0 && draft.groups.length === 0 && draft.events.length === 0;
}

/** The draft as a [BackupData] snapshot. */
export function draftToSnapshot(draft: Draft): BackupData {
  return { version: 1, tasks: draft.tasks, groups: draft.groups, events: draft.events, settings: DEFAULT_SETTINGS };
}
```

If the W0 `web/src/draft.ts` differs from this in any of those four declarations, the W0 version wins — copy it.

- [ ] **Step 6: Prove the copy is exact (Review Focus 2)**

```bash
cd platform/packages/domain/src
for f in types merge completion compose edit recurrence completion.test compose.test edit.test merge.test recurrence.test; do diff -q ../../../../web/src/${f%.ts}.ts ${f%.ts}.ts; done
for f in tools/*.ts; do diff -q ../../../../web/src/$f $f; done
```

Expected: no output (every copied file is identical).

- [ ] **Step 7: Write the failing tests** — `platform/packages/domain/src/purity.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));
const FORBIDDEN = /\b(localStorage|sessionStorage|window|document|process|Buffer)\b|\brequire\(|from "(cloudflare:|react|node:)/;

/** Code only: the copied KDoc legitimately says "window" (completion.ts) and "localStorage" (tools/context.ts). */
function offends(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return FORBIDDEN.test(code);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [p] : [];
  });
}

describe("domain purity", () => {
  it("the check catches real use and ignores comments", () => {
    expect(offends('const x = localStorage.getItem("k");')).toBe(true);
    expect(offends('import { env } from "cloudflare:workers";')).toBe(true);
    expect(offends("/** No localStorage behind a tool. */\n// the window lower bound\nconst a = 1;")).toBe(false);
  });

  it("non-test source uses no browser, Node or Cloudflare globals/imports", () => {
    const offenders = sourceFiles(SRC).filter((f) => offends(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the browser-only tool context was not copied", () => {
    expect(sourceFiles(SRC).some((f) => f.endsWith("browserContext.ts"))).toBe(false);
  });
});
```

`platform/packages/domain/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ALL_TOOLS, draftToSnapshot, memoryContext, mergeSnapshots, runTool } from "./index";

describe("@imprint/domain barrel", () => {
  it("exposes a non-empty tool catalog with unique names", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  it("runs a tool end to end through the barrel", () => {
    const ctx = memoryContext();
    const r = runTool(ctx, "add_task", { title: "Hello", where: "day" });
    expect(r).toMatchObject({ ok: true, changed: true });
    const merged = mergeSnapshots([draftToSnapshot(ctx.draft)]);
    expect(merged.tasks.map((t) => t.title)).toEqual(["Hello"]);
  });
});
```

- [ ] **Step 8: Run to verify the barrel test fails**

Run: `cd platform && npm run test -w @imprint/domain -- src/index.test.ts src/purity.test.ts`
Expected: `index.test.ts` FAILS — `./index` not found. `purity.test.ts` already PASSES (3 tests); if it fails, a copied file uses a forbidden global in code — report it to the user, do not edit the copy.

- [ ] **Step 9: Write `platform/packages/domain/src/index.ts`**

```ts
/**
 * @imprint/domain — the only home of Imprint's rules (P1). Pure TypeScript: runs in the worker's
 * Durable Object, in the browser (optimistic preview) and in Node tests.
 */
export * from "./types";
export * from "./merge";
export * from "./completion";
export * from "./recurrence";
export * from "./compose";
export * from "./edit";
export * from "./draft";
export { ALL_TOOLS, runTool } from "./tools/index";
export { memoryContext, type MemoryContext, type MemoryOptions } from "./tools/memoryContext";
export type { ToolContext } from "./tools/context";
export { defineTool, type ToolDef } from "./tools/define";
export type { Reason, ToolError, ToolFail, ToolOk, ToolResult } from "./tools/result";
export { GROUP_PALETTE, colorForId, javaStringHashCode } from "./tools/palette";
```

- [ ] **Step 10: Run all domain tests + typecheck**

Run: `cd platform && npm run test -w @imprint/domain && npm run typecheck -w @imprint/domain`
Expected: every copied test PASS (same count as the matching files in `web/`), plus 5 new tests PASS; `tsc` reports no errors. If `export *` reports a duplicate-name conflict, replace that line with named exports of the conflicting module and note it in the commit message.

- [ ] **Step 11: Commit**

```bash
git add platform/package.json platform/package-lock.json platform/tsconfig.base.json platform/.gitignore platform/packages/domain
git commit -m "platform: workspace + @imprint/domain copied from web/ (W1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lint with the file-size guard

**Files:**
- Create: `platform/eslint.config.js`
- Modify: `platform/package.json` (devDependencies via npm)

**Interfaces:**
- Consumes: Task 1 workspace.
- Produces: `npm run lint` (`eslint .`) — typescript-eslint recommended on `apps/**`, `max-lines` 300 on all non-test source.

- [ ] **Step 1: Install**

Run (from `platform/`): `npm install -D eslint@^9.22.0 typescript-eslint@^8.0.0`

- [ ] **Step 2: Create `platform/eslint.config.js`**

```js
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * Copied domain files already over the limit. They are split in W3, not in the W1 copy step —
 * the copy must stay byte-identical to web/. Add a path here only with that justification.
 */
const LEGACY_LARGE = [];

export default defineConfig([
  { ignores: ["**/dist/**", "**/.wrangler/**", "**/node_modules/**"] },
  { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser } },
  { files: ["apps/**/*.{ts,tsx}"], extends: [tseslint.configs.recommended] },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/fixtures.ts", ...LEGACY_LARGE],
    rules: { "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }] },
  },
]);
```

- [ ] **Step 3: Prove the guard fires**

```bash
cd platform && node -e "require('fs').writeFileSync('packages/domain/src/zz-big.ts', Array.from({length: 301}, (_, i) => 'export const v' + i + ' = ' + i + ';').join('\n'))"
npx eslint packages/domain/src/zz-big.ts; echo "exit=$?"
rm packages/domain/src/zz-big.ts
```

Expected: a `max-lines` error and `exit=1`.

- [ ] **Step 4: Lint the real tree**

Run: `cd platform && npm run lint`
Expected: exit 0. If a copied domain file fails `max-lines`, add its path (e.g. `"packages/domain/src/tools/tasks.ts"`) to `LEGACY_LARGE` — do **not** edit the copied file — and rerun.

- [ ] **Step 5: Commit**

```bash
git add platform/eslint.config.js platform/package.json platform/package-lock.json
git commit -m "platform: eslint with a 300-line file guard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Worker skeleton with a SQLite Durable Object

**Files:**
- Create: `platform/apps/worker/package.json`, `platform/apps/worker/tsconfig.json`, `platform/apps/worker/wrangler.jsonc`, `platform/apps/worker/vitest.config.ts`
- Create: `platform/apps/worker/src/env.ts`, `platform/apps/worker/src/userStore.ts`, `platform/apps/worker/src/index.ts`
- Test: `platform/apps/worker/test/worker.test.ts`

**Interfaces:**
- Consumes: `ALL_TOOLS`, `runTool`, `memoryContext`, `ToolResult` from `@imprint/domain` (Task 1).
- Produces: `interface Env { USER_STORE: DurableObjectNamespace<UserStore>; ASSETS?: Fetcher }`; `class UserStore extends DurableObject<Env>` with `hello(): { count: number; tool: ToolResult }`; routes `GET /health` → `{ ok: true, tools: number }`, `GET /api/hello` → `hello()` of the DO named `"hello"`, any other `/api/*` → 404 `{ error: "not_found" }`, everything else → `ASSETS.fetch` or 404. Scripts `test`, `typecheck`, `dev` (port 8787), `deploy:dev`, `deploy:prod`.

- [ ] **Step 1: Package + config**

`platform/apps/worker/package.json`:

```json
{
  "name": "@imprint/worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --port 8787",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "deploy:dev": "wrangler deploy --env dev",
    "deploy:prod": "wrangler deploy --env prod"
  }
}
```

Install (from `platform/`):

```bash
npm install -w @imprint/worker hono@^4.7.0 @imprint/domain@*
npm install -D -w @imprint/worker wrangler@^4.20.0 @cloudflare/vitest-pool-workers@^0.8.0 @cloudflare/workers-types@^4.20250901.0
```

Expected: `@imprint/domain` resolves to the workspace (symlink), no registry fetch for it. If npm reports a peer conflict between `@cloudflare/vitest-pool-workers` and the root `vitest`, run `npm view @cloudflare/vitest-pool-workers@^0.8 peerDependencies` and set the root `vitest` to the newest version it allows.

`platform/apps/worker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["src", "test"]
}
```

`platform/apps/worker/wrangler.jsonc` — top level = local dev and tests (no assets, no Cloudflare resources); `env.dev`/`env.prod` = deployed workers. Durable Object bindings and migrations are not inherited by environments, so each env repeats them:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "imprint-local",
  "main": "src/index.ts",
  "compatibility_date": "2025-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": { "bindings": [{ "name": "USER_STORE", "class_name": "UserStore" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["UserStore"] }],
  "env": {
    "dev": {
      "name": "imprint-dev",
      "durable_objects": { "bindings": [{ "name": "USER_STORE", "class_name": "UserStore" }] },
      "migrations": [{ "tag": "v1", "new_sqlite_classes": ["UserStore"] }],
      "assets": {
        "directory": "../web/dist",
        "binding": "ASSETS",
        "not_found_handling": "single-page-application",
        "run_worker_first": true
      }
    },
    "prod": {
      "name": "imprint-prod",
      "durable_objects": { "bindings": [{ "name": "USER_STORE", "class_name": "UserStore" }] },
      "migrations": [{ "tag": "v1", "new_sqlite_classes": ["UserStore"] }],
      "assets": {
        "directory": "../web/dist",
        "binding": "ASSETS",
        "not_found_handling": "single-page-application",
        "run_worker_first": true
      }
    }
  }
}
```

`platform/apps/worker/vitest.config.ts`:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: { wrangler: { configPath: "./wrangler.jsonc" } },
    },
  },
});
```

- [ ] **Step 2: Write the failing test** — `platform/apps/worker/test/worker.test.ts`:

```ts
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://imprint.test";

describe("worker skeleton", () => {
  it("/health reports the domain tool catalog", async () => {
    const r = await SELF.fetch(`${BASE}/health`);
    expect(r.status).toBe(200);
    const body = await r.json<{ ok: boolean; tools: number }>();
    expect(body.ok).toBe(true);
    expect(body.tools).toBeGreaterThan(0);
  });

  it("the Durable Object keeps a counter in SQLite and runs a domain tool", async () => {
    const first = await (await SELF.fetch(`${BASE}/api/hello`)).json<{ count: number; tool: { ok: boolean } }>();
    const second = await (await SELF.fetch(`${BASE}/api/hello`)).json<{ count: number }>();
    expect(second.count).toBe(first.count + 1);
    expect(first.tool).toMatchObject({ ok: true });
  });

  it("an unknown /api path is a JSON 404, never the SPA page", async () => {
    const r = await SELF.fetch(`${BASE}/api/nope`);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not_found" });
  });

  it("without assets (local/test config) any other path is 404", async () => {
    expect((await SELF.fetch(`${BASE}/g/some-group`)).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd platform && npm run test -w @imprint/worker`
Expected: FAIL — `src/index.ts` not found (wrangler cannot load `main`).

- [ ] **Step 4: Implement**

`platform/apps/worker/src/env.ts`:

```ts
import type { UserStore } from "./userStore";

/** Worker bindings (wrangler.jsonc). ASSETS exists only in the dev/prod environments. */
export interface Env {
  USER_STORE: DurableObjectNamespace<UserStore>;
  ASSETS?: Fetcher;
}
```

`platform/apps/worker/src/userStore.ts`:

```ts
import { DurableObject } from "cloudflare:workers";
import { memoryContext, runTool, type ToolResult } from "@imprint/domain";
import type { Env } from "./env";

/**
 * One Durable Object per user (W2). In W1 it only proves the plumbing: SQLite storage that
 * survives requests, and the domain package running inside the object.
 */
export class UserStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }

  hello(): { count: number; tool: ToolResult } {
    const sql = this.ctx.storage.sql;
    sql.exec(
      "INSERT INTO meta (key, value) VALUES ('hello_count', '1') " +
        "ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1",
    );
    const row = sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'hello_count'").one();
    return { count: Number(row.value), tool: runTool(memoryContext(), "list_groups", {}) };
  }
}
```

`platform/apps/worker/src/index.ts`:

```ts
import { ALL_TOOLS } from "@imprint/domain";
import { Hono } from "hono";
import type { Env } from "./env";

export { UserStore } from "./userStore";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true, tools: ALL_TOOLS.length }));

/** W1 plumbing check; replaced by authenticated tool routes in W2. */
app.get("/api/hello", async (c) => {
  const stub = c.env.USER_STORE.get(c.env.USER_STORE.idFromName("hello"));
  return c.json(await stub.hello());
});

/** API misses must never fall through to the SPA's index.html. */
app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

/** Everything else is the web app (SPA fallback is configured on the assets binding). */
app.all("*", (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));

export default app;
```

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `cd platform && npm run test -w @imprint/worker && npm run typecheck -w @imprint/worker && npm run lint`
Expected: 4 tests PASS; no type or lint errors.

- [ ] **Step 6: Smoke the local dev server**

Run `cd platform && npm run dev -w @imprint/worker` in the background (Bash `run_in_background`), then:

```bash
curl -s http://localhost:8787/health
curl -s http://localhost:8787/api/hello
```

Expected: `{"ok":true,"tools":<n>}` and `{"count":1,"tool":{...,"ok":true,...}}`. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add platform/apps/worker platform/package.json platform/package-lock.json
git commit -m "platform: worker skeleton — Hono + SQLite Durable Object UserStore

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: React web skeleton

**Files:**
- Create: `platform/apps/web/package.json`, `platform/apps/web/tsconfig.json`, `platform/apps/web/vite.config.ts`, `platform/apps/web/index.html`
- Create: `platform/apps/web/src/probe.ts`, `platform/apps/web/src/health.ts`, `platform/apps/web/src/App.tsx`, `platform/apps/web/src/main.tsx`
- Test: `platform/apps/web/src/probe.test.ts`, `platform/apps/web/src/health.test.ts`

**Interfaces:**
- Consumes: `ALL_TOOLS`, `memoryContext`, `runTool` (Task 1); worker `GET /health` → `{ ok: true, tools: number }` (Task 3).
- Produces: `probeDomain(): DomainProbe` with `interface DomainProbe { tools: number; added: boolean; dayCount: number }`; `type Health = { ok: true; tools: number } | { ok: false }`; `fetchHealth(fetchImpl?: (url: string) => Promise<Response>): Promise<Health>`; `npm run build -w @imprint/web` → `platform/apps/web/dist/` (used by the worker's assets in Task 7).

- [ ] **Step 1: Package + config**

`platform/apps/web/package.json`:

```json
{
  "name": "@imprint/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "build": "vite build"
  }
}
```

Install (from `platform/`):

```bash
npm install -w @imprint/web react@^19.1.0 react-dom@^19.1.0 @imprint/domain@*
npm install -D -w @imprint/web vite@^6.3.0 @vitejs/plugin-react@^4.5.0 @types/react@^19.1.0 @types/react-dom@^19.1.0
```

`platform/apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`platform/apps/web/vite.config.ts` (the proxy target is `wrangler dev` from Task 3):

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://localhost:8787", "/health": "http://localhost:8787" },
  },
});
```

`platform/apps/web/index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Imprint</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the failing tests**

`platform/apps/web/src/probe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { probeDomain } from "./probe";

describe("probeDomain", () => {
  it("runs the domain in-process: add_task to the Day, then list_day sees it", () => {
    const p = probeDomain();
    expect(p.tools).toBeGreaterThan(0);
    expect(p.added).toBe(true);
    expect(p.dayCount).toBe(1);
  });
});
```

`platform/apps/web/src/health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fetchHealth } from "./health";

const respond = (status: number, body: unknown) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("fetchHealth", () => {
  it("reads a healthy worker", async () => {
    expect(await fetchHealth(respond(200, { ok: true, tools: 17 }))).toEqual({ ok: true, tools: 17 });
  });

  it("a 500, malformed JSON or a wrong shape is not ok", async () => {
    expect(await fetchHealth(respond(500, { ok: true, tools: 1 }))).toEqual({ ok: false });
    expect(await fetchHealth(respond(200, "<html>"))).toEqual({ ok: false });
    expect(await fetchHealth(respond(200, { ok: "yes" }))).toEqual({ ok: false });
  });

  it("a network error is not ok, not a throw", async () => {
    const down = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await fetchHealth(down)).toEqual({ ok: false });
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd platform && npm run test -w @imprint/web`
Expected: FAIL — `./probe` and `./health` not found.

- [ ] **Step 4: Implement**

`platform/apps/web/src/probe.ts`:

```ts
import { ALL_TOOLS, memoryContext, runTool } from "@imprint/domain";

export interface DomainProbe {
  tools: number;
  added: boolean;
  dayCount: number;
}

/** W1 plumbing check: the domain package runs in the browser bundle (the W4 optimistic store relies on it). */
export function probeDomain(): DomainProbe {
  const ctx = memoryContext();
  const added = runTool(ctx, "add_task", { title: "Hello, platform", where: "day" });
  const day = runTool(ctx, "list_day", {});
  const tasks = day.ok && Array.isArray(day.tasks) ? day.tasks : [];
  return { tools: ALL_TOOLS.length, added: added.ok && added.changed, dayCount: tasks.length };
}
```

`platform/apps/web/src/health.ts`:

```ts
export type Health = { ok: true; tools: number } | { ok: false };

/** Ask the worker whether it is up. Never throws: the page shows "сервер недоступен" instead. */
export async function fetchHealth(
  fetchImpl: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<Health> {
  try {
    const r = await fetchImpl("/health");
    if (!r.ok) return { ok: false };
    const body = (await r.json()) as { ok?: unknown; tools?: unknown };
    return body.ok === true && typeof body.tools === "number" ? { ok: true, tools: body.tools } : { ok: false };
  } catch {
    return { ok: false };
  }
}
```

`platform/apps/web/src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { fetchHealth, type Health } from "./health";
import { probeDomain } from "./probe";

export function App() {
  const [probe] = useState(probeDomain);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    void fetchHealth().then(setHealth);
  }, []);

  const server = health === null ? "…" : health.ok ? `работает · ${health.tools} tools` : "сервер недоступен";

  return (
    <main>
      <h1>Imprint</h1>
      <p>
        Домен: {probe.tools} tools · add_task → День: {probe.dayCount}
      </p>
      <p>Сервер: {server}</p>
    </main>
  );
}
```

`platform/apps/web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Run tests, typecheck, lint, build**

Run: `cd platform && npm run test -w @imprint/web && npm run typecheck -w @imprint/web && npm run lint && npm run build -w @imprint/web`
Expected: 4 tests PASS; no type/lint errors; `apps/web/dist/index.html` produced.

- [ ] **Step 6: Check it in the browser**

Start `npm run dev -w @imprint/worker` and `npm run dev -w @imprint/web` (both in the background), open `http://localhost:5173` in the built-in browser.
Expected text: "Домен: <n> tools · add_task → День: 1" and "Сервер: работает · <n> tools". Stop the worker, reload: "Сервер: сервер недоступен", no console errors besides the failed proxy request. Stop both servers.

- [ ] **Step 7: Commit**

```bash
git add platform/apps/web platform/package.json platform/package-lock.json
git commit -m "platform: React web skeleton — domain probe + worker health

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: CI workflows

**Files:**
- Create: `.github/workflows/platform.yml`, `.github/workflows/platform-release.yml`

**Interfaces:**
- Consumes: root scripts `check`, `deploy:dev`, `deploy:prod` (Task 1); repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (set by the user when a GitHub remote exists).
- Produces: `check` job on every push/PR touching `platform/`; dev deploy from `main`/`master`; prod deploy only on tags `platform-v*`.

- [ ] **Step 1: Prove the full local check is green first**

Run: `cd platform && npm ci && npm run check`
Expected: typecheck, lint, all tests and build pass from a clean install — CI runs exactly this.

- [ ] **Step 2: Create `.github/workflows/platform.yml`**

```yaml
name: platform

on:
  push:
    branches: [main, master]
    paths: ["platform/**", ".github/workflows/platform.yml"]
  pull_request:
    paths: ["platform/**", ".github/workflows/platform.yml"]

defaults:
  run:
    working-directory: platform

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: platform/package-lock.json
      - run: npm ci
      - run: npm run check

  deploy-dev:
    needs: check
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: platform/package-lock.json
      - run: npm ci
      - run: npm run deploy:dev
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- [ ] **Step 3: Create `.github/workflows/platform-release.yml`**

```yaml
name: platform-release

on:
  push:
    tags: ["platform-v*"]

defaults:
  run:
    working-directory: platform

jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: platform/package-lock.json
      - run: npm ci
      - run: npm run check
      - run: npm run deploy:prod
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- [ ] **Step 4: Validate the deploy bundle without credentials**

Run: `cd platform && npm run build -w @imprint/web && cd apps/worker && npx wrangler deploy --env dev --dry-run --outdir .wrangler/dry-run`
Expected: wrangler validates the `dev` config (Durable Object binding, migration, assets directory) and writes the bundle; no login needed. Repeat with `--env prod`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/platform.yml .github/workflows/platform-release.yml
git commit -m "platform: CI check + dev deploy; prod deploy on platform-v* tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Note: this repository has no GitHub remote yet, so the workflows first run when the user pushes to GitHub and adds the two secrets. Until then `npm run check` (Step 1) is the same gate.

---

### Task 6: ADRs and platform docs

**Files:**
- Create: `platform/docs/adr/000-template.md`, `001-server-hub-durable-objects.md`, `002-v1-rows-day-projection.md`, `003-isomorphic-runtool.md`, `004-react.md`, `006-environments.md`
- Create: `platform/README.md`, `platform/CLAUDE.md`
- Modify: `CLAUDE.md` (root — one section)

**Interfaces:**
- Consumes: decisions from the spec (§Решения, §Архитектура).
- Produces: ADR numbering 001–004, 006 (005 "вход и сессии" is written in W2).

- [ ] **Step 1: ADR template** — `platform/docs/adr/000-template.md`:

```markdown
# NNN — Заголовок

**Статус:** предложено | принято | заменено NNN · **Дата:** YYYY-MM-DD

## Контекст
Что вынуждает решать сейчас; ограничения; цифры, если есть.

## Решение
Одно решение, сформулированное так, чтобы его можно было проверить.

## Последствия
Что становится проще, что сложнее, что теперь запрещено. Когда пересматривать.
```

- [ ] **Step 2: ADR 001** — `platform/docs/adr/001-server-hub-durable-objects.md`:

```markdown
# 001 — Сервер-хаб на Cloudflare Durable Objects

**Статус:** принято · **Дата:** 2026-09-28

## Контекст
Платформа многопользовательская; tools (zod, синхронный `ToolContext`) должны исполняться на
сервере, чтобы веб-UI, MCP-агенты и позже Android ходили в один каталог. Кандидаты: Cloudflare DO,
Firebase + Cloud Run + Postgres, Firebase + Firestore.

## Решение
Один Durable Object `UserStore` на пользователя (`idFromName(userId)`), хранилище — встроенный
SQLite объекта. Воркер (Hono) — тонкий роутер; статика веба раздаётся тем же воркером.

## Последствия
- Синхронный SQL-API совпадает с синхронным `ToolContext`; запросы пользователя сериализуются —
  гонок и HLC нет.
- Hibernatable WebSocket из того же объекта — канал «изменилось» для вкладок и позже телефона.
- `McpAgent` и OAuth-провайдер Cloudflare — готовая основа для W5.
- Минус: новая для проекта платформа, привязка к Cloudflare. Домен (`@imprint/domain`) от неё не
  зависит — это граница выхода.
- Firestore отвергнут: каждый вызов tool читал бы всё состояние пользователя документами.
```

- [ ] **Step 3: ADR 002** — `platform/docs/adr/002-v1-rows-day-projection.md`:

```markdown
# 002 — Строки v1 + День как проекция, без HLC

**Статус:** принято · **Дата:** 2026-09-28

## Контекст
План 2.0 предполагал журнал операций (`TaskCreated`, `FieldSet`…) с HLC. Tools (W0) пишут строки
контракта v1 (`Task`, `Group`, `TaskEvent`), а Android v1 и его экспорт — те же формы.

## Решение
Хранилище пользователя — таблицы `tasks`, `groups`, `events` один к одному с `types.ts`; события
только добавляются; LWW по `updatedAt`. День, «завершено» и rollover вычисляются проекцией (W3a),
ничего не мутирует «само».

## Последствия
- Импорт v1 и мост Android (W7) работают с теми же строками.
- HLC не нужен: объект пользователя сериализует записи.
- Офлайн-писатель (телефон) в W7 снова приносит LWW по часам клиента — решается в ADR моста.
```

- [ ] **Step 4: ADR 003** — `platform/docs/adr/003-isomorphic-runtool.md`:

```markdown
# 003 — Оптимистичный онлайн через изоморфный `runTool`

**Статус:** принято · **Дата:** 2026-09-28

## Контекст
P3: интерфейс не ждёт сеть. Полный local-first (tools в IndexedDB + доигрывание) дорог; вебу
офлайн-запись не нужна.

## Решение
Tools исполняются на сервере. Для мгновенного отклика веб прогоняет тот же `runTool` на
`memoryContext` поверх последнего серверного состояния и показывает результат; ответ сервера его
заменяет, отказ или сбой сети — откат и тихая плашка. Без сети — кэш только на чтение.

## Последствия
- В `apps/web` нет своей логики предсказания — правило P1 соблюдается и для оптимистичного показа.
- `@imprint/domain` обязан оставаться чистым (тест `purity.test.ts`).
- Ключ дня на клиенте считается той же функцией и теми же настройками, что на сервере (W3a).
```

- [ ] **Step 5: ADR 004** — `platform/docs/adr/004-react.md`:

```markdown
# 004 — React для веб-UI

**Статус:** принято · **Дата:** 2026-09-28

## Контекст
UX (`imprint2.0/05-web-ux.md`): перетаскивание между колонками, поповеры у строки, адреса,
оптимистичные обновления, `prefers-reduced-motion`. Кандидаты: React, Preact + signals, Solid.

## Решение
React 19 + Vite; dnd-kit для перетаскивания, Radix для доступных поповеров (подключаются в W4).

## Последствия
- Самая богатая экосистема без слоя совместимости (`preact/compat`) и его сюрпризов.
- ~50 КБ gzip — приемлемо для спокойного интерфейса.
```

- [ ] **Step 6: ADR 006** — `platform/docs/adr/006-environments.md`:

```markdown
# 006 — Окружения dev и prod

**Статус:** принято · **Дата:** 2026-09-28

## Контекст
P8 и CRIT-1: разработка никогда не касается реальных данных.

## Решение
- Верхний уровень `wrangler.jsonc` — локальная разработка и тесты (Miniflare, без ассетов и без
  ресурсов Cloudflare).
- `--env dev` → воркер `imprint-dev`, `--env prod` → `imprint-prod`; у каждого свои Durable Objects,
  позже — свои OAuth-клиенты и секреты.
- Dev деплоится из `main`/`master` в CI; prod — только по тегу `platform-v*`.
- В W1 — бесплатный тариф Workers: жёсткие лимиты вместо счёта, «рубильник» не нужен. Переход на
  платный тариф — отдельный ADR с расчётом.

## Последствия
- Данные dev и prod физически разные объекты; ошибка в dev не трогает prod.
```

- [ ] **Step 7: `platform/README.md`**

```markdown
# Imprint platform

Веб-платформа Imprint 2.0: `@imprint/domain` (правила), `apps/worker` (Cloudflare Worker + Durable
Object на пользователя), `apps/web` (React). Карта фаз — [imprint2.0/README.md](../imprint2.0/README.md),
решения — [docs/adr/](docs/adr/).

## Команды (из `platform/`)

| Что | Команда |
|---|---|
| Всё сразу (как CI) | `npm run check` |
| Тесты / типы / линт | `npm run test` · `npm run typecheck` · `npm run lint` |
| Воркер локально (:8787) | `npm run dev -w @imprint/worker` |
| Веб локально (:5173, прокси на :8787) | `npm run dev -w @imprint/web` |
| Деплой dev / prod | `npm run deploy:dev` · `npm run deploy:prod` (prod — только из CI по тегу) |

**Windows:** в PowerShell используйте `npm.cmd` вместо `npm` — политика выполнения блокирует `npm.ps1`.
В Git Bash работает `npm`.

`web/` в корне репозитория — замороженный Drive-верстак v1; сюда из него скопирован домен (W1).
```

- [ ] **Step 8: `platform/CLAUDE.md`**

```markdown
# Imprint platform — working notes for Claude

Imprint 2.0 web platform (npm workspace). Spec:
[../docs/superpowers/specs/2026-09-28-web-platform-roadmap-design.md](../docs/superpowers/specs/2026-09-28-web-platform-roadmap-design.md);
phases: [../imprint2.0/README.md](../imprint2.0/README.md); ADRs: [docs/adr/](docs/adr/).

## Rules
- **P1:** product rules live only in `packages/domain`. `apps/*` route, store and render — no date,
  recurrence, completion or placement logic.
- `packages/domain` stays pure: no DOM, Node, Cloudflare or React (`purity.test.ts` enforces it).
- Tool results are data (`ToolResult`), never exceptions; new tools follow `tools/define.ts`.
- Non-test files ≤ 300 lines (eslint `max-lines`).
- Never modify or delete existing tests without asking; new tests are fine.
- Never touch `web/` (frozen) or `app/` from platform work.
- Knowledge base: [../docs/knowledge/](../docs/knowledge/) — check 02-BUGS-AND-TRAPS before UI or time code.

## Commands (from `platform/`)
`npm run check` · `npm run dev -w @imprint/worker` · `npm run dev -w @imprint/web` · `npm run deploy:dev`.
On Windows PowerShell use `npm.cmd`.
```

- [ ] **Step 9: Root `CLAUDE.md` pointer** — append after the "Build / test / run (Windows)" section:

```markdown
## Web platform (Imprint 2.0)

The web platform lives in [platform/](platform/) with its own [CLAUDE.md](platform/CLAUDE.md);
the phase map is [imprint2.0/README.md](imprint2.0/README.md). `web/` is the frozen v1 Drive workbench.
```

- [ ] **Step 10: Check links**

```bash
cd /c/Users/andre/Documents/Imprint
for f in platform/README.md platform/CLAUDE.md CLAUDE.md platform/docs/adr/*.md; do d=$(dirname "$f"); grep -o '](\([^)#h][^)#]*\)' "$f" | sed 's/^](//' | while read -r l; do [ -e "$d/$l" ] || echo "BROKEN $f -> $l"; done; done; echo checked
```

Expected: only `checked`.

- [ ] **Step 11: Commit**

```bash
git add platform/docs platform/README.md platform/CLAUDE.md CLAUDE.md
git commit -m "platform: ADR 001-004, 006 + README and CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Live "hello DO" in dev and phase close

**Files:**
- Modify: `imprint2.0/W1-foundation.md` (tick boxes), `HISTORY.md` (W1 entry)

**Interfaces:**
- Consumes: everything above; the user's Cloudflare account.
- Produces: `https://imprint-dev.<account-subdomain>.workers.dev` serving the web app, `/health`, `/api/hello`; tag `web-w1`.

- [ ] **Step 1: The user logs in to Cloudflare (manual, user only)**

Ask the user to run in their own terminal and complete the browser sign-in:

```bash
cd platform/apps/worker && npx wrangler login
```

Do not enter credentials on the user's behalf. Continue when `npx wrangler whoami` shows their account.

- [ ] **Step 2: Deploy dev**

Run: `cd platform && npm run deploy:dev`
Expected: wrangler prints the `imprint-dev` URL and applies migration `v1` for `UserStore`.

- [ ] **Step 3: Verify live**

```bash
URL=https://imprint-dev.<subdomain>.workers.dev   # from Step 2 output
curl -s $URL/health
curl -s $URL/api/hello; curl -s $URL/api/hello
curl -s -o /dev/null -w "%{http_code}\n" $URL/api/nope
curl -s $URL/g/some-group | grep -o "<title>Imprint</title>"
```

Expected: health `{"ok":true,...}`; the hello count grows by 1 between the two calls; `/api/nope` → `404`; a deep link returns the SPA's `index.html`. Open `$URL` in the built-in browser: "Сервер: работает · <n> tools". Take a screenshot for the user.

- [ ] **Step 4: Close the phase in docs**

- `imprint2.0/W1-foundation.md`: tick every box done. Leave unticked, with a note, "PR проходит все джобы CI" (no GitHub remote yet — first push runs it) and "Бюджетные ограничения Cloudflare" if not done (ADR 006: Free plan has hard limits).
- `HISTORY.md`: add a "W1 — Platform foundation" entry at the top of the closed-stages list: what was built (workspace, domain copy with byte-identical tests, worker + SQLite DO, React skeleton, CI, ADRs, live dev URL) and the rakes actually hit during execution (versions that needed adjusting, wrangler config surprises, anything added to `LEGACY_LARGE`).

- [ ] **Step 5: Commit and tag**

```bash
git add imprint2.0/W1-foundation.md HISTORY.md
git commit -m "W1 closed: platform foundation live in dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git tag web-w1
```

- [ ] **Step 6: Final check**

Run: `git status --short`
Expected: only the user's pre-existing uncommitted files (`PLAN.md`, `.claude/launch.json`, `app/**`, `gradle/**` and the three untracked sync files) remain; nothing under `platform/`, `.github/` or `imprint2.0/` is uncommitted.
