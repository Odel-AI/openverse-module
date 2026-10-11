/**
 * @Odel/openverse — search Openverse for openly licensed sound effects, music and images that
 * are safe for commercial use. Bring-your-own Openverse client: each user's credentials arrive
 * per request in the Odel secrets envelope (see src/config.ts).
 */

import { WebStandardStreamableHTTPServerTransport } from '@odel/module-sdk/server';
import type { Env } from './config.js';
import { buildServer } from './server.js';

// The entry module exports only the handler: workerd refuses any other named export.
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const server = buildServer(env);
		const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
		await server.connect(transport);
		return transport.handleRequest(request);
	}
};
