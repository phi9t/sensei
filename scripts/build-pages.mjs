import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { generateServiceWorker } from './generate-service-worker.mjs';
import { verifyProductionArtifacts } from './verify-production-artifacts.mjs';

const basePath = '/sensei/';
const distDir = fileURLToPath(new URL('../dist/', import.meta.url));

await build({ base: basePath });

const manifestUrl = new URL('../dist/manifest.webmanifest', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
manifest.start_url = basePath;
manifest.scope = basePath;
manifest.icons = manifest.icons.map((icon) => ({
  ...icon,
  src: `${basePath}${icon.src.replace(/^\//, '')}`,
}));
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
await generateServiceWorker({ distDir, basePath });
await verifyProductionArtifacts({ distDir, basePath });
console.log(`Verified GitHub Pages build at ${basePath}`);
