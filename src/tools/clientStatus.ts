import { z } from 'zod';
import type { KeySource } from '../config.js';
import type { OpenverseClient } from '../openverse.js';

export const clientStatusOutput = {
	success: z.literal(true),
	keySource: z
		.enum(['yours', 'odel', 'anonymous'])
		.describe('Whose Openverse key your searches use: your own, Odel’s shared one, or none (anonymous)'),
	verified: z
		.boolean()
		.nullable()
		.describe('Whether that key’s email address is verified (unverified keys get anonymous rate limits); null when anonymous'),
	rateLimitModel: z.string().nullable().describe('standard or enhanced; null when anonymous'),
	requestsThisMinute: z.number().int().nullable(),
	requestsToday: z.number().int().nullable()
};

export const clientStatusDescription =
	'Check which Openverse key this module uses for the user (their own, Odel’s shared one, or none) and, for a key, whether it is verified, ' +
	'its rate-limit tier and how many requests it has made. Not endorsed by Openverse.';

interface KeyInfo {
	verified: boolean;
	rate_limit_model: string;
	requests_this_minute: number | null;
	requests_today: number | null;
}

export async function clientStatus(client: OpenverseClient, keySource: KeySource) {
	if (keySource === 'anonymous') {
		return { keySource, verified: null, rateLimitModel: null, requestsThisMinute: null, requestsToday: null };
	}
	const info = await client.get<KeyInfo>('/rate_limit/');
	return {
		keySource,
		verified: info.verified,
		rateLimitModel: info.rate_limit_model,
		requestsThisMinute: info.requests_this_minute ?? null,
		requestsToday: info.requests_today ?? null
	};
}
