# Driver SMS Setup

The Transfers page now includes a **Text Driver** workflow backed by a Supabase Edge Function and Twilio.

## What is already in the app

- Text Driver button when a transfer is opened for editing
- Driver phone number storage
- Assignment / Update / Delay templates
- Editable SMS body up to 1,600 characters
- Recent SMS history per transfer
- SMS events in Recent Activity
- Secure server-side Twilio credentials (never placed in browser JavaScript)

## One-time setup

### 1. Run the database migration

In the **Transfers** Supabase project, open **SQL Editor** and run the contents of:

`migration-v9.sql`

This adds:
- `phone_number` to `transfer_drivers`
- `transfer_sms_log` for message history

### 2. Prepare Twilio

You need:
- Twilio Account SID
- Twilio Auth Token
- A Twilio SMS-capable sender

For production U.S. SMS from a normal local 10-digit number, complete Twilio's A2P 10DLC registration and associate the number with the approved Messaging Service.

For initial testing on a Twilio trial account, Twilio requires the destination number to be verified first.

### 3. Add Twilio secrets to Supabase

In the **Transfers** Supabase project:

**Edge Functions → Secrets**

Add:

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
```

Then use **one** of these sender options.

Recommended for a registered A2P Messaging Service:

```
TWILIO_MESSAGING_SERVICE_SID=MG...
```

Or, for a specific Twilio sending number:

```
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
```

Do not put these values in `config.js`, `index.html`, GitHub, or any other browser-visible file.

### 4. Deploy the Supabase Edge Function

The function source is:

`supabase/functions/send-sms/index.ts`

#### Dashboard method

1. Open the **Transfers** project in Supabase.
2. Open **Edge Functions**.
3. Choose **Deploy a new function → Via Editor**.
4. Name it exactly: `send-sms`
5. Replace the editor contents with `supabase/functions/send-sms/index.ts`.
6. Deploy the function.

#### CLI method

From a local copy of this repository:

```bash
supabase login
supabase link --project-ref nqdadzlvtmsybcnntkny
supabase functions deploy send-sms
```

The app calls the function by name, so there is no additional URL configuration required.

## Testing

1. Sign in to Transfers.
2. Open an existing transfer.
3. Click **Text Driver**.
4. Enter the driver's phone number.
5. Choose Assignment, Update, or Delay.
6. Edit the message if needed.
7. Click **Send SMS**.

After a successful send:
- the driver number is saved for future texts,
- the SMS appears in the transfer's SMS history,
- Recent Activity receives an **SMS sent** entry.

## Notes

Twilio can split longer texts into multiple SMS segments, which can affect cost. Keep operational messages concise when practical.

Only send operational texts to drivers who have agreed to receive them. Production U.S. application-to-person SMS must follow carrier/Twilio registration and consent requirements.
