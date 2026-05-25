import { supabase } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { formatDate, getDeptColor, isVisaExpiringSoon, tenureYears } from '@/lib/utils';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import HrChat from '@/components/HrChat';

export const revalidate = 0;

async function getLoggedInName(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const serverSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user?.email) return null;
    return user.email.split('@')[0].split('.').map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  } catch { return null; }
}

function getNextBirthday(birthdayStr: string): Date {
  const bd  = new Date(birthdayStr + 'T00:00:00');
  const tod = new Date(); tod.setHours(0, 0, 0, 0);
  const next = new Date(tod.getFullYear(), bd.getMonth(), bd.getDate());
  if (next < tod) next.setFullYear(tod.getFullYear() + 1);
  return next;
}

async function getStats() {
  const [{ data: activeData }, { data: allData }] = await Promise.all([
    supabase.from('employees').select('*').eq('active', true),
    supabase.from('employees').select('id,active,status,region,joined,visa_expiry,visa,location,wfo,name,role,photo_url,dept'),
  ]);
  const all      = activeData ?? [];
  const everyone = allData ?? [];

  const inactive = everyone.filter(e =>
    e.active === false ||
    e.status === 'Ex-Employee' ||
    e.status === 'Ex-Contractor'
  );

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

  // Upcoming birthdays — next 30 days among active employees
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcomingBirthdays = all
    .filter(e => (e as never as {birthday:string|null}).birthday)
    .map(e => {
      const next = getNextBirthday((e as never as {birthday:string}).birthday);
      const days = Math.round((next.getTime() - today.getTime()) / 86400000);
      return { ...e, _bdayDays: days, _nextBday: next };
    })
    .filter(e => e._bdayDays <= 30)
    .sort((a, b) => a._bdayDays - b._bdayDays);

  return { all, inactive, india, uscan, newJoin, visaAlerts, deptCounts, recentJoiners, upcomingBirthdays };
}

export default async function DashboardPage() {
  const [{ all, inactive, india, uscan, newJoin, visaAlerts, deptCounts, recentJoiners, upcomingBirthdays }, loggedInName] =
    await Promise.all([getStats(), getLoggedInName()]);

  const stats = [
    { label: 'Active Headcount',  value: all.length,         color: '#1e88e5', href: '/dossier?status=Active'      },
    { label: 'Inactive / Alumni', value: inactive.length,    color: '#78909c', href: '/dossier?status=Ex-Employee' },
    { label: 'India Team',        value: india.length,       color: '#43a047', href: '/dossier?region=India'       },
    { label: 'US / Canada Team',  value: uscan.length,       color: '#9c27b0', href: '/dossier?region=USA'         },
    { label: 'Contractors',       value: all.filter(e => (e as never as {type:string}).type === 'Contractor' || e.status === 'Contractor').length, color: '#fb8c00', href: '/dossier?status=Contractor' },
    { label: 'Visa Alerts',       value: visaAlerts.length,  color: '#e53935', href: '/dossier'                    },
  ];

  const deptEntries = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]);
  const maxDept = Math.max(...deptEntries.map(d => d[1]), 1);

  return (
    <div className="p-8">
      {/* Welcome */}
      <div className="mb-6 bg-gradient-to-r from-[#0f1e3d] to-[#1a3a6b] rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            👋 Welcome back{loggedInName ? `, ${loggedInName}` : ''}
          </h1>
          <p className="text-white/70 text-sm">
            Simpliigence HR Portal · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {loggedInName && (
          <div className="hidden sm:flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2">
            <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-sm font-bold">
              {loggedInName.split(' ').map((p: string) => p[0]).join('').slice(0,2)}
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">{loggedInName}</div>
              <div className="text-xs text-white/60">HR Admin</div>
            </div>
          </div>
        )}
      </div>

      {/* Today's birthday banner */}
      {upcomingBirthdays.filter(e => e._bdayDays === 0).map(e => (
        <div key={e.id} className="mb-4 flex items-center gap-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-2xl px-5 py-4 shadow-md">
          <span className="text-4xl">🎂</span>
          <div>
            <p className="font-bold text-lg leading-tight">Happy Birthday, {e.name.split(' ')[0]}!</p>
            <p className="text-pink-100 text-sm">{e.role} · {e.location} — Wishing them a wonderful day 🎉</p>
          </div>
        </div>
      ))}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
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

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
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

        {/* Birthday widget */}
        <div className={`bg-white rounded-xl shadow-sm p-5 ${upcomingBirthdays.some(e => e._bdayDays === 0) ? 'border-l-4 border-pink-400' : upcomingBirthdays.length > 0 ? 'border-l-4 border-yellow-300' : ''}`}>
          <h2 className="font-semibold text-gray-800 mb-4">🎂 Upcoming Birthdays</h2>
          {upcomingBirthdays.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No birthdays in the next 30 days.<br/><span className="text-xs">Add dates of birth in HR Dossier → Edit employee.</span></p>
          ) : (
            <div className="space-y-3">
              {upcomingBirthdays.map(e => {
                const days = e._bdayDays;
                const isToday = days === 0;
                const isTomorrow = days === 1;
                const dateLabel = isToday ? '🎂 Today!' : isTomorrow ? '🎈 Tomorrow' : days <= 7 ? `🎉 In ${days} days` : e._nextBday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                return (
                  <div key={e.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isToday ? 'bg-pink-50 border border-pink-200' : isTomorrow ? 'bg-yellow-50' : ''}`}>
                    <Avatar name={e.name} photoUrl={e.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{e.name}</div>
                      <div className="text-xs text-gray-500">{e.role} · {e.location}</div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${
                      isToday    ? 'bg-pink-100 text-pink-700' :
                      isTomorrow ? 'bg-yellow-100 text-yellow-700' :
                      days <= 7  ? 'bg-blue-100 text-blue-700' :
                                   'bg-gray-100 text-gray-600'}`}>
                      {dateLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Region split */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Region / Work Mode</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'India',      value: india.length,                              color: '#43a047' },
              { label: 'US / Canada', value: uscan.length,                             color: '#9c27b0' },
              { label: 'WFH',        value: all.filter(e => e.wfo === 'WFH').length,   color: '#1e88e5' },
              { label: 'WFO',        value: all.filter(e => e.wfo === 'WFO').length,   color: '#fb8c00' },
            ].map(s => (
              <div key={s.label} className="rounded-lg p-3 text-center" style={{ background: s.color + '15' }}>
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs text-gray-600 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Chat */}
      <HrChat />
    </div>
  );
}
