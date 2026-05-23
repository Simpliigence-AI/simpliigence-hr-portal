import { supabase } from '@/lib/supabase';
import { formatDate, getDeptColor, isVisaExpiringSoon, tenureYears } from '@/lib/utils';
import Link from 'next/link';
import Avatar from '@/components/Avatar';

export const revalidate = 60;

async function getStats() {
  const { data: employees } = await supabase.from('employees').select('*').eq('active', true);
  const all = employees ?? [];

  const now     = new Date();
  const ago90   = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const india   = all.filter(e => e.region === 'India');
  const uscan   = all.filter(e => e.region !== 'India');
  const newJoin = all.filter(e => e.joined && new Date(e.joined) >= ago90);
  const visaAlerts = all.filter(e => isVisaExpiringSoon(e.visa_expiry));

  const deptCounts: Record<string, number> = {};
  for (const e of all) {
    deptCounts[e.dept ?? 'Other'] = (deptCounts[e.dept ?? 'Other'] ?? 0) + 1;
  }

  const recentJoiners = [...all]
    .filter(e => e.joined)
    .sort((a, b) => new Date(b.joined!).getTime() - new Date(a.joined!).getTime())
    .slice(0, 8);

  return { all, india, uscan, newJoin, visaAlerts, deptCounts, recentJoiners };
}

export default async function DashboardPage() {
  const { all, india, uscan, newJoin, visaAlerts, deptCounts, recentJoiners } = await getStats();

  const stats = [
    { label: 'Total Headcount',  value: all.length,         color: '#1e88e5', href: '/dossier'    },
    { label: 'India FTEs',       value: india.length,       color: '#43a047', href: '/dossier?region=India' },
    { label: 'US / Canada Team', value: uscan.length,       color: '#9c27b0', href: '/dossier?region=USA'   },
    { label: 'New Joiners (90d)',  value: newJoin.length,   color: '#fb8c00', href: '/onboarding' },
    { label: 'Visa Alerts (90d)', value: visaAlerts.length, color: '#e53935', href: '/dossier'    },
  ];

  const deptEntries = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]);
  const maxDept = Math.max(...deptEntries.map(d => d[1]));

  return (
    <div className="p-8">
      {/* Welcome */}
      <div className="mb-8 bg-gradient-to-r from-[#0f1e3d] to-[#1a3a6b] rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-1">👋 Welcome back, Raghu</h1>
        <p className="text-white/70 text-sm">
          Simpliigence HR Portal · {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map(s => (
          <Link key={s.label} href={s.href}
            className="bg-white rounded-xl p-4 border-t-4 shadow-sm hover:shadow-md transition-shadow"
            style={{ borderTopColor: s.color }}
          >
            <div className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Department breakdown */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Department Breakdown</h2>
          <div className="space-y-3">
            {deptEntries.map(([dept, count]) => (
              <div key={dept}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{dept}</span>
                  <span className="text-gray-500">{count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${(count / maxDept) * 100}%`, backgroundColor: getDeptColor(dept) }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent joiners */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Recent Joiners</h2>
          <div className="space-y-3">
            {recentJoiners.map(e => (
              <div key={e.id} className="flex items-center gap-3">
                <Avatar name={e.name} photoUrl={e.photo_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.name}</div>
                  <div className="text-xs text-gray-500">{e.role} · {e.location}</div>
                </div>
                <div className="text-xs text-gray-400 shrink-0">{formatDate(e.joined)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Visa tracker */}
        {visaAlerts.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-red-400">
            <h2 className="font-semibold text-gray-800 mb-4">⚠️ Visa / Work Auth Alerts</h2>
            <div className="space-y-3">
              {visaAlerts.map(e => (
                <div key={e.id} className="flex items-center gap-3">
                  <Avatar name={e.name} photoUrl={e.photo_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{e.name}</div>
                    <div className="text-xs text-gray-500">{e.visa} · {e.location}</div>
                  </div>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    Exp: {formatDate(e.visa_expiry)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Region split */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Region / Work Mode</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'India', value: india.length, color: '#43a047' },
              { label: 'US / Canada', value: uscan.length, color: '#9c27b0' },
              { label: 'WFH', value: all.filter(e => e.wfo === 'WFH').length, color: '#1e88e5' },
              { label: 'WFO', value: all.filter(e => e.wfo === 'WFO').length, color: '#fb8c00' },
            ].map(s => (
              <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: s.color + '15' }}>
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs text-gray-600 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
