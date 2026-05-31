import * as Cloudflare from "alchemy/Cloudflare";
import * as Planetscale from "alchemy/Planetscale";
import * as Test from "alchemy/Test/Bun";
import { expect } from "bun:test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import Stack from "../alchemy.run.ts";

const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Layer.mergeAll(Cloudflare.providers(), Planetscale.providers()),
  state: Cloudflare.state(),
});

const stack = beforeAll(deploy(Stack));

afterAll.skipIf(!process.env.CI)(destroy(Stack));

test(
  "worker returns a url",
  Effect.gen(function* () {
    const { url } = yield* stack;

    expect(url).toStartWith("https://");
  }),
);

test(
  "PUT then GET returns stored content",
  Effect.gen(function* () {
    const { url } = yield* stack;
    const key = `test-${crypto.randomUUID()}`;

    const put = yield* HttpClient.put(`${url}/${key}`, {
      body: HttpBody.text("Hello, World!"),
    });

    expect(put.status).toBe(201);

    const get = yield* HttpClient.get(`${url}/${key}`);
    const text = yield* get.text;

    expect(get.status).toBe(200);
    expect(text).toBe("Hello, World!");
  }),
);

test(
  "GET missing key returns 404",
  Effect.gen(function* () {
    const { url } = yield* stack;
    const response = yield* HttpClient.get(`${url}/no-such-key`);

    expect(response.status).toBe(404);
  }),
);

test(
  "Counter persists per key",
  Effect.gen(function* () {
    const { url } = yield* stack;
    const foo = `foo-${crypto.randomUUID()}`;
    const bar = `bar-${crypto.randomUUID()}`;

    const a1 = yield* HttpClient.post(`${url}/counter/${foo}`);
    expect(yield* a1.text).toBe("1");

    const a2 = yield* HttpClient.post(`${url}/counter/${foo}`);
    expect(yield* a2.text).toBe("2");

    const b1 = yield* HttpClient.post(`${url}/counter/${bar}`);
    expect(yield* b1.text).toBe("1");
  }),
);

test(
  "tick streams 5 sequential values",
  Effect.gen(function* () {
    const { url } = yield* stack;

    const response = yield* HttpClient.get(`${url}/tick/5`);
    const lines = yield* response.stream.pipe(
      Stream.decodeText,
      Stream.splitLines,
      Stream.runCollect,
    );
    expect([...lines]).toEqual(["0", "1", "2", "3", "4"]);
  }),
);
