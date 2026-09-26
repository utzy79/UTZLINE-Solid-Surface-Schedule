// UTZLINE Solid Surface Schedule offline service worker.
//
// This is a NEW, SEPARATE, standalone app in the UTZLINE family, FORKED
// from UTZLINE Scheduler's own codebase (v12, the day its plan viewer's
// stray SVG viewBox bug was fixed -- see that app's own service-worker.js
// history for the full story; the fix is carried over unchanged here,
// #planCanvasSvg has no viewBox, same as every ITP app).
//
// Requested directly by Andrew (2026-09-23), verbatim: "we will also add a
// Solid Surface schedule that is a separate app. so when putting on the
// joinery item we can have a tick box for has Solid Surface. this then
// puts it on its own schedule. this schedule pulls its site delivery date
// from the main schedule, but could be independant if required (might
// need to go to site later)."
//
// Confirmed follow-up decision (same day): this app is a FULL clone of
// Scheduler's own screens/logic -- its own manufacture lead-time field,
// its own computed manufacture-start-date/delay-flag logic, fully
// independent of the main Scheduler's own dates once its own record
// exists. "Pulls from the main schedule" means ONLY a one-time,
// convenience prefill: opening the Set Schedule dialog for an item with NO
// solid-surface-schedule.json record of its own yet reads that item's
// record (if any) from the MAIN Scheduler's own joinery-schedule.json
// (read-only) and pre-fills ONLY the Required Delivery Date field from it
// -- the Manufacture Lead Time field stays at THIS app's own
// DEFAULT_LEAD_TIME_DAYS (30), never pulled across, since Solid Surface
// lead times may genuinely differ from carcase/joinery lead times. The
// moment a record is saved here, it is fully independent forever after --
// reopening the dialog always shows this app's own saved values, never
// re-consulting the main schedule again even if its own date later
// changes.
//
// SCOPE: every table (Overall + per-project) and every actionable plan
// marker in this app is filtered to joinery-items.json records with
// hasSolidSurface === true only (that field is owned/written exclusively
// by UTZLINE Projects; this app only ever reads it). An item without that
// flag never appears in a table at all; on the plan viewer its marker is
// still drawn (muted) for navigation context, but tapping/right-clicking/
// long-pressing it shows a "not flagged for Solid Surface" reminder toast
// instead of opening this app's Set Schedule dialog.
//
// Sits alongside UTZLINE Site Measure, Viewer, Install ITP, Manufacture
// ITP, Delivery ITP, Projects, Scheduler, and Machine Schedule -- its own
// manifest, own icon (indigo, #4f5fe0/#2e3894 -- the one accent hue not
// already used by a sibling: Site Measure/Viewer orange-red, Install ITP
// green, Manufacture ITP purple, Delivery ITP amber, Projects crimson,
// Scheduler blue, Machine Schedule teal/cyan), own taskbar/Start-menu
// entry, own cache namespace ("utzline-solid-surface-schedule-cache-*").
// Like every sibling built this way, it is NOT built from source.html --
// it's its own small, purpose-built codebase (here, a fork of Scheduler's
// own, re-scoped and relabeled rather than written from scratch).
//
// WHAT IT READS (the SAME Projects-root folder every other app in the
// family uses), strictly READ-ONLY:
//   <Project>/joinery-items.json       -- {joineryId, level, room, status,
//     hasSolidSurface, ...} records (hasSolidSurface added 2026-09-23 by
//     UTZLINE Projects; this app filters every table/plan-marker to
//     hasSolidSurface===true only)
//   <Project>/joinery-status.json      -- the shared, forward-only status
//     pipeline (used exactly like every other reader app in the family,
//     including the status-history hover popup and post-delivery
//     delay-outcome logic ported verbatim from Scheduler)
//   <Project>/joinery-schedule.json    -- the MAIN Scheduler's own file,
//     read-only, ONLY for the one-time Required Delivery Date prefill
//     described above -- never written here
//   <Project>/machining-flags.json     -- Machine Schedule's own per-item
//     cut-tracking file, read-only, purely to show that item's Solid
//     Surface cut state as an extra reference column -- optional/
//     best-effort, never written here
//   <Project>/Project Saves/Floor Plans/<Level>.json (with the same
//     legacy per-Level-folder fallback Scheduler already has) -- a
//     level's floor plan image and its roomlink markers, for the
//     read-only plan viewer
//
// WHAT IT WRITES: exactly ONE branch of its own -- "solid-surface-
// schedule.json" (a sibling of, and never the same file as, the main
// Scheduler's own joinery-schedule.json). As of v7 (2026-09-26) this is
// event-sourced: one immutable event file per Save/Clear under
// "Project Saves/Solid Surface Schedule/<Level> - <Room> - <Code>/",
// folded to the single latest event by timestamp -- { kind: "set"|"clear",
// level, room, joineryId, requiredDeliveryDate, manufactureLeadTimeDays
// (this app's own default 30), manufactureStartDate (computed, same
// business-day math as Scheduler), by, at }. The old whole-file array is
// migrated in automatically, once, losslessly, the first time this app
// opens a project after v7, and left on disk afterward, untouched -- plus
// the same shared <ProjectsRoot>/utzline-users.csv name+PIN identity
// registry every sibling UTZLINE app reads and writes (APP_CODES here
// gained one new entry, ["SolidSurfaceSchedule", "Solid Surface Schedule"],
// following the same pattern Machine Schedule already used for its own
// entry -- purely a local display/admin list, never read by any other
// app's own copy of that file).
//
// Same cache-first app shell strategy as every other app in the family: a
// small, fixed set of local files, no CDN calls once installed. Bump
// CACHE_NAME whenever index.html or any vendored asset changes, so
// installed copies pick up the update instead of serving stale files
// forever.
//
// (v1, 2026-09-23: first release -- the fork described above. Everything
// inherited unchanged from Scheduler v12 (Projects-root folder picker/
// reconnect, the shared name+PIN identity system, the full-width sortable/
// filterable Overall + per-project tables, the pan/zoom/reset plan viewer
// with its already-fixed no-viewBox SVG, the status-history hover popup,
// computeDelayInfo's business-day math and post-delivery early/late/
// on-time outcome logic) is re-scoped to Solid Surface items only
// (filterSolidSurfaceItems) and re-pointed at this app's own
// solid-surface-schedule.json (never joinery-schedule.json, which is now
// read-only here via readMainJoinerySchedule for the one-time prefill).
// Every user-facing label that could be confused with the main Scheduler
// if the two are open side by side -- the header brand, screen titles, the
// Set Schedule modal's own title/field labels/computed-start label, the
// "Solid Surface delivery"/"SS manufacture start"/"SS lead time" table
// columns -- was reworded for clarity. Also added, as the disclosed
// nice-to-have from Andrew's original spec's own optional extra: a
// read-only "SS cut (Machine Sched.)" reference column in both tables,
// sourced from Machine Schedule's own machining-flags.json (defensive
// best-effort parsing -- an unreadable file or unexpected shape just shows
// an em-dash, never breaks the table). Does NOT touch source.html, Install
// ITP, Manufacture ITP, Delivery ITP, Projects, the main Scheduler, or
// Machine Schedule in any way -- this app owns solid-surface-schedule.json
// exclusively and reads everything else strictly read-only.)
//
// (v2, 2026-09-24: added an "Open job note" button to the row-actions
// column of both the Overall and per-project schedule tables, per Andrew's
// verbatim request across the whole "any scheduler" family: "on any
// scheduler, there needs to be a open job note button for each joinery
// item. between delay and view on plan." Placed as the FIRST button in
// that column -- before the existing "View on plan"/"Edit schedule"
// buttons, matching "between delay and view on plan" since Delay is the
// previous column and row-actions is the very next one.
//
// A "job note" in this ecosystem is exclusively a PDF attachment (site
// instructions, a delivery docket, etc) -- there is no text body, and this
// app never writes one, only reads: content lives in a per-item folder,
// <Project>/Project Saves/Job Notes/<key>/, where key is
// joineryItemPageKey(level, room, joineryId) -- exactly mirroring every
// other reader app in the family (Install ITP, UTZLINE Projects). Every
// PDF ever added stays there forever (oldest never deleted); listJobNotes
// lists them newest-first via jobNoteSortKey, which finds the
// "yyyy-mm-dd hh-mm-ss" stamp whether it's a filename PREFIX (older files)
// or SUFFIX (current format, per Andrew's 2026-09-23 "dont want job notes
// to have this format at the start" request), so both shapes sort
// correctly. The button itself is gated on that row's own
// joinery-status.json record already carrying jobNote:true/jobNoteAt/
// jobNoteBy (set by Site Measure or the Viewer when a note is added, read
// via the SAME findJoineryStatus call buildEnrichedRows already makes --
// no new file read needed for the flag itself) -- an item with no job note
// gets no button at all, never a dead-end "no notes yet" dialog. Clicking
// it opens a shared dialog (one instance, reused by every row on both
// table screens) listing each PDF with an "Open" action that reads the
// real file handle, creates an object URL, and opens it in a new tab,
// revoking the URL after 60s. Scoped correctly within this app's own
// hasSolidSurface:true filtering -- the flag/button/dialog logic reads off
// the already-filtered row objects, so an out-of-scope item never gets a
// button regardless of its own jobNote flag. Companion apps UTZLINE
// Scheduler and UTZLINE Machine Schedule are getting the identical feature
// in parallel, each in their own codebase -- this app's own copy touches
// nothing outside this file and index.html.)
//
// (v3/v4/v5, 2026-09-24: joinery-status.json / machining-flags.json /
// joinery-schedule.json v2 -- each read path now folds one-immutable-event-
// file-per-change folders under "Project Saves/" instead of a shared
// mutable array file, with a one-time lossless migration; see README.)
//
// (v6, 2026-09-25/26: family-wide scheduling sweep -- Andrew: "ok, now a
// full sweep of all the scheduling software", then mid-sweep "add in tick
// boxes for filtering out installed and delivered items". One memoised
// IndexedDB connection per database; the device/phone Back button walks
// back through the app and closes any open dialog first; "unreadable is
// not empty" -- every read that feeds a write is strict, above all this
// app's own whole-file solid-surface-schedule.json read-modify-write on
// Save/Clear, the shared utzline-users.csv, and the three legacy
// migrations (legacy file read BEFORE any events folder is created);
// speed -- directory-handle cache, folded-event cache, level-name stat
// cache, parallel project reads, instant paint from last-known snapshots,
// in-place row patching after Save/Clear; Android touch/selection
// robustness; "Hide delivered"/"Hide installed" tick boxes on both tables;
// ordinary bugs fixed (two `hidden` toggles that never hid anything, stale
// rows after navigation, unhandled rejections, a floating popover, a lost
// project filter on Refresh, text that lied). See README v6.)
//
// (v7, 2026-09-26: this app's OWN solid-surface-schedule.json is now
// event-sourced -- one immutable event file per Save/Clear under
// "Project Saves/Solid Surface Schedule/<Level> - <Room> - <Code>/",
// folded to the single latest event by timestamp, with a one-time
// automatic lossless migration from the old whole-file array -- so two
// site managers scheduling different Solid Surface items in the same
// project at the same moment can no longer clobber each other. This app
// also got its own IndexedDB database ("utzline-solid-surface-schedule-db",
// split off from the shared "utzline-scheduler-db"), with a best-effort
// one-time carry-over of the persisted Projects-root folder handle from
// the old shared database so installed copies don't have to reconnect.
// See README v7. v8, 2026-09-26: Completed/Delivered PIN-locked buttons +
// new event-sourced "Solid Surface Completion" file, column reorder + two
// new columns, "Open item" button + scoped Joinery Item page, frozen
// identifying columns, status icon swap, new "Delivery due soon" delay
// pill, and the plan-canvas tap/long-press behaviour change -- see README v8.)
var ICON_VERSION = "v1";
var CACHE_NAME = "utzline-solid-surface-schedule-cache-v8";

var PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json?v=" + ICON_VERSION,
  "./icons/icon-192.png?v=" + ICON_VERSION,
  "./icons/icon-512.png?v=" + ICON_VERSION,
  "./icons/icon-192-maskable.png?v=" + ICON_VERSION,
  "./icons/icon-512-maskable.png?v=" + ICON_VERSION
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(PRECACHE_URLS);
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
             .map(function(n){ return caches.delete(n); })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function(event){
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function(cached){
      var networkFetch = fetch(event.request).then(function(response){
        if (response && response.status === 200){
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return response;
      }).catch(function(){
        return cached;
      });
      // Cache-first for instant offline loads; refresh the cache in the
      // background whenever the network is available.
      return cached || networkFetch;
    })
  );
});
