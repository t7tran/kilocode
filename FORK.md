# Fork Divergence Tracking

This repository is a fork of [Kilo-Org/kilocode](https://github.com/Kilo-Org/kilocode), which is itself a fork of [opencode](https://github.com/anomalyco/opencode). We rebase against `upstream/main` (Kilo-Org/kilocode) indefinitely, so minimizing and isolating our diff is as important as the features themselves.

This document is the authoritative reference for our fork's divergence-tracking convention. Kilo's own convention is documented in their `CONTRIBUTING.md` and `packages/kilo-docs/pages/contributing/architecture/development-patterns.md` — we do not modify those.

## Marker token: `fork_change`

Our fork uses the `fork_change` marker token. This is deliberately different from Kilo's `kilocode_change` marker so our diff is distinguishable from theirs during rebases.

| Change shape | Marker |
|---|---|
| One line | Trailing `// fork_change` |
| Multi-line block | `// fork_change start` and `// fork_change end` |
| New file in shared path | Top-level `// fork_change - new file` |
| JSX or TSX | JSX comment equivalents: `{/* fork_change */}` |
| YAML / TOML / shell | `# fork_change` |

### When markers are required

Any edit to a shared upstream-owned file (files that exist in Kilo-Org/kilocode) must be annotated with `fork_change` markers. This includes files under `packages/opencode/src/` (excluding `fork/` and `kilocode/` subdirectories), `script/`, and `.github/`.

### When markers are NOT required

Files in these paths never need `fork_change` markers — they are entirely fork-owned:

- `packages/opencode/src/fork/**` — fork-specific source code
- `packages/opencode/test/fork/**` — fork-specific tests
- Any path containing `fork` in the directory or filename
- Kilo-owned paths (containing `kilocode` or starting with `kilo-`)

## Fork-owned directories

New behavior goes in new, clearly fork-owned files/directories:

| Prefer | Avoid |
|---|---|
| `packages/opencode/src/fork/` | Broad edits to shared `packages/opencode/src/` files |
| `packages/opencode/test/fork/` | Shared tests that encode only fork behavior |
| Narrow import or injection seams in shared files | Refactors that enlarge upstream merge conflicts |

## CI guards

| Guard | When to run |
|---|---|
| `bun run script/check-fork-annotations.ts` | PR touches `packages/opencode/`; verifies shared upstream fork edits are annotated |
| `bun run script/check-workflows.ts` | Workflow add or remove changes; keeps workflow allowlist explicit |

The `check-fork-annotations.ts` script mirrors the intent of Kilo's `check-opencode-annotations.ts` but is scoped to the `fork_change` marker. It is run by the `check-fork-annotations.yml` GitHub Actions workflow on every PR.

## Provider lock

This fork is permanently locked to a single OpenAI-compatible provider (Genix). The lock is enforced at the server/handler layer, not just in the UI:

- **State init** (`packages/opencode/src/provider/provider.ts`): only the locked provider survives the provider pipeline; all others are deleted.
- **List handler** (`packages/opencode/src/server/routes/instance/httpapi/handlers/provider.ts`): the `list` endpoint filters `all`, `connected`, and `failed` to only the locked provider.
- **Authorize/callback handlers**: OAuth authorization is rejected for any non-locked provider.
- **authSet/authRemove handlers** (`handlers/control.ts`): direct API credential storage is rejected for any non-locked provider.
- **models.dev fetch**: forced off at startup via `packages/opencode/src/fork/preload.ts`; no network request to the catalog endpoint.

The provider identity is hardcoded in `packages/opencode/src/fork/lock.ts`:

| Field | Value |
|---|---|
| ID | `genix` |
| Display Name | `Genix` |
| Base URL | `https://ai.gateway.genixventures.com/v1` |
| AI SDK npm | `@ai-sdk/openai-compatible` |

The user supplies the remaining configuration (API key and model list) via normal provider config in `kilo.json` / `opencode.json`:

```jsonc
{
  "provider": {
    "genix": {
      "options": { "apiKey": "your-api-key" },
      "models": {
        "your-model-id": { "name": "Your Model" }
      }
    }
  }
}
```

## Branding

The fork replaces Kilo's visual identity with Genix branding. Source of truth for the mark is the Genix icon at `https://genixventures.com/wp-content/uploads/2024/04/Icon-Logo-Colour.png` (a white "G" on a blue gradient rounded square, `#0A8CCF` → `#4EB5E0`).

### VS Code extension icons

All extension icon assets live in `packages/kilo-vscode/assets/icons/` and were regenerated from the Genix mark. Filenames are unchanged, so no `package.json` or source path edits were needed:

| File | Role | Artwork |
|---|---|---|
| `logo-outline-black.png` (512×512) | Marketplace icon (top-level `icon`) | Full-colour Genix mark |
| `kilo-light.png` / `kilo-dark.png` (256×256) | Activity-bar container icon | Monochrome "G" **silhouette** on transparent (black for light theme, white for dark) |
| `kilo-light.svg` / `kilo-dark.svg` | Command icons, editor-tab icons, webview logos | Full-colour Genix mark |
| `kilo-icon-font.woff2` | Status-bar `$(kilo-logo)` glyph (Genix "G" at `U+F101`) | Monochrome "G" outline |

Activity-bar view-container icons are rendered by VS Code as a **monochrome mask** (theme-tinted), so a full-colour opaque square would collapse into a solid blob. Those two PNGs must therefore be transparent-background silhouettes. Everywhere else the icon renders literally, so the full-colour mark is used.

### Display name

`Genix Kilo Code` → `Genix Code` across all extension strings (i18n, `package.json`, `EXTENSION_DISPLAY_NAME`, alt text, tests) in `packages/kilo-vscode/`. The `genix-kilocode` package identifier is left unchanged.

### CLI wordmark

The startup banner wordmark is `KILO CLI` → `GENIX CLI`, redrawn in `packages/opencode/src/kilocode/cli/logo.ts` using portable half-block glyphs (`▀▄█`) — this also drops the sextant-based modern/fallback split. The banner is coloured Genix blue via the `right` palette in `packages/opencode/src/cli/ui.ts`, using **256-colour** index 32 (`#0087d7`, closest to the brand `#0186CD`) rather than a 24-bit truecolor escape, so it renders in terminals/ptys that don't advertise `COLORTERM=truecolor` (including the pty the VS Code extension spawns the CLI in).

The interactive entry-splash wordmark is `Kilo` → `Genix` in `packages/opencode/src/cli/cmd/run/splash.ts`. Its colour previously came from `theme.text`; a dedicated `logo` colour was added to `RunSplashTheme` in `packages/opencode/src/cli/cmd/run/theme.ts`, set to the Genix blue `#0186CD` as **truecolor** (not palette-indexed, so terminals with a remapped 256-colour cube still show blue).

The main **home-screen logo** (shown on first launch of the interactive TUI) is the fork-owned component `packages/tui/src/component/kilo-logo.tsx`, which renders the `GENIX CLI` block-art wordmark. It hardcoded a yellow (`#F8F675`); this was changed to the Genix blue `#0186CD` (truecolor). This is the most prominent CLI logo — the other two (`UI.logo()` help banner and the entry-splash wordmark) are separate, less-visible surfaces.

## Rebase workflow

1. Rebase against `upstream/main` (Kilo-Org/kilocode).
2. Resolve conflicts on shared files — look for `fork_change` markers to identify our changes.
3. Run `bun run script/check-fork-annotations.ts --base <upstream-ref>` to verify all fork changes are still annotated.
4. Run `bun run script/check-workflows.ts` to verify the workflow allowlist is up to date.
5. Fork-owned files under `packages/opencode/src/fork/` and `packages/opencode/test/fork/` should never conflict with upstream.

## Local builds

### VS Code extension (.vsix)

Build .vsix files for the current platform locally:

```bash
bun run packages/kilo-vscode/script/fork-build.ts
```

This runs the full pipeline: build the CLI binary (`--single`) then package the `.vsix` via `packages/kilo-vscode/script/build.ts`. Output goes to `packages/kilo-vscode/out/`.

To skip the CLI build (reuse an existing `packages/opencode/dist/`):

```bash
bun run packages/kilo-vscode/script/fork-build.ts --no-cli
```

### CLI binary only

```bash
cd packages/opencode
bun run build --single --skip-install
```

Output goes to `packages/opencode/dist/@kilocode/cli-<platform>-<arch>/bin/kilo`.

## Publishing

Fork builds are published via `.github/workflows/fork-publish.yml`, which triggers on `v*` tags and manual `workflow_dispatch`.

### GitHub Release (.vsix)

The `build-vscode` job builds multi-platform `.vsix` packages and uploads them as GitHub Release assets. It reuses the existing packaging script at `packages/kilo-vscode/script/build.ts`.

### npm publish (CLI)

The `publish-npm` job publishes the CLI to npm under the `kilocode-cli` package name. It:

1. Builds all platform binaries via `packages/opencode/script/build.ts`
2. Rewrites package names from `@kilocode/cli-*` to `kilocode-cli-*` via `packages/opencode/script/fork-publish.ts`
3. Publishes each platform package and the `kilocode-cli` super-package to npm

Requires an `NPM_TOKEN` secret with publish rights to the `kilocode-cli` package scope. Set it in the fork repo's Settings → Secrets and variables → Actions.

To skip npm publish (e.g. for a vsix-only release), trigger `workflow_dispatch` with the "Skip npm publish" option checked.

This workflow does not touch Kilo's own `publish.yml` or `beta.yml`.
