// Extract the submission archive to a temp directory using the same PowerShell
// path the packager uses, then prove the packaged layout is runnable.
// Usage: node scripts/verify-packaged-layout.mjs
import { execFileSync } from 'node:child_process';
import { rmSync, mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZIP = join(ROOT, 'release', 'flexpp-source.zip');
if (!existsSync(ZIP)) {
  process.stderr.write('packaged-layout: no archive found - run npm run package first\n');
  process.exit(1);
}

const target = mkdtempSync(join(tmpdir(), 'flexpp-'));
execFileSync('powershell', [
  '-NoProfile',
  '-Command',
  `Add-Type -A System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory('${ZIP}','${target}')`,
]);

// Every npm script that references a repository-relative file must resolve in
// the extracted copy. A script pointing at an absent file is the exact defect
// that shipped once already.
const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
const missing = [];
for (const [name, command] of Object.entries(pkg.scripts || {})) {
  for (const token of command.split(/\s+/)) {
    const match = /^(scripts|src|tests|docs)\/[\w./-]+$/.exec(token);
    if (match && !existsSync(join(target, match[0]))) missing.push(`${name} -> ${match[0]}`);
  }
}
if (missing.length) {
  process.stderr.write(`packaged-layout: scripts reference missing files: ${missing.join(', ')}\n`);
  process.exit(1);
}

// Pure-domain tests must run with no node_modules present, proving the archive
// carries the code rather than a link to the working tree.
const pureTests = ['tests/gpa.test.js', 'tests/attendance.test.js', 'tests/marks.test.js'];
let failed = false;
for (const test of pureTests) {
  if (!existsSync(join(target, test))) continue;
  try {
    execFileSync('node', ['--test', test], { cwd: target, encoding: 'utf8', stdio: 'pipe' });
    process.stdout.write(`packaged-layout: ${test} passes in the extracted copy\n`);
  } catch (error) {
    failed = true;
    process.stdout.write(`packaged-layout: ${test} FAILED in the extracted copy\n`);
    process.stdout.write(`${String(error.stdout || error.message).slice(0, 800)}\n`);
  }
}

rmSync(target, { recursive: true, force: true });
process.stdout.write(failed ? 'packaged-layout: FAILED\n' : 'packaged-layout: OK\n');
process.exit(failed ? 1 : 0);