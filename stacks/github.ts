import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const GITHUB_OWNER = "mstibbard";
const GITHUB_REPO = "simple";

export default Alchemy.Stack(
  "github",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const accountId = yield* Config.string("CLOUDFLARE_ACCOUNT_ID").pipe(Effect.orDie);
    const planetscaleApiTokenId = yield* Config.string("PLANETSCALE_API_TOKEN_ID").pipe(
      Effect.orDie,
    );
    const planetscaleApiToken = yield* Config.string("PLANETSCALE_API_TOKEN").pipe(Effect.orDie);
    const planetscaleOrganization = yield* Config.string("PLANETSCALE_ORGANIZATION").pipe(
      Effect.orDie,
    );

    const apiToken = yield* Cloudflare.AccountApiToken("CIToken", {
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Workers Scripts Write",
            "Workers KV Storage Write",
            "Workers R2 Storage Write",
            "D1 Write",
            "Queues Write",
            "Pages Write",
            "Account Settings Write",
            "Workers Tail Read",
            "Secrets Store Write",
            "Hyperdrive Write",
          ],
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: "*",
          },
        },
      ],
    });

    yield* GitHub.Secret("cf-api-token", {
      owner: GITHUB_OWNER,
      repository: GITHUB_REPO,
      name: "CLOUDFLARE_API_TOKEN",
      value: apiToken.value,
    });

    yield* GitHub.Secret("cf-account-id", {
      owner: GITHUB_OWNER,
      repository: GITHUB_REPO,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    });

    yield* GitHub.Secret("planetscale-api-token-id", {
      owner: GITHUB_OWNER,
      repository: GITHUB_REPO,
      name: "PLANETSCALE_API_TOKEN_ID",
      value: Redacted.make(planetscaleApiTokenId),
    });

    yield* GitHub.Secret("planetscale-api-token", {
      owner: GITHUB_OWNER,
      repository: GITHUB_REPO,
      name: "PLANETSCALE_API_TOKEN",
      value: Redacted.make(planetscaleApiToken),
    });

    yield* GitHub.Secret("planetscale-organization", {
      owner: GITHUB_OWNER,
      repository: GITHUB_REPO,
      name: "PLANETSCALE_ORGANIZATION",
      value: Redacted.make(planetscaleOrganization),
    });
  }),
);
