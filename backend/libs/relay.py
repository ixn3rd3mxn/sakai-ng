"""Optional Thai-IP hop in front of the NIEMS RNIS APIs.

`rnis-iqm-ptn.niems.go.th` answers Thai addresses only; from anywhere else
the connection is dropped without a refusal, so every feed in this backend
would time out when it runs on AWS. `relay/relay.php`, deployed on Thai
shared hosting, forwards the seven read-only paths those feeds use, and this
module is the client half of it.

Two properties matter more than anything else here:

*   **It is invisible to the rest of the code.** `get()` returns the same
    `httpx.Response` a direct call would, status and body untouched, so the
    404-means-no-rows rule, `libs.feed_health`, the caches and the poll loops
    are all unaware the hop exists. Only the destination of the request
    changes.

*   **No configuration means no relay.** With `NIEMS_RELAY_URL` and
    `NIEMS_RELAY_TOKEN` unset, `route()` is a no-op and every feed goes
    straight to NIEMS exactly as before - which is what a developer machine
    in Thailand, or a backend moved onto Thai hosting, should do.

The NIEMS URLs themselves stay in the feed modules: they are part of what
this system *is*. These two are env because one is a secret that must not be
committed and the other is deployment topology.
"""

from __future__ import annotations

import os
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

# Read here as well as in libs.configs: this module is imported by the feed
# modules, and which of the two lands first depends on import order.
load_dotenv()

TOKEN_HEADER = "X-Relay-Token"

# Set by relay.php on responses it generated itself, so the caller can tell a
# rejected token from a 403 that NIEMS actually sent.
ERROR_HEADER = "X-Relay-Error"


def _url() -> str:
    return (os.environ.get("NIEMS_RELAY_URL") or "").strip()


def _token() -> str:
    return (os.environ.get("NIEMS_RELAY_TOKEN") or "").strip()


def enabled() -> bool:
    """True only when both settings are present.

    Half a configuration is not a usable relay - a URL without a token gets a
    403 from every request, which would look like NIEMS itself going down.
    Treating that as "off" fails the obvious way instead.
    """
    return bool(_url() and _token())


def route(url: str, params: Optional[dict] = None) -> tuple[str, Optional[dict], Optional[dict]]:
    """Rewrite one upstream request into `(target_url, params, headers)`.

    Returns its arguments unchanged when the relay is off, so callers need no
    branch of their own.
    """
    if not enabled():
        return url, params, None
    forwarded: dict[str, Any] = dict(params or {})
    # The relay pins the host and matches this against its own allowlist; it
    # never accepts a full URL, so it cannot be turned into an open proxy.
    forwarded["path"] = urlparse(url).path
    return _url(), forwarded, {TOKEN_HEADER: _token()}


async def get(client: httpx.AsyncClient, url: str, params: Optional[dict] = None) -> httpx.Response:
    """GET `url`, through the relay when one is configured.

    The client belongs to the caller. Each feed sets its own timeout and
    keeps its own connection pool - the call log allows 30s for four paged
    requests, the agent board 10s for a 2s poll - and creating a client here
    would collapse those into one set of defaults.
    """
    target, forwarded, headers = route(url, params)
    return await client.get(target, params=forwarded, headers=headers)


def describe() -> dict:
    """Configuration summary for health output. Never includes the token."""
    return {
        "enabled": enabled(),
        "url": _url() or None,
        "token_set": bool(_token()),
    }
