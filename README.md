# UTZLINE Solid Surface Schedule — installable app

**Current version: v7** (its own independent version line, separate from
every other app in the family — bump this line, and add a dated entry
below, every time a new build ships.)

**v7 (2026-09-26):** Event-sourced this app's OWN `solid-surface-schedule.json`, and gave this app its own IndexedDB database. Andrew was told directly, after the v6 sweep, that the safety-net work made the whole-file read *safe against an unreadable file* but left it exactly as exposed as before to a different hazard: two site managers scheduling different Solid Surface items in the same project at the same moment could still silently clobber each other, last-write-wins, on the next read-modify-write. Asked what's best given that devices already have independent per-device logins (the name+PIN identity system this app already has), the answer was: convert this file to the SAME event-sourced pattern already used elsewhere in this exact codebase for `joinery-status.json` and `machining-flags.json`, and — critically — for this app's own existing read-only port of the MAIN Scheduler's own `joinery-schedule.json` (`foldMainJoinerySchedule`/`migrateLegacyMainJoineryScheduleIfNeeded`/`readMainScheduleRecordForItem`, all already in this file), which was the closest template since it already lived here; the MAIN Scheduler's own write-side implementation of the exact same file shape (a sibling folder, its own `index.html`) was the second template, just for a different owning app.

*Part 1 — `solid-surface-schedule.json` v2: event-sourced storage.* Every Save or Clear is now its own immutable event file (`{kind:"set", level, room, joineryId, requiredDeliveryDate, manufactureLeadTimeDays, manufactureStartDate, by, at}` or `{kind:"clear"}`), named via the same `statusEventFileName`/`statusEventStampFromIso` stamp already used family-wide, filed under **`Project Saves/Solid Surface Schedule/<Level> - <Room> - <Code>/`** — a *different* branch name from the main Scheduler's own `Joinery Schedule` branch in the same project's `Project Saves/` folder, so the two event trees never collide. Folding an item's events takes the single latest one by timestamp: a `"clear"` means no schedule, otherwise that event's own fields are the record — the exact same fold shape (`level, room, joineryId, requiredDeliveryDate, manufactureLeadTimeDays, manufactureStartDate, updatedAt, setBy`) as the read-only port of the main Scheduler's file already in this app, **deliberately**: the main UTZLINE Scheduler does not reference `solid-surface-schedule.json` at all today (confirmed by grep — read access from that app or from UTZLINE Projects is explicitly out of scope for this round), but if a future round wants that, the exact read-only port sitting in this file already is a copy-paste, just re-pointed at "Solid Surface Schedule" instead of "Joinery Schedule". `migrateLegacyJoineryScheduleIfNeeded` reads the old whole-file array **strictly first** (same "unreadable is not empty" ordering as every other legacy migration in this family — a truncated legacy file rejects rather than migrating from nothing) and only then creates the events folder and writes one synthetic `"set"` event per existing record; the old file is left on disk afterward, untouched. `readJoinerySchedule(projectHandle)` keeps returning a plain array (fold the event branch, falling back to the legacy whole-file reader only when the events branch folder itself doesn't exist yet), so the Overall/per-project table reads and the Set Schedule dialog's own-record check needed **zero changes** — only the two write call sites (Save/Clear button handlers) and the reader's own body changed, now calling the new `writeJoineryScheduleEvent(projectHandle, level, room, joineryId, kind, fields, updatedBy)` directly instead of read-whole-list→splice/push→write-whole-list-back. The old `writeJoinerySchedule(projectHandle, list)` whole-array writer is gone (nothing called it directly from a live path any more); `readLegacyJoinerySchedule` remains as the strict legacy reader used only by the migration. One knock-on effect worth naming plainly: the dialog's own-record read is now a **soft** fold (`readFoldedEventBranch`, same as every other reader branch in this app) rather than the old whole-file's strict read — that strictness existed only to protect a read-modify-write that no longer exists, so a mid-sync event file for one item now just makes that one item look one save behind for a moment, instead of blocking the whole table; see the regression suite below for exactly this proven both ways.

*Part 2 — this app's own IndexedDB database.* `DB_NAME` was `"utzline-scheduler-db"` — shared with the main Scheduler on the same origin, inherited verbatim from the v1 fork and never actually split off despite a stale comment above it that claimed otherwise (an ordinary bug, fixed along with the split — the comment now matches the accurate explanation that was already sitting a few lines below it). It's now `"utzline-solid-surface-schedule-db"`, matching the one-database-per-app pattern every other app in the family already uses. Because the persisted Projects-root folder handle lived in that shared database, a straight rename would have made every already-installed copy of this app forget its chosen folder and ask everyone to reconnect once — **avoided**: on first boot after this update, if the new database has no root handle yet, a one-time, read-only, best-effort read of the old `utzline-scheduler-db`'s own `"session"` store (same key) copies the handle across before falling back to the normal "choose your Projects folder" flow; the old database is never written to, deleted, or otherwise disturbed (checked for existence via `indexedDB.databases()` first, specifically so this carry-over attempt can never *bring the old database into existence* on a device that genuinely never had it). This is a convenience only, not a data-safety requirement, and it was straightforward to do safely here, so it's implemented rather than skipped. The `"sss-"` key prefix used throughout this app's own snapshots/caches (`sss-snap…`, `sss-eventFolds…`, `sss-flatLevelNames…`) is no longer load-bearing now that nothing else uses this database — left in place anyway (harmless, less churn than a second rename).

*Tests.* Six existing files exercised end to end, plus substantially expanded coverage of the new behaviour rather than a brand-new file: `run_solid_surface_schedule_scoping_and_prefill.js` (existing, needed one legitimate update — it used to read the raw flat `solid-surface-schedule.json` after a Save; that file is no longer written by a Save at all, so it now reads the folded record instead, same as the live app does); `run_solid_surface_schedule_sweep_idb_single_connection.js` (updated to expect `indexedDB.open` against `utzline-solid-surface-schedule-db` instead of the old shared name, plus a new check that the old shared database is never opened at all when the carry-over's existence check correctly finds nothing to carry over); `run_solid_surface_schedule_sweep_unreadable_not_empty.js` (its own section 1 rewritten for the new storage — the old "Save refuses to write while the file is unreadable" scenario no longer applies, since a Save no longer reads this file at all, so this now proves, on real fake-fs projects: a truncated legacy `solid-surface-schedule.json` migration REJECTS rather than migrating from nothing, exactly like every other legacy migration in this family; a *valid* legacy array migrates losslessly into its own events branch, one synthetic `"set"` event per record, the old file left byte-for-byte untouched; saving a new item never touches another item's own event file at all; **two concurrent Saves on different items, fired together so neither ever reads the other's write first, each independently survive** — the exact race the old whole-file read-modify-write was vulnerable to; and a brand-new incoming event file that isn't readable yet is a soft fold — that one item quietly keeps its previous valid record for a moment, the rest of the table is never blocked, and the new value takes over cleanly once it reads). `run_solid_surface_schedule_sweep_back_button.js`, `run_solid_surface_schedule_sweep_hide_tickboxes.js`, and `run_solid_surface_schedule_sweep_instant_paint_cache.js` needed no behavioural changes and pass unchanged (one stale comment fixed in the last one). Full Solid Surface Schedule suite: **6/6** (same six files as v6, each carrying materially more coverage of the new storage than before). `service-worker.js` cache bumped to `utzline-solid-surface-schedule-cache-v7`.

**v6 (2026-09-25):** Family-wide scheduling sweep — Andrew, verbatim: *"ok, now a full sweep of all the scheduling software"*, said straight after the Site Measure v46 and Install ITP v35 rounds. Same four family fixes applied here where they apply, the same classes of bug audited, the tablet made faster, and ordinary bugs found along the way fixed. Same shape as UTZLINE Scheduler v19 (this app's parent — it was forked from Scheduler v12) and Machine Schedule v9, adapted to this fork's own particulars: its own `solid-surface-schedule.json` was still a single whole-file array at the time (deliberately not changed in a sweep — see *deliberately left alone*; **event-sourced in v7 above**), it reads two more branches (the main Scheduler's schedule, Machine Schedule's cut flags) and performs three legacy migrations, and it shared the `utzline-scheduler-db` IndexedDB database with the main Scheduler on the same origin at the time (**its own database as of v7 above**). Nothing about any file format or filename another app reads or writes changes.

*Family fixes.* (1) **IndexedDB connection leak** — `idbOpen`/`identityDbOpen` opened a new connection per call and never closed it (the cause of "slows down after a little use" across the family); now one memoised connection per database (`idbConnP`/`identityConnP`), reopened only after the browser closes it (`versionchange`/`close`). Because `DB_NAME` is `utzline-scheduler-db` (inherited verbatim from the fork, so this app and the main Scheduler share one database and one persisted Projects-root handle — left as is, both using the same root is the intended setup), every key this round adds is prefixed `sss-` (`sss-snap…`, `sss-eventFolds…`, `sss-flatLevelNames…`) so this app can never paint the main Scheduler's unscoped snapshot rows, or vice versa; the new IDB test checks the prefix on every key written. (2) **Device / phone Back button walks back through the app** — setup / reconnect / Home `replaceState` (Back from there leaves the app as before), Overall Solid Surface Schedule / project schedule / the plan canvas `pushState`; a popstate first closes whatever is open — the Set Schedule dialog (through Cancel, so nothing is written), the Job notes dialog, the name prompt, the numberpad, the "Show me in" list, the status-history popover — otherwise steps back exactly one screen through the app's existing navigation (plan → the table it came from; either table → Home); a step that doesn't change the screen puts the entry back so the next press asks again. (3) **"Unreadable is not empty"** — every read audited. The most important case in this app: `readJoinerySchedule` (this app's own `solid-surface-schedule.json`, read whole, modified, rewritten whole on every Save and Clear) collapsed *any* failure to `[]` — so a file that was mid-Dropbox-sync for a moment read as "no schedules in this project" and the very next Save rewrote it holding **only** the record just saved; every other Solid Surface schedule in the project gone, silently. Also: `readUsersCsv` (so "Add a new name" on a `utzline-users.csv` that was mid-sync would have rewritten the registry with only the new name); and all three legacy migrations — `migrateLegacyJoineryStatusIfNeeded`, `migrateLegacyMainJoineryScheduleIfNeeded` (the **main Scheduler's** file, which this app migrates when it is the first to open a project) and `migrateLegacyMachiningFlagsIfNeeded` (Machine Schedule's) — which created the events folder *first* and only then read the legacy file, so a legacy file mid-sync became an *empty* events folder that every app then trusts forever. All now distinguish NotFoundError (genuinely absent → fresh is fine) from any other failure (→ one retry after 600 ms → reject with `code:"read_failed"`, surface it, write nothing): Save/Clear refuse and keep the dialog open with the reason ("nothing was changed"); the dialog won't even open on an unreadable schedule file; the add-name flow says "nothing was changed"; a PIN check that couldn't read the file says so rather than "Incorrect PIN"; the migrations read the legacy file strictly *before* creating anything. Also strict: `readJoineryItems` (a table now says "couldn't read" instead of "No joinery items in this project yet."), the level-file readers (the plan says "couldn't read, try again" instead of "No saved plan found"), and a new per-item `readMainScheduleRecordForItem` for the dialog's one-time main-schedule prefill — a soft fold there could silently offer the *previous* main-schedule date when the newest event file was mid-sync, and a Save would freeze it into this app's independent record; since the main schedule is only a convenience starting point, a failed prefill read opens the dialog empty and says why, rather than blocking it. Pure-display folds (the tables' status / cut events) deliberately stay soft, and say so in a comment; the "SS cut (Machine Sched.)" column keeps its documented best-effort "—". (4) **Speed / "icon caching like we just did"** — the rule proven on Andrew's tablet: on Android + Dropbox every File System Access call costs hundreds of ms and a named lookup scans its folder. Measured against a seeded 40-item project (two projects for the Overall table) with a call counter, v5 → v6: opening a project **266 → 71** directory/lookup calls on first open and **266 → 65** calls / **105 → 5** file reads / **1.7 MB → 8 KB** read on every later open; a Save **268 → 2** calls and **106 → 1** reads (it used to re-read the whole project after every Save — from the Overall Schedule's plan, *every* project); opening the Overall table **504 → 132** calls, and its Refresh **504 → 128** calls / **204 → 4** reads. How: a per-session directory-handle cache (`getCachedDir`/`projectDir`/`getProjectHandleByName`, cleared on a root change, dropped on failure); memoised migration checks; per-item event folders read from the handles the listing already returns (no named lookup per item); a folded-event cache in this app's IndexedDB keyed on each item's immutable event filenames (only an item with a new file is actually read); projects read in parallel (`Promise.all`) instead of a sequential `reduce` chain; Site Measure v46's `listFlatLevelNames` stat cache (level files — each carrying a multi-MB base64 plan — are stat'ed in parallel and only re-parsed when size/lastModified changed); the dialog prefills from the item's own main-schedule folder instead of folding the whole project; **instant paint** — Home, the Overall table and each project schedule paint their last-known rows from a device-local snapshot at once (with a "Showing last-known schedule — refreshing from the folder…" note), refresh from the folder behind it and repaint, rows stored without their directory handle and getting it back lazily on first use, the Delay pill recomputed against *today* on paint so a stale snapshot never shows yesterday's "On track"; **in-place row patching** after a Save/Clear (the record just written is what a re-read would give); `joinery-items.json` read once per plan open instead of once per marker tap; the plan's pan/pinch transform coalesced to one DOM write per animation frame; the search boxes debounced (100 ms). A project that can't be read keeps its last-known rows on the Overall table and is *named* in a toast rather than silently vanishing. (5) **Android UI robustness** — `[hidden]{display:none !important}` (see the bug below); `touch-action: manipulation` on buttons, list rows, headers and inputs; `pan-x pan-y` on the table scrollers so a tap on a row button doesn't fight the pan; `user-select:none`/`-webkit-touch-callout:none` on the plan screen plus a document-level `contextmenu` swallow while it's open, so a long press never selects the title or pops the image sheet. Andrew's standing rule ("only show view shop drawing or view job notes button if there is one applied") was already met — the "Open job note" button is gated on the shared status record's `jobNote` flag, and this app has no shop-drawing button; no Timings/debug UI exists here.

*Filter tick boxes (addendum, 2026-09-26, same v6 build).* Andrew, verbatim, mid-sweep: *"add in tick boxes for filtering out installed and delivered items. Also machining filter out machined with a tickbox"* (the machined one belongs to Machine Schedule). Both tables — the Overall Solid Surface Schedule and the per-project Schedule — get **"Hide delivered"** and **"Hide installed"** tick boxes in their filters bar, next to the search box. Both apply here: this app's rows carry the *shared* status pipeline, and a Solid Surface item reaches `delivered` (Delivery ITP) and `installed` (Install ITP) like any other — the Delay column's own Delivered early/late/on-time outcome depends on it. Ticked = rows whose current folded status is exactly that stage are left out (installed outranks delivered in the pipeline, so each box hides only its own stage; both ticked hides both). Default unticked; remembered per device in `localStorage`, one key per app+table+box (`utzline-solid-surface-schedule:overall:hideDelivered`, `…:overall:hideInstalled`, `…:project:hideDelivered`, `…:project:hideInstalled` — this app's own prefix, so the main Scheduler's boxes on the same origin are independent), every access wrapped so a browser that refuses storage just starts unticked. Filtering happens on the rows already in memory — never a re-read from the folder — and the search box and other dropdowns still apply on top. A new count line under each filter bar follows what's visible ("5 items" / "Showing 3 of 5 items"). Covered by `run_solid_surface_schedule_sweep_hide_tickboxes.js`.

*Ordinary bugs found and fixed.* **`hidden` did nothing on two controls:** the browser's default `[hidden]{display:none}` is outranked by any author display rule, so `schedClearBtn.hidden = true` on a `.btn{display:inline-flex}` and `levelPlanRow.hidden = true` on a `.card.row{display:flex}` never hid anything — the "Clear schedule" button showed for items with no record yet (a tap on it would have rewritten the schedule file to remove a record that wasn't there), and the "Open a level's plan" row showed (with an empty select) for a project with no plan; confirmed in headless Chromium against the v5 build (computed display stayed `inline-flex`/`flex`), fixed with one rule. **Stale rows after navigation:** opening a project left the *previous* project's rows and plan levels on screen until the new reads finished — on a slow tablet you could tap "Edit schedule" on a row belonging to the project you'd just left; the table is now cleared (or painted from this project's own snapshot) at once, and a superseded load (Refresh pressed again, or a different project opened before the last read finished) is dropped rather than repainting over the newer one. **Unhandled rejections:** the Reconnect button's `requestPermission`, a marker tap whose `joinery-items.json` read failed, and a row action whose dialog read or folder lookup failed all rejected silently — each now reports. **Popover left behind:** re-sorting/filtering a table while the status-history popover was open rebuilt the cell it was anchored to and left it floating; it's now hidden on every render. **Per-project failures swallowed:** the Overall table dropped a project that couldn't be read as if it had no Solid Surface items; it now keeps that project's last-known rows and names it in a toast. **Project filter reset on Refresh:** the Overall table's project dropdown was rebuilt with `innerHTML` on every load, so Refresh silently jumped back to "All projects"; the selection is now kept. **Missing Refresh:** the project schedule had no Refresh button (the Overall table did); added. **Double tap could rewrite twice:** Save/Clear are disabled while their whole-file write is in flight. **Text that lied:** the setup screen claimed "the only thing it ever writes is its own new solid-surface-schedule.json" — it has also written the shared name+PIN registry since v1 and performed the family's legacy migrations since v3/v4/v5; and a comment in `pickProjectsRootFolder` still named the main Scheduler's `joinery-schedule.json` as this app's own write (a fork leftover).

*Deliberately left alone.* ~~**`solid-surface-schedule.json` stays a single whole-file array**~~ -- **superseded in v7 below**: this file is now event-sourced, exactly like the main Scheduler's own schedule (its v15) and this file's own read-only port here, closing the exact concurrency exposure this bullet used to describe (see v7 for the details and why). Back on the Home screen itself (the base) is not intercepted, so a dialog opened from Home — the identity selector's name prompt / numberpad — is closed by the app's own Cancel, not by the phone's Back: there is no app-owned history entry under Home to pop; this matches every reference app exactly. The migrations' per-event *write* failures are still swallowed individually (a partially-migrated events folder would then be trusted) — that's the family-wide migration contract ported byte-for-byte from `source.html`, and changing it belongs to a shared decision; reported instead. ~~`DB_NAME` sharing with the main Scheduler (above) is left as is~~ -- **superseded in v7 below**: this app now has its own database. Hover-to-open on the status-history popover stays alongside tap-to-toggle (the popover is not hover-*dependent*). `detectFolderShape` still probes up to three names per project folder when a root is first picked (once per folder choice, not per screen). The first-ever open of the Set Schedule dialog in a project still costs the one-off main-schedule migration check (a few calls, once per project per session).

Five new regression tests in `pdftest-projects/`: `run_solid_surface_schedule_sweep_back_button.js` (the history walk through every screen and the dialog/popover/numberpad-closes-first rule, using Playwright's real `goBack()`, including a Back on the Set Schedule dialog writing nothing), `run_solid_surface_schedule_sweep_idb_single_connection.js` (`indexedDB.open` wrapped and counted across a whole session of sign-in, screens, a Save, a Clear, a plan open and refreshes — exactly one open per database, and every key written under the `sss-` prefix), `run_solid_surface_schedule_sweep_unreadable_not_empty.js` (a Save on an unreadable `solid-surface-schedule.json` refusing to write and leaving the other records byte-for-byte intact, then going through once it reads; the registry add/PIN paths; all three legacy migrations creating nothing on a truncated legacy file and migrating on Refresh once it reads; the strict per-item main-schedule prefill never offering a superseded date), `run_solid_surface_schedule_sweep_instant_paint_cache.js` (snapshots saved from live reads; a Save and a Clear updating the row in place with 2 folder calls each; the two `hidden` bugs; the level-name stat cache on a second visit; then a reload with every project-level read made to hang — Home, Overall and the project schedule all still paint their last-known rows with the refreshing note, the Delay pill recomputed) and `run_solid_surface_schedule_sweep_hide_tickboxes.js` (above). The existing `run_solid_surface_schedule_scoping_and_prefill.js` needed no changes and passes unchanged. Full Solid Surface Schedule suite 6/6 (1 existing + 5 new). `service-worker.js` cache bumped to `utzline-solid-surface-schedule-cache-v6`. Does not touch source.html, any ITP app, UTZLINE Scheduler, UTZLINE Machine Schedule, or UTZLINE Projects in any way.

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
other app's file (the one-time legacy→event-folder migrations of
`joinery-status.json`, `joinery-schedule.json` and `machining-flags.json`,
which this app performs only when it happens to be the first app to open a
project, are the family-wide contract, not a write of content — and since
v6 they read the legacy file strictly *before* creating any folder). It
also reads/writes the shared
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

**Sweep tests (v6, 2026-09-25/26)** — five more files in the same
directory, same harness, all named `run_solid_surface_schedule_sweep_*.js`
(NOT `run_solid_surface_flag.js`, which targets UTZLINE Projects):

- `run_solid_surface_schedule_sweep_back_button.js` — the device/browser
  Back button walk and the dialog-closes-first rule.
- `run_solid_surface_schedule_sweep_idb_single_connection.js` — one
  `indexedDB.open` per database across a whole session; every key this app
  writes to the Scheduler-shared database is `sss-` prefixed.
- `run_solid_surface_schedule_sweep_unreadable_not_empty.js` — an
  unreadable `solid-surface-schedule.json` never gets rewritten from an
  empty read; the registry, the three legacy migrations and the strict
  main-schedule prefill.
- `run_solid_surface_schedule_sweep_instant_paint_cache.js` — snapshots,
  in-place Save/Clear with 2 folder calls, the two `hidden` bugs, the
  level-name stat cache, and a reload with a hanging folder still painting.
- `run_solid_surface_schedule_sweep_hide_tickboxes.js` — the "Hide
  delivered" / "Hide installed" tick boxes on both tables, remembered
  across a reload.
