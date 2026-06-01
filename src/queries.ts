import * as Effect from "effect/Effect";
import { Database } from "./db.ts";

export const findUserWithPosts = (id: number) =>
  Effect.gen(function* () {
    const db = yield* Database;

    return yield* db.query.Users.findFirst({
      where: { id },
      with: { posts: true },
    });
  });
