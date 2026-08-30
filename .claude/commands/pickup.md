---
description: Pick up the jarins work where the last developer left off
---

Read `PROMPT.md` and then `HANDOFF.md`, both at the repo root, before doing
anything else. Together they describe the current state of this project, what is
verified, what is explicitly not, and the ordered next steps.

Then:

1. Tell me which task you are starting and what you understand the current state
   to be, in a few sentences. If your reading disagrees with those documents, say
   so — they may have gone stale.
2. Check whether `apps/web/.env.local` exists. If it does not, Supabase has not
   been connected yet, and Task 1 blocks everything else. Do not start
   feature work ahead of it; say so and stop.
3. Work in small, reviewable commits with the reasoning in the message, matching
   the existing history.
4. Before saying anything is done, run the verification in `PROMPT.md` — and
   state plainly what you verified and what you did not.

Do not remove the constraints listed under "do not undo these" in `PROMPT.md`.
Each one looks like clutter and each one is load-bearing; the reasons are
recorded in `HANDOFF.md` under Landmines.
