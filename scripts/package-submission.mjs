#!/usr/bin/env node
/**
 * Build the submission package: a source ZIP with no dependencies, caches or
 * private reference material.
 *
 * Everything needed to run the project is included (source, app.json, package
 * manifests including the lockfile, assets, docs). Deliberately excluded:
 * node_modules, .git, .expo, dist, web-build, the private reference/ folder,
 * logs and the release directory itself.
 *
 * Implementation note: a staging copy is made first so the archive can be built
 * with a single Compress-Archive call instead of a long argument list.
 *
 * Self-check: the shipped package.json still advertises the npm scripts, so
 * every file an entry in "scripts" invokes must exist in the archive. A file
 * extension missing from INCLUDE_EXTENSIONS used to drop the whole scripts/
 * directory, leaving `npm run verify` to fail with MODULE_NOT_FOUND inside the
 * submitted ZIP. That is now a hard failure here instead of a silent omission.
 *
 * Idempotent: it wipes and rebuilds both the staging folder and the archive.
 * Usage: node scripts/package-submission.mjs [outputPath]
 */
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(process.argv[2] || join(ROOT, 'release', 'flexpp-source.zip'));
const STAGING = join(ROOT, 'release', 'staging');

const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'web-build', 'reference', 'release', '.vscode']);
const EXCLUDED_FILES = new Set(['.DS_Store', 'nohup.out']);
const INCLUDE_EXTENSIONS = ['.js', '.mjs', '.json', '.md', '.png', '.jpg', '.jpeg', '.svg', '.txt', '.pdf', '.docx'];

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry) || EXCLUDED_FILES.has(entry) || entry.endsWith('.log')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (entry === '.gitignore' || INCLUDE_EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

const files = collect(ROOT);
// Normalised to forward slashes so the checks below behave the same on Windows.
const relativePaths = files.map((file) => relative(ROOT, file).replace(/\\/g, '/')).sort();

if (!existsSync(join(ROOT, 'package-lock.json'))) {
  process.stderr.write('package-submission: package-lock.json is missing - run npm install first.\n');
  process.exit(1);
}

const leaked = relativePaths.filter((path) => path.startsWith('reference/') || path.includes('node_modules'));
if (leaked.length) {
  process.stderr.write(`package-submission: FAILED - excluded material selected: ${leaked.join(', ')}\n`);
  process.exit(1);
}

/**
 * Every file path a package.json "scripts" entry appears to invoke.
 *
 * `node scripts/check-hooks.mjs` only works inside the archive if that file was
 * actually packed. This is the check that catches an extension missing from
 * INCLUDE_EXTENSIONS: the shipped package.json keeps advertising the script
 * while the archive silently stops containing its target.
 */
function referencedScriptFiles(packageJson) {
  const refs = new Set();
  const pathToken = /[A-Za-z0-9_./\\-]+\.(?:mjs|cjs|js|json|sh|ps1)\b/g;
  for (const command of Object.values(packageJson.scripts || {})) {
    for (const token of String(command).match(pathToken) || []) {
      refs.add(token.replace(/\\/g, '/'));
    }
  }
  return refs;
}

const archived = new Set(relativePaths);
const droppedScripts = [...referencedScriptFiles(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')))]
  .filter((ref) => existsSync(join(ROOT, ref)) && !archived.has(ref));
if (droppedScripts.length) {
  process.stderr.write(
    `package-submission: FAILED - package.json scripts reference files missing from the archive: ${droppedScripts.join(', ')}\n`,
  );
  process.exit(1);
}

rmSync(STAGING, { recursive: true, force: true });
rmSync(OUTPUT, { force: true });
mkdirSync(STAGING, { recursive: true });
for (const path of relativePaths) {
  const destination = join(STAGING, path);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(ROOT, path), destination);
}

execFileSync(
  'powershell',
  ['-NoProfile', '-Command', `Compress-Archive -Path '${STAGING}\\*' -DestinationPath '${OUTPUT}' -Force`],
  { stdio: 'inherit' },
);

const bytes = statSync(OUTPUT).size;
process.stdout.write(
  `package-submission: wrote ${relative(ROOT, OUTPUT) || OUTPUT} (${files.length} files, ${(bytes / 1024).toFixed(0)} KB)\n`,
);
process.stdout.write('package-submission: no dependencies, caches or private reference material included.\n');
