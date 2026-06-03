'use client';

import { useEffect, useState, useCallback , useMemo} from 'react';
import { supabase } from '@/lib/supabase';
import type { Employee } from '@/lib/database.types';
import { cn } from '@/lib/utils';
import Avatar from '@/components/Avatar';

// ─── Types ────────────────────────────────────────────────────
type Rating = 'G' | 'VG' | 'E' | '';
type Mood   = 'Happy' | 'Neutral' | 'Concerned' | 'Stressed' | '';

interface MonthlyReview {
  id: string;
  employee_id: string;
  review_month: string;
  manager_name: string | null;
  project: string | null;
  billable: boolean | null;
  mood: Mood;
  role_fitment: Rating;
  innovation: Rating;
  delivery: Rating;
  critical_situations: Rating;
  client_mgmt: Rating;
  teamwork: Rating;
  ownership: Rating;
  problem_solving: Rating;
  client_professional: Rating;
  accountability: Rating;
  critical_thinking: Rating;
  proactive: Rating;
  independent: Rating;
  quality_speed: Rating;
  updating_skills: Rating;
  professional_attitude: Rating;
  team_morale: Rating;
  targets: string | null;
  achievements: string | null;
  overall_feedback: string | null;
  score: number | null;
  created_at: string;
}

const RATING_FIELDS: { key: keyof MonthlyReview; label: string; group: string }[] = [
  { key: 'role_fitment',          label: 'Role Fitment — meets technical/functional skills?',     group: 'Delivery & Performance' },
  { key: 'delivery',              label: 'Meets delivery expectations & commitments?',             group: 'Delivery & Performance' },
  { key: 'critical_situations',   label: 'Managing critical project situations?',                  group: 'Delivery & Performance' },
  { key: 'quality_speed',         label: 'Balances quality and speed effectively?',                group: 'Delivery & Performance' },
  { key: 'client_mgmt',           label: 'Management of client calls (needs intervention?)',       group: 'Client & Stakeholder' },
  { key: 'client_professional',   label: 'Handles client interactions professionally?',            group: 'Client & Stakeholder' },
  { key: 'proactive',             label: 'Proactive in proposing solutions and improvements?',     group: 'Client & Stakeholder' },
  { key: 'teamwork',              label: 'Teamwork & attitude',                                    group: 'Collaboration & Culture' },
  { key: 'ownership',             label: 'Ownership',                                              group: 'Collaboration & Culture' },
  { key: 'accountability',        label: 'Accountability',                                         group: 'Collaboration & Culture' },
  { key: 'independent',           label: 'Works independently as an IC / Lead?',                   group: 'Collaboration & Culture' },
  { key: 'professional_attitude', label: 'Demonstrates positive & professional attitude?',         group: 'Collaboration & Culture' },
  { key: 'team_morale',           label: 'Contributes positively to team morale & culture?',       group: 'Collaboration & Culture' },
  { key: 'innovation',            label: 'Innovation / goes the extra mile?',                      group: 'Growth & Skills' },
  { key: 'problem_solving',       label: 'Problem solving',                                        group: 'Growth & Skills' },
  { key: 'critical_thinking',     label: 'Critical thinking',                                      group: 'Growth & Skills' },
  { key: 'updating_skills',       label: 'Actively updating skills?',                              group: 'Growth & Skills' },
];

const GROUPS = ['Delivery & Performance', 'Client & Stakeholder', 'Collaboration & Culture', 'Growth & Skills'];

const RATING_OPTIONS = [
  { value: 'G'  as Rating, label: 'Good',      color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'VG' as Rating, label: 'Very Good', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'E'  as Rating, label: 'Excellent', color: 'bg-green-100 text-green-700 border-green-300' },
];

const MOOD_OPTIONS = [
  { value: 'Happy'     as Mood, emoji: '😊', label: 'Happy',     color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'Neutral'   as Mood, emoji: '😐', label: 'Neutral',   color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'Concerned' as Mood, emoji: '😟', label: 'Concerned', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'Stressed'  as Mood, emoji: '😰', label: 'Stressed',  color: 'bg-red-100 text-red-700 border-red-300' },
];

const SCORE_VAL: Record<string, number> = { G: 1, VG: 2, E: 3 };

function calcScore(form: Partial<MonthlyReview>): number | null {
  const vals = RATING_FIELDS
    .map(f => SCORE_VAL[(form[f.key] as string) ?? ''] ?? null)
    .filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function scoreColor(s: number | null) {
  if (s === null) return 'text-gray-400';
  if (s >= 2.5) return 'text-green-600';
  if (s >= 1.8) return 'text-blue-600';
  return 'text-orange-500';
}

function scoreLabel(s: number | null) {
  if (s === null) return '—';
  if (s >= 2.5) return 'Excellent';
  if (s >= 1.8) return 'Very Good';
  return 'Good';
}

function monthLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function emptyForm(): Partial<MonthlyReview> {
  return {
    manager_name: '', project: '', billable: true, mood: '' as Mood,
    role_fitment: '' as Rating, innovation: '' as Rating, delivery: '' as Rating,
    critical_situations: '' as Rating, client_mgmt: '' as Rating, teamwork: '' as Rating,
    ownership: '' as Rating, problem_solving: '' as Rating, client_professional: '' as Rating,
    accountability: '' as Rating, critical_thinking: '' as Rating, proactive: '' as Rating,
    independent: '' as Rating, quality_speed: '' as Rating, updating_skills: '' as Rating,
    professional_attitude: '' as Rating, team_morale: '' as Rating,
    targets: '', achievements: '', overall_feedback: '',
  };
}

// ─── Main Page ────────────────────────────────────────────────
const DETAILED_QUESTIONS = [
  { id: 'role_fitment', cat: '1. Technical Performance & Execution', label: 'Role Fitment', opts: ['Development Needed','Developing','Proficient','Advanced'] },
  { id: 'delivery', cat: '1. Technical Performance & Execution', label: 'Delivery & Commitments', opts: ['Rarely','Sometimes','Consistently','Always'] },
  { id: 'quality_speed', cat: '1. Technical Performance & Execution', label: 'Quality vs. Speed', opts: ['Struggles to Balance','Inconsistent','Effective Balance','Exceptional Balance'] },
  { id: 'skill_dev', cat: '1. Technical Performance & Execution', label: 'Skill Development', opts: ['Needs Improvement','Passive Learner','Proactive','Continuous Learner'] },
  { id: 'ownership', cat: '2. Professional Traits & Mindset', label: 'Ownership', opts: ['Good','Very Good','Excellent'] },
  { id: 'accountability', cat: '2. Professional Traits & Mindset', label: 'Accountability', opts: ['Good','Very Good','Excellent'] },
  { id: 'critical_thinking', cat: '2. Professional Traits & Mindset', label: 'Critical Thinking & Solution Proactivity', opts: ['Reactive','Occasionally Proactive','Highly Proactive'] },
  { id: 'innovation', cat: '2. Professional Traits & Mindset', label: 'Innovation & Going the Extra Mile', opts: ['Meets Expectations Only','Occasionally Steps Up','Consistently Goes the Extra Mile'] },
  { id: 'autonomy', cat: '3. Leadership & Autonomy', label: 'Autonomy (IC vs. Lead)', opts: ['High Supervision Needed','Moderate Supervision Needed','Independent'] },
  { id: 'critical_situations', cat: '3. Leadership & Autonomy', label: 'Managing Critical Project Situations', opts: ['Easily Overwhelmed','Stabilizes Gradually','Calm & Effective','Thrives Under Pressure'] },
  { id: 'client_mgmt', cat: '4. Client Interactions', label: 'Management of Client / Client Calls', opts: ['Needs Intervention','Needs Occasional Support','Independent Management','Trusted Advisor'] },
  { id: 'professionalism', cat: '4. Client Interactions', label: 'Professionalism in Client Interactions', opts: ['Needs Improvement','Generally Professional','Exemplary Professionalism'] },
  { id: 'attitude', cat: '5. Teamwork & Culture', label: 'Attitude & Behavior', opts: ['Needs Improvement','Professional','Highly Positive'] },
  { id: 'teamwork', cat: '5. Teamwork & Culture', label: 'Teamwork & Morale', opts: ['Detrimental','Neutral Participant','Positive Contributor','Culture Champion'] },
]

export default function PerformancePage() {
  const [employees,    setEmployees]    = useState<Employee[]>([]);
  const [selected,     setSelected]     = useState<Employee | null>(null);
  const [reviews,      setReviews]      = useState<MonthlyReview[]>([]);
  const [activeReview, setActiveReview] = useState<MonthlyReview | null>(null);
  const [mode,         setMode]         = useState<'history' | 'form'>('history');
  const [form,         setForm]         = useState<Partial<MonthlyReview>>(emptyForm());
  const [reviewTemplate, setReviewTemplate] = useState('standard')
  const [detailedData, setDetailedData]       = useState({})
  const [reviewMonth,  setReviewMonth]  = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    supabase.from('employees').select('*').eq('active', true)
      .in('status', ['Active', 'Contractor']).order('name')
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  const loadReviews = useCallback(async (empId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from('monthly_reviews').select('*')
      .eq('employee_id', empId)
      .order('review_month', { ascending: false });
    setReviews((data ?? []) as MonthlyReview[]);
    setLoading(false);
  }, []);

  function selectEmployee(emp: Employee) {
    setSelected(emp); setMode('history'); setActiveReview(null); loadReviews(emp.id);
  }

  async function startNewReview() {
    // Pre-populate targets from employee_targets table
    const { data: targetRow } = await supabase
      .from('employee_targets')
      .select('default_targets')
      .eq('employee_id', selected!.id)
      .maybeSingle();
    const defaultTargets = targetRow?.default_targets ?? '';
    setForm({ ...emptyForm(), review_month: reviewMonth, targets: defaultTargets });
    setActiveReview(null);
    setMode('form');
  }

  function editReview(r: MonthlyReview) {
    setForm({ ...r }); setReviewMonth(r.review_month); setActiveReview(r); setMode('form');
  }

  const setR = (key: keyof MonthlyReview) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  async function saveReview() {
    if (!selected) return;
    setSaving(true);
    const payload = { ...form, employee_id: selected.id, review_month: reviewMonth, score: calcScore(form) };
      review_template: reviewTemplate,
      detailed_data: reviewTemplate === 'detailed' ? detailedData : null,
    let result;
    if (activeReview) {
      ({ data: result } = await supabase.from('monthly_reviews').update(payload).eq('id', activeReview.id).select().single());
    } else {
      ({ data: result } = await supabase.from('monthly_reviews')
        .upsert(payload, { onConflict: 'employee_id,review_month' }).select().single());
    }
    if (result) {
      const r = result as MonthlyReview;
      setReviews(rs => rs.find(x => x.id === r.id) ? rs.map(x => x.id === r.id ? r : x) : [r, ...rs]);
      setActiveReview(r); setMode('history');
    }
    setSaving(false);
  }

  const filteredEmps = employees.filter(e => {
    const q = search.toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || (e.role ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Employee sidebar ── */}
      <div className="w-64 border-r bg-gray-50 flex flex-col shrink-0">
        <div className="p-3 border-b">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search employee…"
            className="w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white" />
        </div>
        <div className="overflow-auto flex-1">
          {filteredEmps.map(emp => (
            <button key={emp.id} onClick={() => selectEmployee(emp)}
              className={cn('w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white transition-colors border-b border-gray-100',
                selected?.id === emp.id ? 'bg-white border-l-2 border-l-blue-600' : '')}>
              <Avatar name={emp.name} photoUrl={emp.photo_url} size="sm" />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{emp.name}</div>
                <div className="text-xs text-gray-400 truncate">{emp.role}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main panel ── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-sm">Select an employee to view or add monthly reviews</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">

          {/* ── History panel ── */}
          <div className="w-72 border-r flex flex-col bg-white shrink-0">
            <div className="p-4 border-b">
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={selected.name} photoUrl={selected.photo_url} size="md" />
                <div>
                  <div className="font-semibold text-sm">{selected.name}</div>
                  <div className="text-xs text-gray-400">{selected.role}</div>
                </div>
              </div>
              <button onClick={startNewReview}
                className="w-full py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">
                + New Monthly Review
              </button>
            </div>

            <div className="text-xs font-semibold text-gray-400 px-4 py-2 uppercase tracking-wide">Review History</div>
            <div className="overflow-auto flex-1">
              {loading && <div className="p-4 text-sm text-gray-400">Loading…</div>}
              {!loading && reviews.length === 0 && (
                <div className="p-4 text-sm text-gray-400 text-center">No reviews yet.</div>
              )}
              {reviews.map(r => (
                <button key={r.id} onClick={() => { setActiveReview(r); setMode('history'); }}
                  className={cn('w-full text-left px-4 py-3 border-b hover:bg-blue-50 transition-colors',
                    activeReview?.id === r.id && mode === 'history' ? 'bg-blue-50 border-l-2 border-l-blue-600' : '')}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">{monthLabel(r.review_month)}</span>
                    <span className={cn('text-sm font-bold', scoreColor(r.score))}>{r.score?.toFixed(1) ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium',
                      r.score !== null
                        ? r.score >= 2.5 ? 'bg-green-50 text-green-600' : r.score >= 1.8 ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-500'
                        : 'text-gray-400')}>
                      {scoreLabel(r.score)}
                    </span>
                    {r.mood && <span className="text-sm">{MOOD_OPTIONS.find(m => m.value === r.mood)?.emoji}</span>}
                  </div>
                  {r.project && <div className="text-xs text-gray-400 mt-0.5 truncate">{r.project}</div>}
                </button>
              ))}
            </div>
          </div>

          {/* ── Detail / Form panel ── */}
          <div className="flex-1 overflow-auto">

            {/* Empty state */}
            {mode === 'history' && !activeReview && (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <div className="text-4xl mb-2">📅</div>
                  <p className="text-sm">Select a past review or click "+ New Monthly Review"</p>
                </div>
              </div>
            )}

            {/* ── Review detail (read-only) ── */}
            {mode === 'history' && activeReview && (
              <div className="p-6 max-w-3xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold">{monthLabel(activeReview.review_month)} Review</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{selected.name} · {activeReview.project ?? 'No project'} · Manager: {activeReview.manager_name ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={cn('text-3xl font-bold', scoreColor(activeReview.score))}>{activeReview.score?.toFixed(1) ?? '—'}</div>
                      <div className={cn('text-xs font-medium', scoreColor(activeReview.score))}>{scoreLabel(activeReview.score)}</div>
                    </div>
                    <button onClick={() => editReview(activeReview)}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">✏️ Edit</button>
                  </div>
                </div>

                {/* Meta row */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">Mood</div>
                    <div className="font-medium text-sm flex items-center gap-1">
                      {MOOD_OPTIONS.find(m => m.value === activeReview.mood)?.emoji} {activeReview.mood || '—'}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">Billable</div>
                    <div className="font-medium text-sm">{activeReview.billable ? '✅ Yes' : '❌ No'}</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">Score / 3.0</div>
                    <div className={cn('font-bold text-sm', scoreColor(activeReview.score))}>{activeReview.score?.toFixed(2) ?? '—'}</div>
                  </div>
                </div>

                {/* Ratings by group */}
                {GROUPS.map(group => {
                  const fields = RATING_FIELDS.filter(f => f.group === group);
                  return (
                    <div key={group} className="mb-5">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{group}</h3>
                      <div className="bg-white border rounded-xl overflow-hidden">
                        {fields.map((f, i) => {
                          const val = activeReview[f.key] as string;
                          const opt = RATING_OPTIONS.find(o => o.value === val);
                          return (
                            <div key={f.key} className={cn('flex items-center justify-between px-4 py-2.5 text-sm',
                              i < fields.length - 1 ? 'border-b' : '')}>
                              <span className="text-gray-700 pr-4 leading-snug">{f.label}</span>
                              {opt
                                ? <span className={cn('text-xs px-2.5 py-0.5 rounded-full font-semibold border shrink-0', opt.color)}>{opt.label}</span>
                                : <span className="text-gray-300 text-xs shrink-0">Not rated</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Targets & Achievements */}
                <div className="grid sm:grid-cols-2 gap-4 mb-5">
                  <div className="bg-blue-50 rounded-xl p-4">
                    <div className="text-xs font-semibold text-blue-600 mb-2 uppercase tracking-wide">🎯 Targets</div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{activeReview.targets || '—'}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4">
                    <div className="text-xs font-semibold text-green-600 mb-2 uppercase tracking-wide">🏆 Achievements</div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{activeReview.achievements || '—'}</p>
                  </div>
                </div>

                {activeReview.overall_feedback && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Overall Feedback</div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{activeReview.overall_feedback}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Review form ── */}
            {mode === 'form' && (
              <div className="p-6 max-w-3xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold">{activeReview ? 'Edit Review' : 'New Monthly Review'}</h2>
                    <p className="text-sm text-gray-500">{selected.name}</p>
                  </div>
                  <div className="text-center">
                    <div className={cn('text-2xl font-bold', scoreColor(calcScore(form)))}>{calcScore(form)?.toFixed(1) ?? '—'}</div>
                    <div className="text-xs text-gray-400">Live score / 3.0</div>
                  </div>
                </div>

                {/* Review meta */}
                <div className="bg-gray-50 rounded-xl p-4 mb-5">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Review Details</h3>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Review Month</label>
                      <input type="month" value={reviewMonth.slice(0, 7)}
                        onChange={e => setReviewMonth(e.target.value + '-01')}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white" />
                    </div>
              {/* Template Selector */}
              <div className="mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                <div className="text-xs font-semibold text-gray-600 mb-2">Review Template</div>
                <div className="flex gap-2">
                  {(['standard','detailed']).map(t => (
                    <button key={t} onClick={() => setReviewTemplate(t)}
                      className={`px-3 py-1.5 text-xs rounded-lg font-semibold border transition-colors ${reviewTemplate===t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                      {t === 'standard' ? '📋 Standard Review' : '🔍 Detailed Review Template'}
                    </button>
                  ))}
                </div>
              </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Manager Name</label>
                      <input value={form.manager_name ?? ''} onChange={e => setForm(f => ({ ...f, manager_name: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Project</label>
                      <input value={form.project ?? ''} onChange={e => setForm(f => ({ ...f, project: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer mt-3">
                    <input type="checkbox" checked={form.billable ?? true}
                      onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))}
                      className="w-4 h-4 rounded" />
                    Billable resource this month
                  </label>
                </div>

                {/* Mood */}
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Overall Mood / Pulse</h3>
                  <div className="flex gap-2 flex-wrap">
                    {MOOD_OPTIONS.map(m => (
                      <button key={m.value} onClick={() => setForm(f => ({ ...f, mood: m.value }))}
                        className={cn('px-4 py-2 rounded-xl text-sm font-medium border transition-all',
                          form.mood === m.value
                            ? m.color + ' ring-2 ring-offset-1 ring-blue-400'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400')}>
                        {m.emoji} {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rating groups */}
                {GROUPS.map(group => {
                  const fields = RATING_FIELDS.filter(f => f.group === group);
                  return (
                    <div key={group} className="mb-5">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{group}</h3>
                      <div className="bg-white border rounded-xl overflow-hidden">
                        {fields.map((f, i) => (
                          <div key={f.key} className={cn('px-4 py-3', i < fields.length - 1 ? 'border-b' : '')}>
                            <div className="text-sm text-gray-700 mb-2 leading-snug">{f.label}</div>
                            <div className="flex gap-2 flex-wrap">
                              {RATING_OPTIONS.map(opt => (
                                <button key={opt.value} onClick={() => setR(f.key)(opt.value)}
                                  className={cn('px-3 py-1 text-xs rounded-full border font-medium transition-all',
                                    form[f.key] === opt.value
                                      ? opt.color + ' ring-2 ring-offset-1 ring-blue-300'
                                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400')}>
                                  {opt.label}
                                </button>
                              ))}
                              {form[f.key] && (
                                <button onClick={() => setR(f.key)('')}
                                  className="text-xs text-gray-300 hover:text-red-400 transition-colors">✕ clear</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Targets & Achievements */}
                <div className="grid sm:grid-cols-2 gap-4 mb-5">
                  <div>
                    <label className="text-xs font-semibold text-blue-600 mb-1 block">🎯 Targets (this month)</label>
                    <textarea rows={4} value={form.targets ?? ''}
                      onChange={e => setForm(f => ({ ...f, targets: e.target.value }))}
                      placeholder="What were the agreed targets for this period?"
                      className="w-full px-3 py-2 text-sm border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-400 resize-none bg-blue-50" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-green-600 mb-1 block">🏆 Achievements</label>
                    <textarea rows={4} value={form.achievements ?? ''}
                      onChange={e => setForm(f => ({ ...f, achievements: e.target.value }))}
                      placeholder="What did the employee achieve against those targets?"
                      className="w-full px-3 py-2 text-sm border border-green-200 rounded-xl focus:ring-2 focus:ring-blue-400 resize-none bg-green-50" />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Overall Feedback (Strengths / Improvements)</label>
              {/* Detailed Review Template Questions */}
              {reviewTemplate === 'detailed' && (
                  <div className="mb-4 space-y-4 border border-indigo-100 rounded-xl p-4 bg-indigo-50">
                    <div className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">Detailed Review Template</div>
                    {['1. Technical Performance & Execution','2. Professional Traits & Mindset','3. Leadership & Autonomy','4. Client Interactions','5. Teamwork & Culture'].map(cat => (
                      <div key={cat} className="mb-4">
                        <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide border-b border-indigo-100 pb-1">{cat}</div>
                        {DETAILED_QUESTIONS.filter(q => q.cat === cat).map(q => (
                          <div key={q.id} className="mb-3">
                            <label className="text-xs font-medium text-gray-700 mb-1 block">{q.label}</label>
                            <select value={detailedData[q.id] || ''} onChange={e => setDetailedData(d => ({ ...d, [q.id]: e.target.value }))}
                              className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-400 bg-white">
                              <option value="">Select…</option>
                              {q.opts.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                  <textarea rows={4} value={form.overall_feedback ?? ''}
                    onChange={e => setForm(f => ({ ...f, overall_feedback: e.target.value }))}
                    placeholder="Summarise strengths, areas for improvement, and any other notes…"
                    className="w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-blue-400 resize-none" />
                </div>

                <div className="flex gap-3 pb-8">
                  <button onClick={saveReview} disabled={saving}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {saving ? 'Saving…' : '✓ Save Review'}
                  </button>
                  <button onClick={() => setMode('history')}
                    className="px-5 py-2.5 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
