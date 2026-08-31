"""Zero-dependency test runner.

    cd backend
    python tests/run.py                  # offline suites only
    RUN_LIVE_TESTS=1 python tests/run.py # plus the real NIEMS API contracts
    python tests/run.py call_stats       # a single suite

Test functions are named `test_*` and are plain synchronous callables, so
pytest discovers and runs them too if you ever add it - no plugin needed for
the async paths, which drive their own event loop internally.
"""

from __future__ import annotations

import importlib
import os
import sys
import traceback

# Running this file directly puts tests/ on sys.path, not backend/, so the
# `tests` package itself would not be importable. Add the parent first.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests import helpers  # noqa: E402
from tests.helpers import RUN_LIVE, Skip  # noqa: E402

SUITES = ("test_call_stats", "test_agents", "test_call_log", "test_live_feeds")


def main(argv: list[str]) -> int:
    wanted = argv[1:]
    suites = [s for s in SUITES if not wanted or any(w in s for w in wanted)]

    passed = failed = skipped = 0
    failures: list[tuple[str, str]] = []

    for suite in suites:
        module = importlib.import_module(f"tests.{suite}")
        names = sorted(n for n in dir(module) if n.startswith("test_"))
        print(f"\n{suite}  ({len(names)} tests)")
        for name in names:
            try:
                helpers.reset_all()
                getattr(module, name)()
            except Skip as exc:
                skipped += 1
                print(f"  SKIP  {name}  ({exc})")
            except Exception:
                failed += 1
                failures.append((f"{suite}.{name}", traceback.format_exc()))
                print(f"  FAIL  {name}")
            else:
                passed += 1
                print(f"  pass  {name}")

    for where, tb in failures:
        print(f"\n{'=' * 70}\nFAILED  {where}\n{'=' * 70}\n{tb}")

    print(f"\n{passed} passed, {failed} failed, {skipped} skipped")
    if skipped and not RUN_LIVE:
        print("(set RUN_LIVE_TESTS=1 to also run the live NIEMS API contract tests)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
