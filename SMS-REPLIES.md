# Driver status replies — prepared Dialpad receiver

The `receive-driver-sms` Edge Function is deployed but remains inactive until
`INBOUND_SMS_ENABLED=true` and the webhook secrets below are configured.
Outgoing SMS is unchanged. No webhook subscription is created automatically.

## Driver replies

Accepted whole-message commands (case insensitive): **Waiting, Loading, Loaded,
In Transit, On Site, Delivered**. `in-transit`, `intransit`, `on-site`, and `onsite`
are aliases. A trailing period or exclamation mark is accepted. Free text such as
"not loaded yet", questions, Planned, Deleted, MMS and outbound events do not
change a load.

Use the saved driver phone number from the driver's profile. It must uniquely
identify one driver. The receiver updates one unfinished, started load on the
SMS's date in **America/Chicago**. Waiting/Loading/Loaded/In Transit/On Site loads
remain candidates after their planned duration. Planned loads qualify only
inside their scheduled time window. If more than one load qualifies, no load
changes. The driver can specify **`Loaded #123`**, **`Loaded Move #123`**, or
**`#123 Loaded`** to identify a started, unfinished load for that date.

The update flows through the normal transfer table and Status changed activity
entry, so the board and status timeline update normally. The activity author is
`Driver name (SMS)`. Duplicate provider message IDs never apply twice. Messages
older than 24 hours, future-dated by over five minutes, or older than the load's
latest edit are recorded without changing the load. Deleted/completed loads are
never restored or changed by a reply.

## Activate when the receiving Dialpad number is ready

1. Ensure each driver's profile has their current mobile phone number.
2. In the Transfers Supabase project, add Edge Function secrets:

   ```text
   DIALPAD_WEBHOOK_SECRET=<a fresh random secret of at least 32 characters>
   DIALPAD_FROM_NUMBER=<your SMS-capable Dialpad number in E.164 format>
   INBOUND_SMS_ENABLED=true
   ```

   Keep the secret in Supabase and Dialpad only, never in GitHub or browser code.
   `DIALPAD_FROM_NUMBER` is the same number used for outgoing Dialpad SMS.
   Setting `INBOUND_SMS_ENABLED=false` immediately stops incoming processing.

3. Create a Dialpad webhook using `POST https://dialpad.com/api/v2/webhooks`:

   ```json
   {
     "hook_url": "https://nqdadzlvtmsybcnntkny.supabase.co/functions/v1/receive-driver-sms",
     "secret": "<the exact same DIALPAD_WEBHOOK_SECRET>"
   }
   ```

   Supply your Dialpad API key as the Bearer authorization header. Record the
   returned webhook ID without recording its secret in repository files.

4. Create an inbound subscription using
   `POST https://dialpad.com/api/v2/subscriptions/sms`:

   ```json
   {
     "endpoint_id": 123456,
     "direction": "inbound",
     "enabled": true,
     "include_internal": true,
     "status": false
   }
   ```

   Replace `123456` with the returned webhook ID. Prefer scoping to the specific
   Dialpad receiving user/department via `target_type` and `target_id`. A scoped
   subscription needs the `message_content_export` API scope; an unscoped company
   subscription needs `message_content_export:all`. Otherwise Dialpad omits the
   message text and the receiver rejects it without changing a job.

5. Test with one saved driver's phone and one current unfinished test load:
   send `Loading`, then `Loaded`, then `In Transit`, then `On Site`, then
   `Delivered`. Check the board and Recent Activity after each reply. These are
   real SMS messages; local/database verification does not send any texts.

## Server design and verification

The endpoint deliberately has `verify_jwt=false` because Dialpad cannot supply a
Supabase user JWT. It requires its own HS256 JWT signature before any database
call and rejects messages to any number except `DIALPAD_FROM_NUMBER`.
`process_driver_sms_reply` is callable only by `service_role`; signed-out and
ordinary site accounts cannot invoke it. No frontend receives a service key.

The private `sms_private.inbound_messages` table stores verified events and their
outcome, including unknown senders and ambiguous assignments. Inspect it through
the Supabase SQL Editor when troubleshooting. It is not accessible to site users:

```sql
select received_at,driver,transfer_id,requested_status,outcome
from sms_private.inbound_messages
order by received_at desc limit 50;
```

`sms-reply-tests.sql` verifies matching, status history, duplicate retries,
ambiguous loads/phones, explicit Move #, stale messages and restricted RPC access
inside a rollback transaction. Test inserts consume sequence numbers but leave
no test jobs, drivers or messages. `check-receiver.cjs` verifies webhook signature,
configuration, recipient filtering and retry behavior with mocked requests.

Official references:
- https://developers.dialpad.com/docs/sms-events
- https://developers.dialpad.com/reference/webhookscreate
- https://developers.dialpad.com/reference/webhook_sms_event_subscriptioncreate
