'use client'
import { useState } from 'react'

const DETAILED_QUESTIONS = [
  { id: 'role_fitment', cat: '1. Technical Performance & Execution', label: 'Role Fitment', opts: ['Development Needed','Developing','Proficient','Advanced'] },
  { id: 'delivery', cat: '1. Technical Performance & Execution', label: 'Delivery & Commitments', opts: ['Rarely','Sometimes','Consistently','Always'] },
  { id: 'quality_speed', cat: '1. Technical Performance & Execution', label: 'Quality vs. Speed', opts: ['Struggles to Balance','Inconsistent','Effective Balance','Exceptional Balance'] },
  { id: 'updating_skills', cat: '1. Technical Performance & Execution', label: 'Skill Development', opts: ['Needs Improvement','Passive Learner','Proactive','Continuous Learner'] },
  { id: 'ownership', cat: '2. Professional Traits & Mindset',label: 'Ownership', opts: ['Good','Very Good','Excellent'] },
  { id: 'accountability', cat: '2. Professional Traits & Mindset', label: 'Accountability', opts: ['Good','Very Good','Excellent'] },
  { id: 'critical_thinking', cat: '2. Professional Traits & Mindset', label: 'Critical Thinking & Solution Proactivity', opts: ['Reactive','Occasionally Proactive','Highly Proactive'] },
  { id: 'innovation', cat: '2. Professional Traits & Mindset', label: 'Innovation & Going the Extra Mile', opts: ['Meets Expectations Only','Occasionally Steps Up','Consistently Goes the Extra Mile'] },
  { id: 'independent', cat: '3. Leadership & Atonomy', label: 'Autonomy (IC vs. Lead)', opts: ['High Supervision Needed','Moderate Supervision Needed','Independent'] },
  { id: 'critical_situations', cat: '3. Leadership & Autonomy', label: 'Managing Critical Project Situations', opts: ['Easily Overwhelmed','Stabilizes Gradually','Calm & Effective','Thrives Under Pressure'] },
  { id: 'client_mgmt', cat: '4. Client Interactions', label: 'Management of Client / Client Calls', opts: ['Needs Intervention','Needs Occasional Support','Independent Management','Trusted Advisor'] },
  { id: 'client_professional', cat: '4. Client Interactions', label: 'Professionalism in Client Interactions', opts: ['Needs Improvement','Generally Professional','Exemplary Professionalism'] },
  { id: 'professional_attitude', cat: '5. Teamwork & Culture', label: 'Attitude & Behavior', opts: ['Needs Improvement','Professional','Highly Positive'] },
  { id: 'team_morale', cat: '5. Teamwork & Culture', label: 'Teamwork & Morale', opts: ['Detrimental','Neutral Participant','Positive Contributor','Culture Champion'] },
]

const CONTRACTOR_SECTIONS = [
  '1. Engagement context',
  '2. Workload & utilization',
  '3. Deliverables & milestones',
  '4. Capacity & commitments',
  '5. Project ecosystem',
  '6. Challenges & risk flags',
]

type CField = { id: string; sec: string; label: string; kind: 'text' | 'area' | 'date' | 'select'; opts?: string[]; wide?: boolean }

const CONTRACTOR_FIELDS: CField[] = [
  { id: 'c_project',        sec: '1. Engagement context', label: 'Project / account', kind: 'text' },
  { id: 'c_client_manager', sec: '1. Engagement context', label: 'Reporting manager (client side)', kind: 'text' },
  { id: 'c_simplii_manager',sec: '1. Engagement context', label: 'Simpliigence manager', kind: 'text' },
  { id: 'c_stage',          sec: '1. Engagement context', label: 'Project stage', kind: 'select', opts: ['Discovery','Design','Build','UAT','Go-live','Hypercare','Support / BAU'] },

  { id: 'c_hours_month',    sec: '2. Workload & utilization', label: 'Hours logged this month', kind: 'text' },
  { id: 'c_hours_week',     sec: '2. Workload & utilization', label: 'Avg hours / week', kind: 'select', opts: ['Under 20','20-30','30-40','40-45','45+'] },
  { id: 'c_workload',       sec: '2. Workload & utilization', label: 'Is workload sufficient?', kind: 'select', opts: ['Underutilized - needs more','Right-sized','Stretched','Overloaded'] },
  { id: 'c_billable',       sec: '2. Workload & utilization', label: 'Billable', kind: 'select', opts: ['Yes - full','Yes - partial','No - bench'] },
  { id: 'c_pipeline_8w',    sec: '2. Workload & utilization', label: 'Scheduled work / pipeline for next 8 weeks', kind: 'area', wide: true },

  { id: 'c_deliverables',   sec: '3. Deliverables & milestones', label: 'Current deliverables', kind: 'area', wide: true },
  { id: 'c_next_milestone', sec: '3. Deliverables & milestones', label: 'Next milestone', kind: 'text' },
  { id: 'c_milestone_date', sec: '3. Deliverables & milestones', label: 'Target date', kind: 'date' },
  { id: 'c_on_track',       sec: '3. Deliverables & milestones', label: 'On track?', kind: 'select', opts: ['On track','At risk','Slipped'] },

  { id: 'c_other_engage',   sec: '4. Capacity & commitments', label: 'Other concurrent engagements', kind: 'select', opts: ['None - exclusive','One other','Two or more','Declined to say'] },
  { id: 'c_impact',         sec: '4. Capacity & commitments', label: 'Impact on our delivery', kind: 'select', opts: ['No impact','Minor - manageable','Noticeable','Significant concern'] },
  { id: 'c_balancing',      sec: '4. Capacity & commitments', label: 'How are they balancing it? (availability, overlap hours, responsiveness)', kind: 'area', wide: true },

  { id: 'c_other_vendors',  sec: '5. Project ecosystem', label: 'Other vendors / partners on this project', kind: 'area', wide: true },
  { id: 'c_client_team',    sec: '5. Project ecosystem', label: 'Client-side team & key stakeholders', kind: 'area', wide: true },

  { id: 'c_challenges',     sec: '6. Challenges & risk flags', label: 'Challenges being faced', kind: 'area', wide: true },
  { id: 'c_red_flags',      sec: '6. Challenges & risk flags', label: 'Red flags', kind: 'select', opts: ['None','Watch','Concern','Escalate now'] },
  { id: 'c_retention_risk', sec: '6. Challenges & risk flags', label: 'Retention risk', kind: 'select', opts: ['Low','Medium','High'] },
  { id: 'c_flag_detail',    sec: '6. Challenges & risk flags', label: 'Red flag detail / escalation notes', kind: 'area', wide: true },
  { id: 'c_notes',          sec: '6. Challenges & risk flags', label: 'Overall notes', kind: 'area', wide: true },
]

type Props = {
  onDataChange: (template: string, data: Record<string, string>) => void
    initialTemplate?: string
    initialAnswers?: Record<string, string>
}

export default function DetailedTemplate({ onDataChange, initialTemplate, initialAnswers }: Props) {
  const [template, setTemplate] = useState(initialTemplate ?? 'standard')
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers ?? {})

  function handleTemplateChange(t: string) {
    setTemplate(t)
    onDataChange(t, answers)
  }

  function handleAnswer(id: string, val: string) {
    const next = { ...answers, [id]: val }
    setAnswers(next)
    onDataChange(template, next)
  }

  const cats = ['1. Technical Performance & Execution','2. Professional Traits & Mindset','3. Leadership & Autonomy','4. Client Interactions','5. Teamwork & Culture']

  return (
    <div className="mb-4">
      {/* Template selector */}
      <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 mb-3">
        <div className="text-xs font-semibold text-gray-600 mb-2">Review Template</div>
        <div className="flex gap-2">
          <button onClick={() => handleTemplateChange('standard')}
            className={'px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors ' + (template === 'standard' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
            Standard Review
          </button>
          <button onClick={() => handleTemplateChange('detailed')}
            className={'px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors ' + (template === 'detailed' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
            Detailed Review Template
          </button>
          <button onClick={() => handleTemplateChange('contractor')}
            className={'px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors ' + (template === 'contractor' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
            Contractor Review
          </button>
        </div>
      </div>

      {/* Contractor questions */}
      {template === 'contractor' && (
        <div className="border border-indigo-100 rounded-xl p-4 bg-indigo-50 space-y-4">
          <div className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Contractor Review Template</div>
          {CONTRACTOR_SECTIONS.map(sec => (
            <div key={sec}>
              <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide border-b border-indigo-100 pb-1">{sec}</div>
              <div className="grid sm:grid-cols-2 gap-3">
                {CONTRACTOR_FIELDS.filter(f => f.sec === sec).map(f => (
                  <div key={f.id} className={f.wide ? 'sm:col-span-2' : ''}>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">{f.label}</label>
                    {f.kind === 'select' ? (
                      <select value={answers[f.id] || ''} onChange={e => handleAnswer(f.id, e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-indigo-400">
                        <option value="">Select...</option>
                        {(f.opts || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.kind === 'area' ? (
                      <textarea rows={3} value={answers[f.id] || ''} onChange={e => handleAnswer(f.id, e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 resize-none" />
                    ) : (
                      <input type={f.kind === 'date' ? 'date' : 'text'} value={answers[f.id] || ''} onChange={e => handleAnswer(f.id, e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-indigo-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed questions */}
      {template === 'detailed' && (
        <div className="border border-indigo-100 rounded-xl p-4 bg-indigo-50 space-y-4">
          <div className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Detailed Review Template</div>
          {cats.map(cat => (
            <div key={cat}>
              <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide border-b border-indigo-100 pb-1">{cat}</div>
              {DETAILED_QUESTIONS.filter(q => q.cat === cat).map(q => (
                <div key={q.id} className="mb-3">
                  <label className="text-xs font-medium text-gray-700 mb-1 block">{q.label}</label>
                  <select value={answers[q.id] || ''} onChange={e => handleAnswer(q.id, e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">Select rating...</option>
                    {q.opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
