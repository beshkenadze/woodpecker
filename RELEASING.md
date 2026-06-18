# Releasing & publishing

`@woodpecker-js/*` packages are published to the **public npm registry** with
[Changesets](https://github.com/changesets/changesets) + Turborepo, using
**[npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC)** —
no long-lived `NPM_TOKEN`, and **provenance is attached automatically**.

Each package builds to `dist/` (ESM `.mjs` + `.d.mts`) via
[tsdown](https://tsdown.dev) and ships only `dist/` (see each `package.json`
`files`).

## How publishing is wired

- `.github/workflows/release.yml` has `permissions: id-token: write`, sets up a
  recent **npm CLI** (≥ 11.5.1, required for OIDC), and publishes via
  `changeset publish` (which runs `npm publish`). No npm token is stored.
- OIDC + public repo + public package ⇒ npm generates provenance automatically.

## One-time setup (owner)

### A. Bootstrap the 23 packages (first publish only)

npm trusted publishers are configured **per package**, and a package's settings
only exist once the package is published. So the very first `0.1.0` of each
package must be created with a token (one-time):

1. `npm login` locally (an account that owns the `@woodpecker-js` scope — create
   the org `woodpecker-js` on npmjs.com first; it's free for public packages).
2. From the repo root: `bun run release` (`turbo build && changeset publish`).
   This publishes all 23 packages at `0.1.0`.

(Alternatively, do this bootstrap in CI with a temporary `NPM_TOKEN` secret +
an `.npmrc` step, then remove it.)

### B. Switch to trusted publishing (OIDC), token-free

For each `@woodpecker-js/*` package, on npmjs.com → *Package settings → Trusted
Publisher → GitHub Actions*, set:

- **Organization or user:** `beshkenadze`
- **Repository:** `woodpecker`
- **Workflow filename:** `release.yml`
- **Environment:** *(leave empty)*
- **Allowed actions:** `npm publish`

> npm does **not** validate these when you save — the repo, workflow filename
> and scope must match exactly or publishing fails with `ENEEDAUTH`.

After this, the `release` workflow publishes with **no token**. Recommended:
restrict/revoke any bootstrap token afterwards.

## Day-to-day flow (after setup)

1. Make changes on a branch; add a changeset:
   ```bash
   bunx changeset   # pick packages + bump (patch/minor/major), write a summary
   ```
   Commit the generated `.changeset/*.md`.
2. Open a PR and merge to `main`.
3. The **`release`** workflow:
   - pending changesets → opens/updates a **"Version Packages"** PR (bumps
     versions, writes `CHANGELOG.md`, rewrites internal `workspace:*` ranges);
   - merge that PR → it **publishes** the bumped packages to npm via OIDC, with
     provenance, and pushes git tags.

## Scripts

| Command | What |
|---|---|
| `bun run build` | `turbo build` — tsdown → `dist/` for every package (cached) |
| `bun run release` | `turbo build && changeset publish` (used by CI / bootstrap) |
| `bun run version` | `changeset version` — apply changesets, bump, changelog |
| `bunx changeset` | author a new changeset |

## Notes & constraints

- **Publish must run via `npm publish`.** OIDC trusted publishing does not work
  with `bun publish`/`pnpm publish`. `changeset publish` uses the npm CLI (the
  workflow installs a recent npm). Keep it that way.
- `repository.url` in each `package.json` must match the GitHub repo
  (`github.com/beshkenadze/woodpecker`) — already set.
- Provenance needs a **public** repo + **public** package (both true here); it is
  not supported from private repos.
- `workspace:*` deps are rewritten to real version ranges at publish time.
- Consumers install the umbrella `@woodpecker-js/woodpecker` (all services) or a
  single service, e.g. `@woodpecker-js/slack`; the CLI is `@woodpecker-js/cli`.
- Packages declare `license: "MIT"`; the repo-root `LICENSE` applies. (Optional:
  copy `LICENSE` into each package before publish to include it in every tarball.)
