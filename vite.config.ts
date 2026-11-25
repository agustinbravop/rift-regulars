import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// A runtime import keeps the adapter's Bun globals out of the Node/browser test types.
const adapterPackage = '@sveltejs/adapter-bun';
const { default: adapter } = await import(adapterPackage);

export default defineConfig({
  server: {
    fs: {
      deny: ['**/.env', '**/.env.*', '**/*.{crt,pem}', '**/.git/**', '**/data/**']
    }
  },
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true
      },
      // Riot requests can wait in the shared queue longer than Bun's default idle timeout.
      adapter: adapter({ serverOptions: { idleTimeout: 0 } })
    })
  ]
});
