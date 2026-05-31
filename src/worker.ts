import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { Bucket } from "./bucket.ts";
import Counter from "./counter.ts";
import * as Stream from "effect/Stream";

export default Cloudflare.Worker(
  "Worker",
  { main: import.meta.path },
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2Bucket.bind(Bucket);
    const counters = yield* Counter;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;

        if (request.url.startsWith("/counter/") && request.method === "POST") {
          const name = request.url.split("/").pop()!;
          const next = yield* counters.getByName(name).increment();
          return HttpServerResponse.text(String(next));
        }

        if (request.url.startsWith("/tick/") && request.method === "GET") {
          const n = Number(request.url.split("/").pop()!);
          const stream = counters
            .getByName("tick")
            .tick(n)
            .pipe(
              Stream.map((i) => `${i}\n`),
              Stream.encodeText,
            );
          return HttpServerResponse.stream(stream, {
            headers: { "content-type": "text/plain" },
          });
        }

        const key = request.url.split("/").pop()!;

        if (request.method === "PUT") {
          yield* bucket.put(key, request.stream, {
            contentLength: Number(request.headers["content-length"] ?? 0),
          });

          return HttpServerResponse.empty({ status: 201 });
        }

        const object = yield* bucket.get(key);

        if (object === null) {
          return HttpServerResponse.text("Not found", { status: 404 });
        }

        return HttpServerResponse.text(yield* object.text());
      }).pipe(
        Effect.catchTag("R2Error", (error) =>
          Effect.succeed(HttpServerResponse.text(error.message, { status: 500 })),
        ),
      ),
    };
  }).pipe(Effect.provide(Cloudflare.R2BucketBindingLive)),
);
