---
name: add-workout
description: Load a new or updated workout into this site — from a zip package, loose files, or a plain-text description — verify it renders correctly, and push to GitHub Pages. Use when the user says things like "загрузим новую тренировку", "добавь тренировку для X", or attaches a training package (zip/json/images) for a client.
---

# Adding/updating a workout

This site has two kinds of workout pages — know which one you're dealing with before touching files:

1. **Personal page** (`Rustam-K.html`, `Tatiana-Z.html`, ...) — one page per client holding their
   whole program. The page's own filename *is* the client id (see `resolveWorkoutId()` in
   `assets/app.js`), so it always reads `data/<id>.json` — do not invent a new id like
   `Rustam-Z-03` even if an imported package uses one. The file is
   `{ id, athlete, <shared fields>, blocks: [ { title, sessions: [ ... ] } ] }`: the **last block
   is the current one** (shown as a strip of sessions), earlier blocks are the on-page archive.
   New sessions are **appended** — usually as a new block for the next two weeks — never written
   over old ones. Each session's `id` keys the client's progress (`workout-progress:<id>:<sessionId>`
   in localStorage) and their result rows in the trainer's sheet (`<id>|<sessionId>|<exerciseIdx>`),
   so **never change or reuse a published session id**. Ids only need to be unique within the client;
   follow whatever scheme that client's file already uses (Fedor: running `s01`, `s02`, …; Rustam:
   planned date + variant, `2026-10-26-A`; very old sessions: plain date `2026-09-04`) and leave
   existing ids as they are. A brand-new client starts at `s01`.
   Sessions are done in order; `date` is only the planned day shown to the client (the client
   enters the day they actually did it themselves).
2. **Generic/example workouts** reached via `workout.html?id=...` and listed on the index page —
   these get a new `data/<id>.json` plus an entry appended to `data/index.json` (see README.md's
   documented format). Only use this path if there's no personal page for the person, or the user
   explicitly wants a browsable list entry instead of updating an existing client's page.

When unsure which case applies, check for an existing `<Name>.html` file first.

### New client

Ask for name + surname initial if not given. Then:
- `<Name>-<I>.html` — copy any existing personal page (`Rustam-K.html`); they're identical, the
  filename alone selects the data.
- `data/<Name>-<I>.json` — `{ "id": "<Name>-<I>", "athlete": "<display name>", "blocks": [] }`, then
  add the first block as below. `id` must equal the filename; `athlete` is what the trainer sees on
  review.html.
- `assets/exercises/<person>/` for their images (lowercase folder name, e.g. `fedor`).
- Nothing to do in the backend: their results go to a sheet named after the id, created on the
  first entry, and show up on review.html automatically.

## 1. Unpack the input

If given a zip: extract it into the scratchpad directory, not the repo. Typical contents:
`data/<something>.json` (the workout), `images/*.png|jpg` (new exercise photos), and sometimes a
`README.txt` noting which images are new vs. reused from a prior session.

If given a plain-text description instead of files: write the session JSON yourself following the
shape documented in `README.md` (id/title/subtitle/date/duration/tags/meta/notice/warmup/
exercises/cooldown/avoid/progression/footer — see any existing `data/*.json` for a full example).

## 2. Merge into the client's file

- For a personal page, open the existing `data/<id>.json`. Incoming packages may describe one
  session or several (often one per training day for the next two weeks). Turn each into a session
  object and append them as a new block at the end of `blocks`, titled with its date range
  (`"Блок 3 · 27 окт – 9 ноя"`). Only add to the current (last) block instead if the user says the
  new sessions belong to the current block.
- Give each new session the next id in that client's scheme, a `title` (sequential "Тренировка 7",
  or the variant the plan uses, "Тренировка A3"), and the planned `date`. Keep the client-level
  `id`/`athlete` untouched; ignore any id/athlete the package carries.
- Text that applies to every session of the client (safety `notice`, standing `avoid` list) can live
  at the client level; a session's own field overrides it. Don't move existing session fields
  around — just add the new sessions.
- Skim the new exercise lists against the client's past sessions (they're all in the same file now) —
  carry forward anything still relevant, like exclusions called out for a reason (injury,
  dizziness, pain).
- Give every exercise a numeric `"sets"`: the client's log shows that many per-set rows
  (weight · reps · RIR), so a missing or wrong count means the wrong number of rows (without
  `sets` the page falls back to a leading "N×" in `spec`, else 1). Warm-up and cardio items get
  `"sets": 1`. RIR shows only in the main part (`warmup`/`cooldown` hide it); set `"trackRir"` on an
  exercise to override, and `"trackPain": true` where pain should be logged. `trackRpe` is no longer
  used — leave it on old sessions, don't add it to new ones.
- Don't reorder or delete exercises inside an already published session: results are keyed by the
  exercise's position, so shifting them would attach logged sets to the wrong exercise.

## 3. Place exercise images

Each client has its own folder: `assets/exercises/<person>/`, files numbered sequentially
(`01-treadmill.jpg`, `02-dynamic-warmup.jpg`, ...) with a short kebab-case name after the number.

- **New exercises**: copy the image from the extracted package into `assets/exercises/<person>/`,
  continuing the existing number sequence, named after the exercise (extension can differ from
  neighbors — png next to jpg is fine).
- **Repeated exercises**: before treating an image as "new", check whether an existing numbered
  file in that folder already depicts the same movement (matching by exercise name/description,
  not filename) — reuse its path instead of duplicating the image. Packages sometimes note "not
  found automatically, reuse from prior archive" for exactly this case.
- Update each exercise's `"image"` field in the JSON to the final `assets/exercises/<person>/NN-name.ext` path.

## 4. Verify before touching git

Use the Browser preview tools — never `curl`/Bash for this:

1. `preview_start` with `{name: "workouts-static"}` (config already in `.claude/launch.json`,
   serves the whole repo on `http://localhost:8080`).
2. `navigate` to `http://localhost:8080/<Person>.html` (or `.../workout.html?id=<id>` for the
   generic path). Then open **each new session** via its hash, `.../<Person>.html#s07`, and repeat
   steps 3–5 for each; the strip at the top should show the new block's sessions, and the previous
   block should appear under «Прошедшие тренировки».
3. `read_console_messages` with `onlyErrors: true` — must be empty.
4. `get_page_text` — confirm title, sections (Разминка/Основная часть/Заминка), exercise names,
   and callouts (notice/avoid/progression/footer) read correctly and nothing is `undefined`.
5. `read_network_requests` filtered to `exercises/<person>` — every image must be `200 OK`. A 404
   here means a path typo or a missing copy step.
6. Log rows: expand a few exercises (click their heads) and check the number of set rows matches
   the plan, RIR appears only in the main part, and the «Дата тренировки» field is there.
   **Don't type into the result fields** — the local page posts to the real Apps Script backend, so
   test entries would land in the trainer's sheet. If you must test input, first replace
   `window.fetch` in the page via `javascript_tool` so requests to `script.google.com` are captured
   instead of sent, and clear the `workout-progress:*` keys you created afterwards.
7. `preview_stop` when done.

Fix and re-verify before proceeding if anything looks wrong — don't commit on a hunch.

## 5. Commit and push

- Commit only the files that actually changed (`data/<id>.json` + any new images under
  `assets/exercises/<person>/`, plus `<Name>.html` for a new client) — never `git add -A`.
- `git fetch` first: other sessions also push to `main`. If the remote has new commits to the same
  client file, rebase and re-merge by hand, keeping both sides' sessions.
- Write a commit message describing what the new sessions/block bring (new exercises, changed loads,
  new exclusions) and why, not just "update workout".
- After pushing, give the user the client's page link; a specific session can be shared as
  `<Person>.html#<sessionId>`.
- `git push` is a shared/hard-to-reverse action — it publishes to GitHub Pages. Ask the user to
  confirm before pushing even if they asked you to "load" the workout; only skip asking if they've
  already said push it in the same turn.
