# Ziventra Talent Hub

Website for the ServiceNow + AI/ML candidate database that the n8n automation fills every day.

- **Frontend** (`frontend/`): **React 19 + Vite**. Deployed on **Vercel**.
- **Backend** (`backend/`): Python (Starlette, the framework FastAPI is built on) + MongoDB. Deployed on **Render**.
- **Database**: sir's two MongoDB Atlas clusters.
  - Candidates: `servicenow.candidates_master` and `ai_ml.candidates_master`, written by n8n.
  - App data: `talent_app` database on the ServiceNow cluster (admin login, edit history, run log).

## Features

| Page | What it shows |
|---|---|
| Sign in | One admin account only (no sign-up). Change password from the sidebar. |
| Dashboard | Total, enriched, refreshed, average profile %, 30-day chart, pool split, data status, top cities, recently updated |
| Candidates | 8 KPI cards for the current filters, search, filters, cards or table, sort, pages, CSV download, profile % badge |
| Candidate | One page, no tabs: summary, every field editable, % badge (click to see what's missing and why), history |
| Daily record | Pick a day: scraped, enriched, refreshed, LinkedIn changes, 14-day chart, automation runs |

Data status (Discovered / Enriched / Refreshed / Rejected) comes from the automation.

**Edits made on the website are never overwritten by automation.** They are saved under `manual.<field>` in the candidate document. n8n only updates the normal fields, and the website always shows the edited value first.

## Run it on your laptop

Needs Python 3.11+ and **Node.js 20.19 or newer** (`node -v`).

**Window 1, backend:**

```powershell
cd D:\servicenow-candidates\talent-hub\backend
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8800
```

`backend\.env` decides the data: `DATA_MODE=mongo` uses the real database. For invented demo data run `$env:DATA_MODE="memory"` first (login `admin@ziventra.com` / `demo1234`).
`FRONTEND_ORIGINS` in `.env` must include `http://localhost:5500`.

**Window 2, frontend:**

```powershell
cd D:\servicenow-candidates\talent-hub\frontend
copy .env.example .env
npm install
npm run dev
```

Open **http://localhost:5500/zv-admin-access-7k2m9q4x** to sign in (the private sign-in address, set by `VITE_LOGIN_PATH`; every other address shows "Page not found" until you are signed in). API tests: keep the backend running in memory mode and run `python tests\test_api.py`.

### Reset admin password
Put the new password in `ADMIN_PASSWORD`, add `ADMIN_RESET=yes`, restart the backend once, then remove `ADMIN_RESET`.
(On Render: Environment tab, then Manual Deploy.)

## Deploy (step by step)

### 1. Put the code on GitHub
1. Create a **private** repository, for example `ziventra-talent-hub`.
2. Upload the whole `talent-hub` folder. You can use GitHub Desktop, or the "uploading an existing file" link on the empty repo page.
3. Never upload a `.env` file. `.gitignore` already blocks it.

### 2. Backend on Render
1. In Render, click **New → Blueprint**, pick the repository, and Render reads `render.yaml`.
2. Fill in the secret values when asked:

| Key | Value |
|---|---|
| `SN_MONGODB_URI` | ServiceNow cluster connection string (from sir) |
| `AI_MONGODB_URI` | AI/ML cluster connection string |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the admin login (created on first start) |
| `FRONTEND_ORIGINS` | your Vercel URL, and later the DuckDNS URL, separated by commas |

3. Deploy. Then open `https://<your-service>.onrender.com/api/health`. It should show `{"ok":true,"mode":"mongo"}`.
4. Atlas **Network Access** must allow `0.0.0.0/0` (already done), because Render has no fixed IP on the free plan.
5. The free plan sleeps after 15 minutes idle, and the first request then takes ~50 seconds. The Starter plan ($7/month) stays awake.

### 3. Frontend on Vercel
1. In Vercel, click **Add New → Project** and import the repository.
2. Set **Root Directory** to `frontend`. Vercel detects **Vite** (Build Command `npm run build`, Output `dist`).
3. Under **Environment Variables** add `VITE_API_URL` = your Render URL + `/api` (for example `https://ziventra-talent-api.onrender.com/api`) and `VITE_LOGIN_PATH` = your own long private sign-in path.
4. Deploy, and you get a URL like `https://ziventra-talent.vercel.app`.
5. Put that URL in Render's `FRONTEND_ORIGINS`, then redeploy the backend.
   If you change `VITE_API_URL` later, redeploy the frontend too (it is baked in at build time).

### 4. DuckDNS name (optional)
1. On duckdns.org, create a sub domain, for example `ziventra` → `ziventra.duckdns.org`.
2. In Vercel: Project → Settings → **Domains** → add `ziventra.duckdns.org`. Vercel shows an **A record**, usually `76.76.21.21`.
3. In DuckDNS, set the **current ip** of your sub domain to that address and click **update ip**.
4. If Vercel asks for a TXT record to verify, open this URL once in the browser. Use your DuckDNS token and the value Vercel shows:
   `https://www.duckdns.org/update?domains=ziventra&token=YOUR_TOKEN&txt=VALUE_FROM_VERCEL`
5. Add `https://ziventra.duckdns.org` to Render's `FRONTEND_ORIGINS`.

### 5. After the first deploy
1. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
2. Check that edits survive the n8n sync:
   - Edit one candidate's phone on the website.
   - Wait for the next "Master sheet to MongoDB" run (10:45, 1:45, 4:45, 7:45).
   - Reload the website. The phone must still be there.

### 6. Optional: automation run log on the Daily record page
In each n8n workflow, add a MongoDB **Insert** node next to the "Log to runs tab" node, writing to database `talent_app`, collection `runs`. Use these fields:
`date` (YYYY-MM-DD), `time` (HH:MM), `job` (Scraping / Enrichment / Refresh), `by` (n8n), `result` (short text), `cost` (number in $).

## Security notes
- Passwords are hashed (scrypt). Tokens expire after 12 hours. Sign-in locks for 15 minutes after 8 wrong tries.
- Database passwords live only in Render's environment settings, never in the code or the frontend.
- The API only answers the website addresses listed in `FRONTEND_ORIGINS`.
- Candidate contact data is personal data (DPDP Act). Share the admin password only with people who need it, and change it when someone leaves.
