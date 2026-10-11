import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { getMediaOutput } from '../src/tools/getMedia';
import { callTool, fakeOpenverse, media, page } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const id = 'eab8a6e2-0ac8-4615-9e0d-ebde30523783';

test('get-media returns the item, without asking for related works by default', async () => {
	const ov = fakeOpenverse(() => Response.json(media({ id })));
	const { body, result } = await callTool('get-media', { type: 'audio', id });

	expect(ov.searches().map(c => c.url.pathname)).toEqual([`/v1/audio/${id}/`]);
	expect(body).toMatchObject({ success: true, type: 'audio', item: { id, durationSeconds: 3.16 } });
	expect(body.related).toBeUndefined();
	expect(z.object(getMediaOutput).parse(result.structuredContent)).toEqual(body);
});

test('related: true adds up to 10 allowed related works', async () => {
	const related = [media({ license: 'by-nd' }), ...Array.from({ length: 12 }, () => media({ license: 'by' }))];
	const ov = fakeOpenverse(call => (call.url.pathname.endsWith('/related/') ? page(related) : Response.json(media({ id }))));
	const { body } = await callTool('get-media', { type: 'image', id, related: true });

	expect(ov.searches().map(c => c.url.pathname)).toEqual([`/v1/images/${id}/`, `/v1/images/${id}/related/`]);
	expect(body.related).toHaveLength(10);
	expect(body.related.every((r: { license: string }) => r.license === 'by')).toBe(true);
});

test('a work outside the allowed licences is refused', async () => {
	fakeOpenverse(() => Response.json(media({ id, license: 'by-sa' })));
	const { isError, body } = await callTool('get-media', { type: 'audio', id });

	expect(isError).toBe(true);
	expect(body).toMatchObject({ success: false, code: 1001, metadata: { license: 'by-sa' } });
});

test('a 404 maps to NOT_FOUND naming the media type and id', async () => {
	fakeOpenverse(() => new Response('{"detail":"Not found."}', { status: 404 }));
	const { isError, body } = await callTool('get-media', { type: 'audio', id });

	expect(isError).toBe(true);
	expect(body).toEqual({ success: false, error: `audio "${id}" not found`, code: 3004, metadata: { identifier: id } });
});

test('a malformed id is refused before any upstream call', async () => {
	const ov = fakeOpenverse(() => Response.json(media()));
	expect((await callTool('get-media', { type: 'audio', id: '../../auth_tokens/register' })).isError).toBe(true);
	expect(ov.calls).toHaveLength(0);
});
