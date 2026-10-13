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

// HEAD carries the current version tag only when the release commit is the tip,
// i.e. no commits have landed since the last release.
let atVersionCommit = false;
try {
  atVersionCommit = run('git describe --tags --exact-match HEAD') === tag;
} catch {
  atVersionCommit = false;
}

if (atVersionCommit) {
  console.log(`[version-bump] HEAD is ${tag}; no new commits, keeping version`);
} else {
  console.log('[version-bump] new commits since last release; bumping patch');
  // Bump the manifest only. The commit + tag happen after the build so the
  // freshly built output lands in the same release commit.
  execSync('npm version patch --no-git-tag-version', { cwd: root, stdio: 'inherit' });
}
