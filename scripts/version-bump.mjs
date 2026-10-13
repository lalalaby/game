import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Package root, independent of the process working directory.
const root = fileURLToPath(new URL('..', import.meta.url));

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts }).trim();
}

function isGitRepo() {
  try {
    return run('git rev-parse --is-inside-work-tree') === 'true';
  } catch {
    return false;
  }
}

if (!isGitRepo()) {
  console.warn('[version-bump] not a git repository; skipping version bump');
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = `v${version}`;

// HEAD carries the current version tag only when the version commit is the tip,
// i.e. no commits have landed since the last bump.
let atVersionCommit = false;
try {
  atVersionCommit = run('git describe --tags --exact-match HEAD') === tag;
} catch {
  atVersionCommit = false;
}

if (atVersionCommit) {
  console.log(`[version-bump] HEAD is ${tag}; no new commits, keeping version`);
} else {
  console.log('[version-bump] new commits since last version; bumping patch');
  execSync('npm version patch --force', { cwd: root, stdio: 'inherit' });
}
