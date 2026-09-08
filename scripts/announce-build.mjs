// Tells the backend what was just built, so every open board hears about the
// deploy within seconds instead of on its own five-minute timer.
//
// Runs from the `postbuild` script, which npm fires after `build`. The backend
// pushes the id down the SSE connections the boards already hold; the client
// treats it only as "go and re-read version.json now", so nothing here has to
// be reliable for the app to be correct - a failure just means the operator
// finds out on the next poll, exactly as before this existed.
//
// Configure on Vercel:
//   DEPLOY_ANNOUNCE_URL   https://<backend>/api/deployments
//   DEPLOY_TOKEN          the same secret set on the backend
import { buildId } from './build-id.mjs';

const url = process.env.DEPLOY_ANNOUNCE_URL;
const token = process.env.DEPLOY_TOKEN;

// Preview deployments must stay silent. They build from the same script but
// are never what the production domain serves, so announcing one would send
// every console off to re-check and, worse, could raise a banner for a build
// that is not the one they would get by reloading.
const env = process.env.VERCEL_ENV;
const isProduction = env === undefined ? process.env.ANNOUNCE_BUILD === '1' : env === 'production';

const ATTEMPTS = 2;
const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 3_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function announce() {
    if (!isProduction) {
        console.log(`announce-build: skipped (VERCEL_ENV=${env ?? 'unset'}; set ANNOUNCE_BUILD=1 to force locally)`);
        return;
    }
    if (!url || !token) {
        console.log('announce-build: skipped (DEPLOY_ANNOUNCE_URL or DEPLOY_TOKEN not set)');
        return;
    }

    const build = buildId();

    // Two attempts, because the backend sleeps on a free plan: the first
    // request is often what wakes it and times out doing so, and the second
    // then lands on a warm process a few seconds later.
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-deploy-token': token },
                body: JSON.stringify({ build }),
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });
            if (response.ok) {
                console.log(`announce-build: ${build} announced (attempt ${attempt})`);
                return;
            }
            console.log(`announce-build: attempt ${attempt} rejected with HTTP ${response.status}`);
            // 401 and 503 are configuration, not weather. Retrying cannot fix
            // a wrong token or an unset one, and a build log that says so once
            // is easier to read than one that says it twice.
            if (response.status === 401 || response.status === 503) break;
        } catch (error) {
            console.log(`announce-build: attempt ${attempt} failed (${error.name}: ${error.message})`);
        }
        if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }

    console.log('announce-build: giving up; clients will notice this deploy on their next poll');
}

// Never fail the build over this. A deploy that shipped fine but could not be
// announced is a slower notification, not a broken release - and failing here
// would turn a sleeping backend into a red deployment.
await announce().catch((error) => console.log(`announce-build: ${error}`));
