# Why COAir answers were slow — findings report

**Date:** 26 October 2026
**Scope:** QUERIS chat answers and CHRONOS chronology runs on the production server.

## Summary

Between 22 September and 22 October, a chat answer took a **median of 77 seconds**;
one in ten took over **2 minutes**, and the slowest took **4 minutes 16 seconds**.
Chronology runs took a median of **18 minutes**, and **7 of 13 failed**.

Four problems account for most of the chat delay:

1. **Almost half of all answers (47%) were judged "weak" and re-researched.**
   Those answers took a median of 100 seconds versus 43 seconds for the rest.
2. **Keyword search was broken on every logged question.** Each search fell back to a
   slow text scan taking 2.7–6.2 seconds instead of 0.2 seconds, and the poorer
   results made "weak" answers more likely. *Fixed on 26 October.*
3. **After any upload, the next question waited 37–60 seconds** while the search
   index was rebuilt. *Fixed on 26 October.*
4. **The user sees nothing until the whole answer is finished.** There is no
   word-by-word display, so a 40-second answer feels like a 40-second freeze.

Two of the four are fixed. The other two, plus the chronology failures, are open
and listed with recommendations at the end.

## Where the evidence comes from

| Source | What it shows |
|---|---|
| Query run store on the server (`storage/query_runs.db`) | Every question since 22 September: route, total time, verdict, and every AI call with its purpose and duration. 108 chat questions and 13 chronology runs. |
| Server logs (21 October) | A step-by-step trace of one slow answer. |
| Benchmark on a copy of the production search database (26 October) | Measured speed of the broken and fixed keyword search on 138,861 real document chunks. |

The server keeps no log files older than its last restart, so the run store is
the only long-term record. It does not time the individual non-AI steps (search,
reading files); those are recorded as zero. That gap is listed as a
recommendation.

## Chat answers at a glance

| Answer type | Questions | Median time | 1 in 10 took over |
|---|---|---|---|
| Document questions | 57 | 47 s | 95 s |
| Mixed documents + spreadsheets | 43 | 102 s | 137 s |
| Spreadsheet (data) questions | 7 | 110 s | 137 s |
| **All chat answers** | **108** | **77 s** | **121 s** |

Answers got slower over time: the median was 34 seconds in late September and
77–111 seconds through October, as the document library grew and the steps
below compounded.

## Finding 1 — Half of all answers were re-researched from scratch

**Status: open**

After writing an answer, COAir checks it. If the check rates it "weak" (for
example the first search found nothing useful), a deeper research agent runs
several more searches and AI calls before anything is shown.

| Verdict | Questions | Median time | AI calls per answer | Time waiting for AI | Other time |
|---|---|---|---|---|---|
| OK | 57 | 43 s | 3.8 | 25 s | 30 s |
| Weak → re-researched | 50 | 100 s | 12.0 | 46 s | 59 s |

One traced example (21 October, "Summarise the delay events…"): the first answer
was rated weak, the research agent ran four more search rounds, and the user
waited **106 seconds** for 9 AI calls, **66 seconds** of which was the extra
research.

The re-research does improve hard answers, so it should not simply be removed.

**Recommendation:** show the first answer straight away, then either refine it
in the background or offer a "Search deeper" button. Users get an answer in
about 40 seconds instead of 100, and still get the deeper result when needed.

## Finding 2 — Keyword search failed on every question

**Status: fixed and live, 26 October**

COAir combines two kinds of search: meaning-based (AI vectors) and keyword-based
(BM25, which finds exact names, references and codes). In every query in the
available logs (21 October onwards) the keyword search failed with a database
error. When it started is unknown, because older logs were not kept:

> `Binder Error: Alias "score" referenced - but the expression has side effects`

**Cause:** the search database library (DuckDB) is not pinned to a version in
`requirements.txt`. A server rebuild installed DuckDB 2.0, which rejects the way
the query was written. The code then fell back to a plain text scan.

**Measured on production data:**

| Search | Time per search |
|---|---|
| Fallback text scan (what was running) | 2.7 – 6.2 s |
| Fixed keyword search | 0.17 – 0.19 s |

A normal answer runs a search once; a re-researched answer runs it three to
five times, so the fallback added roughly **3–30 seconds per answer**. The
fallback also ranks results poorly (it only counts matching words), which makes
the "weak" verdict in Finding 1 more likely.

**Fix:** the query was rewritten so DuckDB 2.0 accepts it. Results now come back
properly ranked; for example a search for Flyvbjerg's findings returns his
expert report as a top result.

## Finding 3 — Questions stalled while the search index rebuilt

**Status: fixed and live, 26 October**

The keyword index has to be rebuilt after documents are added. The rebuild took
**37–60 seconds** and ran inside whichever question came next, so that user
waited for it. It also ran on the first question after every server restart.
Days with heavy uploading and questions together were the slowest: on
17 October, 52 questions had a median of 94 seconds.

**Fix:** the index now builds in the background when the server starts (41.7
seconds on 26 October, before any question arrived). After uploads, questions
keep using the existing index while a fresh one is built, at most every five
minutes. New uploads are found by meaning-based search immediately and by
keyword search within about five minutes.

## Finding 4 — Nothing appears until the answer is complete

**Status: open**

The chat waits for the full answer before showing anything, apart from the
progress animation. ChatGPT and Claude show words within a second or two even
when the full answer takes longer; COAir shows nothing for 40–100 seconds.

**Recommendation:** stream the answer as it is written. This does not reduce
total time but changes the experience most: words appear as soon as writing
starts instead of after it finishes. Writing alone takes 11 seconds on average
(up to 20), so users would see the answer forming for that part rather than
waiting for it. Combined with showing progress for the search steps, the screen
is never static.

## Finding 5 — More than half the time is spent outside the AI model

**Status: partly fixed**

Across chat answers, only **43%** of the time was spent waiting for the AI model.
The rest — 30 seconds on a normal answer, 59 seconds on a re-researched one — went
on searching, reading documents and other processing. Findings 2 and 3 were a
large part of that; the rest cannot be broken down because these steps are not
timed individually.

**Recommendation:** record the duration of each step (vector search, keyword
search, reading files, spreadsheet queries) in the run store, so the next round
of speed work targets measured delays rather than estimates.

## Finding 6 — Many AI calls run one after another

**Status: open**

A chat answer makes **7.6 AI calls on average** (up to 17), each waiting for the
previous one:

| Purpose | Calls | Average | 1 in 10 over |
|---|---|---|---|
| Writing the document answer | 109 | 11.0 s | 20.4 s |
| Writing a combined answer | 71 | 7.5 s | 10.9 s |
| Writing spreadsheet queries (SQL) | 21 | 15.2 s | 18.4 s |
| General steps (rewriting the question, planning) | 192 | 3.6 s | 4.7 s |
| Re-ranking search results | 248 | 2.5 s | 2.8 s |
| Classifying the question | 107 | 2.6 s | 3.1 s |
| Checking the answer | 52 | 2.2 s | 2.4 s |
| Deciding the scope | 35 | 2.4 s | 2.9 s |

All of these use the full-quality model (Gemini 3.6 Flash) by deliberate policy.
Moving the small steps to the cheaper Lite model would save a few seconds but
risks answer quality, so it was not done.

**Recommendation:** run independent steps (classification, scope and question
rewriting) at the same time instead of in sequence; reuse results for repeated
questions.

## Finding 7 — Some answers were cut off

**Status: open (small)**

7 answer-writing calls and 6 spreadsheet-query calls hit the model's output limit
(`MAX_TOKENS`). These produce incomplete answers or failed spreadsheet queries
that then trigger retries or a weak verdict.

**Recommendation:** raise the output limit for answer writing and SQL generation,
and log when it happens.

## Chronology (CHRONOS) runs

**Status: open**

| Measure | Value |
|---|---|
| Runs | 13 |
| Failed | 7 (4 with "model output invalid") |
| Median time | 18 minutes |
| 1 in 10 took over | 80 minutes |
| Longest | 84 minutes ("mudfa utility diversion", 20 October) |
| AI calls per run | 204 on average, up to 725 |

Almost all the time is document extraction: 2,530 extraction calls averaging
7.5 seconds each. Long runs are expected for this work, but the failure rate is
not: more than half the runs did not produce a report.

**Recommendation:** investigate the "model output invalid" failures first (the
extraction format the model returns), then reduce how many documents are
extracted per run by ranking them before extraction.

## Other issues found while investigating

- **Production ran 26 September code from 21 to 26 October.** Earlier fixes had
  been copied into the running server container instead of into the folder it is
  built from, so each rebuild removed them. This affected answer quality
  (chronology report, chat memory, spreadsheet reading), not just speed. Fixed on
  26 October; deploys now go through `api/scripts/deploy_vps.ps1`, which always
  ships the full committed code.
- **Unpinned library versions.** DuckDB (`>=0.9.0`) and several AI libraries
  (`llama-index>=0.10.0`) are not pinned. Any rebuild can pull a new major version
  and break something, as happened with keyword search.

## Status at a glance

| Problem | Effect on an answer | Status |
|---|---|---|
| Half of answers re-researched | +57 s median | Open |
| Keyword search broken | +3–30 s, weaker results | Fixed 26 Oct |
| Index rebuild during a question | +37–60 s after uploads | Fixed 26 Oct |
| No word-by-word display | Feels frozen for the whole answer | Open |
| AI calls in sequence | 7.6 calls, 2–15 s each | Open |
| Answers cut off at output limit | Occasional retries / weak answers | Open |
| Chronology failures | 7 of 13 runs failed | Open |
| Production on old code | Missing fixes, 21–26 Oct | Fixed 26 Oct |

## Recommended next steps, in order

1. **Measure the fixed system.** Ask 10–15 typical questions and compare against
   the 77-second baseline above; this shows how much Findings 2 and 3 recovered.
2. **Show the first answer immediately; make deeper research optional**
   (Finding 1). Largest single saving.
3. **Stream answers word by word** (Finding 4). Largest improvement in how fast
   it feels.
4. **Time every step in the run store** (Finding 5), so further work is measured.
5. **Fix chronology failures** ("model output invalid").
6. **Pin library versions** in `requirements.txt` to the versions running in
   production, during a planned deploy with a full test pass.
7. **Run independent AI steps in parallel** and raise output limits
   (Findings 6 and 7).
