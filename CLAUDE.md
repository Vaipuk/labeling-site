# CLAUDE.md — NOTAM relevance labelling site

Read `HANDOFF.md` first. It carries the decisions, the data, the traps and the
schema. This file is the short orientation.

## What this repository is

A website where pilots and dispatchers grade how much each NOTAM should have
mattered to each flight. Their answers become the gold set for the ACPA research
project at ASU, funded under the Honeywell AI Challenge for Pilot Assist.

It replaces a working single-file version, kept at
`reference/single-file-version.html`. Open that in a browser before writing any
code: it is the product, and the website is the same thing with several people
and a database behind it.

## Who uses it

Aviation professionals, not engineers. One of them is a former licensed flight
dispatcher and ERJ-145 first officer who has done this triage by hand for a
living. Her judgment is the product; the interface exists to get out of her way.

Design for someone who will not read instructions, will not install anything,
and is doing this as a favour between other commitments.

## Stack, already decided

Cloudflare Pages, Pages Functions, and **D1**. Not Workers KV: its free tier
allows 1,000 writes a day and one write per second to the same key, and this
workload breaks both. R2 is available but probably unnecessary. Everything must
stay inside free tiers.

## What is already here

```
HANDOFF.md                        the brief: decisions, data, traps, schema
data/pairs.json                   476 pairs, ready to serve (~1 MB)
reference/single-file-version.html  the working product, open this first
reference/build_dashboard.py      how pairs.json is generated
reference/template.html           the page that version is built from
```

`data/pairs.json` is generated from the ACPA_Phase-1 repository. Regenerating it
is in HANDOFF.md; it is not needed to build the site.

## The three things most likely to go wrong

1. **`notam_id` is not unique across the two source corpora.** Always key on
   `(notam_id, source)`. `pair_id` already encodes both as
   `flight_id__SOURCE_notamid`. Keying on the id alone shows the wrong notice
   and looks like someone else's bug.
2. **Keep `pair_id` byte-identical to the single-file version.** Grading may
   already have happened against it, and those CSVs must import cleanly.
3. **Distance is measured to the edge of the notice's area, not its centre.**
   Already computed in `pairs.json`; do not recompute it naively.

## Conventions

From the parent project, and they apply here:

- Write loose and expanded rather than tight and clever.
- Plain everyday names: `find_runway_used`, not `rwy_resolv`.
- No em dashes in comments, docstrings or generated prose.
- Comment only the why the code cannot show.
- No attribution trailers in commit messages.
- Specs and plans stay out of commits. Code, tests and this kind of
  documentation are fine.

## Scope discipline

This is a form with a map and four buttons, plus a progress page. It is not a
platform. Resist auth systems, user roles, real-time collaboration, and anything
else nobody asked for. The hard parts are the plain-English notice readings and
not losing anyone's work, and both are already solved in the reference version.
