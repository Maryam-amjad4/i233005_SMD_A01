// Sanity-check the built submission archive: expected files present, private
// material absent. Run: node scripts/verify-archive.mjs
import { execFileSync } from 'node:child_process';

const listing = execFileSync(
  'powershell',
  ['-NoProfile', '-Command',
    "Add-Type -A System.IO.Compression.FileSystem; " +
    "[IO.Compression.ZipFile]::OpenRead((Resolve-Path 'release/flexpp-source.zip')).Entries | " +
    'ForEach-Object { $_.FullName }'],
  { encoding: 'utf8' },
);
const entries = listing.split(/\r?\n/).filter(Boolean).map((e) => e.replace(/\\/g, '/'));

const mustBePresent = [
  'package.json', 'package-lock.json', 'app.json', 'index.js', 'App.js',
  'docs/verification.md', 'docs/demo-script.md', 'docs/viva-guide.md', 'docs/policy-sources.md',
  'AI_USAGE_REPORT.md', 'README.md',
  'src/domain/gpa.js', 'src/domain/wording.js',
  'scripts/smoke-render.mjs', 'scripts/persistence-check.mjs', 'scripts/package-submission.mjs',
  'scripts/render-harness/react-stub.mjs',
  'tests/uiReadiness.test.js', 'tests/gpa.test.js',
];

const mustBeAbsent = [
  { label: 'private reference material', test: (f) => /^reference\//.test(f) },
  { label: 'installed dependencies', test: (f) => f.includes('node_modules/') },
  { label: 'build output', test: (f) => /^(dist|\.expo)\//.test(f) },
  { label: 'agent scratch files', test: (f) => /tmp-verify|debug-|scratch|\.bak$/.test(f) },
  { label: 'git history', test: (f) => f.startsWith('.git/') },
];

let bad = 0;
process.stdout.write(`archive: ${entries.length} entries\n`);
mustBePresent.forEach((f) => {
  const ok = entries.includes(f);
  if (!ok) bad += 1;
  process.stdout.write(`  ${ok ? 'present' : 'MISSING'}  ${f}\n`);
});
mustBeAbsent.forEach(({ label, test }) => {
  const hits = entries.filter(test);
  if (hits.length) bad += 1;
  process.stdout.write(`  ${hits.length ? 'LEAKED ' : 'clean   '}  ${label}${hits.length ? `: ${hits.slice(0, 3).join(', ')}` : ''}\n`);
});

process.stdout.write(bad === 0 ? 'archive: OK\n' : `archive: ${bad} problem(s)\n`);
process.exit(bad === 0 ? 0 : 1);