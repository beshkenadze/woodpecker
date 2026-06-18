# Releasing & publishing

`@woodpecker-js/*` packages are published to the **public npm registry** with
[Changesets](https://github.com/changesets/changesets) + Turborepo. Each package
builds to `dist/` (ESM `.mjs` + `.d.mts`) via [tsdown](https://tsdown.dev) and
ships only `dist/` (see each `package.json` `files`).

## One-time setup (owner)

1. **Create the npm org `woodpecker-js`** (scope `@woodpecker-js`) — free for
   public packages. All packages set `publishConfig.access = "public"`.
2. **Create one npm token** scoped to the whole org: npm → *Access Tokens* →
   *Generate* → **Granular** with read+write to `@woodpecker-js/*` (or a classic
   *Automation* token). **One token publishes all packages — no per-package
   config.**
3. **Add it as a repo secret** `NPM_TOKEN` (GitHub → *Settings → Secrets and
   variables → Actions*).

That's it. On merge to `main` the `release` workflow publishes the bumped
packages (with provenance via `id-token`). `GITHUB_TOKEN` is provided
automatically.

## Day-to-day flow

1. On a branch, add a changeset:
   ```bash
   bunx changeset   # pick packages + bump (patch/minor/major), write a summary
   ```
   Commit the generated `.changeset/*.md`.
2. Open a PR and merge to `main`.
3. The **`release`** workflow:
   - pending changesets → opens/updates a **"Version Packages"** PR (bumps
     versions, writes `CHANGELOG.md`, rewrites internal `workspace:*` ranges);
   - merge that PR → it **publishes** the bumped packages and pushes git tags.

## Scripts

| Command | What |
|---|---|
| `bun run build` | `turbo build` — tsdown → `dist/` for every package (cached) |
| `bun run release` | `turbo build && changeset publish` (used by CI; also for a manual publish) |
| `bun run version` | `changeset version` — apply changesets, bump, changelog |
| `bunx changeset` | author a new changeset |

## Notes

- A **scope-wide token** (one `NPM_TOKEN`) covers every package — you never
  configure anything per package.
- `changeset publish` publishes via the **npm CLI** (the workflow installs a
  recent npm); `workspace:*` deps are rewritten to real version ranges at
  publish time.
- Provenance is attached for CI publishes (public repo + public package +
  `id-token: write`). A local `bun run release` (no OIDC) publishes **without**
  provenance.
- Consumers install the umbrella `@woodpecker-js/woodpecker` (all services) or a
  single service, e.g. `@woodpecker-js/slack`; the CLI is `@woodpecker-js/cli`.

## Optional: token-free via OIDC (trusted publishing)

For a long-lived-token-free setup you can later switch to npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC). Note it
is configured **per package** on npmjs.com (Package settings → Trusted Publisher
→ GitHub Actions: org `beshkenadze`, repo `woodpecker`, workflow `release.yml`,
action `npm publish`), there is no API to script it, and OIDC only works with
`npm publish`. With 22 packages already published you *can* now add it
package-by-package and then drop `NPM_TOKEN`.
