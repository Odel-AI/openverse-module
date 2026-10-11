# @Odel/openverse

An Odel module that searches [Openverse](https://openverse.org) for openly licensed **sound effects, music and images**, filtered to licences that are safe for commercial use. Built on [`@odel/module-sdk`](https://www.npmjs.com/package/@odel/module-sdk).

> Made using Openverse. Not endorsed by Openverse. Licences are as reported by the source and are not verified by Openverse or Odel — check a result's `landingUrl` before you use it.

## Tools

Every tool works without setup: searches run on Odel's shared Openverse key unless you add your own (see [Which key a search uses](#which-key-a-search-uses)).

| Tool              | Inputs                                                                                                                                                              | Returns                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `search-audio`    | `query` · `kind`: `sound_effect` (default) \| `music` \| `any` · `licence`: `public-domain` (default) \| `attribution` · `maxSeconds`? · `page` · `pageSize` (1–20) | `results[]`, `resultCount`, `pageCount`, `page`, `nextPage`         |
| `search-images`   | `query` · `licence` · `category`? (`photograph` \| `illustration` \| `digitized_artwork`) · `aspectRatio`? (`tall` \| `wide` \| `square`) · `page` · `pageSize`     | the same                                                            |
| `get-media`       | `type`: `audio` \| `image` · `id` · `related` (default false)                                                                                                       | `item`, and `related[]` (up to 10) when asked                       |
| `register-client` | `email` · `name`? (unique; random when omitted) · `description`?                                                                                                    | `clientId`, `clientSecret` (shown once), `name`, `nextSteps[]`      |
| `client-status`   | —                                                                                                                                                                   | `keySource` (`yours` \| `odel` \| `anonymous`), `verified`, `rateLimitModel`, `requestsThisMinute`, `requestsToday` |

Every item carries `url` (the file, on the source's own host), `license`, `licenseUrl`, `attribution` (the credit line to publish, or `null` when none is needed) and `landingUrl`. Audio items add `durationSeconds`; image items add `thumbnailUrl`, `width` and `height`.

**Licences.** `public-domain` returns only CC0 and the public domain mark — nothing to credit. `attribution` adds CC BY, with its credit line in `attribution`. Share-alike, no-derivatives and non-commercial works are never returned, and results are re-checked after the fetch in case the upstream filter changes. `get-media` serves the `attribution` set. Most music on Openverse (Jamendo) is CC BY, so music searches usually want `licence: "attribution"`.

**`maxSeconds`** is applied after the fetch, because Openverse only filters by coarse length buckets; a call reads at most 3 upstream pages to fill `pageSize`. Pass `nextPage` back as `page` to continue.

**Errors** come back as an `isError` result whose text is `{ success: false, error, code, metadata? }`, with `code` from the SDK's `ErrorCode`: `2001` only one of your two secrets set, `2002` your own credentials rejected by Openverse, `1001` bad input, `3004` not found, `4001` rate limited (`metadata.retryAfter`; on the shared key or anonymous use, `metadata.keySource` and a pointer to `register-client`), `3001` Openverse unavailable, `3002` network, `3003` timeout.

## Which key a search uses

1. **Your own Openverse client**, when both of your secrets are set: an allowance to yourself.
2. **Odel's shared key** otherwise: a verified client Odel registered for this module and holds as Worker secrets. Every Odel user without their own key shares its allowance.
3. **Anonymous**, when neither is available (a local run without Odel's key, say).

| Caller | Requests a minute | Requests a day | Results per page |
| --- | --- | --- | --- |
| A verified client (your own, or Odel's shared one) | 100 | 10,000 | up to 20 here |
| An unverified client, or anonymous (per IP) | 20 | 200 | 20 |

These are Openverse's published defaults, read from its rate-limit headers; Openverse can raise a client's limits on request.

| Secret (optional)         | What                                           |
| ------------------------- | ---------------------------------------------- |
| `OPENVERSE_CLIENT_ID`     | Your Openverse client id                       |
| `OPENVERSE_CLIENT_SECRET` | Your Openverse client secret (shown only once) |

Setting only one of the two is answered `2001`, naming the missing one: add it, or remove both to go back to Odel's key.

**Getting your own key.** Worth it if you keep hitting the shared limit (a `4001` that points at `register-client`). Ask your assistant to run `register-client` with your own email address; it needs no account. It returns the client id and secret (the secret is shown once), so store both, say in your Odel vault. Click the link Openverse emails you **before** adding them: until you verify, Openverse treats the client as anonymous, which is less than the shared key. Then add both on the module's Config tab ([how](https://docs.odel.app/docs/installing#changing-credentials-later)) and run `client-status` to confirm `keySource: "yours"` and `verified: true`.

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
pnpm dev         # wrangler dev; send your own key in params._meta["app.odel/secrets"]
```

Worker bindings:

- `ODEL_OPENVERSE_CLIENT_ID` / `ODEL_OPENVERSE_CLIENT_SECRET` (secrets): Odel's shared key. Locally, put them in `.dev.vars` (gitignored); without them local searches go anonymous.
- `OPENVERSE_API_BASE` (a variable, default `https://api.openverse.org/v1`) points the module at another Openverse, such as a local stub.

## License

MIT
