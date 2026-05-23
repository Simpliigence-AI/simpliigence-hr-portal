export function getAvatarColor(name: string): string {
  const colors = [
    '#e53935','#8e24aa','#1e88e5','#00897b','#f4511e',
    '#039be5','#7cb342','#fb8c00','#6d4c41','#546e7a',
    '#d81b60','#3949ab','#00acc1','#43a047','#f6bf26',
  ];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
  return colors[Math.abs(hash) % colors.length];
}

export function getDeptColor(dept: string): string {
  const map: Record<string, string> = {
    Delivery:    '#1e88e5',
    HR:          '#e91e63',
    Finance:     '#43a047',
    Sales:       '#fb8c00',
    Marketing:   '#9c27b0',
    Operations:  '#00897b',
    'Talent Mgmt': '#f4511e',
    Leadership:  '#3949ab',
  };
  return map[dept] ?? '#607d8b';
}

export function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

export function tenureYears(joinDate: string | null): string {
  if (!joinDate) return '';
  const ms = Date.now() - new Date(joinDate).getTime();
  const yrs = ms / (1000 * 60 * 60 * 24 * 365.25);
  if (yrs < 1) return `${Math.floor(yrs * 12)} mo`;
  return `${yrs.toFixed(1)} yrs`;
}

export function isVisaExpiringSoon(expiry: string | null, days = 90): boolean {
  if (!expiry) return false;
  return (new Date(expiry).getTime() - Date.now()) < days * 24 * 60 * 60 * 1000;
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
