import { z } from 'zod';
import { registerClient } from '../openverse.js';

export const registerClientInput = {
	email: z.string().trim().email().max(254).describe('Where Openverse sends the verification link; must be the user’s own address'),
	name: z
		.string()
		.trim()
		.min(1)
		.max(150)
		.optional()
		.describe('A unique name for the client; a random one is picked when omitted'),
	description: z.string().trim().min(1).max(10_000).optional().describe('What the client is for; Openverse asks for detail')
};

export const registerClientOutput = {
	success: z.literal(true),
	clientId: z.string(),
	clientSecret: z.string().describe('Shown once — Openverse cannot show it again'),
	name: z.string(),
	nextSteps: z.array(z.string())
};

export const registerClientDescription =
	'Register a new Openverse API client for the user. Once its id and secret are configured, this module adds tools to search ' +
	'openly licensed sound effects, music and images that are safe for commercial use. Needs no credentials. ' +
	'Only call it when the user asks for a client and gives their own email address. ' +
	'The secret is returned once: tell the user to store both values as this module’s OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET in Odel, ' +
	'and to click the verification link Openverse emails them (until then the client runs on anonymous rate limits). ' +
	'Not endorsed by Openverse.';

const DEFAULT_DESCRIPTION = 'Searching Openverse for openly licensed audio and images through the Odel module @Odel/openverse (https://odel.app).';

type Args = { email: string; name?: string; description?: string };

export async function registerClientTool(base: string, args: Args) {
	const registration = await registerClient(
		{
			email: args.email,
			name: args.name ?? `odel-openverse-${crypto.randomUUID().slice(0, 8)}`,
			description: args.description ?? DEFAULT_DESCRIPTION
		},
		base
	);
	return {
		...registration,
		nextSteps: [
			'Save OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET now (e.g. in your Odel vault): Openverse will not show the secret again.',
			'Add both to this module’s secrets in Odel, then reconnect so the search tools appear.',
			`Click the verification link Openverse emailed to ${args.email}; until then the client has anonymous rate limits.`,
			'Run client-status to confirm it shows verified: true.'
		]
	};
}
