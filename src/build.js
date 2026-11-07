/** Validate the native DSH module and distributable resources without generating root files. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { apply } from './index.js';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const allowedRootFiles = new Set(['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', '.gitignore']);
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isDirectory()) continue;
  assert.ok(allowedRootFiles.has(entry.name) || /^(readme|license|upstream|changelog)(\.[a-z]+)*$/i.test(entry.name),
    `Keep implementation and build code under src/, not ${entry.name}`);
}
assert.equal(manifest.name, '@pnpwin/dsh-approval-details');
assert.equal(manifest.dsh.client.platform, 'web');
assert.equal(typeof apply, 'function');
for (const key of ['.', './client', './icon']) {
  const path = manifest.exports[key];
  assert.ok(path.startsWith('./src/'), `${key} must resolve under src/`);
  assert.ok(statSync(new URL(path, root)).isFile(), `Missing export ${path}`);
  assert.ok(manifest.files.some(pattern => path.slice(2) === pattern || path.slice(2).startsWith(pattern)), `Unpacked export ${path}`);
}
const clientSource = readFileSync(new URL(manifest.exports['./client'], root), 'utf8');
new Script(clientSource, { filename: 'src/client.js' });
let loaded;
const context = { window: { __ModuleLoader__: { load: value => { loaded = value; } } } };
new Script(clientSource).runInNewContext(context);
assert.equal(loaded.id, manifest.name);
assert.equal(typeof loaded.factory, 'function');
const patch = readFileSync(new URL(manifest.dsh.bundle.patch, root), 'utf8');
assert.ok(patch.includes(`name: '${manifest.name}'`));
assert.ok(patch.includes('id: pnpwin-approval-details'));
for (const language of ['en', 'ru', 'zh']) {
  const locale = JSON.parse(readFileSync(new URL(`locale/${language}.json`, root), 'utf8'));
  assert.ok(locale.meta.title.trim());
  assert.ok(locale.meta.description.trim());
}
const icon = readFileSync(new URL(manifest.exports['./icon'], root), 'utf8');
assert.ok(icon.includes('<svg') && icon.includes('xmlns="http://www.w3.org/2000/svg"'));
assert.ok(Buffer.byteLength(icon) <= 256 * 1024);
for (const file of ['README.md', 'LICENSE', 'UPSTREAM.md']) assert.ok(statSync(new URL(file, root)).isFile());
console.log(`Built ${manifest.name}@${manifest.version}: native Client/Host modules and package resources validated in ${fileURLToPath(root)}`);
