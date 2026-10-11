import { expect, test } from 'vitest';
import { listTools, readConfigResource } from './helpers';

test('lists the five tools, each with an input and an output schema and the Openverse disclaimer', async () => {
	const tools = await listTools();
	expect(tools.map(t => t.name).sort()).toEqual(['client-status', 'get-media', 'register-client', 'search-audio', 'search-images']);
	for (const tool of tools) {
		expect(tool.inputSchema.type).toBe('object');
		expect(tool.outputSchema.type).toBe('object');
		expect(tool.description).toContain('Not endorsed by Openverse');
	}
});

test('odel://config declares the caller’s own Openverse client, optional at install so register-client is reachable', async () => {
	const { secrets } = await readConfigResource();
	expect(secrets.map((s: { name: string; required: boolean }) => [s.name, s.required])).toEqual([
		['OPENVERSE_CLIENT_ID', false],
		['OPENVERSE_CLIENT_SECRET', false]
	]);
	expect(secrets[0].description).toContain('register-client');
});

const names = (tools: Array<{ name: string }>) => tools.map(t => t.name).sort();

test('nothing is gated: an Odel caller with no key of their own sees every tool', async () => {
	expect(names(await listTools({ 'app.odel/configured': [] }))).toEqual(['client-status', 'get-media', 'register-client', 'search-audio', 'search-images']);
});
