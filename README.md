# GMQ Global — Consultation Booking Site

A responsive booking form (name, email, DOB, country, mobile, Nominatim-powered
address lookup, consultation reason, and an hourly 10:00–17:00 slot picker)
backed by a Google Sheet via Vercel Serverless Functions.

## Where your Excel/Google Sheet link goes

**You don't paste a link into any code file.** Instead, you create a Google
Sheet, share it with a service account, and put two pieces of identifying
info into **Vercel environment variables**. Here's the exact path:

### Step 1 — Create the Google Sheet
1. Go to [sheets.google.com](https://sheets.google.com) and create a new sheet.
2. Rename the bottom tab to exactly `Responses` (case-sensitive — the backend writes to a tab with this name).
3. Look at the sheet's URL:
   `https://docs.google.com/spreadsheets/d/THIS_LONG_ID_HERE/edit`
   Copy the long ID in the middle — that's your `GOOGLE_SHEET_ID`.

> If you'd rather work in Excel and just want it backed up to Drive, upload your
> `.xlsx` to Google Drive and Drive will offer to open it as a Google Sheet — use
> that converted Sheet's URL/ID. The API used here is Google Sheets API, which
> doesn't write directly to a `.xlsx` file sitting in Drive untouched.

### Step 2 — Create a Google Service Account (so the backend can write to the sheet)
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a project (any name).
2. Enable the **Google Sheets API** for that project (search "Sheets API" in the top search bar → Enable).
3. Go to **IAM & Admin → Service Accounts → Create Service Account**. Any name is fine.
4. Open the new service account → **Keys** tab → **Add Key → Create new key → JSON**. This downloads a `.json` file — keep it safe, don't commit it to git.
5. Inside that JSON file you'll see two fields you need:
   - `client_email` → this is your `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → this is your `GOOGLE_PRIVATE_KEY`

### Step 3 — Share the Sheet with the service account
1. Open your Google Sheet → click **Share**.
2. Paste in the `client_email` from the JSON file (looks like `something@your-project.iam.gserviceaccount.com`).
3. Give it **Editor** access. Without this step, writes will fail with a permissions error.

### Step 4 — Add environment variables in Vercel
This is the actual "where do I put the link" step:

1. In your Vercel project → **Settings → Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `GOOGLE_SHEET_ID` | the long ID from the sheet URL (Step 1.3) |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the `client_email` from the JSON key |
   | `GOOGLE_PRIVATE_KEY` | the `private_key` from the JSON key, **including** the `\n` characters exactly as they appear in the JSON file |

2. Redeploy after adding/changing env vars (Vercel doesn't hot-reload them).

That's it — no link goes into any source file. The Sheet ID + service account
credentials are the entire connection, and they live only in Vercel's
environment variable settings (never committed to your repo).

## Local development
```bash
npm install
npx vercel dev
```
This serves the frontend and runs `/api/slots` and `/api/submit` locally,
provided you've set the same three env vars in a `.env` file or via `vercel env pull`.

## Deploying to Vercel
```bash
npm install -g vercel   # if not already installed
vercel
```
Follow the prompts to link/create a project, then set the three environment
variables above in the Vercel dashboard, then run `vercel --prod`.

## How double-booking is prevented
Every submission re-checks the sheet for the same `Slot Date` + `Time Slot`
pair immediately before writing, and again immediately after writing. If a
concurrent request beat it to the same slot, the later request's row is
marked `CONFLICT - slot taken` and the user is told to pick a different time.
This isn't a perfect distributed lock, but for a low-concurrency consultation
form it effectively prevents double bookings.

## File structure
```
public/
  index.html      — form markup
  styles.css      — design system + responsive layout
  app.js          — validation, Nominatim address lookup, slot UI, submit logic
  countries.js    — country list for the citizenship selector
api/
  slots.js        — GET: returns booked slots for a given date
  submit.js       — POST: validates + appends a row, re-checking for conflicts
  _sheets.js      — shared Google Sheets auth/helpers
vercel.json       — routes API functions correctly on Vercel
package.json      — googleapis dependency
```
