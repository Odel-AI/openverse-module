/** Openverse result → the module's audio / image item, and the zod schemas both are checked against. */

import { z } from 'zod';
import { NO_CREDIT_LICENCES } from './openverse.js';

/** The fields of an Openverse audio or image result this module reads. */
export interface OpenverseMedia {
	id: string;
	title?: string | null;
	creator?: string | null;
	url?: string | null;
	foreign_landing_url?: string | null;
	license?: string;
	license_version?: string | null;
	license_url?: string | null;
	attribution?: string | null;
	source?: string | null;
	provider?: string | null;
	filetype?: string | null;
	tags?: Array<{ name?: string }> | null;
	// audio
	duration?: number | null;
	// image
	thumbnail?: string | null;
	width?: number | null;
	height?: number | null;
}

export interface OpenversePage {
	result_count: number;
	page_count: number;
	page: number;
	results: OpenverseMedia[];
}

const creditShape = {
	id: z.string(),
	title: z.string().nullable(),
	creator: z.string().nullable(),
	url: z.string().describe('The file itself, on the source’s own host'),
	fileType: z.string().nullable(),
	license: z.string().describe('cc0, pdm or by'),
	licenseVersion: z.string().nullable(),
	licenseUrl: z.string().nullable(),
	attribution: z.string().nullable().describe('The credit line to publish with the work; null when none is required'),
	landingUrl: z.string().nullable().describe('The work’s page at its source — check the licence there before use'),
	source: z.string().nullable(),
	tags: z.array(z.string())
};

export const audioItemSchema = z.object({
	...creditShape,
	durationSeconds: z.number().nullable()
});
export type AudioItem = z.infer<typeof audioItemSchema>;

export const imageItemSchema = z.object({
	...creditShape,
	thumbnailUrl: z.string().nullable(),
	width: z.number().nullable(),
	height: z.number().nullable()
});
export type ImageItem = z.infer<typeof imageItemSchema>;

/** The paging fields every search returns. `resultCount` / `pageCount` are Openverse's, before any `maxSeconds` filter. */
export const pagingShape = {
	resultCount: z.number().int(),
	pageCount: z.number().int(),
	page: z.number().int(),
	nextPage: z.number().int().nullable().describe('Pass as `page` to continue; null when there is nothing more')
};

function credit(m: OpenverseMedia) {
	const license = m.license ?? '';
	return {
		id: m.id,
		title: m.title ?? null,
		creator: m.creator ?? null,
		url: m.url ?? '',
		fileType: m.filetype ?? null,
		license,
		licenseVersion: m.license_version ?? null,
		licenseUrl: m.license_url ?? null,
		attribution: NO_CREDIT_LICENCES.includes(license) ? null : (m.attribution ?? null),
		landingUrl: m.foreign_landing_url ?? null,
		source: m.source ?? m.provider ?? null,
		tags: (m.tags ?? []).flatMap(t => (t.name ? [t.name] : []))
	};
}

/** Openverse reports audio duration in milliseconds. */
export function durationSeconds(m: OpenverseMedia): number | null {
	return typeof m.duration === 'number' ? Math.round(m.duration / 10) / 100 : null;
}

export function toAudioItem(m: OpenverseMedia): AudioItem {
	return { ...credit(m), durationSeconds: durationSeconds(m) };
}

export function toImageItem(m: OpenverseMedia): ImageItem {
	return { ...credit(m), thumbnailUrl: m.thumbnail ?? null, width: m.width ?? null, height: m.height ?? null };
}
