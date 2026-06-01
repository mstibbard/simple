import type { HttpEffect as WorkerHttpEffect } from "alchemy/Http";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpEffect, HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { HttpApiLive } from "./api.ts";
import { Bucket } from "./bucket.ts";
import Counter from "./counter.ts";
import { Database, Hyperdrive } from "./db.ts";

const internalServerError = (cause: unknown) =>
  Effect.succeed(HttpServerResponse.text(String(cause), { status: 500 }));

const toWorkerFetch = (
  layer: Layer.Layer<unknown, never, HttpRouter.HttpRouter>,
): WorkerHttpEffect => {
  const { handler } = HttpRouter.toWebHandler(layer, {
    disableLogger: true,
  });

  return Effect.contextWith((context) =>
    HttpEffect.fromWebHandler((request) =>
      handler(request, context as never),
    ),
  ).pipe(
    Effect.catchCause(internalServerError),
  ) as WorkerHttpEffect;
};

export default Cloudflare.Worker(
  "Worker",
  {
    main: import.meta.path,
    compatibility: {
      flags: ["nodejs_compat"],
    },
  },
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2Bucket.bind(Bucket);
    const hyperdrive = yield* Cloudflare.Hyperdrive.bind(Hyperdrive);
    const databaseLive = Database.Live(hyperdrive.connectionString);
    const counters = yield* Counter;

    return {
      fetch: toWorkerFetch(
        HttpApiLive({
          bucket,
          counters,
          database: databaseLive,
        }) as Layer.Layer<unknown, never, HttpRouter.HttpRouter>,
      ),
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(Cloudflare.R2BucketBindingLive, Cloudflare.HyperdriveBindingLive),
    ),
  ),
);
