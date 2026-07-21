#!/usr/bin/env bun
// fork_change - new file
//
// Publishes the fork's CLI to npm under the "genix-cli" package name.
//
// The upstream CLI is published as @kilocode/cli with per-platform optional
// dependencies (@kilocode/cli-linux-x64, etc.). This script:
//   1. Builds all platform binaries via packages/opencode/script/build.ts
//   2. Rewrites the package name in each dist/*/package.json from @kilocode/cli-*
//      to kilocode-cli-*
//   3. Rewrites the super-package name and optionalDependencies keys
//   4. Publishes each platform package and the super-package to npm
//
// Usage:
//   bun run packages/opencode/script/fork-publish.ts
//
// Requires:
//   - NPM_TOKEN env var (npm auth token with publish rights to kilocode-cli*)
//   - GH_TOKEN env var (for GitHub release asset upload, same as upstream build)
//
// The version is derived from the git tag (v*) or KILO_VERSION env var.

import { $ } from "bun"
import { Script } from "@opencode-ai/script"
import pkg from "../package.json"
import { dirname, join } from "node:path"

const dir = join(import.meta.dir, "..")
process.chdir(dir)

// gh targets the repo from GH_REPO when set; otherwise it falls back to gh's
// configured default, which may resolve to an upstream remote the local user
// cannot write to. Derive the fork repo from the git origin so local runs
// publish to the fork instead of upstream.
async function repoFromOrigin(): Promise<string | undefined> {
  const url = (await $`git remote get-url origin`.quiet().text().catch(() => "")).trim()
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.#]+)/)
  return m ? `${m[1]}/${m[2]}` : undefined
}
const repo = process.env.GH_REPO || (await repoFromOrigin())
if (repo) process.env.GH_REPO = repo

const ORIGINAL_NAME = "@kilocode/cli"
const FORK_NAME = "genix-cli"

function rename(name: string): string {
  return name.replace(ORIGINAL_NAME, FORK_NAME)
}

async function rewritePackageJson(path: string, fn: (pkg: any) => void) {
  const raw = await Bun.file(path).text()
  const pkg = JSON.parse(raw)
  fn(pkg)
  await Bun.file(path).write(JSON.stringify(pkg, null, 2) + "\n")
}

console.log("=== Creating GitHub release ===\n")

// build.ts runs `gh release upload v<version>` when KILO_RELEASE is set, which
// requires the release to already exist. The normal publish flow creates the
// draft release in script/version.ts before building; the fork flow runs
// build.ts directly, so create it here first. Use --prerelease for versions
// with a prerelease tag (e.g. 1.0.0-beta.1). Idempotent: skip if it exists.
const tag = `v${Script.version}`
const isPre = !!Script.version.match(/-(alpha|beta|rc|pre)/)
const preFlag = isPre ? ["--prerelease"] : []
const exists = (await $`gh release view ${tag}`.nothrow().quiet()).exitCode === 0
if (!exists) {
  await $`gh release create ${tag} -d ${preFlag} --title ${tag} --notes ""`
} else {
  console.log(`  release ${tag} already exists, skipping create`)
}

console.log("=== Building CLI binaries (all platforms) ===\n")
await $`./script/build.ts`.env({
  ...process.env,
  KILO_RELEASE: "true",
})

const distDir = join(dir, "dist")

// Platform packages are scoped (@kilocode/cli-linux-x64, ...), so build.ts
// writes them to nested paths like dist/@kilocode/cli-linux-x64/package.json.
// A flat readdirSync(distDir) only sees the "@kilocode" scope directory and
// misses every platform package. Mirror publish.ts and glob one level deeper.
// Returns absolute package.json paths, excluding the super-package which lives
// at dist/@kilocode/cli (its name has no trailing "-<platform>-<arch>").
function platformPackageJsonPaths(): string[] {
  const paths: string[] = []
  for (const rel of new Bun.Glob("*/*/package.json").scanSync({ cwd: distDir })) {
    paths.push(join(distDir, rel))
  }
  return paths
}

console.log("\n=== Rewriting package names ===\n")

// Rewrite each platform package. At this point the super-package has not been
// assembled yet, so every match is a @kilocode/cli-* platform package.
for (const pkgPath of platformPackageJsonPaths()) {
  await rewritePackageJson(pkgPath, (pkg) => {
    if (pkg.name?.startsWith(ORIGINAL_NAME + "-")) {
      pkg.name = rename(pkg.name)
      console.log(`  ${pkg.name}`)
    }
    if (pkg.repository?.url) {
      pkg.repository.url = "https://github.com/your-org/your-fork"
    }
  })
}

// Build the super-package. build.ts only produces platform packages
// (@kilocode/cli-*); the super-package (@kilocode/cli) is assembled here,
// mirroring packages/opencode/script/publish.ts. It contains the launcher
// stub, postinstall hook, and optionalDependencies pointing at the renamed
// platform packages.
const superPkgDir = join(distDir, ORIGINAL_NAME)
await $`mkdir -p ${superPkgDir}/bin`
await $`cp ./bin/genix-cli ${superPkgDir}/bin/genix-cli`
await $`cp ./script/postinstall.mjs ${superPkgDir}/postinstall.mjs`
await Bun.file(join(superPkgDir, "LICENSE")).write(await Bun.file(join(dir, "../../LICENSE")).text())
await Bun.file(join(superPkgDir, "README.md")).write(await Bun.file(join(dir, "README.md")).text())

// Rewrite @kilocode/cli references in the launcher and postinstall so they
// resolve the renamed @genix/cli-* platform packages at install time.
for (const file of ["bin/genix-cli", "postinstall.mjs"]) {
  const p = join(superPkgDir, file)
  const text = await Bun.file(p).text()
  await Bun.file(p).write(text.replaceAll(ORIGINAL_NAME, FORK_NAME))
}

// Collect platform package versions for optionalDependencies. The super-package
// dir (dist/@kilocode/cli) now exists and its package.json matches the glob too,
// but its name is exactly FORK_NAME (no trailing "-"), so the filter excludes it.
const optionalDeps: Record<string, string> = {}
for (const pkgPath of platformPackageJsonPaths()) {
  const pkg = await Bun.file(pkgPath).json()
  if (pkg.name?.startsWith(FORK_NAME + "-")) {
    optionalDeps[pkg.name] = pkg.version
  }
}

await Bun.file(join(superPkgDir, "package.json")).write(
  JSON.stringify(
    {
      name: FORK_NAME,
      bin: { "genix-cli": "./bin/genix-cli" },
      scripts: { postinstall: "node ./postinstall.mjs" },
      version: Script.version,
      license: pkg.license,
      optionalDependencies: optionalDeps,
      repository: { type: "git", url: "https://github.com/your-org/your-fork" },
    },
    null,
    2,
  ) + "\n",
)
console.log(`  super: ${FORK_NAME}`)

console.log("\n=== Publishing to npm ===\n")

async function publishPkg(pkgDir: string, name: string) {
  console.log(`  publishing ${name}...`)
  await $`bun pm pack`.cwd(pkgDir)
  await $`npm publish *.tgz --access public`.cwd(pkgDir).env({
    ...process.env,
    NODE_AUTH_TOKEN: process.env.NPM_TOKEN,
  })
}

// Publish platform packages
const platformDirs: Record<string, string> = {}
for (const pkgPath of platformPackageJsonPaths()) {
  const pkg = await Bun.file(pkgPath).json()
  if (pkg.name?.startsWith(FORK_NAME + "-")) {
    platformDirs[pkg.name] = dirname(pkgPath)
  }
}

for (const [name, pkgDir] of Object.entries(platformDirs)) {
  await publishPkg(pkgDir, name)
}

// Publish super-package
await publishPkg(superPkgDir, FORK_NAME)

console.log("\n=== Done ===\n")
console.log(`Published ${FORK_NAME} with ${Object.keys(platformDirs).length} platform packages.`)
