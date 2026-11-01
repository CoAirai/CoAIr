# Why COAir answers were slow — findings and improvements report

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

## Further improvements that would make COAir better

These go beyond speed. Each was observed on the production server or in the
code during this investigation, not taken from a generic checklist.

### Answer accuracy

**A. UK dates in spreadsheets are read the wrong way round — high priority.**
Spreadsheet dates are read US-style (month first) whenever the day is 12 or
less. Tested on the current code:

| Spreadsheet says | Meant (UK) | COAir reads |
|---|---|---|
| 03/04/2010 | 3 April 2010 | **4 March 2010** |
| 12/01/2011 | 12 January 2011 | **1 December 2011** |
| 25/03/2010 | 25 March 2010 | 25 March 2010 (correct) |

Within one column some dates come out right and others wrong, which can
mislead spreadsheet answers and chronologies built from programme or cost
sheets. The server log is full of warnings from this code. **Fix:** decide the
format once per column (if any value has a first number above 12, the column is
day-first) and default to day-first for UK projects, or make it a project
setting. About half a day including tests.

**B. Learn from "weak" answers.** The run store already records which questions
the answer check rated weak (50 of 108). Reviewing those questions each week
shows which documents or question types the search misses, and turns the check
into a quality-improvement loop instead of only a speed cost.

**C. Show users when an answer is uncertain.** When the check rates an answer
weak and the deeper search finds nothing better, say so plainly ("I found
limited evidence for this") rather than presenting it with the same confidence
as a well-sourced answer.

### Reliability

**D. Keep logs for at least 30 days.** The server keeps logs only since its last
restart, so the history of the keyword-search failure was lost and this report
could not say when it began. Configure Docker log rotation to a file kept on the
server disk, or ship logs to a service (e.g. Better Stack, Grafana Cloud). About
an hour.

**E. Make the test suite trustworthy again.** 42 sign-in and company tests fail
on the current code, most of them because sign-in no longer returns a login
token directly, which suggests they predate the email-code (MFA) step. 11 more
fail locally because some packages are missing from developer machines. A test suite that is always partly red stops catching
real breakages. Update the tests to the MFA flow and add a requirements file for
development. About a day.

**F. Run the tests automatically before every deploy.** Add a GitHub Actions
check that runs the test suite on each push, and make the deploy script refuse
to deploy when it fails. Today nothing stops a broken backend reaching
production: this morning's 8–10 minute outage was a startup error that a test
importing the app would have caught before deploy.

**G. Keep the previous version ready for rollback.** A daily job on the server
deletes all Docker images not in use (`docker image prune -af`), so after a bad
deploy there is no previous image to switch back to; recovery means rebuilding.
The deploy script now keeps a code backup; additionally keep the last working
image under a separate tag and exclude it from the cleanup.

**H. Back up the server's working databases.** Users, companies and billing live
in Supabase Postgres, which has its own backups. But these files exist only on
the server's disk, with no backup job:

| File | Contains |
|---|---|
| `storage/report_jobs.db` | Chronology report jobs and results |
| `storage/forensic.db` | FORENSIS analysis results |
| `storage/query_runs.db` | Question history and timings (the data behind this report) |
| `storage/ingestion_jobs.db` | Upload and indexing history |
| `storage/activity_notices.db` | Header notifications |

A nightly copy to the object storage bucket (S3 now, Azure later) would protect
them. About two hours.

**I. A health check that checks the important parts.** `/api/health` reports
"ok" when the API is running, but not whether keyword search, the vector
database or object storage are working. The keyword search was broken while the
health check stayed green. Add those checks so a failure shows up immediately.

### Security

**J. Remove the plain-text copy of production secrets — do this first.** The file
`/opt/coair-api/render.env.paste` (from 14 September) holds the Google API key,
the vector database key and the secret that signs login tokens, and is readable
and writable by every account on the server. Delete it; if it was ever copied
elsewhere, change those keys.

**K. Tighten file permissions on the server.** `.env` (all live secrets) and the
whole `/opt/coair-api` folder are writable by every account on the server
(permissions 666/777). Restrict `.env` to the owner only (`chmod 600`) and the
folder to `755`. Five minutes, no effect on the app.

**L. Replace a retired Google library.** The server warns at every start that
the `google.generativeai` package used by one AI integration no longer receives
updates or security fixes. Move that integration to the supported `google-genai`
package, which the rest of the code already uses.

### Monitoring and visibility

**M. A speed and quality dashboard for Super Admin.** The run store already holds
every question's time, route, verdict and cost. A small page showing daily median
answer time, the share of weak answers, chronology failures and AI cost per
company would show at a glance whether changes help, and catch regressions like
the keyword-search failure within a day instead of weeks.

**N. Alerts.** Send an email when the median answer time doubles, chronology runs
fail repeatedly, or the API restarts unexpectedly.

### Chronology (CHRONOS)

**O. Progress and partial results.** Runs take 18–84 minutes. Show progress with
an estimate ("120 of 400 documents read, about 25 minutes left") and keep what
was extracted when a run fails, so a failure late in a run does not waste it.

**P. Rank before extracting.** Extraction (2,530 calls averaging 7.5 seconds) is
nearly all the time. Ranking documents by relevance first and extracting only
the strongest matches would shorten runs and reduce cost without losing the key
evidence.

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

**This week — quick, low-risk**

1. **Delete the plain-text secrets file and tighten permissions** (J, K).
   Minutes of work, closes a real exposure.
2. **Fix UK date reading in spreadsheets** (A). Wrong dates undermine trust in
   every spreadsheet answer and chronology.
3. **Measure the fixed system.** Ask 10–15 typical questions and compare against
   the 77-second baseline above; this shows how much Findings 2 and 3 recovered.
4. **Keep logs for 30 days and back up the working databases** (D, H).

**Next — biggest gains for users**

5. **Show the first answer immediately; make deeper research optional**
   (Finding 1). Largest single saving.
6. **Stream answers word by word** (Finding 4). Largest improvement in how fast
   it feels.
7. **Fix chronology failures** ("model output invalid"), then add progress and
   partial results (O).

**Then — make it stay fixed**

8. **Repair the test suite and run it automatically before every deploy**
   (E, F), and **pin library versions** to those running in production during
   that deploy.
9. **Time every step in the run store** (Finding 5) and add the **Super Admin
   dashboard and alerts** (M, N).
10. **Run independent AI steps in parallel**, raise output limits
    (Findings 6 and 7), and rank documents before chronology extraction (P).
