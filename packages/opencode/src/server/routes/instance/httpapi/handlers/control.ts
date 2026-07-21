import { Auth } from "@/auth"
import { invalidateAfterProviderAuthChange } from "@/kilocode/server/provider-auth-lifecycle" // kilocode_change
// fork_change start
import { isLockedProvider } from "@/fork/lock"
// fork_change end
import { ProviderID } from "@/provider/schema"
import * as Log from "@opencode-ai/core/util/log"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpApiError } from "effect/unstable/httpapi" // fork_change
import { RootHttpApi } from "../api"
import { LogInput } from "../groups/control"

export const controlHandlers = HttpApiBuilder.group(RootHttpApi, "control", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service

    const authSet = Effect.fn("ControlHttpApi.authSet")(function* (ctx: {
      params: { providerID: ProviderID }
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
      yield* invalidateAfterProviderAuthChange(ctx.params.providerID) // kilocode_change
      return true
    })

    const authRemove = Effect.fn("ControlHttpApi.authRemove")(function* (ctx: { params: { providerID: ProviderID } }) {
      // fork_change start
      if (!isLockedProvider(ctx.params.providerID)) {
        const logger = Log.create({ service: "fork.control" })
        logger.warn("rejected auth.remove for non-locked provider", { providerID: ctx.params.providerID })
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }
      // fork_change end
      yield* auth.remove(ctx.params.providerID).pipe(Effect.orDie)
      yield* invalidateAfterProviderAuthChange(ctx.params.providerID) // kilocode_change
      return true
    })

    const log = Effect.fn("ControlHttpApi.log")(function* (ctx: { payload: typeof LogInput.Type }) {
      const logger = Log.create({ service: ctx.payload.service })
      logger[ctx.payload.level](ctx.payload.message, ctx.payload.extra)
      return true
    })

    return handlers.handle("authSet", authSet).handle("authRemove", authRemove).handle("log", log)
  }),
)
