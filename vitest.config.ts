import { defineConfig } from 'vitest/config';

// The worker's fetch handler is web-standard, so the MCP transport runs end to end in
// plain Node; Openverse itself is replaced by a stubbed global fetch (test/fakeOpenverse.ts).
export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts']
	}
});
