# @Odel/openverse

An Odel module that searches [Openverse](https://openverse.org) for openly licensed **sound effects, music and images**, filtered to licences that are safe for commercial use. Built on [`@odel/module-sdk`](https://www.npmjs.com/package/@odel/module-sdk).

> Made using Openverse. Not endorsed by Openverse. Licences are as reported by the source and are not verified by Openverse or Odel — check a result's `landingUrl` before you use it.

## Tools

Every tool except `register-client` needs an Openverse client (see [Bring your own Openverse client](#bring-your-own-openverse-client)). On Odel, those tools stay hidden until both secrets are configured.

| Tool              | Inputs                                                                                                                                                              | Returns                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `search-audio`    | `query` · `kind`: `sound_effect` (default) \| `music` \| `any` · `licence`: `public-domain` (default) \| `attribution` · `maxSeconds`? · `page` · `pageSize` (1–20) | `results[]`, `resultCount`, `pageCount`, `page`, `nextPage`         |
| `search-images`   | `query` · `licence` · `category`? (`photograph` \| `illustration` \| `digitized_artwork`) · `aspectRatio`? (`tall` \| `wide` \| `square`) · `page` · `pageSize`     | the same                                                            |
| `get-media`       | `type`: `audio` \| `image` · `id` · `related` (default false)                                                                                                       | `item`, and `related[]` (up to 10) when asked                       |
| `register-client` | `email` · `name`? (unique; random when omitted) · `description`?                                                                                                    | `clientId`, `clientSecret` (shown once), `name`, `nextSteps[]`      |
| `client-status`   | —                                                                                                                                                                   | `verified`, `rateLimitModel`, `requestsThisMinute`, `requestsToday` |

Every item carries `url` (the file, on the source's own host), `license`, `licenseUrl`, `attribution` (the credit line to publish, or `null` when none is needed) and `landingUrl`. Audio items add `durationSeconds`; image items add `thumbnailUrl`, `width` and `height`.

**Licences.** `public-domain` returns only CC0 and the public domain mark — nothing to credit. `attribution` adds CC BY, with its credit line in `attribution`. Share-alike, no-derivatives and non-commercial works are never returned, and results are re-checked after the fetch in case the upstream filter changes. `get-media` serves the `attribution` set. Most music on Openverse (Jamendo) is CC BY, so music searches usually want `licence: "attribution"`.

**`maxSeconds`** is applied after the fetch, because Openverse only filters by coarse length buckets; a call reads at most 3 upstream pages to fill `pageSize`. Pass `nextPage` back as `page` to continue.

**Errors** come back as an `isError` result whose text is `{ success: false, error, code, metadata? }`, with `code` from the SDK's `ErrorCode`: `2001` a missing secret, `2002` credentials Openverse rejected, `1001` bad input, `3004` not found, `4001` rate limited (`metadata.retryAfter`), `3001` Openverse unavailable, `3002` network, `3003` timeout.

## Bring your own Openverse client

Each user supplies their own Openverse API client as two secrets, so every caller searches on their own rate limit and under their own agreement with Openverse. Both are optional at install, so someone without a client can install first and get one from inside the module:

| Secret                    | What                                           |
| ------------------------- | ---------------------------------------------- |
| `OPENVERSE_CLIENT_ID`     | Your Openverse client id                       |
| `OPENVERSE_CLIENT_SECRET` | Your Openverse client secret (shown only once) |

**Getting a client.** A fresh install lists only `register-client`. Ask your assistant to run it with your own email address. It returns the client id and secret (the secret is shown once), so store both in your Odel vault and add them to the module's secrets. Then reconnect your MCP client: the search tools and `client-status` appear. Click the link Openverse emails you, and run `client-status` to confirm `verified: true`. Until you verify, the client runs on anonymous rate limits.

**How the tools are hidden.** The module declares the secrets each tool needs with the SDK's `requiresSecrets`. Odel tells the module which secrets you have configured (names only), and a tool whose secrets are missing is left out of `tools/list`; calling it anyway answers `2001` (MISSING_SECRET). Outside Odel (the MCP inspector, `wrangler dev`) no such information is sent, so every tool is listed and a search without credentials answers `2001`, pointing at `register-client`.

**Registering by hand.**

```bash
curl -s -X POST https://api.openverse.org/v1/auth_tokens/register/ \
  -H 'Content-Type: application/json' \
  -d '{"name": "my-odel-openverse", "description": "Searching Openverse from Odel", "email": "you@example.com"}'
```

Save `client_id` and `client_secret` from the response — the secret can't be retrieved again — and click the link Openverse emails you. Until you do, the client stays on anonymous rate limits.

## Development

```bash
pnpm install
pnpm test        # vitest, Openverse replaced by a stubbed fetch
pnpm typecheck
pnpm dev         # wrangler dev; send secrets in params._meta["app.odel/secrets"]
                 # and, to see the gating, names in params._meta["app.odel/configured"] on tools/list
```

`OPENVERSE_API_BASE` (a worker variable, default `https://api.openverse.org/v1`) points the module at another Openverse, such as a local stub.

## License

MIT
