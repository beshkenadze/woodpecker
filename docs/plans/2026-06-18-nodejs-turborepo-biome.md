# Turborepo + Biome v2 Tooling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Turborepo (cached `build`/`test` orchestration) and Biome v2 (format + lint + import-organize, applied across the workspace) to the `nodejs/` Bun monorepo, plus a GitHub Actions CI job.

**Architecture:** Additive tooling layer. Bun stays the package manager and test runner; Turbo runs the existing per-package `build`/`test` scripts with caching; Biome runs once over the whole repo. No runtime behavior changes — the only large effect is a mechanical formatting diff.

**Tech Stack:** Bun 1.3.14, Turborepo 2.5.x, Biome v2.x, TypeScript (tsc --noEmit), GitHub Actions.

---

## Conventions for the executor

- **All commands run from `/Volumes/DATA/shoutrrr/nodejs`** (the workspace root) unless stated otherwise. The git repo root is `/Volumes/DATA/shoutrrr`; the Go tree must NOT be touched.
- Work on branch `nodejs-tooling` (already created; the design doc is committed there).
- If a `git commit` fails due to 1Password signing being locked, retry the SAME commit with `git -c commit.gpgsign=false commit ...` (signing-only bypass; never `--no-verify`).
- The workspace has 23 packages under `packages/`. All already have uniform scripts `build: "tsc --noEmit"` and `test: "bun test"`.
- Baseline before starting: `bunx tsc` clean per package and 484 tests pass. Keep both true at every checkpoint.

---

## Task 1: Add Turbo + Biome dependencies and root scripts

**Files:**
- Modify: `nodejs/package.json`

**Step 1: Add the dev dependencies (use the package manager, do not hand-edit deps)**

Run:
```bash
bun add -D turbo @biomejs/biome
```
Expected: both added under `devDependencies`; `nodejs/bun.lock` updated; `node_modules/.bin/turbo` and `biome` present.

**Step 2: Add the `packageManager` field and replace the loop scripts**

Edit `nodejs/package.json` so it reads (keep the existing `workspaces`):
```jsonc
{
  "name": "shoutrrr-workspace",
  "private": true,
  "packageManager": "bun@1.3.14",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "check": "biome check",
    "format": "biome check --write",
    "ci": "turbo build test && biome ci"
  },
  "devDependencies": { /* turbo + @biomejs/biome as added by bun */ }
}
```
(Replaces the previous `for`-loop `test`/`typecheck` scripts.)

**Step 3: Do NOT commit yet** — `turbo build`/`test` will fail until `turbo.json` exists (Task 2). Proceed.

---

## Task 2: Add the Turbo pipeline

**Files:**
- Create: `nodejs/turbo.json`

**Step 1: Create `nodejs/turbo.json`**

```jsonc
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsconfig.json", "package.json"],
      "outputs": []
    },
    "test": {
      "inputs": ["src/**", "test/**", "tsconfig.json", "package.json"],
      "outputs": []
    }
  }
}
```

**Step 2: Verify Turbo orchestrates build**

Run: `bunx turbo build`
Expected: 23 `build` tasks run (`tsc --noEmit` per package), all succeed, summary `Tasks: 23 successful, 23 total`.

**Step 3: Verify Turbo cache works**

Run: `bunx turbo build` again.
Expected: `Tasks: 23 successful, 23 total` with `>>> FULL TURBO` / cached, near-instant.

**Step 4: Verify Turbo orchestrates test**

Run: `bunx turbo test`
Expected: 23 `test` tasks run (`bun test`), all succeed. (Each package's own suite passes; total ≈484 tests across packages.)

---

## Task 3: Add the Biome config and gitignore entry

**Files:**
- Create: `nodejs/biome.json`
- Modify: `nodejs/.gitignore`

**Step 1: Create `nodejs/biome.json`**

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.2.0/schema.json",
  "files": { "includes": ["**", "!**/node_modules", "!**/.turbo"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "javascript": { "formatter": { "quoteStyle": "double" } },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```
NOTE: pin `$schema` to the installed Biome version (check `bunx biome --version`; use the matching `schemas/<version>/schema.json`). If Biome rejects a config key, run `bunx biome check` to see the suggestion (the `assist.actions.source.organizeImports` shape is Biome 2.x; adjust if the installed minor differs).

**Step 2: Validate the config loads**

Run: `bunx biome check --max-diagnostics=1 .`
Expected: Biome runs (it WILL report many format/lint diagnostics — that is fine here; we only confirm the config parses without a "configuration error").

**Step 3: Add `.turbo` to `nodejs/.gitignore`**

Append a line `.turbo` (and `.turbo/` is covered). Confirm `node_modules`, `dist`, `*.tsbuildinfo` already present.

---

## Task 4: Commit the tooling scaffold

**Step 1: Stage and review**

Run: `git -C /Volumes/DATA/shoutrrr status --short`
Expected staged set: `nodejs/package.json`, `nodejs/turbo.json`, `nodejs/biome.json`, `nodejs/.gitignore`, `nodejs/bun.lock`. (No source files yet.)

**Step 2: Commit**

```bash
git -C /Volumes/DATA/shoutrrr add nodejs/package.json nodejs/turbo.json nodejs/biome.json nodejs/.gitignore nodejs/bun.lock
git -C /Volumes/DATA/shoutrrr commit -m "chore(nodejs): add Turborepo + Biome tooling scaffold"
```

**Step 3: CHECKPOINT — report to the human before the big reformat.** Confirm `bunx turbo build` and `bunx turbo test` are green, then proceed.

---

## Task 5: Apply Biome formatting + safe fixes (the mechanical reformat)

**Files:** all `nodejs/packages/**/src` and `**/test` (mechanical).

**Step 1: Capture a pre-reformat baseline**

Run: `bunx turbo test` → record "all green". This is the safety baseline.

**Step 2: Apply safe fixes + format + organize imports**

Run: `bunx biome check --write .`
Expected: many files reformatted (double quotes, 2-space, sorted imports); Biome reports remaining (unsafe/unfixable) diagnostics count.

**Step 3: Confirm the diff is style-only**

Run: `git -C /Volumes/DATA/shoutrrr diff --stat nodejs/packages` — expect broad churn across packages. Spot-check a few files: only quotes/spacing/import-order changed, no logic.

**Step 4: Commit the reformat in isolation (no manual edits mixed in)**

```bash
git -C /Volumes/DATA/shoutrrr add nodejs/packages
git -C /Volumes/DATA/shoutrrr commit -m "style(nodejs): biome check --write across workspace"
```

---

## Task 6: Verify the reformat is behavior-safe

**Step 1: Full test suite**

Run: `bunx turbo test --force` (`--force` bypasses cache so tests actually re-run).
Expected: all 23 `test` tasks succeed (≈484 tests). If ANY fail, investigate — formatting must not change behavior; revert the offending file's formatting if a real change slipped in.

**Step 2: Typecheck**

Run: `bunx turbo build --force`
Expected: 23 successful.

**Step 3: Side-effect import order (critical risk check)**

`organizeImports` may have reordered bare side-effect imports. Verify the two ordering-sensitive spots:
- Run: `bun packages/cli/src/cli.ts send -u logger:// -m "ordering ok"`
  Expected: prints `ordering ok` then `Notification sent`, exit 0.
- Run: `bunx turbo test --filter=@woodpecker-js/shoutrrr --force`
  Expected: umbrella registry tests pass (all schemes register).

If either fails because imports were reordered (e.g. `cli.ts` now imports `./register-services.js` before `./core/index.js`): restore the required order and add `// biome-ignore assist/source/organizeImports: side-effect order matters` above the import group, then re-commit as a fixup to Task 5's commit.

---

## Task 7: Resolve remaining Biome lint to zero

**Files:** wherever `biome check` reports (expected: a handful of test files + maybe config).

**Step 1: List remaining diagnostics**

Run: `bunx biome check .`
Expected: a list of lint errors not auto-fixed. Likely categories:
- `lint/suspicious/noExplicitAny` — in migrated tests using `globalThis.fetch = (async (input: any, init?: RequestInit) => …) as typeof fetch`. Fix: type the param precisely, e.g. `(input: Request | string | URL, init?: RequestInit)`, or import and use `FetchLike` from `@woodpecker-js/core`.
- `lint/style/noNonNullAssertion`, `lint/correctness/noUnusedImports`, etc.

**Step 2: Fix each diagnostic at its source**

For each: apply the minimal precise fix (NOT a blanket `// biome-ignore` unless the rule is genuinely wrong for that line — the chosen policy is "clean to zero", do not silence rules wholesale). Prefer `bunx biome check --write --unsafe .` ONLY after reviewing what the unsafe fixes would change (run it, then `git diff` and verify each change is correct; revert any that alter behavior).

**Step 3: Re-run until clean**

Run: `bunx biome check .`
Expected: `Checked N files. No fixes applied.` and exit code 0.

**Step 4: Re-verify tests still green after manual fixes**

Run: `bunx turbo test --force`
Expected: all 23 succeed.

**Step 5: Commit**

```bash
git -C /Volumes/DATA/shoutrrr add nodejs/packages
git -C /Volumes/DATA/shoutrrr commit -m "fix(nodejs): resolve remaining biome lint diagnostics"
```

---

## Task 8: Add the CI workflow

**Files:**
- Create: `.github/workflows/nodejs.yml` (at the REPO ROOT `/Volumes/DATA/shoutrrr/.github/workflows/`, not under `nodejs/`).

**Step 1: Create the workflow**

```yaml
name: nodejs
on:
  push:
    branches: [main]
    paths: ["nodejs/**", ".github/workflows/nodejs.yml"]
  pull_request:
    paths: ["nodejs/**", ".github/workflows/nodejs.yml"]
defaults:
  run:
    working-directory: nodejs
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.14"
      - uses: actions/cache@v4
        with:
          path: nodejs/.turbo
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: turbo-${{ runner.os }}-
      - run: bun install --frozen-lockfile
      - run: bunx turbo build test
      - run: bunx @biomejs/biome ci
```

**Step 2: Sanity-check the CI commands locally**

- Run: `bun install --frozen-lockfile` → expect "no changes"/success (proves `bun.lock` is current; if it errors, run `bun install`, commit the lockfile).
- Run: `bunx turbo build test` → all tasks succeed.
- Run: `bunx @biomejs/biome ci` → exit 0, no diagnostics.

**Step 3: Commit**

```bash
git -C /Volumes/DATA/shoutrrr add .github/workflows/nodejs.yml nodejs/bun.lock
git -C /Volumes/DATA/shoutrrr commit -m "ci(nodejs): add Turborepo + Biome workflow"
```

---

## Task 9: Final verification and PR

**Step 1: Whole-workspace green**

- `bun install --frozen-lockfile` → success.
- `bunx turbo build test --force` → 46 tasks (23 build + 23 test) successful.
- `bunx biome ci` → exit 0.
- Smoke: `bun packages/cli/src/cli.ts send -u logger:// -m done` prints `done` + `Notification sent`.

**Step 2: Confirm Go tree untouched**

Run: `git -C /Volumes/DATA/shoutrrr diff --name-only main...nodejs-tooling | grep -v '^nodejs/\|^.github/workflows/nodejs.yml'`
Expected: empty (only `nodejs/**` and the new workflow changed).

**Step 3: Push and open the PR**

```bash
git -C /Volumes/DATA/shoutrrr push -u origin nodejs-tooling
gh pr create --repo beshkenadze/shoutrrr --base main \
  --title "chore(nodejs): Turborepo + Biome v2 tooling" --fill
```
Report the PR URL.

---

## Verification summary (all must hold at the end)

- `bunx turbo build test` → 46/46 tasks successful (cached on repeat).
- `bunx biome ci` → exit 0.
- CLI `send -u logger://` and umbrella routing work (side-effect order intact).
- Diff is `nodejs/**` + `.github/workflows/nodejs.yml` only; purely additive + stylistic.
- First CI run on the PR is green.
