import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { searchImagesOutput } from '../src/tools/searchImages';
import { callTool, fakeOpenverse, media, page } from './helpers';

afterEach(() => vi.unstubAllGlobals());

function image(overrides: Record<string, unknown> = {}) {
	return media({
		title: 'Forest',
		url: 'https://upload.wikimedia.org/forest.jpg',
		thumbnail: 'https://api.openverse.org/v1/images/x/thumb/',
		width: 1920,
		height: 1080,
		source: 'wikimedia',
		filetype: 'jpg',
		duration: undefined,
		...overrides
	});
}

test('search-images sends category and aspect_ratio and returns thumbnails and size', async () => {
	const ov = fakeOpenverse(() => page([image(), image({ license: 'by-nc' })]));
	const { body, result, isError } = await callTool('search-images', {
		query: 'forest',
		category: 'photograph',
		aspectRatio: 'wide',
		pageSize: 5
	});

	expect(isError).toBe(false);
	const q = ov.searches()[0].url;
	expect(q.pathname).toBe('/v1/images/');
	expect(q.searchParams.get('category')).toBe('photograph');
	expect(q.searchParams.get('aspect_ratio')).toBe('wide');
	expect(q.searchParams.get('license')).toBe('cc0,pdm');
	expect(q.searchParams.get('page_size')).toBe('5');
	expect(body.results).toHaveLength(1);
	expect(body.results[0]).toMatchObject({ thumbnailUrl: 'https://api.openverse.org/v1/images/x/thumb/', width: 1920, height: 1080 });
	expect(z.object(searchImagesOutput).parse(result.structuredContent)).toEqual(body);
});

test('search-images leaves out category and aspect_ratio when not asked', async () => {
	const ov = fakeOpenverse(() => page([]));
	await callTool('search-images', { query: 'forest' });
	const q = ov.searches()[0].url.searchParams;
	expect(q.has('category')).toBe(false);
	expect(q.has('aspect_ratio')).toBe(false);
});
