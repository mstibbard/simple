import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as Planetscale from "alchemy/Planetscale";
import * as Effect from "effect/Effect";

export const Db = Effect.gen(function* () {
  const schema = yield* Drizzle.Schema("app-schema", {
    schema: "./src/schema.ts",
    out: "./migrations",
  });

  const database = yield* Planetscale.PostgresDatabase("app-db", {
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
