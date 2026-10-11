import { ErrorCode, ModuleError, getOptionalSecret, type HandlerExtraLike } from '@odel/module-sdk';
import { z } from 'zod';

/**
 * Bring-your-own Openverse client: each user registers their own and supplies it here, so
 * every caller searches on their own rate limit and terms rather than one shared account.
 * Optional at install, so someone without a client can install and run `register-client`
 * first; every search still needs both (see `requireCredentials`).
 */
export const configSchema = z.object({
	OPENVERSE_CLIENT_ID: z
		.string()
		.min(1)
		.optional()
		.describe('Your Openverse API client id. No client yet? Install without it and run the register-client tool.'),
	OPENVERSE_CLIENT_SECRET: z
		.string()
		.min(1)
		.optional()
		.describe('Your Openverse API client secret, shown once when you register the client')
});

export interface OpenverseCredentials {
	OPENVERSE_CLIENT_ID: string;
	OPENVERSE_CLIENT_SECRET: string;
}

/** The caller's Openverse client, or MISSING_SECRET pointing them at register-client. */
export function requireCredentials(extra: HandlerExtraLike): OpenverseCredentials {
	const id = getOptionalSecret(extra, 'OPENVERSE_CLIENT_ID');
	const secret = getOptionalSecret(extra, 'OPENVERSE_CLIENT_SECRET');
	const missing = [!id && 'OPENVERSE_CLIENT_ID', !secret && 'OPENVERSE_CLIENT_SECRET'].filter(Boolean) as string[];
	if (missing.length) {
		throw new ModuleError(
			ErrorCode.MISSING_SECRET,
			`No Openverse client configured (${missing.join(', ')}). Run the register-client tool to get one, then add both values to this module's secrets.`,
			{ secretNames: missing }
		);
	}
	return { OPENVERSE_CLIENT_ID: id!, OPENVERSE_CLIENT_SECRET: secret! };
}

/** Worker bindings. Nothing secret lives here — credentials are per user. */
export interface Env {
	/** Defaults to https://api.openverse.org/v1; lets a local run point at a stub. */
	OPENVERSE_API_BASE?: string;
}
