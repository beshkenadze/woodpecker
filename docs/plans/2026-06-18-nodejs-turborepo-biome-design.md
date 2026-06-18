# Design: Turborepo + Biome v2 for the Node.js workspace

Date: 2026-06-18
Scope: `nodejs/` only — the Go tree is untouched.

## Context

The `nodejs/` Bun workspace (23 packages: `core`, `shoutrrr` umbrella, `cli`,
and 20 services) has no task orchestrator and no linter/formatter. Root scripts
are shell `for`-loops over packages; code style diverged across the packages
that were authored in parallel (≈268 single-quote vs 90 double-quote imports).

This is a small, additive tooling refactor:

1. **Turborepo** — cache-aware orchestration of `build`/`test`.
2. **Biome v2** — one `check` (format + lint + import organize) over the repo,
   applied now to normalize the divergent style.

Bun stays the package manager and test runner. No runtime behavior changes; the
only large effect is a mechanical formatting diff.

## Decisions

| Topic | Choice |
|-------|--------|
| Package manager | Keep **bun**; Turbo runs via `bunx turbo` over existing bun scripts. |
| Biome scope | Full `biome check` (formatter + linter + organize imports), applied now. |
| Quote style | **Double** (Biome default). |
| Lint | Ruleset `recommended`, cleaned to zero (`biome check` exits 0). |
| Pipeline + CI | Turbo `build`+`test` (cached) + Biome root scripts + GitHub Actions CI. |

## Architecture / layout

New/changed at `nodejs/` root:

- `package.json` — add `"packageManager": "bun@1.3.14"`, devDeps `turbo` +
  `@biomejs/biome` (via `bun add -D`). Replace the loop scripts with:
  - `"build": "turbo build"`, `"test": "turbo test"`
  - `"check": "biome check"`, `"format": "biome check --write"`
  - `"ci": "turbo build test && biome ci"`
- `turbo.json` — `build`/`test` tasks (below).
- `biome.json` — single workspace config (below).
- `.gitignore` — add `.turbo`.
- `../.github/workflows/nodejs.yml` — CI, path-filtered to `nodejs/**`.

Packages need no structural change — `build: tsc --noEmit` and `test: bun test`
are already uniform across all 23. Turbo invokes them as-is. Biome reformats all
sources (including the CLI's vendored `cli/src/core`).

Unchanged: package structure, `@woodpecker-js/core` API, test semantics (style only),
bun workspace links, library/CLI behavior.

## Turbo pipeline

`nodejs/turbo.json` (Turbo 2.x `tasks` key):

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

- `build` = `tsc --noEmit` → no artifacts (`outputs: []`); Turbo caches the task
  result + logs keyed on `inputs`, so a no-change `turbo build` is an instant
  cache hit.
- `dependsOn: ["^build"]` is a convention/safety here (packages typecheck
  against `@woodpecker-js/core` *source*, so it is not strictly required).
- `test` does not depend on `build` (tests run sources via bun).
- Narrow `inputs` keep the cache from being invalidated by unrelated files; the
  Biome reformat does not bust build/test caches unless code changes.
- Biome is **not** a Turbo task — it is fast and multi-file, so one root pass is
  cleaner than 23 per-package runs.
- `.turbo/` is gitignored. Runs via `bunx turbo …`.

## Biome v2 config + style migration

`nodejs/biome.json`:

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.x/schema.json",
  "files": { "includes": ["**", "!**/node_modules", "!**/.turbo"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "javascript": { "formatter": { "quoteStyle": "double" } },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

(JSON files may be excluded from the formatter to avoid package.json churn —
decide at implementation time.)

Migration order:

1. `biome check --write` over `nodejs/` — applies **safe** fixes + format
   (double quotes, 2-space) + organize imports. This is the large mechanical
   commit.
2. `biome check` (no write) → inspect the remainder.
3. Fix manually until clean. Expected hotspots:
   - `noExplicitAny` in migrated tests (`globalThis.fetch = (async (input: any …))`)
     → precise types (`Request | string | URL`, `RequestInit`) or `FetchLike`.
   - possible `noNonNullAssertion`, `noUnusedImports` (much auto-fixed).
4. Repeat until `biome check` exits 0.

**Key risk — organizeImports vs side-effect imports:** the umbrella
(`import './register.ts'`) and CLI (`import './core/index.js'` must precede
`import './register-services.js'` so the inline logger registers first). Biome
does not reorder bare side-effect imports across boundaries, but this ordering
is verified by running the CLI/umbrella tests after formatting; if disturbed,
pin with `// biome-ignore` or explicit ordering.

After `--write`: run the full `bun run test` (484 tests) + `turbo build` — must
stay green; the diff must be purely stylistic.

## CI (GitHub Actions)

`.github/workflows/nodejs.yml` (triggers only on `nodejs/**` changes):

```yaml
name: nodejs
on:
  push: { branches: [main], paths: ["nodejs/**", ".github/workflows/nodejs.yml"] }
  pull_request: { paths: ["nodejs/**", ".github/workflows/nodejs.yml"] }
defaults:
  run: { working-directory: nodejs }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: "1.3.14" }
      - uses: actions/cache@v4
        with:
          path: nodejs/.turbo
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: turbo-${{ runner.os }}-
      - run: bun install --frozen-lockfile
      - run: bunx turbo build test
      - run: bunx @biomejs/biome ci
```

- One `check` job: `turbo build test` (typecheck + tests, cached) and `biome ci`
  (CI mode — non-zero on any format/lint violation).
- `--frozen-lockfile` needs a committed, current `nodejs/bun.lock` (updated by
  `bun add -D turbo @biomejs/biome`; this also unifies the lockfile after the
  dedupe PRs left it variously staged).
- `actions/cache` on `.turbo` gives cross-run Turbo cache (no remote cache).
- Bun provides the runtime for `tsc`/`bun test`; no separate Node needed.

Out of scope: publish/release, version matrix, Turbo remote caching.

## Execution plan

Branch `nodejs-tooling`, ordered commits:

1. `chore: add turbo + biome` — deps, `turbo.json`, `biome.json`,
   `packageManager`, root scripts, `.gitignore`, `bun.lock`. `bunx turbo build
   test` green.
2. `style: biome check --write across workspace` — formatter/imports only,
   isolated so the diff is obviously stylistic.
3. `fix: resolve remaining biome lint` — manual fixes until `biome check` = 0.
4. `ci: nodejs workflow` — added last, so the tree is already clean and the
   first run is green.

One PR (4 commits) or CI split out — reviewer's choice.

### Verification checkpoints

- After #1: `bunx turbo build test` green; rerun → cache hit.
- After #2: full `bun run test` (484) + `turbo build` green; `git diff --stat`
  confirms style-only.
- Side-effect imports: `bun packages/cli/src/cli.ts send -u logger://` + umbrella
  test confirm registration order intact.
- After #3: `biome check` exits 0.
- CI: first PR run green.

### Risks → mitigations

- organizeImports breaks registration order → caught by CLI/umbrella tests;
  `biome-ignore`/explicit order.
- Large diff hides a semantic change → formatter in its own commit + 484 tests
  before/after.
- `recommended` is noisy → auto-fix first, then targeted manual; noisy rules are
  NOT silenced (chose "clean to zero").
- bun + Turbo PM detection → resolved by the `packageManager` field.

Rollback: tooling is additive, runtime unchanged — revert the PR.
