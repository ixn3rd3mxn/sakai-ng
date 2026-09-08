import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The commit, not the build time: two deploys of the same commit ship the same
// bundle, and nagging a whole shift to reload for a byte-identical bundle is
// how people learn to ignore the banner. The timestamp fallback is for a
// checkout with no git (a downloaded tarball, or `vercel deploy` from a
// machine, which does not upload .git) - an ugly build id is far better than a
// repeating one, which would leave every tab believing it is current forever.
//
// Shared so that the file the browser reads and the announcement sent to the
// backend can never disagree about what was just built.
export function buildId() {
    if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
    try {
        return execSync('git rev-parse --short=12 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return `t${Date.now().toString(36)}`;
    }
}

export { root };
