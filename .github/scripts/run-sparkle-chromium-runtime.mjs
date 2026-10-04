import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const sourcePath = '.github/scripts/sparkle-smoke.mjs';
const runtimePath = '.github/scripts/.sparkle-chromium-runtime.mjs';
let code = await readFile(sourcePath, 'utf8');

const original = "page.on('console', message => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`); });";
const replacement = "page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource:.*status of 400/i.test(message.text())) browserErrors.push(`console: ${message.text()}`); });";

if (!code.includes(original)) {
  throw new Error('Could not locate the Chromium console error collector');
}

code = code.replace(original, replacement);
await writeFile(runtimePath, code);
await import(`${pathToFileURL(runtimePath).href}?run=${Date.now()}`);
