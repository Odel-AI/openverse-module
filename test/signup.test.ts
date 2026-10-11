import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { registerClientOutput } from '../src/tools/registerClient';
import { clientStatusOutput } from '../src/tools/clientStatus';
import { callTool, fakeOpenverse, freshSecrets } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const REGISTERED = { client_id: 'new-client-id', client_secret: 'new-client-secret', name: 'my-project', msg: 'Check your email' };

describe('register-client', () => {
	test('registers anonymously with the caller’s email and returns the client with next steps', async () => {
		const ov = fakeOpenverse(() => Response.json(REGISTERED, { status: 201 }));
		const { isError, body, result } = await callTool('register-client', { email: 'me@example.com', name: 'my-project' }, null);

		expect(isError).toBe(false);
		expect(ov.tokenCalls()).toHaveLength(0);
		const [call] = ov.searches();
		expect(call.method).toBe('POST');
		expect(call.url.pathname).toBe('/v1/auth_tokens/register/');
		expect(call.headers.get('authorization')).toBeNull();
		expect(JSON.parse(call.body)).toEqual({ email: 'me@example.com', name: 'my-project', description: expect.stringContaining('@Odel/openverse') });
		expect(body).toMatchObject({ success: true, clientId: 'new-client-id', clientSecret: 'new-client-secret', name: 'my-project' });
		expect(body.nextSteps.join(' ')).toContain('me@example.com');
		expect(z.object(registerClientOutput).parse(result.structuredContent)).toEqual(body);
	});

	test('picks a unique-looking name when none is given', async () => {
		const ov = fakeOpenverse(call => Response.json({ ...REGISTERED, name: JSON.parse(call.body).name }, { status: 201 }));
		const { body } = await callTool('register-client', { email: 'me@example.com' }, null);

		expect(JSON.parse(ov.searches()[0].body).name).toMatch(/^odel-openverse-[0-9a-f]{8}$/);
		expect(body.name).toMatch(/^odel-openverse-/);
	});

	test('a taken name is a validation error naming the field, without echoing Openverse’s body', async () => {
		fakeOpenverse(() => Response.json({ name: ['o auth2 registration with this name already exists.'] }, { status: 400 }));
		const { isError, body, text } = await callTool('register-client', { email: 'me@example.com', name: 'taken' }, null);

		expect(isError).toBe(true);
		expect(body).toMatchObject({ code: 1001, metadata: { statusCode: 400, fields: ['name'] } });
		expect(body.error).toContain('unique');
		expect(text).not.toContain('already exists');
	});

	test('a 400 with its fields nested in detail still names them', async () => {
		fakeOpenverse(() => Response.json({ detail: { email: ['Enter a valid email address.'] } }, { status: 400 }));
		const { body } = await callTool('register-client', { email: 'me@example.com' }, null);
		expect(body).toMatchObject({ code: 1001, metadata: { fields: ['email'] } });
	});

	test('a 400 that names no field says so generically', async () => {
		fakeOpenverse(() => Response.json({ detail: 'Bad request' }, { status: 400 }));
		const { body } = await callTool('register-client', { email: 'me@example.com' }, null);
		expect(body).toMatchObject({ code: 1001, error: 'Openverse rejected the registration', metadata: { fields: [] } });
	});

	test('a 429 maps to RATE_LIMIT_EXCEEDED', async () => {
		fakeOpenverse(() => new Response('{}', { status: 429, headers: { 'Retry-After': '30' } }));
		const { body } = await callTool('register-client', { email: 'me@example.com' }, null);
		expect(body).toMatchObject({ code: 4001, metadata: { retryAfter: 30 } });
	});

	test('a malformed email is refused before any upstream call', async () => {
		const ov = fakeOpenverse(() => Response.json(REGISTERED, { status: 201 }));
		expect((await callTool('register-client', { email: 'not-an-email' }, null)).isError).toBe(true);
		expect(ov.calls).toHaveLength(0);
	});
});

describe('client-status', () => {
	test('reports verification and usage from /rate_limit/ with the caller’s token', async () => {
		const ov = fakeOpenverse(() =>
			Response.json({ requests_this_minute: 2, requests_today: 40, rate_limit_model: 'standard', verified: true })
		);
		const { isError, body, result } = await callTool('client-status', {}, freshSecrets());

		expect(isError).toBe(false);
		expect(ov.searches()[0].url.pathname).toBe('/v1/rate_limit/');
		expect(ov.searches()[0].headers.get('authorization')).toBe('Bearer tok-1');
		expect(body).toEqual({ success: true, verified: true, rateLimitModel: 'standard', requestsThisMinute: 2, requestsToday: 40 });
		expect(z.object(clientStatusOutput).parse(result.structuredContent)).toEqual(body);
	});

	test('without a client it fails with MISSING_SECRET pointing at register-client', async () => {
		fakeOpenverse(() => Response.json({}));
		const { body } = await callTool('client-status', {}, null);
		expect(body.code).toBe(2001);
		expect(body.error).toContain('register-client');
	});
});
