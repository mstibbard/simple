import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpServer, HttpServerResponse } from "effect/unstable/http";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiScalar,
} from "effect/unstable/httpapi";
import { Database } from "./db.ts";
import { findUserWithPosts } from "./queries.ts";

type BucketClient = {
  readonly put: (
    key: string,
    value: Stream.Stream<Uint8Array, unknown>,
    options: { readonly contentLength: number },
  ) => Effect.Effect<unknown, { readonly _tag: "R2Error"; readonly message: string } | unknown, RuntimeContext>;
  readonly get: (
    key: string,
  ) => Effect.Effect<null | { readonly text: () => Effect.Effect<string, unknown, RuntimeContext> }, { readonly _tag: "R2Error"; readonly message: string }, RuntimeContext>;
};

type CounterNamespace = {
  readonly getByName: (name: string) => {
    readonly increment: () => Effect.Effect<number>;
    readonly tick: (n: number) => Stream.Stream<number>;
  };
};

export type HttpApiServices = {
  readonly bucket: BucketClient;
  readonly counters: CounterNamespace;
  readonly database: Layer.Layer<Database, never>;
};

const KeyParam = {
  key: Schema.String,
};

const NameParam = {
  name: Schema.String,
};

const TickParam = {
  n: Schema.NumberFromString,
};

const AppGroup = HttpApiGroup.make("app", { topLevel: true }).add(
  HttpApiEndpoint.post("incrementCounter", "/counter/:name", {
    params: NameParam,
  }),
  HttpApiEndpoint.get("tick", "/tick/:n", {
    params: TickParam,
  }),
  HttpApiEndpoint.get("getUserWithPosts", "/db"),
  HttpApiEndpoint.put("putObject", "/:key", {
    params: KeyParam,
  }),
  HttpApiEndpoint.get("getObject", "/:key", {
    params: KeyParam,
  }),
);

export const AppApi = HttpApi.make("AppApi").add(AppGroup);

const internalServerError = (cause: unknown) =>
  Effect.succeed(HttpServerResponse.text(String(cause), { status: 500 }));

const AppHandlersLive = (
  bucket: BucketClient,
  counters: CounterNamespace,
) => HttpApiBuilder.group(AppApi, "app", (handlers) =>
  handlers
    .handle("incrementCounter", ({ params }) =>
      Effect.gen(function* () {
        const next = yield* counters.getByName(params.name).increment();
        return HttpServerResponse.text(String(next));
      }),
    )
    .handle("tick", ({ params }) =>
      Effect.gen(function* () {
        const stream = counters
          .getByName("tick")
          .tick(params.n)
          .pipe(
            Stream.map((i) => `${i}\n`),
            Stream.encodeText,
          );

        return HttpServerResponse.stream(stream, {
          headers: { "content-type": "text/plain" },
        });
      }),
    )
    .handle("getUserWithPosts", () =>
      Effect.gen(function* () {
        const user = yield* findUserWithPosts(1);
        return yield* HttpServerResponse.json({ user });
      }).pipe(
        Effect.catchCause(internalServerError)
      )
    )
    .handleRaw("putObject", ({ params, request }) =>
      Effect.gen(function* () {
        yield* bucket.put(params.key, request.stream, {
          contentLength: Number(request.headers["content-length"] ?? 0),
        });

        return HttpServerResponse.empty({ status: 201 });
      }).pipe(
        Effect.catchCause(internalServerError)
      )
    )
    .handle("getObject", ({ params }) =>
      Effect.gen(function* () {
        const object = yield* bucket.get(params.key);

        if (object === null) {
          return HttpServerResponse.text("Not found", { status: 404 });
        }

        return HttpServerResponse.text(yield* object.text());
      }).pipe(
        Effect.catchCause(internalServerError)
      )
    )
);

export const HttpApiLive = ({
  bucket,
  counters,
  database,
}: HttpApiServices) =>
  Layer.mergeAll(
    HttpApiBuilder.layer(AppApi).pipe(
      Layer.provide(HttpServer.layerServices),
      Layer.provide(
        AppHandlersLive(bucket, counters).pipe(
          Layer.provide(database),
        ),
      ),
    ),
    HttpApiScalar.layer(AppApi, { path: "/" }),
  );
