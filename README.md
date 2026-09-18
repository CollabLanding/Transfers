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
- Has no invoicing, billing, rates, or accounting fields.

## Files

- `index.html` – page structure
- `styles.css` – responsive layout and schedule styling
- `app.js` – transfer scheduling, edit/delete, auth, realtime, active users
- `config.js` – Supabase project URL and anon key
- `schema.sql` – database tables, RLS policies, profiles, realtime setup

## Preview without Supabase

Open `index.html`. If `config.js` is blank, the page automatically runs in **Demo mode** and saves transfers to that browser's `localStorage`.

## Connect Supabase

1. Create or choose the Supabase project you want this repository to use.
2. Run `schema.sql` in the Supabase SQL editor.
3. In Supabase Authentication, create the user accounts that should access Transfers.
4. Put the project URL and anon/public key into `config.js`:

```js
window.TRANSFERS_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY"
};
```

5. Commit the files to a GitHub repository and enable GitHub Pages for the repository root.

## Notes

- Building 100 and Building 200 are included as typing suggestions, but Origination/Destination remain free-text fields so additional buildings can be used without code changes.
- Driver names are remembered as suggestions after they have been used on a transfer.
- The visible schedule block is currently one hour long because the requested transfer fields include a scheduled time but no duration field. The underlying transfer record does not pretend the move itself takes exactly one hour; this is just its display footprint on the board.
