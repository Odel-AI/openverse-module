/** The MCP server: search tools on the caller's Openverse key or Odel's shared one, plus the tools to get and check a key. */

import { createOdelServer } from '@odel/module-sdk/server';
import type { HandlerExtraLike } from '@odel/module-sdk';
import { configSchema, resolveAuth, type Env } from './config.js';
import { createClient, DEFAULT_API_BASE } from './openverse.js';
import { run } from './tools/shared.js';
import { searchAudio, searchAudioDescription, searchAudioInput, searchAudioOutput } from './tools/searchAudio.js';
import { searchImages, searchImagesDescription, searchImagesInput, searchImagesOutput } from './tools/searchImages.js';
import { getMedia, getMediaDescription, getMediaInput, getMediaOutput } from './tools/getMedia.js';
import { registerClientTool, registerClientDescription, registerClientInput, registerClientOutput } from './tools/registerClient.js';
import { clientStatus, clientStatusDescription, clientStatusOutput } from './tools/clientStatus.js';

const VERSION = '1.1.0';

export function buildServer(env: Env = {}) {
	const server = createOdelServer({ name: 'openverse', version: VERSION, configSchema });
	const base = env.OPENVERSE_API_BASE || DEFAULT_API_BASE;
	const clientFor = (extra: HandlerExtraLike) => createClient(resolveAuth(extra, env), base);

	server.registerTool(
		'search-audio',
		{ description: searchAudioDescription, inputSchema: searchAudioInput, outputSchema: searchAudioOutput },
		async (args, extra) => run(() => searchAudio(clientFor(extra), args))
	);

	server.registerTool(
		'search-images',
		{ description: searchImagesDescription, inputSchema: searchImagesInput, outputSchema: searchImagesOutput },
		async (args, extra) => run(() => searchImages(clientFor(extra), args))
	);

	server.registerTool(
		'get-media',
		{ description: getMediaDescription, inputSchema: getMediaInput, outputSchema: getMediaOutput },
		async (args, extra) => run(() => getMedia(clientFor(extra), args))
	);

	server.registerTool(
		'register-client',
		{
			description: registerClientDescription,
			inputSchema: registerClientInput,
			outputSchema: registerClientOutput,
			annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true }
		},
		async args => run(() => registerClientTool(base, args))
	);

	server.registerTool(
		'client-status',
		{
			description: clientStatusDescription,
			inputSchema: {},
			outputSchema: clientStatusOutput,
			annotations: { readOnlyHint: true }
		},
		async (_args, extra) =>
			run(() => {
				const auth = resolveAuth(extra, env);
				return clientStatus(createClient(auth, base), auth.source);
			})
	);

	return server;
}
