import { Auth } from "@/auth"
// kilocode_change start
import {
  invalidateAfterProviderAuthChange,
  invalidatePresence,
} from "@/kilocode/server/provider-auth-lifecycle"
// kilocode_change end
// fork_change start
import { isLockedProvider } from "@/fork/lock"
import * as Log from "@opencode-ai/core/util/log"
// fork_change end
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpApiError } from "effect/unstable/httpapi" // fork_change
import { RootHttpApi } from "../api"
import { LogInput } from "../groups/control"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { remove as removeAuth } from "@/kilocode/auth/remove" // kilocode_change

export const controlHandlers = HttpApiBuilder.group(RootHttpApi, "control", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service

    const authSet = Effect.fn("ControlHttpApi.authSet")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
      payload: Auth.Info
    }) {
      // fork_change start
      if (!isLockedProvider(ctx.params.providerID)) {
        const logger = Log.create({ service: "fork.control" })
        logger.warn("rejected auth.set for non-locked provider", { providerID: ctx.params.providerID })
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }
      // fork_change end
      yield* auth.set(ctx.params.providerID, ctx.payload).pipe(Effect.orDie)
      // kilocode_change start - drop old presence socket before instance disposal on Kilo auth changes
      if (ctx.params.providerID === "kilo") yield* invalidatePresence()
      yield* invalidateAfterProviderAuthChange(ctx.params.providerID)
      // kilocode_change end
      return true
    })

    const authRemove = Effect.fn("ControlHttpApi.authRemove")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
    }) {
      // fork_change start
      if (!isLockedProvider(ctx.params.providerID)) {
        const logger = Log.create({ service: "fork.control" })
        logger.warn("rejected auth.remove for non-locked provider", { providerID: ctx.params.providerID })
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }
      // fork_change end
      // kilocode_change start
      yield* removeAuth(ctx.params.providerID)
      if (ctx.params.providerID === "kilo") yield* invalidatePresence()
      yield* invalidateAfterProviderAuthChange(ctx.params.providerID)
      // kilocode_change end
      return true
    })

    const log = Effect.fn("ControlHttpApi.log")(function* (ctx: { payload: typeof LogInput.Type }) {
      const write =
        ctx.payload.level === "debug"
          ? Effect.logDebug
          : ctx.payload.level === "info"
            ? Effect.logInfo
            : ctx.payload.level === "warn"
              ? Effect.logWarning
              : Effect.logError
      yield* write(ctx.payload.message).pipe(Effect.annotateLogs(ctx.payload.extra ?? {}))
      return true
    })

    return handlers.handle("authSet", authSet).handle("authRemove", authRemove).handle("log", log)
  }),
)
