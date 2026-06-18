# Releasing & publishing

`@woodpecker-js/*` packages are published to the **public npm registry** with
[Changesets](https://github.com/changesets/changesets) + Turborepo. Each package
builds to `dist/` (ESM `.mjs` + `.d.mts`) via [tsdown](https://tsdown.dev) and
ships only `dist/` (see each `package.json` `files`).

## One-time setup (owner)

1. **Create the npm org `@woodpecker-js`.** On npmjs.com → *Add Organization* →
   name `woodpecker-js` (free for public packages; the bare `woodpecker` org is
   taken). All packages already set `publishConfig.access = "public"`.
2. **Create an npm token.** npm → *Access Tokens* → *Generate New Token* →
   **Automation** (or *Granular*, read+write to `@woodpecker-js/*`).
3. **Add it as a repo secret.** GitHub → repo *Settings → Secrets and variables →
   Actions* → new secret **`NPM_TOKEN`**.

That's it — no other secret is needed (`GITHUB_TOKEN` is provided automatically;
provenance uses OIDC via `id-token: write`).

## Day-to-day flow

1. Make changes on a branch.
2. Add a changeset describing the release:
   ```bash
   bunx changeset
   ```
   Pick the affected packages and the bump (patch/minor/major); write a summary.
   Commit the generated `.changeset/*.md`.
3. Open a PR and merge to `main`.
4. The **`release`** workflow runs on `main`:
   - If there are pending changesets → it opens/updates a **"Version Packages"**
     PR (bumps versions, writes `CHANGELOG.md`, updates internal `workspace:*`
     dependency ranges).
   - Merge that PR → the workflow runs again and **publishes** the bumped
     packages to npm (with provenance) and pushes git tags.

## First publish

Versions start at `0.1.0`. After the scope + `NPM_TOKEN` are in place, either:

- **CI:** merge this setup to `main`; with no pending changesets the workflow
  runs `changeset publish`, which publishes the not-yet-published `0.1.0`
  packages; **or**
- **Locally:** `npm login`, then from the repo root `bun run release`
  (`turbo build && changeset publish`).

## Scripts

| Command | What |
|---|---|
| `bun run build` | `turbo build` — tsdown → `dist/` for every package (cached) |
| `bun run release` | `turbo build && changeset publish` (used by CI) |
| `bun run version` | `changeset version` — apply changesets, bump, changelog |
| `bunx changeset` | author a new changeset |

## Notes

- `workspace:*` deps are rewritten to real version ranges at publish time.
- Consumers install the umbrella `@woodpecker-js/woodpecker` (all services) or any
  single service, e.g. `@woodpecker-js/slack`; the CLI is `@woodpecker-js/cli`.
- The packages declare `license: "MIT"`; the repo-root `LICENSE` applies.
  (Optional: copy `LICENSE` into each package before publish if you want it in
  every tarball.)
