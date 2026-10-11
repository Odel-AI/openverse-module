/**
 * The Openverse client: per-credential token cache, authenticated GETs, and the mapping from
 * upstream failures to `ModuleError`s. Never puts a token, a secret or a raw upstream body
 * into an error or a log line.
 */

import { ErrorCode, ModuleError } from '@odel/module-sdk';
import type { OpenverseCredentials } from './config.js';

export const DEFAULT_API_BASE = 'https://api.openverse.org/v1';
export const TIMEOUT_MS = 10_000;
/** A cached token is reused only while it has more than this left. */
const TOKEN_MARGIN_MS = 60_000;
/** Isolates are short-lived, but bound the cache anyway: one entry per distinct credential. */
const MAX_CACHED_TOKENS = 100;

export type MediaType = 'audio' | 'image';

/** The licences each `licence` mode allows. Anything else is never returned (see README). */
export const LICENCE_MODES = {
	'public-domain': ['cc0', 'pdm'],
	attribution: ['cc0', 'pdm', 'by']
} as const;
export type LicenceMode = keyof typeof LICENCE_MODES;

/** Public-domain marks that need no credit line. */
export const NO_CREDIT_LICENCES: readonly string[] = LICENCE_MODES['public-domain'];

export function isAllowedLicence(license: string | undefined, mode: LicenceMode): boolean {
	return (LICENCE_MODES[mode] as readonly string[]).includes(license ?? '');
}

interface CachedToken {
	token: string;
	expiresAt: number;
}

// Keyed by a hash of base + id + secret, so knowing someone's client id is not enough to
// pick up their cached token.
const tokens = new Map<string, Promise<CachedToken>>();

async function cacheKey(base: string, creds: OpenverseCredentials): Promise<string> {
	const bytes = new TextEncoder().encode(`${base}\n${creds.OPENVERSE_CLIENT_ID}\n${creds.OPENVERSE_CLIENT_SECRET}`);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function credentialsRejected(): ModuleError {
	return new ModuleError(ErrorCode.INVALID_SECRET, 'Openverse rejected your OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET', {
		secretNames: ['OPENVERSE_CLIENT_ID', 'OPENVERSE_CLIENT_SECRET']
	});
}

/** `fetch` with the 10 s timeout, mapping transport failures to typed errors. */
async function send(url: string, init: RequestInit): Promise<Response> {
	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch (err) {
		if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
			throw ModuleError.timeout('Openverse request', TIMEOUT_MS);
		}
		throw ModuleError.networkError('Could not reach Openverse');
	}
}

/**
 * The fields a 400 objects to, never the messages (they echo the input back). Openverse sends
 * DRF's `{ field: [messages] }` at the top level on register and nested in `detail` on search.
 */
async function rejectedFields(res: Response): Promise<string[]> {
	const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
	const errors = body?.detail && typeof body.detail === 'object' && !Array.isArray(body.detail) ? body.detail : body;
	if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return [];
	return Object.keys(errors).filter(key => key !== 'detail');
}

/** Map a non-2xx Openverse response (other than auth) to a ModuleError. */
async function statusError(res: Response, resource?: { type: MediaType; id: string }): Promise<ModuleError> {
	const statusCode = res.status;
	if (statusCode === 400) {
		const fields = await rejectedFields(res);
		const named = fields.length ? `: ${fields.join(', ')}` : '';
		return ModuleError.validationError(`Openverse rejected the request parameters${named}`, { statusCode, fields });
	}
	if (statusCode === 404 && resource) return ModuleError.notFound(resource.type, resource.id);
	if (statusCode === 429) {
		const retryAfter = Number(res.headers.get('Retry-After'));
		return ModuleError.rateLimitError(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60);
	}
	if (statusCode >= 500) return ModuleError.apiError('Openverse is unavailable', { statusCode });
	return ModuleError.apiError('Openverse returned an unexpected response', { statusCode });
}

async function requestToken(base: string, creds: OpenverseCredentials): Promise<CachedToken> {
	const res = await send(`${base}/auth_tokens/token/`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: creds.OPENVERSE_CLIENT_ID,
			client_secret: creds.OPENVERSE_CLIENT_SECRET
		})
	});
	if (res.status === 400 || res.status === 401) throw credentialsRejected();
	if (!res.ok) throw await statusError(res);
	const body = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
	if (typeof body?.access_token !== 'string' || typeof body.expires_in !== 'number') {
		throw ModuleError.apiError('Openverse returned a malformed token response');
	}
	return { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
}

/** A token for these credentials: the cached one while fresh, else a new one (shared by concurrent callers). */
async function getToken(base: string, creds: OpenverseCredentials, forceRefresh = false): Promise<string> {
	const key = await cacheKey(base, creds);
	const cached = tokens.get(key);
	if (cached && !forceRefresh) {
		const token = await cached.catch(() => undefined);
		if (token && token.expiresAt - TOKEN_MARGIN_MS > Date.now()) return token.token;
	}

	const pending = requestToken(base, creds);
	tokens.delete(key);
	tokens.set(key, pending);
	if (tokens.size > MAX_CACHED_TOKENS) tokens.delete(tokens.keys().next().value!);
	pending.catch(() => {
		if (tokens.get(key) === pending) tokens.delete(key);
	});
	return (await pending).token;
}

/** Openverse answers a page past its depth cap with a 401 that is not about credentials. */
async function isPaginationDepth401(res: Response): Promise<boolean> {
	const body = (await res
		.clone()
		.json()
		.catch(() => null)) as { detail?: unknown } | null;
	return typeof body?.detail === 'string' && /pagination depth|page_size may not exceed/i.test(body.detail);
}

export interface OpenverseClient {
	get<T>(path: string, params?: URLSearchParams, resource?: { type: MediaType; id: string }): Promise<T>;
}

export function createClient(creds: OpenverseCredentials, base = DEFAULT_API_BASE): OpenverseClient {
	const apiBase = base.replace(/\/+$/, '');
	return {
		async get<T>(path: string, params?: URLSearchParams, resource?: { type: MediaType; id: string }): Promise<T> {
			const url = `${apiBase}${path}${params && [...params].length ? `?${params}` : ''}`;
			const call = async (token: string) => send(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });

			let res = await call(await getToken(apiBase, creds));
			if (res.status === 401) {
				if (await isPaginationDepth401(res)) {
					throw ModuleError.validationError('That page is deeper than Openverse will serve for this query', { statusCode: 401 });
				}
				// The token may have been revoked or expired early: refresh once, then give up.
				res = await call(await getToken(apiBase, creds, true));
				if (res.status === 401) throw credentialsRejected();
			}
			if (!res.ok) throw await statusError(res, resource);
			const body = await res.json().catch(() => {
				throw ModuleError.apiError('Openverse returned a malformed response');
			});
			return body as T;
		}
	};
}

export interface Registration {
	clientId: string;
	clientSecret: string;
	name: string;
}

/** Register a new Openverse API client. Anonymous: it is how a caller gets credentials at all. */
export async function registerClient(
	input: { name: string; description: string; email: string },
	base = DEFAULT_API_BASE
): Promise<Registration> {
	const res = await send(`${base.replace(/\/+$/, '')}/auth_tokens/register/`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify(input)
	});
	if (res.status === 400) {
		const fields = await rejectedFields(res);
		const message = fields.includes('name')
			? 'Openverse rejected the client name; names must be unique, so try another'
			: 'Openverse rejected the registration';
		throw ModuleError.validationError(message, { statusCode: 400, fields });
	}
	if (!res.ok) throw await statusError(res);
	const body = (await res.json().catch(() => null)) as { client_id?: unknown; client_secret?: unknown; name?: unknown } | null;
	if (typeof body?.client_id !== 'string' || typeof body.client_secret !== 'string') {
		throw ModuleError.apiError('Openverse returned a malformed registration response');
	}
	return { clientId: body.client_id, clientSecret: body.client_secret, name: typeof body.name === 'string' ? body.name : input.name };
}
