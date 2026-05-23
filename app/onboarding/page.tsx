'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Employee, OnboardingChecklist } from '@/lib/database.types';
import { formatDate, cn } from '@/lib/utils';
import Avatar from '@/components/Avatar';

const CHECKLIST_TEMPLATE = [
  { category: 'Pre-Joining',   items: ['Offer letter issued','Background verification initiated','System access requested','Equipment arranged','Welcome email sent'] },
  { category: 'Day 1',         items: ['ID card issued','System login provided','Email account activated','Company overview presentation','Buddy assigned'] },
  { category: 'Week 1',        items: ['Induction completed','HR policies briefed','Department introduction','Reporting manager 1-on-1','Tools & systems training'] },
  { category: 'Month 1',       items: ['30-day check-in with manager','Zoho People profile completed','Timesheet compliance verified','First task/project assigned','Performance goals set'] },
  { category: 'Documentation', items: ['Employment contract signed','I-9 / Work authorization docs','Bank account details','Emergency contact form','NDA/confidentiality agreement','BGV report received'] },
];

interface HireWithChecklist { employee: Employee; checklist: OnboardingChecklist[]; }

export default function OnboardingPage() {
  const [hires,    setHires]    = useState<HireWithChecklist[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const ago90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: emps } = await supabase.from('employees').select('*').eq('active', true).gte('joined', ago90).order('joined', { ascending: false });
    const empIds = (emps ?? []).map(e => e.id);

    let checklist: OnboardingChecklist[] = [];
    if (empIds.length > 0) {
      const { data } = await supabase.from('onboarding_checklists').select('*').in('employee_id', empIds);
      checklist = data ?? [];
    }

    // For employees without checklists, seed them
    const missing = (emps ?? []).filter(e => !checklist.some(c => c.employee_id === e.id));
    if (missing.length > 0) {
      const rows = missing.flatMap(e =>
        CHECKLIST_TEMPLATE.flatMap(t => t.items.map(item => ({
          employee_id: e.id, category: t.category, item, completed: false,
        })))
      );
      const { data: inserted } = await supabase.from('onboarding_checklists').insert(rows).select();
      checklist = [...checklist, ...(inserted ?? [])];
    }

    const result: HireWithChecklist[] = (emps ?? []).map(e => ({
      employee: e,
      checklist: checklist.filter(c => c.employee_id === e.id),
    }));
    setHires(result);
    if (result.length > 0) setSelected(result[0].employee.id);
    setLoading(false);
  }

  async function toggleItem(id: string, completed: boolean) {
    await supabase.from('onboarding_checklists').update({ completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', id);
    setHires(hs => hs.map(h => ({
      ...h,
      checklist: h.checklist.map(c => c.id === id ? { ...c, completed, completed_at: completed ? new Date().toISOString() : null } : c),
    })));
  }

  const current = hires.find(h => h.employee.id === selected);
  const progress = current
    ? Math.round((current.checklist.filter(c => c.completed).length / (current.checklist.length || 1)) * 100)
    : 0;

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading onboarding data…</div>;

  return (
    <div className="p-6 flex gap-6 h-full">
      {/* Left panel */}
      <div className="w-72 shrink-0 space-y-2">
        <h2 className="font-semibold text-gray-700 mb-3">Active Onboardings ({hires.length})</h2>
        {hires.length === 0 && <div className="text-sm text-gray-400">No joiners in the last 90 days.</div>}
        {hires.map(h => {
          const done = h.checklist.filter(c => c.completed).length;
          const total = h.checklist.length;
          const pct = Math.round((done / (total || 1)) * 100);
          return (
            <div key={h.employee.id} onClick={() => setSelected(h.employee.id)}
              className={cn('bg-white rounded-xl p-3 cursor-pointer border-2 transition-all',
                selected === h.employee.id ? 'border-blue-500 shadow-md' : 'border-transparent hover:border-blue-200')}>
              <div className="flex items-center gap-2 mb-2">
                <Avatar name={h.employee.name} photoUrl={h.employee.photo_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{h.employee.name}</div>
                  <div className="text-xs text-gray-400">{h.employee.role}</div>
                </div>
                <span className="text-xs font-bold" style={{ color: pct === 100 ? '#43a047' : '#1e88e5' }}>{pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full">
                <div className="h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#43a047' : '#1e88e5' }} />
              </div>
              <div className="text-xs text-gray-400 mt-1">Joined: {formatDate(h.employee.joined)}</div>
            </div>
          );
        })}
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-auto">
        {current ? (
          <>
            <div className="flex items-center gap-4 mb-6">
              <Avatar name={current.employee.name} photoUrl={current.employee.photo_url} size="lg" />
              <div>
                <h1 className="text-xl font-bold">{current.employee.name}</h1>
                <p className="text-sm text-gray-500">{current.employee.role} · {current.employee.location}</p>
              </div>
              <div className="ml-auto text-right">
                <div className="text-3xl font-bold" style={{ color: progress === 100 ? '#43a047' : '#1e88e5' }}>{progress}%</div>
                <div className="text-xs text-gray-400">complete</div>
              </div>
            </div>

            <div className="space-y-4">
              {CHECKLIST_TEMPLATE.map(t => {
                const items = current.checklist.filter(c => c.category === t.category);
                const done  = items.filter(c => c.completed).length;
                return (
                  <div key={t.category} className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-800">{t.category}</h3>
                      <span className="text-xs text-gray-400">{done}/{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map(item => (
                        <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                          <input type="checkbox" checked={item.completed}
                            onChange={e => toggleItem(item.id, e.target.checked)}
                            className="w-4 h-4 rounded accent-blue-600" />
                          <span className={cn('text-sm', item.completed ? 'line-through text-gray-400' : 'text-gray-700')}>
                            {item.item}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-gray-400 text-sm">Select a hire to view their onboarding checklist.</div>
        )}
      </div>
    </div>
  );
}
