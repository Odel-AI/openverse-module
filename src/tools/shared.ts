import { ModuleError } from '@odel/module-sdk';
import type { CallToolResult } from '@odel/module-sdk/server';
import { z } from 'zod';
import { LICENCE_MODES, isAllowedLicence, type LicenceMode } from '../openverse.js';
import type { OpenverseMedia } from '../map.js';

/** Openverse's terms ask for this credit and disclaimer wherever the results are used. */
export const OPENVERSE_NOTICE =
	'Made using Openverse (https://openverse.org). Not endorsed by Openverse. Licences are as reported by the source and are not verified: check `landingUrl` before use.';

export const queryInput = z.string().trim().min(1).max(200).describe('What to search for');
export const licenceInput = z
	.enum(Object.keys(LICENCE_MODES) as [LicenceMode, ...LicenceMode[]])
	.default('public-domain')
	.describe('public-domain (CC0 / public domain mark, no credit needed) or attribution (adds CC BY; use the returned `attribution` line)');
export const pageInput = z.number().int().min(1).default(1).describe('Result page, from 1');
export const pageSizeInput = z.number().int().min(1).max(20).default(10).describe('Results per page, 1–20');

/** Query parameters every search sends. */
export function baseParams(query: string, licence: LicenceMode, page: number, pageSize: number): URLSearchParams {
	return new URLSearchParams({
		q: query,
		license: LICENCE_MODES[licence].join(','),
		filter_dead: 'true',
		mature: 'false',
		page: String(page),
		page_size: String(pageSize)
	});
}

/** Belt and braces over the upstream licence filter: drop anything outside the mode, or with no file. */
export function usable(m: OpenverseMedia, licence: LicenceMode): boolean {
	return isAllowedLicence(m.license, licence) && Boolean(m.url);
}

/**
 * Run a tool body: its result becomes `structuredContent` plus the same JSON as text; a
 * `ModuleError` becomes an `isError` result carrying `{ success: false, error, code, metadata }`,
 * so callers can branch on the code (the MCP SDK on its own keeps only the message).
 */
export async function run(body: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
	try {
		const result = { success: true, ...(await body()) };
		return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
	} catch (err) {
		if (!(err instanceof ModuleError)) console.error('openverse: unexpected error', err instanceof Error ? err.name : typeof err);
		const error = err instanceof ModuleError ? err : ModuleError.internalError('Unexpected error');
		return { content: [{ type: 'text', text: JSON.stringify(error.toJSON()) }], isError: true };
	}
}
