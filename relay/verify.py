"""Post-deploy check for relay.php. Zero dependencies - any Python 3.

    python relay/verify.py https://1669be.mywellnetptn.com/relay.php <token>

Answers three questions:

  1. Is the *new* relay live? `X-Relay-Timing` and gzip are emitted only by
     the optimised version, so either one proves the upload landed and is not
     being served from a stale copy or an opcode cache.
  2. Is it behaving? Token, allowlist, method guard, and - most importantly -
     404 pass-through, because the backend reads 404 as "no rows for that
     range" and a relay that rewrites it breaks every history view.
  3. Is UPSTREAM_IP worth setting? Only the real host can answer that; the
     DNS figure below is measured on HostAtom, not guessed from here.
"""

from __future__ import annotations

import gzip
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlencode

BANGKOK = timezone(timedelta(hours=7))
PATHS = [
    "/v2/summary/today",
    "/v2/agent",
    "/v2/abandon/today",
    "/v2/call-logs",
    "/v2/stats/summary/summaries",
    "/v2/stats/summary/times",
    "/v2/stats/hourly/summaries",
]

passed = failed = 0


def check(label: str, ok: bool, detail: str = "") -> bool:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {label}" + (f"  ({detail})" if detail else ""))
    else:
        failed += 1
        print(f"  FAIL  {label}" + (f"  ({detail})" if detail else ""))
    return ok


def call(url: str, token: str | None, params: dict | None = None,
         gzip_ok: bool = True, method: str = "GET"):
    """-> (status, headers, body) with no automatic decompression."""
    target = url + ("?" + urlencode(params) if params else "")
    headers = {"Accept-Encoding": "gzip, deflate" if gzip_ok else "identity"}
    if token is not None:
        headers["X-Relay-Token"] = token
    req = urllib.request.Request(target, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def epoch_day(day: date) -> tuple[int, int]:
    start = datetime.combine(day, datetime.min.time(), tzinfo=BANGKOK)
    return int(start.timestamp()), int((start + timedelta(days=1)).timestamp()) - 1


def main(argv: list[str]) -> int:
    url = (argv[1] if len(argv) > 1 else os.environ.get("RELAY_URL", "")).strip()
    token = (argv[2] if len(argv) > 2 else os.environ.get("RELAY_TOKEN", "")).strip()
    if not url or not token:
        print(__doc__)
        return 2

    print(f"relay: {url}\n")

    print("is the new relay live?")
    status, headers, body = call(url, token, {"path": "/v2/agent"})
    timing = headers.get("X-Relay-Timing")
    encoding = (headers.get("Content-Encoding") or "").lower()
    if not check("responds at all", status in (200, 404), f"HTTP {status}"):
        print(f"\n  body: {body[:300]!r}")
        return 1
    new = check("X-Relay-Timing present", timing is not None,
                timing or "MISSING - this is the OLD relay, or an old cached copy")
    new &= check("gzip applied to /v2/agent", encoding == "gzip",
                 f"Content-Encoding: {encoding or '(none)'}"
                 + ("" if encoding == "gzip" else " - OLD relay, or mod_deflate stripped it"))
    if encoding == "gzip":
        plain = gzip.decompress(body)
        check("gzip decodes and is smaller", len(body) < len(plain),
              f"{len(plain):,} -> {len(body):,} bytes, {100 - len(body) * 100 // len(plain)}% saved")

    print("\nsecurity")
    s, h, _ = call(url, None, {"path": "/v2/agent"})
    check("no token is refused", s == 403 and h.get("X-Relay-Error") == "bad_token",
          f"HTTP {s} / {h.get('X-Relay-Error')}")
    s, h, _ = call(url, "wrong-token", {"path": "/v2/agent"})
    check("wrong token is refused", s == 403 and h.get("X-Relay-Error") == "bad_token",
          f"HTTP {s} / {h.get('X-Relay-Error')}")
    s, h, _ = call(url, token, {"path": "/v2/../etc/passwd"})
    check("path outside allowlist is refused",
          s == 403 and h.get("X-Relay-Error") == "path_not_allowed",
          f"HTTP {s} / {h.get('X-Relay-Error')}")
    s, h, _ = call(url, token, None)
    check("missing path is refused", s == 400 and h.get("X-Relay-Error") == "missing_path",
          f"HTTP {s} / {h.get('X-Relay-Error')}")
    s, h, _ = call(url, token, {"path": "/v2/agent"}, method="POST")
    check("non-GET is refused", s == 405, f"HTTP {s}")

    # The backend reads "no rows for this range" off the wire in two shapes -
    # a 404, and a 200 carrying an empty `data` array - and collapses both to
    # None (see libs/call_stats.py `_fetch`). Which one NIEMS picks is its
    # business; the relay's job is to not change it into the other, or into a
    # 502, because a past date rendering as six zeros is a false claim rather
    # than a gap.
    print("\nno-rows pass-through (the one that breaks history if wrong)")
    old = date.today() - timedelta(days=400)
    frm, until = epoch_day(old)
    s, h, b = call(url, token, {"path": "/v2/stats/summary/summaries", "branch_id": 94,
                                "from": frm, "until": until, "org_code": 94}, gzip_ok=False)
    empty_200 = s == 200 and b'"data":[]' in b.replace(b" ", b"")
    check("a day outside retention comes back verbatim", s == 404 or empty_200,
          f"HTTP {s}" + (" with empty data" if empty_200 else "")
          + ("" if (s == 404 or empty_200) else " - the relay altered what NIEMS said"))

    print("\nall seven allowlisted paths")
    today = date.today()
    frm, until = epoch_day(today)
    ranged = {"branch_id": 94, "from": frm, "until": until, "org_code": 94}
    logs = {"page": 1, "per_page": 500, "branch_id": 94, "start_date": frm, "end_date": until}
    for p in PATHS:
        extra = logs if p == "/v2/call-logs" else (ranged if "/stats/" in p else {})
        s, h, b = call(url, token, {"path": p, **extra})
        enc = (h.get("Content-Encoding") or "").lower()
        size = len(gzip.decompress(b)) if enc == "gzip" else len(b)
        check(p, s in (200, 404), f"HTTP {s}, {size:,} bytes{', gzip' if enc == 'gzip' else ''}")

    if timing:
        print(f"\nwhat the hop costs on HostAtom\n  {timing}")
        phases = dict(kv.split("=") for kv in timing.split() if "=" in kv)
        try:
            dns, tls = float(phases.get("dns", 0)), float(phases.get("tls", 0))
            total = float(phases.get("total", 0))
            # dns=0 does NOT mean "this host caches DNS, so leave the pin
            # off" - it is what a *working* UPSTREAM_IP looks like, because
            # CURLOPT_RESOLVE skips the lookup entirely. Reading it the other
            # way round would advise undoing the setting that produced it.
            if dns == 0:
                print("\n  DNS costs nothing. Either UPSTREAM_IP is set in relay.php - in which\n"
                      "  case that is why, and it should stay - or this host resolves for free.\n"
                      "  Nothing to gain here either way.")
            elif dns >= 5:
                print(f"\n  DNS is {dns:.1f}ms per request. Setting UPSTREAM_IP in relay.php removes it\n"
                      f"  (~{dns:.0f}ms off every poll). The retry-without-pin fallback makes that safe.")
            else:
                print(f"\n  DNS is {dns:.1f}ms - this host already caches it. Pinning buys nothing.")

            if total and tls / total > 0.5:
                print(f"\n  TLS is {tls:.0f}ms of the {total:.0f}ms hop ({tls * 100 // total:.0f}%), and NIEMS itself\n"
                      f"  answered in {float(phases.get('wait', 0)):.0f}ms. That handshake is redone on every\n"
                      "  request because PHP-FPM cannot pool connections, and it is mostly CPU on\n"
                      "  shared hosting rather than network. It is the floor for this architecture -\n"
                      "  there is nothing left to tune in relay.php.")
        except (ValueError, ZeroDivisionError):
            pass

    print(f"\n{passed} passed, {failed} failed")
    if failed == 0 and new:
        print("\nThe new relay is live and correct.")
    elif not new:
        print("\nReachable, but this is NOT the optimised relay - re-upload relay.php.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
