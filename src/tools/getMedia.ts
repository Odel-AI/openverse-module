import { ModuleError } from '@odel/module-sdk';
import { z } from 'zod';
import type { MediaType, OpenverseClient } from '../openverse.js';
import { audioItemSchema, imageItemSchema, toAudioItem, toImageItem, type AudioItem, type ImageItem, type OpenverseMedia, type OpenversePage } from '../map.js';
import { OPENVERSE_NOTICE, usable } from './shared.js';

/** get-media has no `licence` input, so it serves the widest mode the module offers. */
const LICENCE = 'attribution';
const MAX_RELATED = 10;

export const getMediaInput = {
	type: z.enum(['audio', 'image']).describe('Whether the id is an audio or an image result'),
	id: z.string().uuid().describe('The Openverse id from a search result'),
	related: z.boolean().default(false).describe('Also return up to 10 similar works')
};

const mediaItem = z.union([audioItemSchema, imageItemSchema]);

export const getMediaOutput = {
	success: z.literal(true),
	type: z.enum(['audio', 'image']),
	item: mediaItem,
	related: z.array(mediaItem).optional()
};

export const getMediaDescription = `Look up one Openverse audio or image result by id, optionally with similar works. Only works under CC0, the public domain mark or CC BY are returned. ${OPENVERSE_NOTICE}`;

type Args = { type: MediaType; id: string; related: boolean };

export async function getMedia(client: OpenverseClient, args: Args) {
	const path = args.type === 'audio' ? '/audio/' : '/images/';
	const toItem: (m: OpenverseMedia) => AudioItem | ImageItem = args.type === 'audio' ? toAudioItem : toImageItem;
	const resource = { type: args.type, id: args.id };

	const media = await client.get<OpenverseMedia>(`${path}${args.id}/`, undefined, resource);
	if (!usable(media, LICENCE)) {
		throw ModuleError.validationError(`This work's licence (${media.license ?? 'unknown'}) is not one this module returns`, {
			license: media.license ?? null
		});
	}

	const result: { type: MediaType; item: AudioItem | ImageItem; related?: Array<AudioItem | ImageItem> } = {
		type: args.type,
		item: toItem(media)
	};
	if (args.related) {
		const page = await client.get<OpenversePage>(`${path}${args.id}/related/`, undefined, resource);
		result.related = page.results
			.filter(m => usable(m, LICENCE))
			.slice(0, MAX_RELATED)
			.map(toItem);
	}
	return result;
}
