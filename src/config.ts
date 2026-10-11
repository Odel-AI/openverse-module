import { ErrorCode, ModuleError, getOptionalSecret, type HandlerExtraLike } from '@odel/module-sdk';
import { z } from 'zod';

/**
 * The caller's own Openverse client, optional. Without one the module searches with Odel's
 * shared key (a Worker secret), and without that anonymously, so nothing needs configuring
 * to start. A key of your own buys a rate limit of your own (see `resolveAuth`).
 */
export const configSchema = z.object({
	OPENVERSE_CLIENT_ID: z
		.string()
		.min(1)
		.optional()
		.describe(
			'Optional: your own Openverse API client id, for a rate limit of your own. Without it the module uses Odel’s shared key. Get one with the register-client tool.'
		),
	OPENVERSE_CLIENT_SECRET: z
		.string()
		.min(1)
		.optional()
		.describe('Optional: your own Openverse API client secret, shown once when you register the client')
});

export interface OpenverseCredentials {
	OPENVERSE_CLIENT_ID: string;
	OPENVERSE_CLIENT_SECRET: string;
}

/** Whose key a call runs on: the caller's own, Odel's shared one, or none. */
export type KeySource = 'yours' | 'odel' | 'anonymous';

export interface OpenverseAuth {
	source: KeySource;
	creds: OpenverseCredentials | null;
}

/** Worker bindings. */
export interface Env {
	/** Defaults to https://api.openverse.org/v1; lets a local run point at a stub. */
	OPENVERSE_API_BASE?: string;
	/** Odel's shared Openverse client (Worker secrets), used when the caller has none of their own. */
	ODEL_OPENVERSE_CLIENT_ID?: string;
	ODEL_OPENVERSE_CLIENT_SECRET?: string;
}

/**
 * The caller's own client when both secrets are set; else Odel's shared one; else anonymous.
 * Exactly one of the caller's two secrets is a misconfiguration, answered MISSING_SECRET
 * rather than quietly searched around.
 */
export function resolveAuth(extra: HandlerExtraLike, env: Env): OpenverseAuth {
	const id = getOptionalSecret(extra, 'OPENVERSE_CLIENT_ID');
	const secret = getOptionalSecret(extra, 'OPENVERSE_CLIENT_SECRET');
	if (id && secret) return { source: 'yours', creds: { OPENVERSE_CLIENT_ID: id, OPENVERSE_CLIENT_SECRET: secret } };
	if (id || secret) {
		const missing = id ? 'OPENVERSE_CLIENT_SECRET' : 'OPENVERSE_CLIENT_ID';
		throw new ModuleError(
			ErrorCode.MISSING_SECRET,
			`Only one of OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET is set (${missing} is missing). Add it, or remove both to use Odel's shared key.`,
			{ secretName: missing, secretNames: [missing] }
		);
	}
	if (env.ODEL_OPENVERSE_CLIENT_ID && env.ODEL_OPENVERSE_CLIENT_SECRET) {
		return { source: 'odel', creds: { OPENVERSE_CLIENT_ID: env.ODEL_OPENVERSE_CLIENT_ID, OPENVERSE_CLIENT_SECRET: env.ODEL_OPENVERSE_CLIENT_SECRET } };
	}
	return { source: 'anonymous', creds: null };
}
