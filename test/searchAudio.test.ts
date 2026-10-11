import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { searchAudioOutput, MAX_UPSTREAM_CALLS } from '../src/tools/searchAudio';
import { callTool, fakeOpenverse, media, page } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const output = z.object(searchAudioOutput);

describe('search-audio', () => {
	test('sound_effect searches Freesound in the shortest bucket and never sends category', async () => {
		const ov = fakeOpenverse(() => page([media()]));
		const { isError, body, result } = await callTool('search-audio', { query: 'whoosh' });

		expect(isError).toBe(false);
		const q = ov.searches()[0].url.searchParams;
		expect(q.get('q')).toBe('whoosh');
		expect(q.get('source')).toBe('freesound');
		expect(q.get('length')).toBe('shortest');
		expect(q.has('category')).toBe(false);
		expect(q.get('page_size')).toBe('10');
		expect(output.parse(result.structuredContent)).toEqual(body);
	});

	test('every search sets filter_dead=true and mature=false and sends the bearer token', async () => {
		const ov = fakeOpenverse(() => page([]));
		await callTool('search-audio', { query: 'pop', kind: 'any' });

		const call = ov.searches()[0];
		expect(call.url.searchParams.get('filter_dead')).toBe('true');
		expect(call.url.searchParams.get('mature')).toBe('false');
		expect(call.headers.get('authorization')).toBe('Bearer tok-1');
	});

	test('sound_effect with maxSeconds over 30 adds the short bucket', async () => {
		const ov = fakeOpenverse(() => page([]));
		await callTool('search-audio', { query: 'rain', maxSeconds: 45 });
		expect(ov.searches()[0].url.searchParams.get('length')).toBe('shortest,short');
	});

	test.each([
		[120, 'shortest,short'],
		[300, 'shortest,short,medium'],
		[900, 'shortest,short,medium,long']
	])('maxSeconds %i asks for the length buckets %s', async (maxSeconds, length) => {
		const ov = fakeOpenverse(() => page([]));
		await callTool('search-audio', { query: 'ambience', kind: 'any', maxSeconds });
		expect(ov.searches()[0].url.searchParams.get('length')).toBe(length);
	});

	test('music maps to category=music, with no source and no length unless maxSeconds is set', async () => {
		const ov = fakeOpenverse(() => page([media({ source: 'jamendo', duration: 180_000 })]));
		const { body } = await callTool('search-audio', { query: 'lofi', kind: 'music' });

		const q = ov.searches()[0].url.searchParams;
		expect(q.get('category')).toBe('music');
		expect(q.has('source')).toBe(false);
		expect(q.has('length')).toBe(false);
		expect(body.results[0]).toMatchObject({ source: 'jamendo', durationSeconds: 180 });
	});

	test('public-domain sends license=cc0,pdm and drops anything else that comes back', async () => {
		const ov = fakeOpenverse(() => page([media(), media({ license: 'by-sa' }), media({ license: 'pdm' }), media({ license: 'by' })]));
		const { body } = await callTool('search-audio', { query: 'click' });

		expect(ov.searches()[0].url.searchParams.get('license')).toBe('cc0,pdm');
		expect(body.results.map((r: { license: string }) => r.license)).toEqual(['cc0', 'pdm']);
	});

	test('attribution mode sends cc0,pdm,by; credit is null for cc0/pdm and Openverse’s line for by', async () => {
		const credit = '"Click" by Someone is licensed under CC BY 4.0.';
		const ov = fakeOpenverse(() => page([media(), media({ license: 'pdm' }), media({ license: 'by', attribution: credit })]));
		const { body } = await callTool('search-audio', { query: 'click', licence: 'attribution' });

		expect(ov.searches()[0].url.searchParams.get('license')).toBe('cc0,pdm,by');
		expect(body.results.map((r: { attribution: string | null }) => r.attribution)).toEqual([null, null, credit]);
	});

	test('maps an Openverse result to the audio item', async () => {
		const m = media({ duration: 3155 });
		fakeOpenverse(() => page([m], { result_count: 240, page_count: 24 }));
		const { body } = await callTool('search-audio', { query: 'whoosh' });

		expect(body).toEqual({
			success: true,
			results: [
				{
					id: m.id,
					title: 'Deep Whoosh #1',
					creator: 'Kinoton',
					durationSeconds: 3.16,
					url: m.url,
					fileType: 'mp3',
					license: 'cc0',
					licenseVersion: '1.0',
					licenseUrl: m.license_url,
					attribution: null,
					landingUrl: m.foreign_landing_url,
					source: 'freesound',
					tags: ['whoosh', 'sfx']
				}
			],
			resultCount: 240,
			pageCount: 24,
			page: 1,
			nextPage: 2
		});
	});

	test('maxSeconds drops longer clips and pages on until pageSize pass', async () => {
		// Each upstream page holds one 1 s clip and one 5 s clip.
		const ov = fakeOpenverse(call => {
			const p = Number(call.url.searchParams.get('page'));
			return page([media({ duration: 1000, title: `short ${p}` }), media({ duration: 5000 })], { page_count: 10, page: p });
		});
		const { body } = await callTool('search-audio', { query: 'pop', maxSeconds: 2, pageSize: 2 });

		expect(ov.searches().map(c => c.url.searchParams.get('page'))).toEqual(['1', '2']);
		expect(body.results.map((r: { title: string }) => r.title)).toEqual(['short 1', 'short 2']);
		expect(body.nextPage).toBe(3);
	});

	test(`maxSeconds paging stops at ${MAX_UPSTREAM_CALLS} upstream calls`, async () => {
		const ov = fakeOpenverse(call => page([media({ duration: 9000 })], { page_count: 50, page: Number(call.url.searchParams.get('page')) }));
		const { body, isError } = await callTool('search-audio', { query: 'pop', maxSeconds: 2, pageSize: 5 });

		expect(isError).toBe(false);
		expect(ov.searches()).toHaveLength(MAX_UPSTREAM_CALLS);
		expect(body.results).toEqual([]);
		expect(body.nextPage).toBe(MAX_UPSTREAM_CALLS + 1);
	});

	test('maxSeconds paging stops when the pages run out', async () => {
		const ov = fakeOpenverse(() => page([media({ duration: 9000 })], { page_count: 1 }));
		const { body } = await callTool('search-audio', { query: 'pop', maxSeconds: 2 });

		expect(ov.searches()).toHaveLength(1);
		expect(body.nextPage).toBeNull();
	});

	test('an empty search is not an error', async () => {
		fakeOpenverse(() => page([], { result_count: 0, page_count: 0 }));
		const { isError, body } = await callTool('search-audio', { query: 'zzzzqx' });

		expect(isError).toBe(false);
		expect(body).toMatchObject({ results: [], resultCount: 0, nextPage: null });
	});

	test('input validation: empty query and pageSize over 20 are refused before any upstream call', async () => {
		const ov = fakeOpenverse(() => page([]));
		expect((await callTool('search-audio', { query: '  ' })).isError).toBe(true);
		expect((await callTool('search-audio', { query: 'pop', pageSize: 21 })).isError).toBe(true);
		expect(ov.calls).toHaveLength(0);
	});
});
