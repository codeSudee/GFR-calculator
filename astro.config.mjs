// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	site: 'https://gfrcalc.com',
	// Emit /page.html so Cloudflare serves clean, slashless URLs that match canonicals and the sitemap.
	build: { format: 'file' },
	trailingSlash: 'never',
	// The default compressor strips the space before an inline link at a line break ("use theCKD-EPI").
	compressHTML: false,
	vite: {
		plugins: [tailwindcss()],
	},
});
