// lib/scoring.ts
// Scoring engine for Simpliigence HR Portal — detailed review ratings

const SCORE_MAP: Record<string, Record<string, number>> = {
  role_fitment: {
    'Development Needed': 25,
    'Developing': 50,
    'Proficient': 75,
    'Advanced': 100,
  },
  delivery: {
    'Rarely': 25,
    'Sometimes': 50,
    'Consistently': 75,
    'Always': 100,
  },
  quality_speed: {
    'Struggles to Balance': 25,
    'Inconsistent': 50,
    'Effective Balance': 75,
    'Exceptional Balance': 100,
  },
  updating_skills: {
    'Needs Improvement': 25,
    'Passive Learner': 50,
    'Proactive': 75,
    'Continuous Learner': 100,
  },
  ownership: {
    'Good': 60,
    'Very Good': 80,
    'Excellent': 100,
  },
  accountability: {
    'Good': 60,
    'Very Good': 80,
    'Excellent': 100,
  },
  critical_thinking: {
    'Reactive': 33,
    'Occasionally Proactive': 67,
    'Highly Proactive': 100,
  },
  innovation: {
    'Meets Expectations Only': 33,
    'Occasionally Steps Up': 67,
    'Consistently Goes the Extra Mile': 100,
  },
  independent: {
    'High Supervision Needed': 33,
    'Moderate Supervision Needed': 67,
    'Independent': 100,
  },
  critical_situations: {
    'Easily Overwhelmed': 25,
    'Stabilizes Gradually': 50,
    'Calm & Effective': 75,
    'Thrives Under Pressure': 100,
  },
  client_mgmt: {
    'Needs Intervention': 25,
    'Needs Occasional Support': 50,
    'Independent Management': 75,
    'Trusted Advisor': 100,
  },
  client_professional: {
    'Needs Improvement': 33,
    'Generally Professional': 67,
    'Exemplary Professionalism': 100,
  },
  professional_attitude: {
    'Needs Improvement': 33,
    'Professional': 67,
    'Highly Positive': 100,
  },
  team_morale: {
    'Detrimental': 25,
    'Neutral Participant': 50,
    'Positive Contributor': 75,
    'Culture Champion': 100,
  },
}

export const WEIGHTS: Record<string, number> = {
  role_fitment: 8,
  delivery: 8,
  quality_speed: 7,
  updating_skills: 7,
  ownership: 6,
  accountability: 6,
  critical_thinking: 7,
  innovation: 6,
  independent: 7,
  critical_situations: 8,
  client_mgmt: 8,
  client_professional: 7,
  professional_attitude: 7,
  team_morale: 8,
}

export const CATEGORIES = [
  { label: 'Technical Performance', fields: ['role_fitment', 'delivery', 'quality_speed', 'updating_skills'], weight: 30 },
  { label: 'Professional Mindset', fields: ['ownership', 'accountability', 'critical_thinking', 'innovation'], weight: 25 },
  { label: 'Leadership & Autonomy', fields: ['independent', 'critical_situations'], weight: 15 },
  { label: 'Client Interactions', fields: ['client_mgmt', 'client_professional'], weight: 15 },
  { label: 'Teamwork & Culture', fields: ['professional_attitude', 'team_morale'], weight: 15 },
]

export function calculateScore(answers: Record<string, string | null | undefined>): number | null {
  let totalWeight = 0
  let weightedSum = 0
  for (const [field, weight] of Object.entries(WEIGHTS)) {
    const val = answers[field]
    if (val && SCORE_MAP[field]?.[val] !== undefined) {
      weightedSum += SCORE_MAP[field][val] * weight
      totalWeight += weight
    }
  }
  if (totalWeight === 0) return null
  return Math.round((weightedSum / totalWeight) * 10) / 10
}

export function categoryBreakdown(
  answers: Record<string, string | null | undefined>
): Array<{ label: string; score: number | null; weight: number }> {
  return CATEGORIES.map(cat => {
    let tw = 0
    let ws = 0
    for (const f of cat.fields) {
      const val = answers[f]
      const w = WEIGHTS[f]
      if (val && SCORE_MAP[f]?.[val] !== undefined) {
        ws += SCORE_MAP[f][val] * w
        tw += w
      }
    }
    return {
      label: cat.label,
      score: tw === 0 ? null : Math.round((ws / tw) * 10) / 10,
      weight: cat.weight,
    }
  })
}

export type TrendDirection = 'up_strong' | 'up' | 'stable' | 'down' | 'down_strong'

export function calculateTrend(
  current: number,
  previous: number | null | undefined
): TrendDirection | null {
  if (previous == null) return null
  const diff = current - previous
  if (diff >= 8) return 'up_strong'
  if (diff >= 3) return 'up'
  if (diff > -3) return 'stable'
  if (diff > -8) return 'down'
  return 'down_strong'
}

export function generateActionPoints(
  answers: Record<string, string | null | undefined>
): Array<{ category: string; description: string; priority: string }> {
  const pts: Array<{ category: string; description: string; priority: string }> = []

  if (answers.role_fitment === 'Development Needed')
    pts.push({ category: 'Technical Performance', priority: 'High', description: 'Create an immediate technical development plan: identify specific skill gaps, assign a mentor, and set 30/60/90-day milestones with measurable outcomes.' })
  else if (answers.role_fitment === 'Developing')
    pts.push({ category: 'Technical Performance', priority: 'Medium', description: 'Review skill gaps against role expectations and build a structured learning path with quarterly checkpoints.' })

  if (answers.delivery === 'Rarely')
    pts.push({ category: 'Delivery', priority: 'High', description: 'Establish weekly delivery check-ins; investigate root causes of missed commitments and introduce a blockers escalation process.' })
  else if (answers.delivery === 'Sometimes')
    pts.push({ category: 'Delivery', priority: 'Medium', description: 'Introduce sprint-level tracking and a structured commitment review at end of each sprint.' })

  if (answers.quality_speed === 'Struggles to Balance')
    pts.push({ category: 'Quality & Execution', priority: 'Medium', description: 'Define done criteria for deliverables and introduce peer review checkpoints before client delivery.' })
  else if (answers.quality_speed === 'Inconsistent')
    pts.push({ category: 'Quality & Execution', priority: 'Low', description: 'Analyse patterns in quality misses to determine if timeline pressure or unclear requirements is the root cause.' })

  if (answers.updating_skills === 'Needs Improvement')
    pts.push({ category: 'Skill Development', priority: 'Medium', description: 'Assign a mandatory learning path relevant to current project. Set 60-day completion target.' })
  else if (answers.updating_skills === 'Passive Learner')
    pts.push({ category: 'Skill Development', priority: 'Low', description: 'Encourage participation in internal knowledge-sharing sessions; set a goal to complete one relevant course this quarter.' })

  if (answers.critical_thinking === 'Reactive')
    pts.push({ category: 'Critical Thinking', priority: 'High', description: 'Include in pre-project discovery and design reviews to build proactive problem-solving habits. Pair with a senior lead for knowledge transfer.' })

  if (answers.innovation === 'Meets Expectations Only')
    pts.push({ category: 'Innovation', priority: 'Low', description: 'Set a quarterly goal to propose at least one process improvement or automation idea; involve in innovation sessions or hackathons.' })

  if (answers.independent === 'High Supervision Needed')
    pts.push({ category: 'Autonomy & Ownership', priority: 'High', description: 'Define a scoped area of full ownership to build confidence. Reduce oversight gradually with structured weekly stand-ups and clear decision boundaries.' })
  else if (answers.independent === 'Moderate Supervision Needed')
    pts.push({ category: 'Autonomy & Ownership', priority: 'Medium', description: 'Assign increasing responsibility on lower-risk tasks; document decision-making frameworks to reduce dependency.' })

  if (answers.critical_situations === 'Easily Overwhelmed')
    pts.push({ category: 'Pressure & Resilience', priority: 'High', description: 'Pair with a senior consultant on high-pressure engagements; consider resilience coaching. Review workload distribution to prevent overload.' })
  else if (answers.critical_situations === 'Stabilizes Gradually')
    pts.push({ category: 'Pressure & Resilience', priority: 'Medium', description: 'Conduct structured debriefs after critical situations to build a personal playbook for managing pressure effectively.' })

  if (answers.client_mgmt === 'Needs Intervention')
    pts.push({ category: 'Client Management', priority: 'High', description: 'Co-own client communications with a senior consultant until confidence improves. Review Simpliigence client management guidelines and shadow best-practice calls.' })
  else if (answers.client_mgmt === 'Needs Occasional Support')
    pts.push({ category: 'Client Management', priority: 'Medium', description: 'Practice independent client call facilitation on lower-stakes accounts; use call prep templates and request post-call feedback from manager.' })

  if (answers.client_professional === 'Needs Improvement')
    pts.push({ category: 'Client Professionalism', priority: 'High', description: 'Schedule a structured 1:1 to share specific examples of professionalism gaps. Define clear expectations with a 30-day follow-up checkpoint.' })

  if (answers.professional_attitude === 'Needs Improvement')
    pts.push({ category: 'Attitude & Behavior', priority: 'High', description: 'Conduct a candid solution-oriented 1:1 to understand root causes. Set specific behavioral expectations with documented targets and a 30-day review.' })

  if (answers.team_morale === 'Detrimental')
    pts.push({ category: 'Team Culture', priority: 'High', description: 'Escalate to HR for a formal performance conversation. Document impact on team dynamics and define non-negotiable behavioral standards with consequences.' })
  else if (answers.team_morale === 'Neutral Participant')
    pts.push({ category: 'Team Culture', priority: 'Low', description: 'Identify team engagement opportunities — assign a team initiative or collaborative project to increase active participation.' })

  return pts
}
