import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Package root, independent of the process working directory.
const root = fileURLToPath(new URL('..', import.meta.url));

function run(cmd, opts = {}) {
  const out = execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
  return typeof out === 'string' ? out.trim() : '';
}

function isGitRepo() {
  try {
    return run('git rev-parse --is-inside-work-tree') === 'true';
  } catch {
    return false;
  }
}

if (!isGitRepo()) {
  console.warn('[release] not a git repository; skipping release commit');
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = `v${version}`;

// The release commit carries the built output (dist) plus the version files, so
// a CDN serving the repository picks up the new build.
const paths = ['dist', 'package.json'];
if (existsSync(new URL('../package-lock.json', import.meta.url))) paths.push('package-lock.json');

run(`git add -A -- ${paths.join(' ')}`, { stdio: 'inherit' });

if (!run('git diff --cached --name-only')) {
  console.log('[release] no build output changes; nothing to commit');
  process.exit(0);
}

run(`git commit -m ${JSON.stringify(version)}`, { stdio: 'inherit' });
console.log(`[release] committed build output (${version})`);

let tagged = true;
try {
  run(`git rev-parse -q --verify refs/tags/${tag}`);
} catch {
  tagged = false;
}
if (tagged) {
  console.log(`[release] tag ${tag} already exists`);
} else {
  run(`git tag -a ${tag} -m ${JSON.stringify(version)}`, { stdio: 'inherit' });
  console.log(`[release] tagged ${tag}`);
}
