// Writes public/version.json at build time.
//
// This file is the only thing an already-loaded tab can compare itself
// against to notice a deploy. The bundle a tab is running came from one
// Vercel deployment; version.json is always served by the *current* one, so a
// difference means the dev has shipped since that tab opened.
//
// Runs from the `prebuild` script, which npm fires before `build` - including
// on Vercel, which builds with `npm run build`.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/version.json');

// The commit, not the build time: two deploys of the same commit ship the
// same bundle, and nagging a whole shift to reload for a byte-identical
// bundle is how people learn to ignore the banner. The timestamp fallback is
// for a checkout with no git (a downloaded tarball) - an ugly build id is far
// better than a repeating one, which would leave every tab believing it is
// current forever.
function buildId() {
    if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
    try {
        return execSync('git rev-parse --short=12 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return `t${Date.now().toString(36)}`;
    }
}

const payload = { build: buildId(), builtAt: new Date().toISOString() };
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`version.json -> ${payload.build} (${payload.builtAt})`);
