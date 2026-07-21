#!/usr/bin/env bun
// fork_change - new file
//
// Local build helper for the fork. Produces .vsix extension files in
// packages/kilo-vscode/out/ for the current platform.
//
// Usage:
//   bun run packages/kilo-vscode/script/fork-build.ts           # build everything
//   bun run packages/kilo-vscode/script/fork-build.ts --no-cli  # skip CLI build (use existing dist)
//
// Steps:
//   1. Build the CLI binary for the current platform (packages/opencode/script/build.ts --single)
//   2. Build the VS Code extension .vsix packages (packages/kilo-vscode/script/build.ts)
//   3. Print the paths of the resulting .vsix files

import { $ } from "bun"
import { join, delimiter } from "node:path"
import { existsSync, readdirSync } from "node:fs"

const skipCli = process.argv.includes("--no-cli")

const vscodeDir = join(import.meta.dir, "..")
const repoDir = join(vscodeDir, "..", "..")
const opencodeDir = join(repoDir, "packages", "opencode")
const cliDistDir = join(opencodeDir, "dist")

// Put the extension's local node_modules/.bin on PATH so `vsce` (invoked bare by
// script/build.ts) resolves without requiring a global install.
const binDir = join(vscodeDir, "node_modules", ".bin")
const env = { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}` }

async function step(name: string, fn: () => Promise<void>) {
  console.log(`\n=== ${name} ===\n`)
  await fn()
}

await step("Build CLI binary (--single)", async () => {
  if (skipCli) {
    if (!existsSync(cliDistDir)) {
      console.error(`--no-cli was passed but ${cliDistDir} does not exist`)
      process.exit(1)
    }
    console.log("Skipping CLI build (--no-cli)")
    return
  }
  await $`./packages/opencode/script/build.ts --single --skip-install`
    .cwd(repoDir)
    .env(env)
})

await step("Build VS Code extension (.vsix)", async () => {
  await $`bun script/build.ts`.cwd(vscodeDir).env({
    ...env,
    CLI_DIST_DIR: cliDistDir,
  })
})

const outDir = join(vscodeDir, "out")
const vsixFiles = existsSync(outDir)
  ? readdirSync(outDir)
      .filter((f) => f.endsWith(".vsix"))
      .map((f) => join(outDir, f))
  : []

console.log("\n=== Build complete ===\n")
if (vsixFiles.length === 0) {
  console.warn("No .vsix files found in packages/kilo-vscode/out/")
  process.exit(1)
}
for (const f of vsixFiles) console.log(f)
