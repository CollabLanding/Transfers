# Twilio driver communication setup

The Transfers sender and a separate Twilio reply receiver are deployed and prepared.
No Twilio account secrets, provider selection, number purchase, or live test texts were configured during preparation. Keep the current SMS_PROVIDER setting until the Twilio account is ready.

## 1. Prepare the Twilio account

Choose an SMS-capable Twilio number and complete the applicable number approval:
US local numbers use A2P 10DLC registration; toll-free numbers use toll-free verification.
Trial accounts can message only verified recipients. Check the current account's Twilio Console eligibility before activation.
Use a single dispatch sender initially so replies return to the expected number.
Save each driver's mobile number in their driver profile; shared phone numbers cannot identify a unique driver.

## 2. Store credentials in the Transfers Supabase project

Open the Transfers Supabase project's Edge Function secrets. Add:

```text
TWILIO_ACCOUNT_SID=<your AC... account SID>
TWILIO_AUTH_TOKEN=<your account auth token>
TWILIO_FROM_NUMBER=<your SMS-capable Twilio number in +1... format>
```

For outbound messaging through a Messaging Service, also add:

```text
TWILIO_MESSAGING_SERVICE_SID=<your MG... service SID>
```

The service SID takes precedence over From for outbound sends. Keep TWILIO_FROM_NUMBER set to the actual dispatch number for inbound recipient checks. Use a service containing that single number initially.
Do not put the Auth Token in config.js, GitHub, frontend files, or chat.

When outbound Twilio is ready, explicitly set:

```text
SMS_PROVIDER=twilio
```

This overrides configured Infobip or Dialpad credentials without deleting them.
The send-sms function retains the existing send_sms permission checks.
Open a transfer, choose Text Driver, review the message and recipient, then Send SMS.
A queued response means provider acceptance, not confirmed handset delivery. Delivery callback syncing is not added in this preparation; inspect Twilio Messaging Logs for delivery outcomes.
After a timeout, inspect Twilio logs before retrying to avoid a duplicate send.

## 3. Enable driver replies

Configure the Twilio number's incoming Messaging webhook (or the Messaging Service inbound integration) as HTTP POST:

```text
https://nqdadzlvtmsybcnntkny.supabase.co/functions/v1/receive-twilio-sms
```

Set the exact public URL used by Twilio and then enable the receiver:

```text
TWILIO_INBOUND_WEBHOOK_URL=https://nqdadzlvtmsybcnntkny.supabase.co/functions/v1/receive-twilio-sms
TWILIO_INBOUND_ENABLED=true
```

Changing TWILIO_INBOUND_ENABLED to false disables Twilio reply processing.
This is independent of the Dialpad INBOUND_SMS_ENABLED setting.

The endpoint does not require a Supabase JWT because Twilio cannot supply one.
It verifies X-Twilio-Signature using the official pinned Twilio SDK, checks AccountSid and To, rejects MMS from status processing, and retrieves the original message timestamp from Twilio.
Changing the webhook URL requires updating TWILIO_INBOUND_WEBHOOK_URL to match exactly.
Verified messages pass to a service-only database function. No browser receives a service key.

## 4. Driver status commands

Supported commands: Waiting, Loading, Loaded, In Transit, On Site, Delivered.
To identify a move, use Loaded #123, Loaded Move #123, or #123 Loaded.
The existing started/unfinished load matching rules apply in America/Chicago.
Unknown/shared phone numbers, ambiguous loads, stale messages, completed/deleted loads, and ordinary free text do not change a load.
Duplicate Twilio MessageSids do not apply twice.
Replies update normal Status changed history as Driver name (SMS).
The endpoint returns empty TwiML; it sends no automatic response SMS.
Free-text replies are retained in the private inbound audit, not displayed as a two-way chat inbox.

## 5. First live test

With an approved account/number and a saved driver's phone, use a current unfinished test transfer.
Manually send one assignment, then have that driver reply Loading or Loaded #<move number>.
Check Twilio Messaging Logs, Transfers status, Recent Activity, and Status History.
These steps send real messages; preparation tests used mocks and rollback database transactions only.

Troubleshooting audit:

```sql
select received_at,driver,transfer_id,requested_status,outcome
from sms_private.inbound_messages
where provider='twilio'
order by received_at desc limit 50;
```

Source: supabase/functions/send-sms/index.ts and supabase/functions/receive-twilio-sms/index.ts.
Database: twilio-driver-sms-replies.sql. Regression tests: twilio-sms-reply-tests.sql and check-twilio-receiver.cjs.

Official references:
- https://www.twilio.com/docs/messaging/api/message-resource
- https://www.twilio.com/docs/usage/security
- https://www.twilio.com/docs/messaging/guides/webhook-request
- https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account
- https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/quickstart
- https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding
