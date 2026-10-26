# Handoff: NOTAM relevance labelling website

Written 2026-10-25 to start a fresh session in a new repository. Everything a
new session needs is here; it should not need to read the ACPA_Phase-1 repo
except to regenerate the data bundle.

## What this is

Pilots and dispatchers grade how much each NOTAM should have mattered to each
flight. Their answers become the gold set for the ACPA research project: the
thing a ranking model is measured against, and the thing that tells us whether
experts even agree with each other.

A working single-file version already exists at
`ACPA_Phase-1/labeling/notam_labeling.html`, built by
`ACPA_Phase-1/labeling/build_dashboard.py`. It works, it has been tested, and a
reviewer can use it today. The website replaces it so several people can
contribute without emailing CSVs around.

**Keep the single-file version working.** It is the fallback if hosting stalls,
and someone may already have graded against it.

## Decisions already made

Do not relitigate these without asking.

| | Decision |
|---|---|
| Hosting | Cloudflare Pages |
| Database | **Cloudflare D1**, not Workers KV. See the free-tier note below. |
| Blob storage | R2 available, probably unnecessary. The data bundle is ~1 MB and Pages serves it as a static asset for free. Use R2 only if the dataset needs updating without a redeploy. |
| Login | As little as possible. No passwords, no email, no OAuth. A person types their name, gets a code back, and uses that code to return. |
| Data terms | Cleared. The PI has approved hosting this data. |
| Work division | **Every participant grades the entire set.** Not split. The point is to compare judgments on the same items, and splitting would confound disagreement with different people seeing different data. |

### Why D1 and not KV

Checked against Cloudflare's published limits on 2026-10-25:

- **Workers KV free tier: 1,000 writes per day, and 1 write per second to the
  same key.** Five people grading 476 pairs is 2,380 writes. Grading with the
  keyboard beats one per second comfortably. KV would start silently failing
  partway through someone's session, which is the worst possible failure for
  volunteer expert labour.
- **D1 free tier: 100,000 rows written per day, 5 million rows read per day,
  5 GB storage.** Roughly a hundred times the headroom needed, with no per-key
  rate limit.

## The login scheme, and the trap in it

The intent is: type your name, get a hash, use the hash to come back.

Two failure modes to design out, neither about security:

1. **Typo drift.** "Sam", "sam", "Sam T" and "Samukelisiwe" hash to four
   different people. One reviewer's work silently splits across four identities
   and the agreement analysis is quietly wrong. Normalise before hashing: trim,
   lowercase, collapse internal whitespace.
2. **Name collisions.** Two people with the same first name merge into one
   identity and overwrite each other.

The cleaner version, which is no more work: on first visit they type their name,
the server mints a short random code such as `sam-4f7a`, and the page shows it
prominently as "your code to come back with". A cookie remembers it so returning
is usually automatic; the code is the recovery path when the cookie is gone.
That removes both failure modes and keeps the "no accounts" feel.

Either way: **always show who the site thinks you are**, with a count. "Welcome
back, Sam. You have graded 143 of 476." A reviewer spots a wrong identity
instantly; a silent wrong identity corrupts the dataset.

No security measures beyond an unguessable site URL are required. The data is
flight tracks and public notices, not anything sensitive.

## One design detail that matters more than it looks

**Serve the pairs in the same order to everyone.**

Everyone grading everything means full overlap in theory. In practice some
people will not finish. If the order is identical for all participants, a
half-finished pass still overlaps completely with everyone else's, and the
agreement analysis works on whatever subset the slowest person reached. Random
or per-user ordering would strand that.

The current builder already sorts so that every distinct notice appears early,
which is a good order to keep: it means even the first 30 screens cover every
notice in the set at least once.

## The data

Regenerate the bundle from the ACPA_Phase-1 repo, branch `labeling-dashboard`:

```
python -m datapipeline.stages.s1_clean_notams
python -m parser.run_parse
python -m datapipeline.run_pipeline
python -m labeling.build_dashboard
```

`build_dashboard.py` is the piece worth reading and porting. For the website,
split it: have it emit the pairs as a JSON file, and let the site load that,
rather than inlining it into HTML.

Current shape: **476 pairs, 30 distinct notices, 396 flights.** 441 of the pairs
are cases where the aircraft actually flew inside the notice's area.

Each pair carries:

- The flight track, thinned to about 70 points, as `[lat, lon]`
- The notice shape: a circle (centre plus radius), a polygon (vertex list), or a
  bare point when the notice names a place but no area
- A plain-English reading of the notice, generated from the parser's structured
  fields. **This is what makes the task possible for a non-programmer** and is
  the highest-value part of the existing code.
- The raw notice text, collapsed behind a disclosure, so an expert can check our
  reading against the original
- What the aircraft was doing at its closest point: phase of flight, altitude,
  distance to the area's *edge* (not its centre), and whether it was inside
- How long the notice was active during that flight

### Three traps that have already cost time

1. **`notam_id` is not unique across the two corpora.** It collides on 30,099
   values and the colliding notices are unrelated. Id 19482 is a 2 nm drone
   circle in Texas in the domestic file and a 300 nm GPS interference area over
   Arizona in the ICAO file. **Always key on `(notam_id, source)`.** Keying on
   the id alone silently shows the wrong notice, and it looks like a pipeline
   bug rather than a lookup bug.
2. **Distance must be measured to the boundary, not the centre.** A flight
   skimming the rim of a 136 nm circle is 136 nm from its centre and about to
   enter it. Reporting centre distance makes an expert grade the wrong thing.
3. **Pointer notices are excluded.** They only say "see that other notice", so
   there is nothing to judge until the reference is resolved. They were 43 of
   the original pairs.

## The grading task

One question per screen: **how much should this notice have mattered to this
flight?**

| Grade | Meaning |
|---|---|
| Critical | The crew needed this. Not knowing it could have changed what they did. |
| Worth knowing | Genuinely useful, but would not have changed the flight. |
| Background | Applies technically, but a crew would reasonably not act on it. |
| Not relevant | No bearing on this flight at all. |

Plus an optional free-text "why". **Do not drop this field.** Those phrases
("right on the downwind leg", "wrong side of the field") are what will
eventually let the system explain its ranking to a pilot, and they are the only
part of the dataset that captures reasoning rather than a verdict.

Judgment is per flight, not per notice type. The same notice can deserve
different grades on different flights, and that variation is the research
question.

## Behaviour the existing page has, worth keeping

- Number keys 1 to 4 grade and advance. An expert will do hundreds; the
  keyboard matters more than it sounds.
- Saves on every answer, resumes at the first ungraded pair.
- A map with a distance scale bar that adapts to the extent, so "is that close"
  is answerable at a glance.
- Exports every answer, not a delta, with the date and progress count in the
  filename.
- Imports an exported file back, so work is recoverable and can move between
  machines.

The import path matters for migration: **keep `pair_id` as
`flight_id__SOURCE_notamid`**, so CSVs produced by the single-file version can
be loaded straight into the website. If that format changes, any grading done
before launch is stranded.

## Suggested D1 schema

```sql
CREATE TABLE people (
  code        TEXT PRIMARY KEY,   -- "sam-4f7a", what they type to come back
  name        TEXT NOT NULL,      -- as typed, for display
  name_key    TEXT NOT NULL,      -- normalised, to spot duplicates
  created_at  TEXT NOT NULL
);

CREATE TABLE answers (
  code        TEXT NOT NULL,
  pair_id     TEXT NOT NULL,      -- flight_id__SOURCE_notamid
  grade       TEXT NOT NULL,      -- critical | worth_knowing | background | not_relevant
  why         TEXT,
  graded_at   TEXT NOT NULL,
  PRIMARY KEY (code, pair_id)
);
```

The composite primary key means a regrade updates in place rather than
duplicating, and "what has this person done" is one indexed lookup.

## Progress dashboard

Decided: build one. The team needs to see how far each participant has got.

### What it shows

Per person, one row each:

| Column | Why it is there |
|---|---|
| Name | |
| Graded / 476, and a percentage | The headline question |
| Last graded | Distinguishes "slow" from "stopped three weeks ago", which need different responses |
| Grade mix | The share they gave to each of the four levels |
| Median seconds per pair | Derived from consecutive `graded_at` values |

Then two numbers for the project as a whole:

- **Pairs now carrying two or more independent grades.** This is the number that
  actually gates the research, more than any individual's count. Agreement
  cannot be measured on a pair only one person has seen.
- **Agreement so far**, once any pair has two grades. Percentage agreement is
  fine to start; Cohen's or Fleiss kappa is the number the write-up needs.
  Published expert agreement on this exact task ran 0.42 to 0.69
  (Mogillo-Dettwiler 2024), so do not be alarmed by a middling figure. Being
  able to quote ours is the point.

### Why the last two columns earn their place

Grade mix and pace are quality signals, not surveillance. If someone has pressed
"Critical" on 90% of pairs, or is averaging two seconds each, they have almost
certainly misread the scale. Catching that at pair 40 means a short
conversation; catching it at pair 400 means discarding their pass. This is the
cheapest quality control available and it costs one `GROUP BY`.

### Who sees it

Put it on an unguessable path and share it with the team, not with the graders.

These are volunteer experts doing us a favour, and a page ranking them against
each other reads as a leaderboard. Each grader already sees their own count in
the header, which is the part that helps them. If you do decide to show
everyone, show counts without ordering by them.

### Cost

Trivial at this scale. Five people times 476 pairs is about 2,400 rows, and the
page is a handful of aggregate queries. D1 bills rows scanned, so just do not
put it on an auto-refreshing timer; load it when someone opens it.

## Open questions for the new session

- How is disagreement resolved into a single gold label? Majority vote, most
  experienced annotator wins, or a discussion pass. The Zurich thesis
  (Mogillo-Dettwiler 2024) used majority of three. This does not block building,
  but it decides what the analysis can say.
- Where does it live? A project domain reads better than a personal subdomain
  for university research, but that is a preference, not a blocker.

## First thing to do in the new session

Set the working directory to the new repository before anything else. Do not
start it in NL2Sim or ACPA_Phase-1.
