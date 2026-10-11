import { z } from 'zod';
import type { OpenverseClient } from '../openverse.js';

export const clientStatusOutput = {
	success: z.literal(true),
	verified: z.boolean().describe('Whether the client’s email address is verified; unverified clients get anonymous rate limits'),
	rateLimitModel: z.string().describe('standard or enhanced'),
	requestsThisMinute: z.number().int().nullable(),
	requestsToday: z.number().int().nullable()
};

export const clientStatusDescription =
	'Check the user’s Openverse API client: whether its email is verified, its rate-limit tier and how many requests it has made. Not endorsed by Openverse.';

interface KeyInfo {
	verified: boolean;
	rate_limit_model: string;
	requests_this_minute: number | null;
	requests_today: number | null;
}

export async function clientStatus(client: OpenverseClient) {
	const info = await client.get<KeyInfo>('/rate_limit/');
	return {
		verified: info.verified,
		rateLimitModel: info.rate_limit_model,
		requestsThisMinute: info.requests_this_minute ?? null,
		requestsToday: info.requests_today ?? null
	};
}
