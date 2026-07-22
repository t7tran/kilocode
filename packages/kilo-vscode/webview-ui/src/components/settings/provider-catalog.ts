import { iconNames, type IconName } from "@opencode-ai/ui/icons/provider"
import type { Provider } from "../../types/messages"
import { KILO_PROVIDER_ID } from "../../../../src/shared/provider-model"

function validIcon(id: string | undefined): IconName | undefined {
  if (!id) return undefined
  if (iconNames.includes(id as IconName)) return id as IconName
  return undefined
}

export function providerIcon(provider: Provider | string): IconName {
  const providerID = typeof provider === "string" ? provider : provider.id
  const icon = typeof provider === "string" ? undefined : validIcon(provider.metadata?.icon)
  if (icon) return icon
  if (providerID === KILO_PROVIDER_ID) return validIcon("kilo") ?? "synthetic"
  const fallback = validIcon(providerID)
  if (fallback) return fallback
  return "synthetic"
}
