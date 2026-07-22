// fork_change - new file
//
// Hard provider lock for this fork of Kilo-Org/kilocode.
//
// Only a single OpenAI-compatible provider (Genix) may be authorized,
// listed as connected, or used for model calls. Every other provider is
// unreachable — not merely hidden in the UI. Blocking happens at the
// server/handler layer (provider state init, list/authorize/callback/authSet/
// authRemove handlers) so a direct API or CLI call cannot bypass it.
//
// The provider identity is hardcoded: ID=genix, Display Name=Genix,
// Base URL=https://ai.gateway.genixventures.com/v1.
//
// Other configuration (API key and model list) is entered by the user via the
// normal provider config (kilo.json / opencode.json). The lock supplies the
// identity and base URL; the user-supplied config is deep-merged on top so
// only the locked provider is ever reachable.
//
// Tests opt out of the lock by setting KILO_FORK_DISABLE_PROVIDER_LOCK=1 in the
// test preload; in that mode every provider behaves as if unlocked.
//
// See FORK.md for the divergence-tracking convention.

import { Effect, Schema } from "effect"
import type { Info as ConfigProviderInfo } from "@opencode-ai/core/v1/config/provider"
import { ProviderV2 } from "@opencode-ai/core/provider"

const PROVIDER_ID = "genix"
const PROVIDER_NAME = "Genix"
const PROVIDER_BASE_URL = "https://ai.gateway.genixventures.com/v1"
const PROVIDER_NPM = "@ai-sdk/openai-compatible"

/** Lock is active unless the test override disables it. */
export function lockActive(): boolean {
  return process.env.KILO_FORK_DISABLE_PROVIDER_LOCK !== "1"
}

export interface LockedProvider {
  id: string
  name: string
  baseURL: string
  apiKey?: string
  npm: string
  models: string[]
}

export function lockedProvider(): LockedProvider {
  return {
    id: PROVIDER_ID,
    name: PROVIDER_NAME,
    baseURL: PROVIDER_BASE_URL,
    npm: PROVIDER_NPM,
    models: [],
  }
}

export function lockedProviderID(): ProviderV2.ID {
  return ProviderV2.ID.make(PROVIDER_ID)
}

export function isLockedProvider(id: string): boolean {
  // When the lock is disabled (tests), every provider is treated as allowed.
  if (!lockActive()) return true
  return id === PROVIDER_ID
}

export function lockedConfigProvider(): ConfigProviderInfo {
  const p = lockedProvider()
  return {
    name: p.name,
    npm: p.npm,
    options: {
      baseURL: p.baseURL,
    },
  }
}

export function lockedConfigEntry(): [string, ConfigProviderInfo] {
  return [lockedProvider().id, lockedConfigProvider()]
}

export class ForkProviderLockedError extends Schema.TaggedErrorClass<ForkProviderLockedError>()(
  "ForkProviderLockedError",
  {
    providerID: Schema.String,
    message: Schema.String,
  },
) {}

export function assertLockedProvider(providerID: string): Effect.Effect<void, ForkProviderLockedError> {
  if (isLockedProvider(providerID)) return Effect.void
  return Effect.fail(
    new ForkProviderLockedError({
      providerID,
      message: `Provider "${providerID}" is not allowed. This build is locked to the Genix provider; see FORK.md.`,
    }),
  )
}

export function filterProviderID(id: string): boolean {
  return isLockedProvider(id)
}
