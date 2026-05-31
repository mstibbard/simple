import * as Cloudflare from "alchemy/Cloudflare";
import * as Planetscale from "alchemy/Planetscale";
import * as Effect from "effect/Effect";

export const Db = Effect.gen(function* () {
  const database = yield* Planetscale.PostgresDatabase("app-db", {
    region: { slug: "us-east" },
    clusterSize: "PS_5",
  });

  const branch = yield* Planetscale.PostgresBranch("app-branch", {
    database,
    isProduction: false,
  } as Planetscale.PostgresBranchProps & { isProduction: false });

  const role = yield* Planetscale.PostgresRole("app-role", {
    database,
    branch,
    inheritedRoles: ["postgres"],
  });

  return { database, branch, role };
});

export const Hyperdrive = Effect.gen(function* () {
  const { role } = yield* Db;

  return yield* Cloudflare.Hyperdrive("app-hyperdrive", {
    origin: role.origin,
  });
});
