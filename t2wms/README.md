# Trucking 2000 WMS

Warehouse Management System — connected to your Supabase database.

Your data is stored in Supabase (project `jfvdbcsgqyknoslhtofj`). It is shared across
everyone who logs in and is saved automatically — it does not reset.

**Admin login:** `Marie` / `11861186`

---

## Before you deploy: run BOTH SQL files in Supabase (one time)

In Supabase → **SQL Editor** → New query → paste and **Run**, for each:
1. `schema.sql`
2. `schema_storage.sql`   ← the app reads/writes this table

(If you already ran them, skip this.)

---

## Put this on the web (GitHub + Vercel) — no command line needed

### A. Upload to GitHub
1. Go to **github.com** → click **+** (top right) → **New repository**.
2. Name it `trucking2000-wms`, keep it **Private**, click **Create repository**.
3. On the next page click **uploading an existing file** (a link in the middle).
4. Drag in **all the files and folders from this project** EXCEPT the `node_modules`
   folder (don't upload node_modules — it's huge and not needed).
   The important items to upload: `src/` folder, `index.html`, `package.json`,
   `vite.config.js`, `.gitignore`, `README.md`.
5. Click **Commit changes**.

### B. Deploy on Vercel
1. Go to **vercel.com** → **Add New… → Project**.
2. **Import** your `trucking2000-wms` repo.
3. Vercel auto-detects Vite. Leave the defaults (Build Command `vite build`,
   Output `dist`). Click **Deploy**.
4. Wait ~1 minute. You'll get a live URL like `trucking2000-wms.vercel.app`.
5. Open it and log in as `Marie` / `11861186`.

---

## Making changes later (the easy loop)

1. Tell Claude the change.
2. Claude gives you the updated file(s).
3. In your GitHub repo, upload/replace the changed file (same drag-and-drop).
4. Vercel automatically rebuilds and updates the live site in about a minute.

Your data in Supabase is never affected by code updates.

---

## Run it on your own computer first (optional, to test)

If you have Node.js installed:
```
npm install
npm run dev
```
Then open the local address it prints (like `http://localhost:5173`).

---

## Notes
- The connection keys in `src/supabase.js` are the **public** client key — safe to be here.
- If you ever see an "Offline" badge in the top bar, the app couldn't reach Supabase;
  check your internet or that the two SQL files were run. Tell Claude if it persists.
