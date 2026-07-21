#!/usr/bin/env bun
// fork_change - new file
//
// Verifies that every fork-specific change in shared upstream-owned source files
// is annotated with a fork_change marker. This mirrors the intent of
// script/check-opencode-annotations.ts (Kilo's own equivalent guard) but is
// scoped to the fork_change marker token so our diff is distinguishable from
// Kilo's kilocode_change markers.
//
// Usage:
//   bun run script/check-fork-annotations.ts                  # diff against origin/main
//   bun run script/check-fork-annotations.ts --base <ref>     # diff against <ref>
//
// A line is "covered" if it:
//   - contains a fork_change marker comment              (inline annotation)
//   - falls inside a fork_change start/end block         (block annotation)
//   - is in a file whose first non-shebang non-empty line is (whole-file annotation)
//     // fork_change - new file
//   - is empty / whitespace-only                         (skipped)
//   - is itself a marker line                            (auto-covered)
//
// JS (//), JSX ({/ * ... * /}), YAML (#), TOML (#), and shell (#) comment styles are recognized.
//
// Exempt paths (no fork markers needed):
//   - packages/opencode/src/fork/**
//   - packages/opencode/test/fork/**
//   - Any path containing "kilocode" or "fork" in directory or filename
//   - Any path with a directory starting with "kilo-" (Kilo-owned packages)
//   - packages/kilo-vscode/**, packages/kilo-docs/**, etc. (Kilo-owned)
//   - script/check-fork-annotations.ts (this file)

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".yml", ".yaml", ".toml", ".sh", ".bash", ".zsh"])
// Shared upstream scopes — same as Kilo's checker, these are the directories
// where fork_change markers are required for non-exempt files.
const SCOPES = [
  "packages/opencode",
  "packages/extensions",
  "packages/ui",
  "packages/shared",
  "packages/script",
  "packages/storybook",
  "script",
  ".github",
  "github",
]
const EXEMPT_SCOPES = [
  "script/upstream",
  "script/check-fork-annotations.ts",
  "script/check-opencode-annotations.ts",
]

const args = process.argv.slice(2)
const baseIdx = args.indexOf("--base")
const base = baseIdx !== -1 ? args[baseIdx + 1] : "origin/main"

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" })
  if (result.status !== 0) {
    const msg = result.stderr?.trim() || result.stdout?.trim() || "unknown error"
    console.error(`Command failed: ${cmd} ${args.join(" ")}\n${msg}`)
    process.exit(1)
  }
  return result.stdout?.trim() ?? ""
}

function changedFiles() {
  const out = run("git", ["diff", "--name-only", "--diff-filter=AMRT", `${base}...HEAD`, "--", ...SCOPES])
  return out ? out.split("\n").filter(Boolean) : []
}

function isExempt(file: string) {
  const norm = file.replaceAll("\\", "/").toLowerCase()
  const parts = norm.split("/")
  if (parts.some((part) => part.includes("fork") || part.includes("kilocode"))) return true
  if (parts.some((part) => part.startsWith("kilo-"))) return true
  return EXEMPT_SCOPES.some((scope) => norm === scope || norm.startsWith(`${scope}/`))
}

function isChecked(file: string) {
  const norm = file.replaceAll("\\", "/")
  return SCOPES.some((scope) => norm === scope || norm.startsWith(`${scope}/`))
}

function content(file: string) {
  const abs = path.join(ROOT, file)
  if (existsSync(abs)) return readFileSync(abs, "utf8")
  const out = run("git", ["show", `HEAD:${file}`])
  const target = out.trim()
  if (!target.startsWith("../")) return out
  return readFileSync(path.resolve(path.dirname(abs), target), "utf8")
}

function isSource(file: string) {
  const ext = path.extname(file)
  if (SOURCE_EXTS.has(ext)) return true
  if (ext) return false
  return content(file).startsWith("#!")
}

// Matches the start of a fork_change marker in JS, JSX, YAML, TOML, and shell comments.
const MARKER_PREFIX = /(?:\/\/|\{?\s*\/\*|#)\s*fork_change\b/

function hasMarker(line: string) {
  return MARKER_PREFIX.test(line)
}

function addedLines(file: string): { added: Set<number>; revert: boolean } {
  const diff = run("git", ["diff", "--unified=0", "--diff-filter=AMRT", `${base}...HEAD`, "--", file])
  const added = new Set<number>()
  let revert = false
  const all = diff.split("\n")

  let i = 0
  while (i < all.length) {
    const header = all[i] ?? ""
    const m = header.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (!m) {
      i++
      continue
    }

    const start = Number(m[1])
    let pos = 0
    let j = i + 1
    while (j < all.length) {
      const hl = all[j] ?? ""
      if (hl.startsWith("@@") || hl.startsWith("diff ")) break
      if (hl.startsWith("+") && !hl.startsWith("+++")) {
        added.add(start + pos)
        pos++
      } else if (hl.startsWith("-") && !hl.startsWith("---") && hasMarker(hl.slice(1))) {
        revert = true
      }
      j++
    }

    i = j
  }

  return { added, revert }
}

function coveredLines(text: string): { lines: string[]; covered: Set<number> } {
  const lines = text.split(/\r?\n/)
  const covered = new Set<number>()

  const first = lines.find((x) => x.trim() !== "" && !x.startsWith("#!"))
  if (first?.match(/(?:\/\/|\{?\s*\/\*|#)\s*fork_change\s*-\s*new\s*file\b/)) {
    for (let i = 1; i <= lines.length; i++) covered.add(i)
    return { lines, covered }
  }

  let block = false
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1
    const line = lines[i] ?? ""

    if (line.match(/(?:\/\/|\{?\s*\/\*|#)\s*fork_change\s+start\b/)) {
      block = true
      covered.add(n)
      continue
    }

    if (line.match(/(?:\/\/|\{?\s*\/\*|#)\s*fork_change\s+end\b/)) {
      covered.add(n)
      block = false
      continue
    }

    if (block) {
      covered.add(n)
      continue
    }

    if (hasMarker(line)) covered.add(n)
  }

  return { lines, covered }
}

// --- main ---

const files = changedFiles().filter((f) => isChecked(f) && !isExempt(f) && isSource(f))

if (files.length === 0) {
  console.log("No shared upstream source files changed — nothing to check.")
  process.exit(0)
}

const violations: string[] = []

for (const file of files) {
  const { added, revert } = addedLines(file)
  if (added.size === 0) continue
  if (revert) continue

  const text = content(file)
  const { lines, covered } = coveredLines(text)

  for (const n of added) {
    const line = lines[n - 1] ?? ""
    const trim = line.trim()
    if (!trim) continue
    if (hasMarker(trim)) continue
    if (!covered.has(n)) violations.push(`  ${file}:${n}: ${trim}`)
  }
}

if (violations.length === 0) {
  console.log("All fork changes are annotated with fork_change markers.")
  process.exit(0)
}

console.error(
  [
    "Unannotated fork changes found in shared upstream files:",
    "",
    ...violations,
    "",
    "Every fork-specific change in shared upstream source files must be annotated.",
    "",
    "Inline (single line):",
    "  const url = baseURL // fork_change",
    "",
    "Block (multiple lines):",
    "  // fork_change start",
    "  ...",
    "  // fork_change end",
    "",
    "JSX/TSX:",
    "  {/* fork_change */}",
    "",
    "YAML/TOML/shell:",
    "  # fork_change",
    "",
    "New file:",
    "  // fork_change - new file",
    "",
    "Exempt paths (no markers needed):",
    "  - packages/opencode/src/fork/**",
    "  - packages/opencode/test/fork/**",
    "  - Any path containing 'fork' or 'kilocode'",
    "  - Any directory starting with 'kilo-'",
    "",
    "See FORK.md for details.",
  ].join("\n"),
)

process.exit(1)
