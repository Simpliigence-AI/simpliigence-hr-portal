'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getDeptColor } from '@/lib/utils';

// ── City coordinate lookup ─────────────────────────────────────
const CITY_COORDS: Record<string, [number, number]> = {
  // India
  'bangalore':   [12.9716,  77.5946],
  'bengaluru':   [12.9716,  77.5946],
  'hyderabad':   [17.3850,  78.4867],
  'pune':        [18.5204,  73.8567],
  'mumbai':      [19.0760,  72.8777],
  'chennai':     [13.0827,  80.2707],
  'delhi':       [28.6139,  77.2090],
  'new delhi':   [28.6139,  77.2090],
  'noida':       [28.5355,  77.3910],
  'gurgaon':     [28.4595,  77.0266],
  'gurugram':    [28.4595,  77.0266],
  'kolkata':     [22.5726,  88.3639],
  'ahmedabad':   [23.0225,  72.5714],
  'kochi':       [ 9.9312,  76.2673],
  'trivandrum':  [ 8.5241,  76.9366],
  'coimbatore':  [11.0168,  76.9558],
  // USA
  'old bridge':  [40.4171, -74.2582],
  'new jersey':  [40.0583, -74.4057],
  'nj':          [40.0583, -74.4057],
  'new york':    [40.7128, -74.0060],
  'nyc':         [40.7128, -74.0060],
  'san francisco':[37.7749,-122.4194],
  'sf':          [37.7749,-122.4194],
  'chicago':     [41.8781, -87.6298],
  'seattle':     [47.6062,-122.3321],
  'boston':      [42.3601, -71.0589],
  'austin':      [30.2672, -97.7431],
  'dallas':      [32.7767, -96.7970],
  'miami':       [25.7617, -80.1918],
  'atlanta':     [33.7490, -84.3880],
  'houston':     [29.7604, -95.3698],
  'los angeles': [34.0522,-118.2437],
  'la':          [34.0522,-118.2437],
  'washington':  [38.9072, -77.0369],
  'dc':          [38.9072, -77.0369],
  'denver':      [39.7392,-104.9903],
  'phoenix':     [33.4484,-112.0740],
  'minneapolis': [44.9778, -93.2650],
  // Canada
  'toronto':     [43.6532, -79.3832],
  'ontario':     [43.6532, -79.3832],
  'vancouver':   [49.2827,-123.1207],
  'calgary':     [51.0447,-114.0719],
  'montreal':    [45.5017, -73.5673],
  'ottawa':      [45.4215, -75.6972],
  // UK / Europe
  'london':      [51.5074,  -0.1278],
  'manchester':  [53.4808,  -2.2426],
  // Asia-Pacific
  'singapore':   [ 1.3521, 103.8198],
  'sydney':      [-33.8688, 151.2093],
  'dubai':       [25.2048,  55.2708],
};

function resolveLocation(location: string | null): { coords: [number, number]; label: string } | null {
  if (!location) return null;
  const lower = location.toLowerCase().trim();
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (lower === city || lower.startsWith(city) || lower.includes(city)) {
      return { coords, label: location };
    }
  }
  return null;
}

interface Employee {
  id: string; name: string; role?: string | null; dept?: string | null;
  location?: string | null; region?: string | null; status?: string | null;
  active?: boolean | null;
}

interface PinGroup {
  coords:    [number, number];
  label:     string;
  region:    string;
  employees: Employee[];
}

const REGION_COLOR: Record<string, string> = {
  'India':   '#f97316',
  'USA':     '#3b82f6',
  'Canada':  '#22c55e',
};
function regionColor(r: string) { return REGION_COLOR[r] ?? '#a855f7'; }

// ── Page ───────────────────────────────────────────────────────
export default function MapPage() {
  const mapDiv      = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<{ remove: () => void } | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [unmapped,  setUnmapped]  = useState<string[]>([]);

  // ── Fetch employees ────────────────────────────────────────
  useEffect(() => {
    supabase.from('employees')
      .select('id,name,role,dept,location,region,active,status')
      .then(({ data }) => { setEmployees((data ?? []) as Employee[]); setLoading(false); });
  }, []);

  // ── Build map once employees loaded ────────────────────────
  useEffect(() => {
    if (loading || !mapDiv.current) return;

    function buildMap() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;
      if (!L || !mapDiv.current) return;

      // Destroy previous instance
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }

      const map = L.map(mapDiv.current, { center: [20, 10], zoom: 2, minZoom: 2, maxZoom: 12 });
      mapInstance.current = map;

      // CartoDB dark tiles — no API key required
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
        subdomains:  'abcd',
        maxZoom: 19,
      }).addTo(map);

      // Force Leaflet to recalculate tile grid after React finishes rendering
      setTimeout(() => map.invalidateSize(), 250);

      // Group by resolved coordinates
      const groupMap = new Map<string, PinGroup>();
      const noCoords: string[] = [];

      for (const emp of employees) {
        const resolved = resolveLocation(emp.location);
        if (!resolved) {
          if (emp.location && !noCoords.includes(emp.location)) noCoords.push(emp.location);
          continue;
        }
        const key = resolved.coords.join(',');
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            coords:    resolved.coords,
            label:     resolved.label,
            region:    emp.region ?? 'Unknown',
            employees: [],
          });
        }
        groupMap.get(key)!.employees.push(emp);
      }

      setUnmapped(noCoords);

      // Draw markers
      for (const group of groupMap.values()) {
        const n      = group.employees.length;
        const color  = regionColor(group.region);
        const radius = Math.max(14, Math.min(42, 14 + n * 5));

        const marker = L.circleMarker(group.coords, {
          radius, fillColor: color, color: '#fff',
          weight: 2.5, opacity: 1, fillOpacity: 0.85,
        }).addTo(map);

        // Count label
        const icon = L.divIcon({
          html:      `<span style="font-size:11px;font-weight:700;color:white;line-height:1">${n}</span>`,
          className: '',
          iconSize:  [radius * 2, radius * 2],
          iconAnchor:[radius, radius],
        });
        L.marker(group.coords, { icon, interactive: false }).addTo(map);

        // Hover tooltip
        marker.bindTooltip(
          `<strong>${group.label}</strong> — ${n} employee${n !== 1 ? 's' : ''}`,
          { sticky: true, className: 'leaflet-tooltip-custom' }
        );

        // Click popup with employee list
        const rows = group.employees.map(e => {
          const initials  = e.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
          const deptColor = getDeptColor(e.dept ?? '');
          return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f3f4f6">
            <div style="width:28px;height:28px;border-radius:50%;background:${deptColor};display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:700;flex-shrink:0">${initials}</div>
            <div>
              <div style="font-size:13px;font-weight:600;color:#111">${e.name}</div>
              <div style="font-size:11px;color:#6b7280">${e.role ?? '—'} · <span style="background:${deptColor}20;color:${deptColor};padding:1px 5px;border-radius:8px;font-size:10px">${e.dept ?? '—'}</span></div>
            </div>
          </div>`;
        }).join('');

        marker.bindPopup(`
          <div style="font-family:-apple-system,sans-serif;min-width:240px">
            <div style="font-weight:700;font-size:14px;padding-bottom:8px;margin-bottom:6px;border-bottom:2px solid ${color};display:flex;align-items:center;gap:8px">
              <span style="background:${color};color:white;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${n}</span>
              ${group.label}
            </div>
            <div style="max-height:240px;overflow-y:auto">${rows}</div>
          </div>
        `, { maxWidth: 300, className: 'leaflet-popup-custom' });
      }
    }

    // Load or re-use Leaflet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).L) {
      buildMap();
    } else {
      const script  = document.createElement('script');
      script.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => buildMap();
      document.body.appendChild(script);
    }

    return () => {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, loading]);

  // ── Stats ──────────────────────────────────────────────────
  const active  = employees.filter(e => e.active !== false && e.status !== 'Ex-Employee');
  const india   = active.filter(e => e.region === 'India');
  const usa     = active.filter(e => e.region === 'USA');
  const canada  = active.filter(e => e.region === 'Canada');
  const cities  = new Set(active.map(e => resolveLocation(e.location)?.coords.join(',')).filter(Boolean)).size;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 0px)' }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-3 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">🌍 World Map</h1>
        <p className="text-sm text-gray-500 mt-0.5">Employees across {cities} office location{cities !== 1 ? 's' : ''}</p>
      </div>

      {/* Stat chips */}
      <div className="px-6 pb-4 shrink-0 flex flex-wrap gap-3">
        {[
          { label: 'Total Active', value: active.length, color: '#1e88e5' },
          { label: 'India',        value: india.length,  color: '#f97316' },
          { label: 'USA',          value: usa.length,    color: '#3b82f6' },
          { label: 'Canada',       value: canada.length, color: '#22c55e' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl px-4 py-2.5 shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <div>
              <div className="text-xl font-bold leading-none" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
        <div className="bg-white rounded-xl px-4 py-2.5 shadow-sm border border-gray-100 flex items-center gap-3 text-xs text-gray-500">
          <span className="font-semibold text-gray-600">Legend:</span>
          {Object.entries(REGION_COLOR).map(([r, c]) => (
            <span key={r} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: c }} />{r}
            </span>
          ))}
        </div>
      </div>

      {/* Map container — explicit height so Leaflet never gets 0px */}
      <div className="px-6 pb-5 shrink-0" style={{ height: 'calc(100vh - 210px)' }}>
        <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-xl border border-gray-200">
          {loading && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center z-10">
              <div className="text-white/70 text-sm animate-pulse">Loading employee data…</div>
            </div>
          )}
          <div ref={mapDiv} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      {/* Unmapped warning */}
      {unmapped.length > 0 && (
        <div className="px-6 pb-4 shrink-0">
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            ⚠️ <strong>{unmapped.length}</strong> location{unmapped.length > 1 ? 's' : ''} couldn't be mapped: <em>{unmapped.join(', ')}</em>.
            Update those employees' location field to a recognisable city name.
          </div>
        </div>
      )}

      {/* Leaflet popup/tooltip custom styles */}
      <style>{`
        .leaflet-tooltip-custom {
          background: #1f2937; color: white; border: none;
          border-radius: 8px; padding: 4px 10px; font-size: 12px; font-weight: 500;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .leaflet-tooltip-custom::before { display: none; }
        .leaflet-popup-content-wrapper { border-radius: 12px !important; box-shadow: 0 8px 24px rgba(0,0,0,0.15) !important; }
        .leaflet-popup-content { margin: 12px 14px !important; }
      `}</style>
    </div>
  );
}
