# Driver SMS Setup

The Transfers page sends driver SMS through a Supabase Edge Function. **Infobip is now the primary provider.** Twilio remains available as a fallback if Infobip is not configured.

## Infobip trial setup

Infobip's current free trial lasts 60 days. During the trial, use the test sender `ServiceSMS` and send only to the phone number verified in your Infobip trial account.

### 1. Create the Infobip API key

In Infobip, create an API key that has the `sms:message:send` scope.

### 2. Add Supabase Edge Function secrets

In the **Transfers** Supabase project open **Edge Functions → Secrets** and add:

```
INFOBIP_API_KEY=your_infobip_api_key
```

Optional settings:

```
INFOBIP_BASE_URL=https://api.infobip.com
INFOBIP_SENDER=ServiceSMS
```

`INFOBIP_BASE_URL` can also be your personalized Infobip base URL such as `xxxxx.api.infobip.com`. If omitted, the function uses `https://api.infobip.com`.

Do not place the API key in `config.js`, `index.html`, GitHub, or any browser-visible file.

### 3. Deploy / redeploy the Edge Function

Open **Supabase → Transfers → Edge Functions → send-sms → Code**.

Replace the entire function with the current contents of:

`send-sms-copy-paste.txt`

Then click **Deploy updates**.

### 4. Test from Transfers

1. Make sure the destination cell phone is the verified number on the Infobip trial account.
2. Open a transfer.
3. Click **Text Driver**.
4. Choose Assignment, Update, or Delay.
5. Edit the custom message if desired.
6. Click **Send SMS**.

On success, Transfers will show `Text queued via Infobip`, save the driver's phone number, add the SMS to message history, and log the action in Recent Activity.

## Existing database requirement

Run `migration-v9.sql` in the Transfers Supabase SQL Editor if it has not already been run. It adds driver phone storage and SMS history.

## Twilio fallback

If `INFOBIP_API_KEY` is absent, the function can still use the existing Twilio secrets. Once an Infobip key is present, Infobip takes priority.
