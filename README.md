# Transfers

A focused internal freight-transfer scheduling board for 53-foot dry van moves between company buildings.

## What the page does

- Builds transfer loads from a left-side panel using:
  - Scheduled Date
  - Scheduled Time
  - Driver
  - Load Origination
  - Load Destination
  - Pallet Count
  - Job Number
- Displays the selected day as a time grid.
- Shows drivers as columns across the top.
- Renders each transfer as a one-hour scheduling block beginning at its scheduled time.
- Displays the user who built each transfer directly on the load block.
- Lets users click an existing load to edit or delete it.
- Includes an Active User panel using Supabase Realtime Presence.
- Includes Team Chat for signed-in users.
- Supports secure Driver SMS through Twilio + a Supabase Edge Function.
- Has no invoicing, billing, rates, or accounting fields.

## Files

- `index.html` – page structure
- `styles.css` – responsive layout and schedule styling
- `app.js` – transfer scheduling, edit/delete, auth, realtime, active users
- `config.js` – Supabase project URL and anon key
- `schema.sql` – database tables, RLS policies, profiles, realtime setup
- `sms.js` – driver SMS UI, templates, phone lookup, and SMS history
- `migration-v9.sql` – driver phone + SMS history database migration
- `supabase/functions/send-sms/index.ts` – secure Twilio SMS sender
- `SMS-SETUP.md` – one-time Twilio/Supabase setup instructions

## Preview without Supabase

Open `index.html`. If `config.js` is blank, the page automatically runs in **Demo mode** and saves transfers to that browser's `localStorage`.

## Live setup

The repository is already connected to the shared Supabase project used by the internal operations boards. The browser configuration is stored in `config.js` with the project's publishable key.

To finish the database setup, run the complete contents of `schema.sql` once in the Supabase SQL Editor. That creates the `transfers` table, authenticated-user access policies, profile support, and Realtime publication.

GitHub Pages is enabled for this repository and deploys from `main`.

## Notes

- Building 100 and Building 200 are included as typing suggestions, but Origination/Destination remain free-text fields so additional buildings can be used without code changes.
- Driver names are remembered as suggestions after they have been used on a transfer.
- The visible schedule block is currently one hour long because the requested transfer fields include a scheduled time but no duration field. The underlying transfer record does not pretend the move itself takes exactly one hour; this is just its display footprint on the board.


## Pickup and delivery deadlines
Run `migration-v16.sql` in the existing Supabase SQL Editor before deploying this update. It adds four nullable fields and records deadline edits in Recent Activity.

Pickup By and Deliver By each accept an optional hour and/or calendar day. Populated values appear at the bottom of the transfer as PU: and DL:. Clearing fields removes those labels. Duplicating a transfer preserves its deadlines; Duplicate Day shifts deadline days by the same number of calendar days as the schedule, retaining the time and relative day offset. Dragging or resizing a job does not change its deadlines.

### Linking board boxes

Job and time-slot status boxes share the chain control. Drag a chain onto a job or status above or below in the same driver column and day. Dragging any connected box moves the entire group while preserving time gaps and durations. Clicking a box's chain disconnects that box from its direct links. Deleting a box also removes its links. Existing job links are retained by the mixed-board-links migration.
