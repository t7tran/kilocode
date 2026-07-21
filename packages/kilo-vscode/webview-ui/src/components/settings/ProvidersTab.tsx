import { Button } from "@kilocode/kilo-ui/button"
import { Card } from "@kilocode/kilo-ui/card"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"
import { ProviderIcon } from "@kilocode/kilo-ui/provider-icon"
import { Tag } from "@kilocode/kilo-ui/tag"
import { showToast } from "@kilocode/kilo-ui/toast"
import { Component, For, Show, createMemo } from "solid-js"
import { useLanguage } from "../../context/language"
import { useProvider } from "../../context/provider"
import { useVSCode } from "../../context/vscode"
import type { Provider } from "../../types/messages"
import ProviderConnectDialog from "./ProviderConnectDialog"
import { providerIcon } from "./provider-catalog"
import { createProviderAction } from "../../utils/provider-action"

// fork_change - this build is locked to a single Genix provider. The Providers
// tab only manages that one provider: connecting it via API key and showing its
// connection status. All other provider UI (Kilo Gateway, custom providers,
// catalog browse, disabled providers) has been removed.
const GENIX_PROVIDER_ID = "genix"

type ProviderSource = "env" | "api" | "config" | "custom"

const ProvidersTab: Component = () => {
  const dialog = useDialog()
  const provider = useProvider()
  const language = useLanguage()
  const vscode = useVSCode()
  const action = createProviderAction(vscode)

  const connectedProviders = createMemo(() => {
    const all = provider.providers()
    return provider
      .connected()
      .filter((id) => all[id])
      .map((id) => all[id])
      .filter((item): item is Provider => !!item)
  })

  const isGenixConnected = createMemo(() => provider.connected().includes(GENIX_PROVIDER_ID))

  function source(item: Provider): ProviderSource | undefined {
    if (!("source" in item)) return
    const value = (item as Provider & { source?: string }).source
    if (value === "env" || value === "api" || value === "config" || value === "custom") return value
    return
  }

  function sourceTag(item: Provider) {
    const current = source(item)
    if (current === "env") return language.t("settings.providers.tag.environment")
    if (current === "api") return language.t("provider.connect.method.apiKey")
    if (current === "config") return language.t("settings.providers.tag.config")
    if (current === "custom") return language.t("settings.providers.tag.custom")
    return language.t("settings.providers.tag.other")
  }

  function canDisconnect(item: Provider) {
    return source(item) !== "env"
  }

  function disconnect(providerID: string, name: string) {
    action.send(
      { type: "disconnectProvider", providerID },
      {
        onDisconnected: () => {
          showToast({
            variant: "success",
            icon: "circle-check",
            title: language.t("provider.disconnect.toast.disconnected.title", { provider: name }),
            description: language.t("provider.disconnect.toast.disconnected.description", { provider: name }),
          })
        },
        onError: (message) => {
          showToast({ title: language.t("common.requestFailed"), description: message.message })
        },
      },
    )
  }

  function connect() {
    dialog.show(() => <ProviderConnectDialog providerID={GENIX_PROVIDER_ID} />)
  }

  return (
    <div>
      {/* Connected providers */}
      <h4 style={{ "margin-top": "16px", "margin-bottom": "8px" }}>
        {language.t("settings.providers.section.connected")}
      </h4>
      <Card>
        <Show
          when={connectedProviders().length > 0}
          fallback={
            <div
              style={{
                padding: "16px 0",
                "font-size": "var(--kilo-font-size-14)",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              }}
            >
              {language.t("settings.providers.connected.empty")}
            </div>
          }
        >
          <For each={connectedProviders()}>
            {(item) => (
              <div
                style={{
                  display: "flex",
                  "flex-wrap": "wrap",
                  "align-items": "center",
                  "justify-content": "space-between",
                  gap: "16px",
                  "min-height": "56px",
                  padding: "12px 0",
                  "border-bottom": "1px solid var(--border-weak-base)",
                }}
              >
                <div style={{ display: "flex", "align-items": "center", gap: "12px", "min-width": 0 }}>
                  <ProviderIcon id={providerIcon(item)} width={20} height={20} />
                  <span
                    style={{
                      "font-size": "var(--kilo-font-size-14)",
                      "font-weight": "500",
                      color: "var(--vscode-foreground)",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                    }}
                  >
                    {item.name}
                  </span>
                  <Tag>{sourceTag(item)}</Tag>
                </div>
                <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                  <Show when={!canDisconnect(item)}>
                    <span
                      style={{
                        "font-size": "var(--kilo-font-size-14)",
                        color: "var(--text-base, var(--vscode-descriptionForeground))",
                        "padding-right": "12px",
                      }}
                    >
                      {language.t("settings.providers.connected.environmentDescription")}
                    </span>
                  </Show>
                  <Show when={canDisconnect(item)}>
                    <Button size="large" variant="ghost" onClick={() => disconnect(item.id, item.name)}>
                      {language.t("common.disconnect")}
                    </Button>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </Show>
      </Card>

      {/* Connect the Genix provider */}
      <Show when={!isGenixConnected()}>
        <h4 style={{ "margin-top": "24px", "margin-bottom": "8px" }}>
          {language.t("settings.providers.section.popular")}
        </h4>
        <Card>
          <div
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              "align-items": "center",
              "justify-content": "space-between",
              gap: "16px",
              "min-height": "56px",
              padding: "12px 0",
            }}
          >
            <div style={{ display: "flex", "flex-direction": "column", "min-width": 0 }}>
              <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                <ProviderIcon id={providerIcon(GENIX_PROVIDER_ID)} width={20} height={20} />
                <span
                  style={{
                    "font-size": "var(--kilo-font-size-14)",
                    "font-weight": "500",
                    color: "var(--vscode-foreground)",
                  }}
                >
                  Genix
                </span>
              </div>
            </div>
            <Button size="large" variant="secondary" icon="plus-small" onClick={connect}>
              {language.t("common.connect")}
            </Button>
          </div>
        </Card>
      </Show>
    </div>
  )
}

export default ProvidersTab
