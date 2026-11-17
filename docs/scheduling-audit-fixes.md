# Scheduling audit fixes

The six fixes are separate commits on `fix/scheduling-audit-1-6`.

1. Board moves reconcile the open editor's driver/date/time/duration and preserve other drafts. Live edits submit changed fields only.
2. Switching job/status editors honors canceled discard decisions and blocks transitions during a pending save. Day navigation retains its existing cancel-edit behavior.
3. Job dragging compensates for visual stacking instead of treating the displaced card as a new scheduled time.
4. Resize classifies every member of the connected component. Boxes starting before the anchor follow the top edge; same-start and later boxes follow the bottom edge.
5. Board/status/link refreshes wait during captured gestures. Escape, blur, lost capture, and navigation cancel previews; failed resizes preserve the original draft baseline.
6. History processes every transition through delivery, reopening, and replanning. Boundary events remain editable markers, and the current label uses the saved status. Stale history responses cannot replace a newly selected job.

## Deployment

Before deploying the frontend, run the updated **complete `linked-resize.sql`** against the existing database, which must already have the mixed-board-links, permissions, and edit-conflict setup. This replaces the resize function without changing tables. It is kept as a manual SQL upgrade, following this repository's existing deployment pattern.

The database upgrade and the GitHub Pages deployment have not been performed by preparing this branch. GitHub Pages deploys from `main`; merging changes to `main` publishes the frontend.

## Verification

- `node check-scheduling-regressions.cjs`: focused draft, drag geometry, linked tie, interruption, and reopened-history checks.
- `node check-linked-resize.cjs`: existing linked resize preview, bounds, grow/shrink checks.
- `node check-linked-resize-db.cjs`: isolated PostgreSQL fixture using `@electric-sql/pglite` on `NODE_PATH`. Runs the production link/resize functions and rollback-only SQL regression cases, including same-start ties. Synthetic auth and table fixtures do not validate the production database's policies or deployment state.
- `node check-scheduling-browser.cjs`: offline Playwright smoke test using installed Chromium (`CHROMIUM_PATH` override supported). Real browser execution remains pending in environments where Chromium cannot start.

No production data is required or changed by these checks.
