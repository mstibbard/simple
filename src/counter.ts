import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";

export default class Counter extends Cloudflare.DurableObjectNamespace<Counter>()(
  "Counter",
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;
      let count = (yield* state.storage.get<number>("count")) ?? 0;

      return {
        increment: () =>
          Effect.gen(function* () {
            count += 1;
            yield* state.storage.put("count", count);
            return count;
          }),
        get: () => Effect.succeed(count),
        tick: (n: number) =>
          Stream.iterate(0, (i) => i + 1).pipe(
            Stream.take(n),
            Stream.schedule(Schedule.spaced("100 millis")),
          ),
      };
    });
  }),
) {}
