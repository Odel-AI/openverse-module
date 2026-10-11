import { z } from 'zod';
import type { OpenverseClient, LicenceMode } from '../openverse.js';
import { audioItemSchema, pagingShape, toAudioItem, type AudioItem, type OpenversePage } from '../map.js';
import { OPENVERSE_NOTICE, baseParams, licenceInput, pageInput, pageSizeInput, queryInput, usable } from './shared.js';

/** `maxSeconds` is applied after the fetch, so a call may read a few upstream pages — never more than this. */
export const MAX_UPSTREAM_CALLS = 3;

export const searchAudioInput = {
	query: queryInput,
	kind: z
		.enum(['sound_effect', 'music', 'any'])
		.default('sound_effect')
		.describe('sound_effect (short Freesound clips), music (tracks, mostly Jamendo) or any'),
	licence: licenceInput,
	maxSeconds: z.number().positive().max(3600).optional().describe('Only return clips at most this long'),
	page: pageInput,
	pageSize: pageSizeInput
};

export const searchAudioOutput = {
	success: z.literal(true),
	results: z.array(audioItemSchema),
	...pagingShape
};

export const searchAudioDescription = `Search openly licensed sound effects and music, safe for commercial use. Returns a playable file URL, duration, licence and a ready-made credit line per result. ${OPENVERSE_NOTICE}`;

type Args = {
	query: string;
	kind: 'sound_effect' | 'music' | 'any';
	licence: LicenceMode;
	maxSeconds?: number;
	page: number;
	pageSize: number;
};

/**
 * Openverse's length buckets: shortest < 30 s, short 30 s–2 min, medium 2–10 min, long 10 min and up
 * (observed 2026-10-11). Ask only for the buckets that can hold a clip of at most `maxSeconds`.
 */
function lengthBuckets(maxSeconds: number | undefined): string[] {
	if (maxSeconds === undefined) return [];
	return ['shortest', ...(maxSeconds > 30 ? ['short'] : []), ...(maxSeconds > 120 ? ['medium'] : []), ...(maxSeconds > 600 ? ['long'] : [])];
}

function searchParams(args: Args, page: number): URLSearchParams {
	const params = baseParams(args.query, args.licence, page, args.pageSize);
	let buckets = lengthBuckets(args.maxSeconds);
	if (args.kind === 'sound_effect') {
		// Not `category=sound_effect`: Freesound results carry no category, so it returns nothing.
		params.set('source', 'freesound');
		if (buckets.length === 0) buckets = ['shortest'];
	} else if (args.kind === 'music') {
		params.set('category', 'music');
	}
	if (buckets.length) params.set('length', buckets.join(','));
	return params;
}

export async function searchAudio(client: OpenverseClient, args: Args) {
	const results: AudioItem[] = [];
	let first: OpenversePage | undefined;
	let page = args.page;

	for (let calls = 1; ; calls++) {
		const res = await client.get<OpenversePage>('/audio/', searchParams(args, page));
		first ??= res;
		for (const m of res.results) {
			if (!usable(m, args.licence)) continue;
			const item = toAudioItem(m);
			if (args.maxSeconds !== undefined && (item.durationSeconds === null || item.durationSeconds > args.maxSeconds)) continue;
			results.push(item);
		}
		const done = args.maxSeconds === undefined || results.length >= args.pageSize || page >= res.page_count;
		if (done || calls >= MAX_UPSTREAM_CALLS) break;
		page++;
	}

	return {
		results: results.slice(0, args.pageSize),
		resultCount: first.result_count,
		pageCount: first.page_count,
		page: args.page,
		nextPage: page < first.page_count ? page + 1 : null
	};
}
