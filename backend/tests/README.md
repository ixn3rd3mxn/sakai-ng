# Tests

No framework, no install. Run from `backend/`:

```bash
python tests/run.py                      # offline suites (default)
RUN_LIVE_TESTS=1 python tests/run.py     # plus the real NIEMS API contracts
python tests/run.py agents               # one suite
```

Functions are named `test_*` and are plain synchronous callables, so `pytest`
discovers them too if you ever add it — the async paths drive their own event
loop internally, so no plugin is needed.

## The two kinds

**Offline** (`test_call_stats.py`, `test_agents.py`) — every upstream fetcher is
stubbed, no network, no database. These must always pass; a failure is a real
regression. A dummy `MONGO_URI` is supplied by `helpers.py`, which works
because pymongo builds client handles lazily.

**Live** (`test_live_feeds.py`) — calls the real NIEMS APIs, skipped unless
`RUN_LIVE_TESTS=1` so an ordinary run is never hostage to a third party being
up. These assert *shape and semantics*, never specific values, because the
numbers move constantly. Run them when the board looks wrong, or after NIEMS
announce a change.

## What is actually being protected

These are the behaviours that are easy to break and hard to notice, each one
written after getting it wrong:

- **A 404 means zero for today but *no data* for a past day.** The upstream
  returns an identical 404 for "no calls yet this morning" and "outside our
  ~110 day retention". Folding both to zeros would state that the centre
  handled no calls on a real past date.
- **A day captured mid-day is refetched once it ends.** Otherwise yesterday
  stands frozen at whatever it read when the operator last looked.
- **The live overlay is discarded at Bangkok midnight.** It serves only
  "today", so a carried-over overlay paints the finished day's totals onto the
  new day.
- **A partial overlay is refused wholesale**, and a failed refresh reuses the
  last good one — the rollup lags minutes behind, so falling back to it makes
  the counters visibly count *down*.
- **An unmapped agent status is shown, not dropped.** An allow-list once made
  an agent whose phone was `RINGING` vanish from the board mid-ring.
- **`parse_times` never sums across rows.** Counters add up; averages and
  maxima do not.
- **The name cache treats an empty mapping as cached.** Guarding on the dict's
  truthiness meant the unseeded state hit Atlas on every poll.
- **The poll loop is shared and stops when the last board closes**, and an
  unchanged board still receives a heartbeat frame so a working display is
  distinguishable from a dead backend.

## Note on module state

Both modules cache aggressively at module level. `helpers.reset_call_stats` /
`reset_agents` clear all of it; call one at the top of any test that touches
them, or results depend on execution order.

`helpers.stub_call_stats` replaces all three fetchers at once, deliberately —
stubbing two of the three lets the remaining one reach the network mid-test,
which is how the live feed and the durations feed each silently leaked into
these suites while they were being written.
