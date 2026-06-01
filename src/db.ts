import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as Planetscale from "alchemy/Planetscale";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import { relations } from "./schema.ts";

const make = (
  connectionString: Effect.Effect<Redacted.Redacted<string>, never, Alchemy.RuntimeContext>,
) => Drizzle.postgres(connectionString, { relations });

type DatabaseShape = Effect.Success<ReturnType<typeof make>>;

export class Database extends Context.Service<Database, DatabaseShape>()("Database") {
  static Live = (
    connectionString: Effect.Effect<Redacted.Redacted<string>, never, Alchemy.RuntimeContext>,
  ) => Layer.effect(Database, make(connectionString));
}

export const Db = Effect.gen(function* () {
  const { stage } = yield* Alchemy.Stack;

  const schema = yield* Drizzle.Schema("app-schema", {
    schema: "./src/schema.ts",
    out: "./migrations",
  });

  const database =
    stage.startsWith("pr-") || stage.startsWith("dev-")
      ? yield* Planetscale.PostgresDatabase.ref("app-db", { stage: "staging" })
      : yield* Planetscale.PostgresDatabase("app-db", {
          region: { slug: "us-east" },
          clusterSize: "PS_5",
        });

  const branch = yield* Planetscale.PostgresBranch("app-branch", {
    database,
    migrationsDir: schema.out as unknown as string,
    isProduction: false,
  } as Planetscale.PostgresBranchProps & { isProduction: false });

  const role = yield* Planetscale.PostgresRole("app-role", {
    database,
    branch,
    inheritedRoles: ["postgres"],
  });

  return { database, branch, role, schema };
});

export const Hyperdrive = Effect.gen(function* () {
  const { role } = yield* Db;

  return yield* Cloudflare.Hyperdrive("app-hyperdrive", {
    origin: role.origin,
  });
});
