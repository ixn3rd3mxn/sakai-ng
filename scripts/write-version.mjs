// Writes public/version.json at build time.
//
// This file is what an already-loaded tab compares itself against to notice a
// deploy. The bundle a tab is running came from one Vercel deployment;
// version.json is always served by the *current* one, so a difference means
// the dev has shipped since that tab opened.
//
// It stays the authority even now that deploys are announced over SSE
// (scripts/announce-build.mjs): the announcement only tells a client to come
// and read this, because a build finishing is not the same instant as the
// deployment going live on the domain.
//
// Runs from the `prebuild` script, which npm fires before `build` - including
// on Vercel, which builds with `npm run build`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildId, root } from './build-id.mjs';

const target = resolve(root, 'public/version.json');

const payload = { build: buildId(), builtAt: new Date().toISOString() };
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`version.json -> ${payload.build} (${payload.builtAt})`);
