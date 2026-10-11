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
	'Register the user’s own free Openverse API client. Only needed if they keep hitting rate limits: without one, this module ' +
	'searches with Odel’s shared key, whose allowance (100 requests a minute, 10,000 a day) every Odel user shares; a verified key of ' +
	'their own gets the same allowance to themselves. Needs no credentials. Only call it when the user asks for a client and gives ' +
	'their own email address. The secret is returned once: tell the user to store both values, verify the client from the email ' +
	'Openverse sends, and then add them as this module’s OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET in Odel. Not endorsed by Openverse.';

/** Odel's guide to editing an installed module's secrets (its Config tab). */
export const CONFIGURE_SECRETS_DOCS = 'https://docs.odel.app/docs/installing#changing-credentials-later';

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
			`Click the verification link Openverse emailed to ${args.email}. Until then Openverse treats the client as anonymous (20 requests a minute, 200 a day), which is less than Odel’s shared key.`,
			`Once verified, add both to this module’s secrets in Odel, on its Config tab (${CONFIGURE_SECRETS_DOCS}). Searches use Odel’s shared key until then.`,
			'Run client-status to confirm it shows keySource: yours and verified: true.'
		]
	};
}
