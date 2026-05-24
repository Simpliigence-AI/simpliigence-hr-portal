import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const SCHEMA = `
PostgreSQL database schema for Simpliigence HR Portal:

TABLE: employees
  id text PRIMARY KEY
  name text                        -- full name e.g. "Priya Sharma"
  role text                        -- job title e.g. "Salesforce Developer"
  dept text                        -- department: "Engineering","Delivery","HR","Finance","Sales"
  bu text                          -- business unit
  location text                    -- city e.g. "Bangalore", "New Jersey", "Toronto"
  country text
  region text                      -- "India" or "USA" or "Canada"
  manager text                     -- manager name
  wfo text                         -- "WFH" or "WFO"
  type text                        -- "FTE", "Contract", "Contractor"
  joined date                      -- date joined the company
  skills text[]                    -- array of skills
  certs text[]                     -- certifications
  visa text                        -- visa type e.g. "H1B", "L1", "GC", "Citizen"
  visa_expiry date                 -- when visa expires (NULL if no visa needed)
  sow_expiry date                  -- Statement of Work expiry date
  active boolean                   -- true if currently employed
  status text                      -- "Active", "On Leave", "Terminated"
  termination_date date
  salary numeric
  appraisal text
  hike numeric                     -- hike percentage
  photo_url text                   -- Supabase Storage URL for profile photo
  ms_user_id text                  -- Microsoft 365 user object ID
  ms_email text                    -- Microsoft 365 primary email
  phone text                       -- phone number from Teams/M365
  job_title text                   -- job title from M365
  ms_department text               -- department from M365
  ms_synced_at timestamptz         -- last Teams sync timestamp

TABLE: monthly_reviews
  id uuid PRIMARY KEY
  employee_id text REFERENCES employees(id)
  review_month date                -- first day of month e.g. '2024-08-01'
  manager_name text
  project text
  billable boolean
  mood text                        -- "Happy", "Neutral", "Concerned", "Stressed"
  score numeric                    -- 1.0–3.0 average (1=Good, 2=Very Good, 3=Excellent)
  targets text
  achievements text
  overall_feedback text
  created_at timestamptz

TABLE: hr_actions
  id uuid PRIMARY KEY
  title text
  description text
  owner text
  priority text                    -- "High", "Medium", "Low"
  status text                      -- "Open", "In Progress", "Done", "Cancelled"
  due_date date
  source text                      -- "manual" or "email"
  created_at timestamptz

TABLE: onboarding_checklists
  employee_id text REFERENCES employees(id)
  category text
  item text
  completed boolean
  completed_at timestamptz

TABLE: engagement_connects
  employee_id text REFERENCES employees(id)
  connect_date date
  notes text
  conducted_by text
  mood text

TABLE: recognition_awards
  employee_id text REFERENCES employees(id)
  award_type text
  award_date date
  reason text
  awarded_by text
`;

const SQL_SYSTEM = `You are a SQL generator for the Simpliigence HR Portal PostgreSQL database.

Given a natural language question, return ONLY a valid PostgreSQL SELECT query — no explanation, no markdown fences, no comments. Just raw executable SQL.

Rules:
- ONLY generate SELECT queries. Never write INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, or GRANT.
- Use exact column names from the schema provided.
- For "joined in August 2023": WHERE joined >= '2023-08-01' AND joined < '2023-09-01'
- For "expired visas": WHERE visa_expiry < CURRENT_DATE AND visa_expiry IS NOT NULL
- For "expiring visas" / "visa alerts": WHERE visa_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
- For "active employees": WHERE active = true or WHERE status = 'Active'
- For "this month" reviews: WHERE review_month = DATE_TRUNC('month', CURRENT_DATE)
- For name searches: use ILIKE '%name%'
- Always include employee name when querying employee-related data.
- Limit to 50 rows for list queries; no limit for counts/aggregates.
- JOIN employees on employee_id when retrieving names from other tables.
- Use clear column aliases.

If the question truly cannot be answered from this schema, return exactly: CANNOT_ANSWER

Schema:
${SCHEMA}`;

const FORMAT_SYSTEM = `You are a helpful HR assistant at Simpliigence. Your job is to present database query results in a clear, professional way.

Guidelines:
- Lead with the direct answer.
- For lists of people, show: name, relevant detail (role, location, date, etc.).
- For counts, state the number clearly.
- If 0 results: say so clearly and suggest what might explain it.
- Keep it concise — no unnecessary padding.
- Use bullet points for lists of 3+ items.
- Never fabricate data not in the results.
- Never show raw SQL or JSON.`;

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json() as { question?: string };
    if (!question?.trim()) {
      return NextResponse.json({ error: 'No question provided' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        answer: '⚠️ The AI assistant is not yet configured. Ask your admin to add ANTHROPIC_API_KEY to the Vercel environment variables.',
      });
    }

    // ── Step 1: Generate SQL ─────────────────────────────────────────────────
    const sqlRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SQL_SYSTEM,
        messages: [{ role: 'user', content: question }],
      }),
    });

    if (!sqlRes.ok) throw new Error(`Anthropic error ${sqlRes.status}`);
    const sqlData = await sqlRes.json() as { content: { text: string }[] };
    const sql = sqlData.content[0].text.trim().replace(/;+$/, '');

    if (sql === 'CANNOT_ANSWER') {
      return NextResponse.json({
        answer: "I can answer questions about employees, visas, performance reviews, departments, join dates, and action items. Try: \"Who joined in 2024?\" or \"Whose visas expire this year?\"",
      });
    }

    // Safety guard
    const up = sql.toUpperCase();
    if (!up.trimStart().startsWith('SELECT') ||
        /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/.test(up)) {
      return NextResponse.json({ answer: 'I can only run read-only queries on the HR database.' });
    }

    // ── Step 2: Execute via RPC ───────────────────────────────────────────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data, error } = await supabase.rpc('execute_hr_query', { query_text: sql });

    if (error) {
      console.error('RPC error:', error);
      return NextResponse.json({
        answer: `I had trouble running that query: ${error.message}. Please try rephrasing your question.`,
      });
    }

    const results = Array.isArray(data) ? data : [];

    // ── Step 3: Format answer ─────────────────────────────────────────────────
    const fmtRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: FORMAT_SYSTEM,
        messages: [{
          role: 'user',
          content: `Question: "${question}"\n\nResults (${results.length} rows):\n${JSON.stringify(results, null, 2)}`,
        }],
      }),
    });

    if (!fmtRes.ok) throw new Error(`Anthropic format error ${fmtRes.status}`);
    const fmtData = await fmtRes.json() as { content: { text: string }[] };
    const answer  = fmtData.content[0].text.trim();

    return NextResponse.json({ answer, rowCount: results.length });

  } catch (e) {
    console.error('HR Chat error:', e);
    return NextResponse.json(
      { answer: `Something went wrong: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
