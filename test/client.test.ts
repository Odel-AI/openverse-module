import { afterEach, describe, expect, test, vi } from 'vitest';
import { callTool, fakeOpenverse, freshSecrets, media, page } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const TOKEN_BODY = '{"access_token":"tok-1","expires_in":36000}';

/** No error may carry the token, the client secret or the raw upstream body. */
function expectNoLeak(text: string, secret: string, upstreamBody?: string) {
	expect(text).not.toContain('tok-1');
	expect(text).not.toContain(secret);
	if (upstreamBody) expect(text).not.toContain(upstreamBody);
}

describe('credentials (bring your own)', () => {
	test('missing secrets fail with MISSING_SECRET pointing at register-client, and nothing is sent upstream', async () => {
		const ov = fakeOpenverse(() => page([]));
		const { isError, body } = await callTool('search-audio', { query: 'pop' }, null);

		expect(isError).toBe(true);
		expect(body).toMatchObject({ success: false, code: 2001, metadata: { secretNames: ['OPENVERSE_CLIENT_ID', 'OPENVERSE_CLIENT_SECRET'] } });
		expect(body.error).toContain('register-client');
		expect(ov.calls).toHaveLength(0);
	});

	test('an Odel caller without the secrets is refused by the SDK gate before anything is sent', async () => {
		const ov = fakeOpenverse(() => page([]));
		const { isError, body } = await callTool('search-audio', { query: 'pop' }, {});

		expect(isError).toBe(true);
		expect(body).toMatchObject({ code: 2001, metadata: { secretNames: ['OPENVERSE_CLIENT_ID', 'OPENVERSE_CLIENT_SECRET'] } });
		expect(ov.calls).toHaveLength(0);
	});

	test('one secret missing names only that one', async () => {
		fakeOpenverse(() => page([]));
		const { body } = await callTool('search-audio', { query: 'pop' }, { OPENVERSE_CLIENT_ID: 'only-the-id' });
		expect(body).toMatchObject({ code: 2001, metadata: { secretNames: ['OPENVERSE_CLIENT_SECRET'] } });
	});

	test('the token request is form-encoded client_credentials with the caller’s own client', async () => {
		const secrets = freshSecrets();
		const ov = fakeOpenverse(() => page([]));
		await callTool('search-audio', { query: 'pop' }, secrets);

		const [tokenCall] = ov.tokenCalls();
		expect(tokenCall.method).toBe('POST');
		expect(tokenCall.headers.get('content-type')).toContain('application/x-www-form-urlencoded');
		expect(Object.fromEntries(new URLSearchParams(tokenCall.body))).toEqual({
			grant_type: 'client_credentials',
			client_id: secrets.OPENVERSE_CLIENT_ID,
			client_secret: secrets.OPENVERSE_CLIENT_SECRET
		});
	});

	test('a rejected client fails with INVALID_SECRET and leaks nothing', async () => {
		const secrets = freshSecrets();
		fakeOpenverse(
			() => page([]),
			() => Response.json({ error: 'invalid_client' }, { status: 401 })
		);
		const { isError, body, text } = await callTool('search-audio', { query: 'pop' }, secrets);

		expect(isError).toBe(true);
		expect(body.code).toBe(2002);
		expectNoLeak(text, secrets.OPENVERSE_CLIENT_SECRET, 'invalid_client');
	});

	test('two calls with the same credentials request one token', async () => {
		const secrets = freshSecrets();
		const ov = fakeOpenverse(() => page([media()]));
		await callTool('search-audio', { query: 'pop' }, secrets);
		await callTool('search-images', { query: 'pop' }, secrets);

		expect(ov.tokenCalls()).toHaveLength(1);
		expect(ov.searches()).toHaveLength(2);
	});

	test('the same client id with a different secret does not reuse the cached token', async () => {
		const secrets = freshSecrets();
		const ov = fakeOpenverse(() => page([]));
		await callTool('search-audio', { query: 'pop' }, secrets);
		await callTool('search-audio', { query: 'pop' }, { ...secrets, OPENVERSE_CLIENT_SECRET: 'guess' });

		expect(ov.tokenCalls()).toHaveLength(2);
	});

	test('an expiring token is replaced', async () => {
		const secrets = freshSecrets();
		const ov = fakeOpenverse(
			() => page([]),
			() => Response.json({ access_token: 'tok-1', expires_in: 30 })
		);
		await callTool('search-audio', { query: 'pop' }, secrets);
		await callTool('search-audio', { query: 'pop' }, secrets);

		expect(ov.tokenCalls()).toHaveLength(2);
	});

	test('a 401 from a search refreshes the token once and retries', async () => {
		let n = 0;
		const ov = fakeOpenverse(
			() => (ov.searches().length === 1 ? new Response('{"detail":"expired"}', { status: 401 }) : page([media()])),
			() => Response.json({ access_token: `tok-${++n}`, expires_in: 36000 })
		);
		const { isError } = await callTool('search-audio', { query: 'pop' });

		expect(isError).toBe(false);
		expect(ov.tokenCalls()).toHaveLength(2);
		expect(ov.searches().map(c => c.headers.get('authorization'))).toEqual(['Bearer tok-1', 'Bearer tok-2']);
	});

	test('a second 401 fails with INVALID_SECRET', async () => {
		const secrets = freshSecrets();
		const ov = fakeOpenverse(() => new Response('{"detail":"bad token"}', { status: 401 }));
		const { body, text } = await callTool('search-audio', { query: 'pop' }, secrets);

		expect(body.code).toBe(2002);
		expect(ov.tokenCalls()).toHaveLength(2);
		expect(ov.searches()).toHaveLength(2);
		expectNoLeak(text, secrets.OPENVERSE_CLIENT_SECRET, 'bad token');
	});

	test('a 401 for pagination depth is a validation error, not a credentials one', async () => {
		const ov = fakeOpenverse(() => Response.json({ detail: 'pagination depth may not exceed 240 for anonymous requests' }, { status: 401 }));
		const { body } = await callTool('search-audio', { query: 'pop', page: 99 });

		expect(body.code).toBe(1001);
		expect(ov.tokenCalls()).toHaveLength(1);
	});
});

describe('upstream errors', () => {
	const cases: Array<[string, () => Response | Promise<Response>, Record<string, unknown>]> = [
		['400', () => new Response('{"detail":"Invalid page"}', { status: 400 }), { code: 1001, metadata: { statusCode: 400, fields: [] } }],
		[
			'400 naming fields, as Openverse sends it',
			() => Response.json({ detail: { license: ["License 'foo' does not exist."] } }, { status: 400 }),
			{ code: 1001, error: 'Openverse rejected the request parameters: license', metadata: { statusCode: 400, fields: ['license'] } }
		],
		[
			'a Cloudflare challenge (429, HTML, no Retry-After)',
			() => new Response('<!DOCTYPE html><title>Just a moment...</title>', { status: 429, headers: { 'Content-Type': 'text/html' } }),
			{ code: 4001, metadata: { retryAfter: 60 } }
		],
		['429 with Retry-After', () => new Response('slow down', { status: 429, headers: { 'Retry-After': '17' } }), { code: 4001, metadata: { retryAfter: 17 } }],
		['429 without Retry-After', () => new Response('slow down', { status: 429 }), { code: 4001, metadata: { retryAfter: 60 } }],
		['503', () => new Response('<html>upstream down</html>', { status: 503 }), { code: 3001, error: 'Openverse is unavailable', metadata: { statusCode: 503 } }],
		['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError')), { code: 3003, metadata: { timeoutMs: 10000 } }],
		['a network failure', () => Promise.reject(new TypeError('fetch failed: connect ECONNREFUSED')), { code: 3002 }],
		['a malformed body', () => new Response('not json', { status: 200 }), { code: 3001 }]
	];

	test.each(cases)('%s maps to its ModuleError code', async (_name, respond, expected) => {
		const secrets = freshSecrets();
		fakeOpenverse(respond);
		const { isError, body, text } = await callTool('search-audio', { query: 'pop' }, secrets);

		expect(isError).toBe(true);
		expect(body).toMatchObject({ success: false, ...expected });
		expectNoLeak(text, secrets.OPENVERSE_CLIENT_SECRET);
		for (const raw of ['Invalid page', 'does not exist', 'Just a moment', 'slow down', 'upstream down', 'ECONNREFUSED', 'not json']) expect(text).not.toContain(raw);
	});

	test('the token endpoint being down maps to API_ERROR, not a credentials error', async () => {
		fakeOpenverse(
			() => page([]),
			() => new Response('oops', { status: 502 })
		);
		const { body } = await callTool('search-audio', { query: 'pop' });
		expect(body).toMatchObject({ code: 3001, metadata: { statusCode: 502 } });
	});

	test('a failed token request is not cached', async () => {
		const secrets = freshSecrets();
		let fail = true;
		const ov = fakeOpenverse(
			() => page([]),
			() => (fail ? new Response('oops', { status: 502 }) : Response.json(JSON.parse(TOKEN_BODY)))
		);
		await callTool('search-audio', { query: 'pop' }, secrets);
		fail = false;
		const { isError } = await callTool('search-audio', { query: 'pop' }, secrets);

		expect(isError).toBe(false);
		expect(ov.tokenCalls()).toHaveLength(2);
	});
});
