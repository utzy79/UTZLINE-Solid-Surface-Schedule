# UTZLINE Solid Surface Schedule — installable app

**Current version: v5** (its own independent version line, separate from
every other app in the family — bump this line, and add a dated entry
below, every time a new build ships.)

**v5 (2026-09-24):** joinery-schedule.json v2 — third and final round of the same rebuild shipped for joinery-status.json in v3 and machining-flags.json in v4, both below. This app reads the MAIN UTZLINE Scheduler's own `joinery-schedule.json` (entirely separate from this app's own `solid-surface-schedule.json`, which this round does not touch) to flag items that are out of scope for a Solid Surface schedule — that file is now event-sourced (one immutable event file per Save/Clear action under `Project Saves/Joinery Schedule/<Level> - <Room> - <Code>/`, folded down to the single latest event by timestamp, matching that file's own always-atomic-whole write semantics) instead of one shared mutable array file. This app's own read path picks up the same one-time, automatic, lossless migration. No observable change to this app's own display or to its own `solid-surface-schedule.json` in any way. This closes out the three follow-up rounds Andrew asked for on top of the original safety-net work. `service-worker.js` cache bumped to `utzline-solid-surface-schedule-cache-v5`.

**v4 (2026-09-24):** machining-flags.json v2 — second round of the same rebuild shipped for joinery-status.json in v3 below. This app is a pure read-only consumer of Machine Schedule's own `machining-flags.json` (an optional, best-effort reference column showing an item's Solid Surface cut state) — that file is now event-sourced (one immutable event file per cut-state change under `Project Saves/Machining Flags/<Level> - <Room> - <Code>/`, folded together with the latest event per cut type winning) instead of one shared mutable array file. This app's own read path picks up the same one-time, automatic, lossless migration. No observable change to this app's own display.

**v3 (2026-09-24):** joinery-status.json v2 — Andrew, verbatim, on the coming scale: "we will have 30 people using this app in different stages, all coming back to the same database... needs to be foolproof and nevel lose data. some of this will be done via dropbox upload after the fact." The shared `joinery-status.json` used to be one JSON array file, rewritten whole on every save — risky with up to 15 people across five apps, some syncing in late via Dropbox. Replaced with one small immutable event file per status change, filed under `Project Saves/Joinery Status/<Level> - <Room> - <Code>/` — two writers can never collide, and a late Dropbox sync can never overwrite a newer save regardless of arrival order. The old file is migrated automatically and losslessly (once, idempotently) the first time any app in the family opens a project after this update, and left in place afterward, untouched. This app is a pure read-only consumer of `joinery-status.json` (never writes it) — the v2 job-note button above is completely unchanged, just now folded from events instead of read off a shared array. `service-worker.js` cache bumped to `utzline-solid-surface-schedule-cache-v3`.

**v2 (2026-09-24):** added an **"Open job note"** button to the
row-actions column of both the Overall Schedule and per-project Schedule
tables. Andrew, verbatim, across the whole "any scheduler" app family:

> "on any scheduler, there needs to be a open job note button for each
> joinery item. between delay and view on plan."

Placed as the **first** button in that column, before the existing "View
on plan"/"Edit schedule" buttons — Delay is the previous column, so
row-actions is the very next one, matching "between delay and view on
plan" exactly.

A job note in this ecosystem is exclusively a **PDF attachment** (site
instructions, a delivery docket, etc) — there's no text body, and this app
never writes one, only reads. Content lives in a per-item folder,
`Project Saves/Job Notes/<key>/` (`key` = `joineryItemPageKey(level, room,
joineryId)`, mirroring every other reader app in the family), and the
button is gated on that same row's `joinery-status.json` record already
carrying `jobNote: true` (set by Site Measure or the Viewer when a note is
added, read off the SAME `findJoineryStatus` call `buildEnrichedRows`
already makes — no new file read needed just for the flag). An item with
no job note gets **no button at all**, never a dead-end "no notes yet"
dialog. Clicking it opens a shared dialog listing every PDF ever attached
(oldest never deleted, newest-first), each with an "Open" action that
opens the real file in a new tab. Ported from Install ITP's own "View job
note" feature — same storage format, same `jobNoteSortKey` newest-first
sort that handles both the old (prefix) and current (suffix) timestamp
filename formats.

Companion apps UTZLINE Scheduler and UTZLINE Machine Schedule are getting
the identical feature at the same time, each in their own codebase — this
change touches only this app's own `index.html`/`service-worker.js`.

**v1 (2026-09-23):** first release. Andrew, verbatim:

> "we will also add a Solid Surface schedule that is a separate app. so
> when putting on the joinery item we can have a tick box for has Solid
> Surface. this then puts it on its own schedule. this schedule pulls its
> site delivery date from the main schedule, but could be independant if
> required (might need to go to site later)."

Confirmed follow-up decision the same day: this app is a **full clone** of
UTZLINE Scheduler's own screens and logic — forked wholesale from
Scheduler's own `index.html` (v12, the day its plan viewer's stray SVG
`viewBox` bug was fixed) and then re-scoped/relabeled, rather than written
from scratch. It has its own manufacture lead-time field and its own
computed manufacture-start-date/delay-flag logic, fully independent of the
main Scheduler's own dates once a record of its own exists. "Pulls from the
main schedule" turned out to mean only one thing: a **one-time convenience
prefill**. See below for exactly how that works.

This folder is the self-contained, installable **UTZLINE Solid Surface
Schedule** app — like Install ITP / Manufacture ITP / Projects / Scheduler
/ Machine Schedule, this is **not** built from `source.html`. There's no
`build.py` here — whatever's in `index.html` is what ships.

## The scoping rule

Every table in this app — the Overall Schedule and every per-project
Schedule — only ever shows joinery items whose `joinery-items.json` record
has `hasSolidSurface === true` (that field is owned and written exclusively
by UTZLINE Projects; this app only ever reads it, via
`filterSolidSurfaceItems`). An item without that flag ticked never appears
in a table here at all.

The plan viewer applies the same rule to its markers, but with a softer
touch: rather than hiding an out-of-scope item's marker outright (which
would make the plan harder to navigate — Andrew still needs to see where
every joinery item sits, Solid Surface or not), `openPlanCanvasForLevel`
tags each marker with whether its matching item has `hasSolidSurface===true`,
and `planRenderMarkers` draws an out-of-scope marker **muted** (40% opacity,
grey dot instead of the accent indigo) instead of hiding it. Tapping,
right-clicking, or long-pressing a muted marker doesn't open this app's Set
Schedule dialog — `onPlanRightClickOrLongPress` shows a "not flagged for
Solid Surface; nothing to schedule here" toast instead.

## The default-pull-then-independent behaviour

Andrew's own words: *"this schedule pulls its site delivery date from the
main schedule, but could be independant if required (might need to go to
site later)."* Concretely, in `openScheduleModal`:

1. This app first checks whether the item already has its **own**
   `solid-surface-schedule.json` record.
2. **If it does**, the Set Schedule dialog opens pre-filled with that
   record's own values — full stop. The main Scheduler is never consulted.
3. **If it doesn't yet**, this app makes one read-only cross-reference into
   the **main Scheduler's own** `joinery-schedule.json` (`readMainJoinerySchedule`
   — this app never writes that file, ever) and, if that item has a record
   there with a `requiredDeliveryDate`, pre-fills **only** the Required
   Delivery Date field from it, with a small note under the field explaining
   where the value came from. The Manufacture Lead Time field is
   deliberately **not** pulled across — it stays at this app's own
   `DEFAULT_LEAD_TIME_DAYS` (30), since a Solid Surface fabricator's lead
   time has no reason to match the main joinery/carcase lead time for the
   same item.
4. The moment Save is pressed, a `solid-surface-schedule.json` record now
   exists for that item, and step 2 applies forever after — even if the
   main Scheduler's own date for that item later changes, this app's own
   record never re-syncs. "Could be independent if required" is the
   default from the very first save, not an opt-in.

`Clear schedule` only ever removes this app's own record; it never touches
the main schedule.

## What it reads vs. what it owns

Solid Surface Schedule reads the **same Projects folder** every other app
in the family uses, and is **strictly read-only** against every file
another app owns — including, now, the main Scheduler's own file:

- `joinery-items.json` — the project's joinery item list, including the
  `hasSolidSurface` flag this app filters everything on (read-only; owned
  by UTZLINE Projects)
- `joinery-status.json` — the shared, forward-only status pipeline
  (read-only, used for the Status column, its history hover popup, and the
  post-delivery Delivered early/late/on-time delay outcome, all ported
  verbatim from Scheduler)
- `joinery-schedule.json` — the **main Scheduler's own** schedule file,
  read-only, used **only** for the one-time Required Delivery Date prefill
  described above
- `machining-flags.json` — **UTZLINE Machine Schedule's** own per-item
  tri-state (Pending/Done/N/A) cut-tracking file, read-only, shown as an
  optional, best-effort "SS cut (Machine Sched.)" reference column in both
  tables (an unreadable file or an unexpected shape for the `solidSurface`
  sub-field just shows an em dash — this is a nice-to-have display, never a
  hard dependency)
- `Project Saves/Floor Plans/<Project> - <Level>.json` (with the same
  legacy per-Level-folder fallback Scheduler already has) — a level's floor
  plan image and its roomlink markers, for the read-only plan viewer

The **only** file this app ever writes per project is its own
`solid-surface-schedule.json` — never `joinery-schedule.json`, never any
other app's file. It also reads/writes the shared
`<ProjectsRoot>/utzline-users.csv` name+PIN identity registry every sibling
UTZLINE app already shares (`APP_CODES` here gained one new entry,
`["SolidSurfaceSchedule", "Solid Surface Schedule"]`, following the same
pattern Machine Schedule already used for its own entry — a purely local
display/admin list, never read or gated on by any other app's own copy of
that file).

Each `solid-surface-schedule.json` record has the identical shape to a
`joinery-schedule.json` record:

```json
{
  "level": "Level 1",
  "room": "Kitchen",
  "joineryId": "K-01",
  "requiredDeliveryDate": "2026-11-02",
  "manufactureLeadTimeDays": 30,
  "manufactureStartDate": "2026-09-22",
  "updatedAt": "2026-09-23T04:12:00.000Z",
  "setBy": "Andrew"
}
```

## What it inherits unchanged from UTZLINE Scheduler

Everything below was carried over from Scheduler v12's own codebase without
behavioral change (only labels/branding differ where noted):

- The Projects-root folder picker/reconnect flow (same convention as
  Projects/Viewer).
- The shared name+PIN identity system (the `<select id="identitySelector">`
  IS the button; choosing a name opens a real on-screen numberpad to verify
  its 4-digit PIN; reads/writes the same `utzline-identity` IndexedDB and
  `utzline-users.csv` registry every sibling app shares).
- The full-width, sortable, filterable Overall Schedule (cross-project) and
  per-project Schedule tables, including the status-history hover/tap
  popup with day-gap markers between entries.
- The read-only pan/zoom/reset plan viewer, including the no-`viewBox`
  `<svg id="planCanvasSvg">` fix Scheduler shipped in its own v12 (this
  fork already starts from that fixed version — see **Tests** below for
  the regression check confirming it's still intact here).
- `computeDelayInfo`'s business-day math and delay-flag logic, including
  the post-delivery Delivered early/late/on-time outcome, unchanged.

## Known, disclosed limitations

- **No public-holiday calendar** — same as Scheduler. Business-day math
  only skips Saturdays/Sundays.
- **Legacy, not-yet-migrated projects** — same plan-viewer caveat as
  Scheduler: a project not yet opened in Site Measure/Projects since the
  flat-structure cutover won't have a `Project Saves/Floor Plans/<Level>.json`
  file yet, so its items still appear in both tables but "View on plan"
  won't find a plan for it until it's opened once elsewhere.
- **Same item-matching caveat as `joinery-status.json`/Scheduler** — two
  items colliding on the exact `(level, room, joineryId)` triple are
  treated as one.
- **`machining-flags.json` display is best-effort** — UTZLINE Machine
  Schedule owns that file's exact shape; this app's own reader
  (`solidSurfaceCutLabel`) accepts either a bare string state or a
  `{state, ...}` object for its `solidSurface` sub-field and falls back to
  a blank cell for anything else, so it degrades gracefully rather than
  breaking if that shape ever changes.

## Accent color

Indigo (`#4f5fe0`) — the one hue not already used by any sibling app (Site
Measure/Viewer are orange-red, Install ITP is green, Manufacture ITP is
purple, Delivery ITP is amber, Projects is crimson, the main Scheduler is
blue/teal, Machine Schedule is teal/cyan). Icon glyph: a beveled Solid
Surface slab with a diagonal sheen highlight and grain veins, plus the same
small "scheduled/on track" checkmark badge Scheduler's own icon used — see
`gen_icons.py`.

## Installation

Same as every other app in this family — it's a standalone PWA, no build
step:

1. Serve this folder over `http(s)://` (or `file://` during local testing —
   the File System Access API needs a secure context in a real deployment).
2. Open `index.html` in an up-to-date Chrome/Edge (or install it as a PWA
   via the browser's install prompt, using `manifest.json`).
3. Choose the **same Projects-root folder** every other UTZLINE app in the
   family already uses. Nothing about those apps' own files changes —
   this app only ever writes its own new `solid-surface-schedule.json`
   file per project.
4. If regenerating icons after editing `gen_icons.py`, run
   `python3 gen_icons.py` (requires Pillow) and bump `ICON_VERSION` in
   `service-worker.js` alongside `CACHE_NAME` so installed copies pick up
   the change.

## Tests

`pdftest-projects/run_solid_surface_schedule_scoping_and_prefill.js`
(Playwright against a fake File System Access API, same convention as the
rest of the family):

- Seeds a fake Projects root with three items in one project — SS-1
  (`hasSolidSurface: true`, an existing main-schedule
  `joinery-schedule.json` record, AND a real job-note PDF on disk under
  `Project Saves/Job Notes/<key>/` with `jobNote: true` on its
  `joinery-status.json` record), SS-2 (`hasSolidSurface: true`, no job
  note), and CARC-1 (`hasSolidSurface: false`).
- Confirms only the two Solid Surface items appear in the Overall table
  (never CARC-1).
- Opens SS-1's Set Schedule dialog and confirms the Required Delivery Date
  field is pre-filled from the main schedule's own date, with the prefill
  note visible.
- Changes the date and saves; confirms `solid-surface-schedule.json` now
  holds its own independent record and the main `joinery-schedule.json`
  is byte-for-byte untouched.
- Reopens the dialog and confirms it now shows this app's own saved value
  (not re-pulled from the main schedule), with the prefill note hidden.
- **"Open job note" (v2, 2026-09-24):** on BOTH the Overall and
  per-project schedule tables, confirms SS-1 (has a job note) shows the
  button as the FIRST row-action, before "View on plan"; SS-2 (no job
  note) shows no button at all; clicking SS-1's button opens the shared
  dialog listing that one PDF by name, and its "Open" action opens a real
  new browser tab at a `blob:` object URL for the file.
- Confirms the plan viewer renders with no `viewBox` regression and its
  image/markers land within the visible stage bounds (the same real-pixel
  check pattern used to catch Scheduler's own v12 bug).

Run via `pdftest-projects/run_all.sh` or directly with
`node run_solid_surface_schedule_scoping_and_prefill.js`.
