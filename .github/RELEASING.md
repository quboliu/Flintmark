# Releasing Flintmark

Flintmark uses one product version and one Git tag for both editor targets.
Every tagged run publishes a VSIX, a downloadable Zed language-server bundle,
and a Zed dev-extension archive to the same GitHub Release. The same run also
publishes the VSIX to the VS Code Marketplace when credentials are available.

Zed's public registry is different: its
[official publishing flow](https://zed.dev/docs/extensions/developing-extensions#publishing-your-extension)
stores extensions as Git submodules in `zed-industries/extensions`, so a
release becomes public there only after an upstream update PR is merged. The
PR can be submitted immediately after the GitHub artifacts are live, but its
merge time cannot be made atomic with the VS Code Marketplace release.

The VS Code Marketplace connection currently uses an Azure DevOps Personal
Access Token (PAT) stored in the protected `marketplace` GitHub Environment.

Microsoft retires global Azure DevOps PATs on December 1, 2026. Before that
date, migrate this workflow to Microsoft Entra workload identity federation or
publish the VSIX manually from the Marketplace publisher management page.

## One-time PAT setup

1. Sign in to [Azure DevOps](https://dev.azure.com/) with the Microsoft account
   that manages publisher `quboliu`. If the account has no Azure DevOps
   organization, create one first; the organization only provides access to the
   PAT settings page.
2. Open **User settings -> Personal access tokens -> New Token**. Configure:

   - Name: `flintmark-github-marketplace`
   - Organization: **All accessible organizations**
   - Expiration: choose a date and record it for rotation
   - Scopes: **Custom defined -> Show all scopes -> Marketplace -> Manage**

3. Copy the PAT when it is displayed. Azure DevOps does not show it again.
4. In GitHub, open **Settings -> Environments -> marketplace**. The environment
   must allow only the `main` branch and tags matching `v*`.
5. Add an environment secret named `VSCE_PAT` containing the PAT.
6. Run **Actions -> Marketplace auth check -> Run workflow** on `main`. It is
   ready when `vsce verify-pat quboliu` succeeds.

Never put the PAT in repository variables, workflow YAML, shell history, issue
comments, or release notes. Rotate it before its expiration date.

Microsoft's current PAT instructions and retirement notice are in
[Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Cut a release

1. Update the same version in all five release manifests:

   - `package.json`
   - the root package entries in `package-lock.json`
   - `editors/zed/extension.toml`
   - `editors/zed/Cargo.toml`
   - `editors/zed/Cargo.lock` (refresh it after changing `Cargo.toml`, including
     the package version)

   `npm run check:versions` fails if any release manifest drifts. After a
   version bump, run `cargo check --manifest-path editors/zed/Cargo.toml` once
   to refresh the root package entry in `Cargo.lock`, then use `--locked` in
   verification and CI.

2. Add the matching `## X.Y.Z` entry at the top of `CHANGELOG.md`, covering
   both hosts and calling out any host-specific capability differences.
3. Run the release gate:

   ```sh
   npm run check:versions
   npm run lint
   npx tsc --noEmit -p .
   npm run test:unit
   npm run test:perf
   npm run test:zed
   rustup target add wasm32-wasip2
   cargo build --locked --release --manifest-path editors/zed/Cargo.toml --target wasm32-wasip2
   npx @vscode/vsce package
   ```

4. Commit and push the release changes, then tag that exact commit:

   ```sh
   git tag vX.Y.Z
   git push origin main
   git push origin vX.Y.Z
   ```

The `Release` workflow verifies that the tag and all manifests agree, then
builds and validates:

- `flintmark-X.Y.Z.vsix` — VS Code/Cursor extension.
- `flintmark-zed-lsp-X.Y.Z.zip` — the server downloaded by the Zed adapter.
- `flintmark-zed-X.Y.Z.zip` — source archive for Zed development installation.
- `SHA256SUMS.txt` — checksums for both Zed archives.

It creates the GitHub Release before either marketplace handoff, because the
Zed adapter for version `X.Y.Z` downloads its server from tag `vX.Y.Z`. When
`VSCE_PAT` is available the workflow verifies Marketplace publisher access and
publishes the same VSIX using `--skip-duplicate`. Without a PAT, Marketplace
publishing is explicitly skipped while the GitHub Release remains successful;
use the manual fallback below for that release.

Run **Marketplace auth check** before tagging whenever automated Marketplace
publishing is expected. A failed or unavailable check does not block a
GitHub-only release.

## First Zed registry publication

The existing `v0.32.13` tag predates the Zed artifact, so do not submit that
version to the Zed registry. Use the first new coordinated tag (for example,
`v0.33.0`) after its GitHub Release contains the Zed LSP archive.

1. Install `editors/zed` as a dev extension and test completion, definition,
   references, Outline, and native Markdown preview against that tagged build.
2. Fork `zed-industries/extensions` to the maintainer's personal account and
   add this public repository as an HTTPS submodule:

   ```sh
   git submodule add https://github.com/quboliu/flintmark.git extensions/flintmark
   ```

3. Add the registry entry, using the exact tagged version:

   ```toml
   [flintmark]
   submodule = "extensions/flintmark"
   path = "editors/zed"
   version = "X.Y.Z"
   ```

4. Run `pnpm sort-extensions`, commit the submodule and registry changes, and
   open a PR to `zed-industries/extensions`. The referenced Flintmark commit
   must be reachable from a public branch. `editors/zed/LICENSE` is deliberately
   present because Zed validates the license at the configured `path`, not only
   at the monorepo root.
5. After the PR merges, verify Flintmark appears in Zed's Extension Gallery and
   installs on macOS, Linux, and Windows. The adapter uses Zed's managed Node.js,
   so the downloaded LSP bundle is platform-neutral.

## Later Zed updates

For every later tag, update the Flintmark submodule commit and the version in
the registry's `extensions.toml`, then open another PR. Once the first listing
has been accepted, this submission step can be automated with the
[community action](https://github.com/huacnlee/zed-extension-action) linked from
Zed's official publishing guide. Keep it in a separate post-release job so it
runs only after the GitHub asset checks pass:

- protect it with a `zed-registry` GitHub Environment;
- store the committer credential as `ZED_EXTENSIONS_TOKEN` and the personal
  extensions fork as a repository variable;
- pin the action to a reviewed full commit SHA rather than a floating tag;
- leave the upstream PR merge to Zed maintainers.

Until those credentials and the initial upstream listing exist, the supported
flow is automatic GitHub + VS Code publication followed by a manual Zed update
PR. This preserves one source tag and one version while acknowledging the
registry's mandatory review boundary.

## Manual fallback

If the PAT is unavailable, download the validated VSIX from the GitHub Release
(or run `npx @vscode/vsce package` from a clean checkout) and upload it at the
[publisher management page](https://marketplace.visualstudio.com/manage/publishers/quboliu).

If the Zed update automation is unavailable, follow **Later Zed updates** by
hand; do not upload the Zed adapter to an unrelated marketplace or embed the
language server in the extension repository, because Zed's publication rules
require language servers to be downloaded or discovered in the user's
environment.
