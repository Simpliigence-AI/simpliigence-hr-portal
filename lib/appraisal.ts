// lib/appraisal.ts
// Simpliigence annual appraisal framework — competency model, scoring, bands, 9-box.
// Shared by the admin console, the tokenised participant forms and the API routes.

export type Audience = 'self' | 'peer' | 'manager'

export type Competency = {
  id: string
  group: string
  label: string
  /** Weight out of 100 across the full (self / manager) set. */
  weight: number
  /** Who is asked this competency. */
  audiences: Audience[]
  /** Anchored descriptors for ratings 1..5. */
  anchors: [string, string, string, string, string]
}

export const GROUPS = [
  'Delivery & Execution',
  'Technical & Functional Expertise',
  'Client Impact',
  'Collaboration & Teamwork',
  'Leadership & Initiative',
  'Values & Culture',
] as const

const ALL: Audience[] = ['self', 'peer', 'manager']
const SM: Audience[] = ['self', 'manager']

export const COMPETENCIES: Competency[] = [
  // ---- Delivery & Execution (25) ----
  {
    id: 'quality', group: 'Delivery & Execution', label: 'Quality of work', weight: 9, audiences: ALL,
    anchors: [
      'Work regularly needs rework or close supervision before it can be used',
      'Work is usable but defects or gaps are found often enough to slow others down',
      'Work is consistently solid and meets the agreed definition of done',
      'Work is high quality with very few defects; others reuse it as a reference',
      'Work sets the quality standard for the practice; raises the bar for the whole team',
    ],
  },
  {
    id: 'ownership', group: 'Delivery & Execution', label: 'Ownership & accountability', weight: 9, audiences: ALL,
    anchors: [
      'Waits to be told; commitments slip without early warning',
      'Owns assigned tasks but hands off problems rather than seeing them through',
      'Owns their commitments end to end and flags risks in time',
      'Takes ownership beyond their own scope; closes gaps nobody assigned them',
      'Treats outcomes as personally theirs; the account or product is visibly safer because of them',
    ],
  },
  {
    id: 'timeliness', group: 'Delivery & Execution', label: 'Timeliness & predictability', weight: 7, audiences: SM,
    anchors: [
      'Frequently misses dates; estimates are unreliable',
      'Meets dates on simple work; slips under pressure or complexity',
      'Delivers to committed dates and estimates realistically',
      'Consistently early or on time, including on complex work; estimates are trusted',
      'Delivery is dependable enough that others plan confidently around their commitments',
    ],
  },

  // ---- Technical & Functional Expertise (23) ----
  {
    id: 'expertise', group: 'Technical & Functional Expertise', label: 'Depth in role / craft', weight: 9, audiences: ALL,
    anchors: [
      'Below the depth the role requires; depends on others for core tasks',
      'Building the core skills; handles routine work independently',
      'Fully proficient at the level expected for the role',
      'Recognised as a go-to person in their area within the team',
      'Recognised across Simpliigence (and by clients) as an authority in their domain',
    ],
  },
  {
    id: 'problem_solving', group: 'Technical & Functional Expertise', label: 'Problem solving & critical thinking', weight: 8, audiences: ALL,
    anchors: [
      'Escalates problems without attempting analysis',
      'Solves familiar problems; struggles with ambiguity',
      'Breaks down unfamiliar problems and arrives at workable solutions',
      'Anticipates problems and offers well-reasoned options with trade-offs',
      'Reframes hard, ambiguous problems in ways that change the approach for the better',
    ],
  },
  {
    id: 'learning', group: 'Technical & Functional Expertise', label: 'Continuous learning & certification', weight: 6, audiences: SM,
    anchors: [
      'No visible learning activity this cycle',
      'Learns when prompted or when the project forces it',
      'Keeps current with role-relevant skills and completed planned certifications',
      'Proactively learns ahead of need; exceeded the certification plan',
      'Learns fast and multiplies it — teaches, writes, or builds enablement for others',
    ],
  },

  // ---- Client Impact (15) ----
  {
    id: 'client_comm', group: 'Client Impact', label: 'Client communication & responsiveness', weight: 8, audiences: ALL,
    anchors: [
      'Communication with clients needs to be managed or corrected',
      'Communicates adequately with support and review',
      'Communicates clearly and responsively; needs no supervision on routine client contact',
      'Runs client conversations independently, including difficult ones',
      'Client communication is a differentiator — clients specifically ask for them',
    ],
  },
  {
    id: 'client_trust', group: 'Client Impact', label: 'Client trust & advisory presence', weight: 7, audiences: SM,
    anchors: [
      'Client confidence is a concern; requires intervention',
      'Seen as a doer; not yet consulted on decisions',
      'Trusted to deliver; client relies on them within their scope',
      'Consulted by the client beyond their scope; shapes decisions',
      'Trusted advisor — influences client strategy and has driven growth or renewal',
    ],
  },

  // ---- Collaboration & Teamwork (15) ----
  {
    id: 'teamwork', group: 'Collaboration & Teamwork', label: 'Teamwork & knowledge sharing', weight: 8, audiences: ALL,
    anchors: [
      'Works in isolation; knowledge stays with them',
      'Cooperates when asked; shares little proactively',
      'Collaborates well and shares what the team needs to know',
      'Actively lifts the team — documents, demos, unblocks others',
      'A visible force for collaboration across teams, not just their own',
    ],
  },
  {
    id: 'dependability', group: 'Collaboration & Teamwork', label: 'Dependability to colleagues', weight: 7, audiences: ALL,
    anchors: [
      'Colleagues cannot rely on their responses or follow-through',
      'Responsive on their own priorities; slow to help others',
      'Reliable — responds and follows through on what they agree to',
      'Colleagues seek them out because they can be counted on under pressure',
      'The person the team turns to when something absolutely must not fail',
    ],
  },

  // ---- Leadership & Initiative (10) ----
  {
    id: 'initiative', group: 'Leadership & Initiative', label: 'Initiative & going beyond the brief', weight: 6, audiences: ALL,
    anchors: [
      'Does only what is explicitly assigned',
      'Occasionally suggests improvements but rarely follows through',
      'Regularly identifies improvements and acts on them within their scope',
      'Drives improvements beyond their scope with measurable benefit',
      'Started something the company now relies on — a practice, asset, offering or process',
    ],
  },
  {
    id: 'mentoring', group: 'Leadership & Initiative', label: 'Mentoring & developing others', weight: 4, audiences: ALL,
    anchors: [
      'No involvement in developing others',
      'Helps when asked',
      'Actively guides juniors on the project',
      'Formally mentors; visible growth in the people they support',
      'Has built capability at scale — mentees now lead work themselves',
    ],
  },

  // ---- Values & Culture (12) ----
  {
    id: 'integrity', group: 'Values & Culture', label: 'Integrity & professionalism', weight: 6, audiences: ALL,
    anchors: [
      'Professionalism has been a concern this cycle',
      'Generally professional; occasional lapses needing correction',
      'Consistently professional, honest and respectful',
      'Sets a strong example; raises issues candidly and constructively',
      'A standard-bearer for Simpliigence values, including when it is costly',
    ],
  },
  {
    id: 'resilience', group: 'Values & Culture', label: 'Adaptability & resilience under pressure', weight: 6, audiences: ALL,
    anchors: [
      'Overwhelmed by change or pressure; impacts others',
      'Copes but needs time and support to stabilise',
      'Adapts to change and stays effective under normal pressure',
      'Steadies others during escalations and shifting priorities',
      'Performs at their best precisely when the situation is hardest',
    ],
  },
]

export const RATING_LABELS = ['', 'Needs improvement', 'Developing', 'Meets expectations', 'Exceeds expectations', 'Outstanding']

// ---------------------------------------------------------------- core 1-10 ratings
// Asked of EVERY rater — the employee, each nominated peer, and the manager — so
// the three views sit side by side on the same scale.

export type CoreRating = {
  id: string
  label: string
  /** Weight within the 1-10 triad. */
  weight: number
  hint: string
  /** Short descriptors shown under the slider at 1-3 / 4-6 / 7-8 / 9-10. */
  scale: [string, string, string, string]
}

export const CORE_RATINGS: CoreRating[] = [
  {
    id: 'r_performance',
    label: 'Performance',
    weight: 50,
    hint: 'Quality, output and impact of the work delivered this year.',
    scale: [
      '1-3 · Below the bar for the role',
      '4-6 · Meets some expectations, gaps remain',
      '7-8 · Consistently delivers at or above the bar',
      '9-10 · Exceptional — among the best in the practice',
    ],
  },
  {
    id: 'r_attitude',
    label: 'Attitude',
    weight: 25,
    hint: 'Ownership, professionalism, willingness and how they respond to pressure and change.',
    scale: [
      '1-3 · A concern that needs addressing',
      '4-6 · Generally positive, inconsistent under pressure',
      '7-8 · Reliably positive and professional',
      '9-10 · Lifts everyone around them',
    ],
  },
  {
    id: 'r_team_mgmt',
    label: 'Team management',
    weight: 25,
    hint: 'Collaboration, mentoring, and how well they lead or support others. Rate on influence, not headcount.',
    scale: [
      '1-3 · Works in isolation or creates friction',
      '4-6 · Cooperates, limited influence on others',
      '7-8 · Actively lifts the team',
      '9-10 · Builds capability others depend on',
    ],
  },
]

/** Weighted 0-100 score from the 1-10 triad. */
export function scoreCore(answers: Record<string, unknown>): number | null {
  let tw = 0
  let ws = 0
  for (const c of CORE_RATINGS) {
    const raw = answers?.[c.id]
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
    if (Number.isFinite(n) && n >= 1 && n <= 10) { ws += n * 10 * c.weight; tw += c.weight }
  }
  if (tw === 0) return null
  return Math.round((ws / tw) * 10) / 10
}

/** The triad on its native 1-10 scale, for side-by-side display. */
export function coreTriad(answers: Record<string, unknown>): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const c of CORE_RATINGS) {
    const raw = answers?.[c.id]
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
    out[c.id] = Number.isFinite(n) && n >= 1 && n <= 10 ? n : null
  }
  return out
}

// ---------------------------------------------------------------- project rows
// The self-assessment "technical template": one row per project, with the
// targets set and what was actually achieved against them.

export type ProjectRow = {
  project: string
  client: string
  role: string
  duration: string
  targets: string
  achievements: string
  skills: string
}

export const PROJECT_COLUMNS: Array<{ id: keyof ProjectRow; label: string; kind: 'text' | 'area'; placeholder?: string }> = [
  { id: 'project',      label: 'Project',            kind: 'text', placeholder: 'e.g. Sales Cloud rollout' },
  { id: 'client',       label: 'Client / account',   kind: 'text', placeholder: 'e.g. Cool Air Rentals' },
  { id: 'role',         label: 'Your role',          kind: 'text', placeholder: 'e.g. Senior Developer' },
  { id: 'duration',     label: 'Period',             kind: 'text', placeholder: 'e.g. Apr - Nov 2026' },
  { id: 'targets',      label: 'Targets set for you on this project', kind: 'area', placeholder: 'What were you asked to deliver?' },
  { id: 'achievements', label: 'What you achieved against them',      kind: 'area', placeholder: 'Be specific and quantify where you can.' },
  { id: 'skills',       label: 'Skills / tools used or learned here',  kind: 'text', placeholder: 'e.g. Agentforce, LWC, Data Cloud' },
]

export function emptyProjectRow(): ProjectRow {
  return { project: '', client: '', role: '', duration: '', targets: '', achievements: '', skills: '' }
}

export function parseProjects(raw: unknown): ProjectRow[] {
  if (Array.isArray(raw)) {
    return raw.map(r => ({ ...emptyProjectRow(), ...(r as object) })) as ProjectRow[]
  }
  return []
}


export function competenciesFor(audience: Audience): Competency[] {
  return COMPETENCIES.filter(c => c.audiences.includes(audience))
}

// ---------------------------------------------------------------- narratives

export type NarrativeQ = {
  id: string
  label: string
  hint?: string
  rows?: number
  required?: boolean
}

export const SELF_NARRATIVES: NarrativeQ[] = [
  { id: 'year_targets', label: 'What were your overall targets / KRAs for this year?', hint: 'The goals agreed with your manager at the start of the cycle, across all projects.', rows: 4, required: true },
  { id: 'skills_learned', label: 'What skills have you learned or deepened over the year?', hint: 'Technologies, certifications, functional or domain knowledge, soft skills.', rows: 4, required: true },
  { id: 'non_project', label: 'Non-project achievements and contributions', hint: 'Referrals, white papers, blogs, presales support, internal tools, hiring, community or brand contributions, training you delivered.', rows: 4, required: true },
  { id: 'challenges', label: 'Biggest challenge you faced this year and how you handled it', rows: 3 },
  { id: 'development', label: 'Where do you most want to grow in the next 12 months?', hint: 'Skills, certifications, role scope, domain.', rows: 3, required: true },
  { id: 'support_needed', label: 'What support do you need from your manager or Simpliigence?', rows: 3 },
  { id: 'aspiration', label: 'Where do you see your role heading over the next 1-2 years?', rows: 3 },
]

export const PEER_NARRATIVES: NarrativeQ[] = [
  { id: 'context', label: 'How have you worked with this person during this cycle?', hint: 'Project, duration and how closely you worked together.', rows: 2, required: true },
  { id: 'strengths', label: 'What should they keep doing? Give a concrete example.', rows: 4, required: true },
  { id: 'improve', label: 'What one thing would make the biggest difference if they changed it?', rows: 4, required: true },
]

export const MANAGER_NARRATIVES: NarrativeQ[] = [
  { id: 'summary', label: 'Overall assessment of performance this cycle', hint: 'This is the narrative the employee will read when the appraisal is released.', rows: 5, required: true },
  { id: 'strengths', label: 'Key strengths and standout contributions', rows: 4, required: true },
  { id: 'improve', label: 'Development areas and specific expectations for next cycle', rows: 4, required: true },
  { id: 'goals_next', label: 'Goals / KRAs for the next cycle', rows: 4, required: true },
  { id: 'peer_reflection', label: 'Anything from the peer feedback worth noting', rows: 3 },
]

// ---------------------------------------------------------------- scoring

/** Weighted 0–100 score from a set of 1–5 competency ratings. */
export function scoreAnswers(answers: Record<string, unknown>, audience: Audience): number | null {
  let tw = 0
  let ws = 0
  for (const c of competenciesFor(audience)) {
    const raw = answers?.[c.id]
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
    if (Number.isFinite(n) && n >= 1 && n <= 5) {
      ws += n * c.weight
      tw += c.weight
    }
  }
  if (tw === 0) return null
  return Math.round((ws / tw) * 20 * 10) / 10
}

export function groupBreakdown(
  answers: Record<string, unknown>,
  audience: Audience
): Array<{ group: string; score: number | null; weight: number }> {
  return GROUPS.map(g => {
    const items = competenciesFor(audience).filter(c => c.group === g)
    let tw = 0
    let ws = 0
    for (const c of items) {
      const raw = answers?.[c.id]
      const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10)
      if (Number.isFinite(n) && n >= 1 && n <= 5) { ws += n * c.weight; tw += c.weight }
    }
    return {
      group: g,
      score: tw === 0 ? null : Math.round((ws / tw) * 20 * 10) / 10,
      weight: items.reduce((s, c) => s + c.weight, 0),
    }
  })
}

/**
 * One rater's overall 0-100 score: the 1-10 triad (Performance / Attitude /
 * Team management) carries 60%, the detailed competency grid the other 40%.
 * Whichever part a rater did not complete is renormalised away.
 */
export const RATER_MIX = { core: 0.6, competency: 0.4 }

export function raterScore(answers: Record<string, unknown>, audience: Audience): number | null {
  const core = scoreCore(answers)
  const comp = scoreAnswers(answers, audience)
  let tw = 0
  let ws = 0
  if (core != null) { ws += core * RATER_MIX.core; tw += RATER_MIX.core }
  if (comp != null) { ws += comp * RATER_MIX.competency; tw += RATER_MIX.competency }
  if (tw === 0) return null
  return Math.round((ws / tw) * 10) / 10
}

/** Blend weights for the final score. Missing inputs are renormalised away. */
export const BLEND = { manager: 0.7, peer: 0.2, self: 0.1 }

export function finalScore(input: {
  manager?: number | null
  peer?: number | null
  self?: number | null
}): number | null {
  let tw = 0
  let ws = 0
  for (const k of ['manager', 'peer', 'self'] as const) {
    const v = input[k]
    if (typeof v === 'number' && Number.isFinite(v)) { ws += v * BLEND[k]; tw += BLEND[k] }
  }
  if (tw === 0) return null
  return Math.round((ws / tw) * 10) / 10
}

// ---------------------------------------------------------------- bands

export type Band = {
  key: string
  label: string
  min: number
  hikeLow: number
  hikeHigh: number
  color: string
  blurb: string
}

export const BANDS: Band[] = [
  { key: 'outstanding',  label: 'Outstanding',          min: 90, hikeLow: 12, hikeHigh: 18, color: 'emerald', blurb: 'Top of the population. Retention-critical; consider accelerated progression.' },
  { key: 'exceeds',      label: 'Exceeds expectations',  min: 78, hikeLow: 9,  hikeHigh: 12, color: 'green',   blurb: 'Consistently above the bar for the role. Strong promotion pipeline.' },
  { key: 'meets',        label: 'Meets expectations',    min: 62, hikeLow: 6,  hikeHigh: 9,  color: 'blue',    blurb: 'Solid, dependable performance at the level expected for the role.' },
  { key: 'partial',      label: 'Partially meets',       min: 50, hikeLow: 0,  hikeHigh: 4,  color: 'amber',   blurb: 'Gaps against the role expectations. Needs a documented improvement plan.' },
  { key: 'below',        label: 'Below expectations',    min: 0,  hikeLow: 0,  hikeHigh: 0,  color: 'red',     blurb: 'Formal performance improvement plan and HR involvement required.' },
]

export function bandFor(score: number | null | undefined): Band | null {
  if (score == null || !Number.isFinite(score)) return null
  return BANDS.find(b => score >= b.min) ?? BANDS[BANDS.length - 1]
}

// ---------------------------------------------------------------- 9-box

export const POTENTIAL = ['Low', 'Medium', 'High'] as const
export type Potential = typeof POTENTIAL[number]

export function performanceTier(score: number | null | undefined): 'Low' | 'Medium' | 'High' | null {
  if (score == null) return null
  if (score >= 90) return 'High'
  if (score >= 62) return 'Medium'
  return 'Low'
}

const NINE_BOX: Record<string, string> = {
  'High|High': 'Star',
  'High|Medium': 'High performer',
  'High|Low': 'Trusted professional',
  'Medium|High': 'High potential',
  'Medium|Medium': 'Core player',
  'Medium|Low': 'Solid contributor',
  'Low|High': 'Enigma / rough diamond',
  'Low|Medium': 'Inconsistent player',
  'Low|Low': 'Underperformer',
}

/** perf = performance tier, pot = potential rating. */
export function nineBox(perf: string | null, pot: string | null): string | null {
  if (!perf || !pot) return null
  return NINE_BOX[`${perf}|${pot}`] ?? null
}

// ---------------------------------------------------------------- stages

export const STAGES = [
  { key: 'self',       label: 'Self-assessment' },
  { key: 'nomination', label: 'Peer nomination' },
  { key: 'peer',       label: 'Peer feedback' },
  { key: 'manager',    label: 'Manager review' },
  { key: 'hr',         label: 'HR review' },
  { key: 'released',   label: 'Released' },
] as const

export type StageKey = typeof STAGES[number]['key']

export const MAX_PEERS = 3
