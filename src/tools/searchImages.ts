import { z } from 'zod';
import type { OpenverseClient, LicenceMode } from '../openverse.js';
import { imageItemSchema, pagingShape, toImageItem, type OpenversePage } from '../map.js';
import { OPENVERSE_NOTICE, baseParams, licenceInput, pageInput, pageSizeInput, queryInput, usable } from './shared.js';

export const searchImagesInput = {
	query: queryInput,
	licence: licenceInput,
	category: z.enum(['photograph', 'illustration', 'digitized_artwork']).optional().describe('Kind of image'),
	aspectRatio: z.enum(['tall', 'wide', 'square']).optional().describe('Image shape'),
	page: pageInput,
	pageSize: pageSizeInput
};

export const searchImagesOutput = {
	success: z.literal(true),
	results: z.array(imageItemSchema),
	...pagingShape
};

export const searchImagesDescription = `Search openly licensed photos, illustrations and artwork, safe for commercial use. Returns the image URL, a thumbnail, its size, licence and a ready-made credit line per result. ${OPENVERSE_NOTICE}`;

type Args = {
	query: string;
	licence: LicenceMode;
	category?: 'photograph' | 'illustration' | 'digitized_artwork';
	aspectRatio?: 'tall' | 'wide' | 'square';
	page: number;
	pageSize: number;
};

export async function searchImages(client: OpenverseClient, args: Args) {
	const params = baseParams(args.query, args.licence, args.page, args.pageSize);
	if (args.category) params.set('category', args.category);
	if (args.aspectRatio) params.set('aspect_ratio', args.aspectRatio);

	const res = await client.get<OpenversePage>('/images/', params);
	return {
		results: res.results.filter(m => usable(m, args.licence)).map(toImageItem),
		resultCount: res.result_count,
		pageCount: res.page_count,
		page: args.page,
		nextPage: args.page < res.page_count ? args.page + 1 : null
	};
}
