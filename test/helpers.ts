import { vi } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/config';

export const BASE = 'https://openverse.test/v1';

/** One recorded upstream call. */
export interface Call {
	method: string;
	url: URL;
	headers: Headers;
	body: string;
}

type Route = (call: Call) => Response | Promise<Response>;

/**
 * Replace global fetch with a fake Openverse. The token endpoint answers by default; every
 * other request goes to `route`. Returns the recorded calls.
 */
export function fakeOpenverse(route: Route, token: Route = () => Response.json({ access_token: 'tok-1', expires_in: 36000 })) {
	const calls: Call[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const req = new Request(input, init);
			const call: Call = { method: req.method, url: new URL(req.url), headers: req.headers, body: await req.text() };
			calls.push(call);
			return call.url.pathname.endsWith('/auth_tokens/token/') ? token(call) : route(call);
		})
	);
	return {
		calls,
		searches: () => calls.filter(c => !c.url.pathname.endsWith('/auth_tokens/token/')),
		tokenCalls: () => calls.filter(c => c.url.pathname.endsWith('/auth_tokens/token/'))
	};
}

let n = 0;
/** Fresh credentials per test, so the module-scope token cache never leaks between tests. */
export function freshSecrets() {
	n++;
	return { OPENVERSE_CLIENT_ID: `client-${n}`, OPENVERSE_CLIENT_SECRET: `secret-${n}-s3cr3t` };
}

export function media(overrides: Record<string, unknown> = {}) {
	return {
		id: crypto.randomUUID(),
		title: 'Deep Whoosh #1',
		creator: 'Kinoton',
		url: 'https://cdn.freesound.org/previews/351/351256_2247456-hq.mp3',
		foreign_landing_url: 'https://freesound.org/people/Kinoton/sounds/351256',
		license: 'cc0',
		license_version: '1.0',
		license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
		attribution: '"Deep Whoosh #1" by Kinoton is marked with CC0 1.0.',
		source: 'freesound',
		provider: 'freesound',
		filetype: 'mp3',
		tags: [{ name: 'whoosh' }, { name: 'sfx' }],
		duration: 3155,
		...overrides
	};
}

export function page(results: unknown[], extra: { result_count?: number; page_count?: number; page?: number } = {}) {
	return Response.json({ result_count: results.length, page_count: 1, page: 1, page_size: 10, results, ...extra });
}

function rpc(method: string, params?: Record<string, unknown>): Request {
	return new Request('http://openverse/mcp', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
	});
}

async function parse(res: Response): Promise<any> {
	const text = await res.text();
	if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
		const data = text.split('\n').find(l => l.startsWith('data: '));
		if (!data) throw new Error(`No data frame: ${text}`);
		return JSON.parse(data.slice(6));
	}
	return JSON.parse(text);
}

/** `tools/list`, optionally with the `_meta` Odel sends (e.g. `app.odel/configured`). */
export async function listTools(meta?: Record<string, unknown>): Promise<any[]> {
	return (await parse(await worker.fetch(rpc('tools/list', meta ? { _meta: meta } : undefined), { OPENVERSE_API_BASE: BASE }))).result.tools;
}

export async function readConfigResource(): Promise<any> {
	const out = await parse(await worker.fetch(rpc('resources/read', { uri: 'odel://config' }), { OPENVERSE_API_BASE: BASE }));
	return JSON.parse(out.result.contents[0].text);
}

let k = 0;
/** A fresh Odel shared key (the Worker secrets), so the token cache never leaks between tests. */
export function odelKey(): Env {
	k++;
	return { ODEL_OPENVERSE_CLIENT_ID: `odel-client-${k}`, ODEL_OPENVERSE_CLIENT_SECRET: `odel-secret-${k}-s3cr3t` };
}

/** Call a tool as mcp-proxy would, secrets in `_meta`; `env` adds Worker bindings. Returns the raw result plus its parsed text. */
export async function callTool(name: string, args: Record<string, unknown>, secrets: Record<string, string> | null = freshSecrets(), env: Env = {}) {
	const params: Record<string, unknown> = { name, arguments: args };
	if (secrets) params._meta = { 'app.odel/secrets': secrets };
	const out = await parse(await worker.fetch(rpc('tools/call', params), { OPENVERSE_API_BASE: BASE, ...env }));
	if (out.error) return { rpcError: out.error, isError: true, text: '', body: undefined as any, result: undefined as any };
	const text: string = out.result.content[0].text;
	let body: any;
	try {
		body = JSON.parse(text);
	} catch {
		body = undefined;
	}
	return { result: out.result, isError: Boolean(out.result.isError), text, body };
}
