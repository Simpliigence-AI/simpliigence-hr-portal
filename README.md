# Simpliigence HR Portal

Full-stack HR Management System built with **Next.js 14**, **Supabase**, deployed on **Vercel**.

## Stack
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage)
- **Hosting**: Vercel
- **Source control**: GitHub

## Modules
| Module | Path | Description |
|--------|------|-------------|
| Dashboard | `/` | Headcount stats, dept breakdown, visa alerts, recent joiners |
| HR Dossier | `/dossier` | Searchable employee directory — grid & list views, profile modal |
| Performance | `/performance` | KRA rating table — 17 KRAs × all India employees |
| Org Chart | `/org-chart` | Reporting tree + BU grid |
| Onboarding | `/onboarding` | 5-category checklist per new joiner |
| Engagement | `/engagement` | 1-on-1 connects with mood tracking & action items |
| Policies | `/policy` | Policy register with category/status filters |

## Supabase
- **Project**: `simpliigence-hr-portal`
- **URL**: `https://cxfkwstpztxhkfknuqtj.supabase.co`
- **Region**: us-east-1
- **Tables**: `employees`, `performance_reviews`, `onboarding_checklists`, `engagement_connects`, `recognition_awards`, `policies`

## Local Development

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_ORG/simpliigence-hr-portal.git
cd simpliigence-hr-portal

# 2. Install dependencies
npm install

# 3. Set up env (already pre-filled with your Supabase project)
cp .env.local.example .env.local

# 4. Run dev server
npm run dev
# → http://localhost:3000
```

## Deploy to GitHub + Vercel

### Step 1 — Push to GitHub
```bash
cd simpliigence-hr-portal
git init
git add .
git commit -m "Initial commit — Simpliigence HR Portal"
git branch -M main

# Create repo at https://github.com/new  (name: simpliigence-hr-portal)
git remote add origin https://github.com/YOUR_ORG/simpliigence-hr-portal.git
git push -u origin main
```

### Step 2 — Import to Vercel
1. Go to **https://vercel.com/new**
2. Import your GitHub repo `simpliigence-hr-portal`
3. Add these **Environment Variables**:
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://cxfkwstpztxhkfknuqtj.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
4. Click **Deploy** — Vercel auto-detects Next.js

### Step 3 — Every push auto-deploys
Merge to `main` → Vercel builds and deploys automatically.

## Adding Employee Photos
1. Go to Supabase → Storage → Create bucket `employee-photos`
2. Upload photo, get public URL
3. Update the employee's `photo_url` field in the `employees` table
4. Avatar component automatically uses the photo

## Database Schema
```sql
employees            -- Core HR dossier (57 records seeded)
performance_reviews  -- KRA ratings per employee per cycle
onboarding_checklists-- 5-category checklist per new hire
engagement_connects  -- 1-on-1 connects with mood + action items
recognition_awards   -- R&R records
policies             -- Policy register (12 seeded)
```
