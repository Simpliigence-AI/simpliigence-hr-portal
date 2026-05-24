'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/* ── City coordinate table  [lat, lng] ─────────────────────────── */
const CITY_COORDS: Record<string, [number, number]> = {
  // India
  'bangalore':    [12.9716,  77.5946], 'bengaluru': [12.9716, 77.5946],
  'hyderabad':    [17.3850,  78.4867], 'pune':      [18.5204, 73.8567],
  'mumbai':       [19.0760,  72.8777], 'chennai':   [13.0827, 80.2707],
  'delhi':        [28.6139,  77.2090], 'new delhi': [28.6139, 77.2090],
  'noida':        [28.5355,  77.3910], 'gurgaon':   [28.4595, 77.0266],
  'gurugram':     [28.4595,  77.0266], 'kolkata':   [22.5726, 88.3639],
  'ahmedabad':    [23.0225,  72.5714], 'kochi':     [ 9.9312, 76.2673],
  'trivandrum':   [ 8.5241,  76.9366], 'coimbatore':[11.0168, 76.9558],
  // USA
  'old bridge':   [40.4171, -74.2582], 'monroe':    [40.3260, -74.4190],
  'new jersey':   [40.0583, -74.4057], 'harrison':  [40.7440, -74.1549],
  'jersey city':  [40.7178, -74.0431], 'mount laurel':[39.9540,-74.9052],
  'somerville':   [40.5735, -74.6099], 'trumbull':  [41.2429, -73.2007],
  'charlotte':    [35.2271, -80.8431], 'irving':    [32.8141, -96.9488],
  'dallas':       [32.7767, -96.7970], 'denver':    [39.7392,-104.9903],
  'san diego':    [32.7157,-117.1611], 'new york':  [40.7128, -74.0060],
  'nyc':          [40.7128, -74.0060], 'albany':    [42.6526, -73.7562],
  'ohio':         [40.4173, -82.9071], 'philadelphia':[39.9526,-75.1652],
  'wake forest':  [35.9799, -78.5097], 'downingtown':[40.0071,-75.7027],
  'san francisco':[37.7749,-122.4194], 'seattle':   [47.6062,-122.3321],
  'boston':       [42.3601, -71.0589], 'austin':    [30.2672, -97.7431],
  'miami':        [25.7617, -80.1918], 'atlanta':   [33.7490, -84.3880],
  'houston':      [29.7604, -95.3698], 'los angeles':[34.0522,-118.2437],
  'washington':   [38.9072, -77.0369], 'dc':        [38.9072, -77.0369],
  // Canada
  'toronto':      [43.6532, -79.3832], 'ontario':   [43.6532, -79.3832],
  'vancouver':    [49.2827,-123.1207], 'calgary':   [51.0447,-114.0719],
  'montreal':     [45.5017, -73.5673], 'ottawa':    [45.4215, -75.6972],
  // Other
  'london':       [51.5074,  -0.1278], 'singapore': [ 1.3521, 103.8198],
  'sydney':       [-33.8688, 151.2093],'dubai':     [25.2048,  55.2708],
};

function resolveLocation(loc: string | null): { coords: [number,number]; label: string } | null {
  if (!loc) return null;
  const lower = loc.toLowerCase().trim();
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (lower === city || lower.startsWith(city + ',') || lower.startsWith(city + ' ') || lower.includes(city))
      return { coords, label: loc };
  }
  return null;
}

function ll2px(lat: number, lng: number, W: number, H: number): [number, number] {
  return [(lng + 180) / 360 * W, (90 - lat) / 180 * H];
}

interface Employee {
  id: string; name: string; role?: string|null; dept?: string|null;
  location?: string|null; region?: string|null; status?: string|null; active?: boolean|null;
}
interface PinGroup { coords:[number,number]; label:string; region:string; employees:Employee[]; }

const RC: Record<string,string> = { India:'#f97316', USA:'#3b82f6', Canada:'#22c55e' };
const regionColor = (r: string) => RC[r] ?? '#a855f7';

/* ── GeoJSON cache so we don't re-fetch on every resize ─────────── */
let geoCache: { features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] } | null = null;
async function getGeo() {
  if (geoCache) return geoCache;
  const res = await fetch('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_land.geojson');
  geoCache = await res.json();
  return geoCache!;
}

export default function MapPage() {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]     = useState(true);
  const [hovered, setHovered]     = useState<PinGroup|null>(null);
  const [mouse,   setMouse]       = useState({ x: 0, y: 0 });
  const pins = useRef<{ cx:number; cy:number; r:number; group:PinGroup }[]>([]);

  /* fetch */
  useEffect(() => {
    supabase.from('employees')
      .select('id,name,role,dept,location,region,active,status')
      .then(({ data }) => { setEmployees((data ?? []) as Employee[]); setLoading(false); });
  }, []);

  /* ── draw function (stable ref so ResizeObserver can call it) ── */
  const drawMap = useCallback((W: number, H: number) => {
    const canvas = canvasRef.current;
    if (!canvas || loading) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    /* build pin groups */
    const gmap = new Map<string, PinGroup>();
    const active = employees.filter(e => e.active !== false && e.status !== 'Ex-Employee' && e.status !== 'Ex-Contractor');
    for (const emp of active) {
      const r = resolveLocation(emp.location);
      if (!r) continue;
      const k = r.coords.join(',');
      if (!gmap.has(k)) gmap.set(k, { coords: r.coords, label: r.label, region: emp.region ?? 'Unknown', employees: [] });
      gmap.get(k)!.employees.push(emp);
    }

    const drawPins = () => {
      pins.current = [];
      for (const group of gmap.values()) {
        const n     = group.employees.length;
        const color = regionColor(group.region);
        const [cx, cy] = ll2px(group.coords[0], group.coords[1], W, H);
        const r = Math.max(13, Math.min(38, 10 + n * 2.5));

        ctx.save();
        ctx.shadowColor = color; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.fillStyle = color + 'bb'; ctx.fill();
        ctx.restore();

        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

        ctx.fillStyle    = '#fff';
        ctx.font         = `bold ${r > 22 ? 13 : 11}px -apple-system,sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), cx, cy);

        pins.current.push({ cx, cy, r, group });
      }
    };

    /* background */
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e293b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    /* graticules */
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.7;
    for (let lng = -180; lng <= 180; lng += 30) {
      const [x] = ll2px(0, lng, W, H);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let lat = -60; lat <= 90; lat += 30) {
      const [,y] = ll2px(lat, 0, W, H);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    /* world land polygons */
    getGeo()
      .then(geo => {
        ctx.fillStyle = '#1e3a5f'; ctx.strokeStyle = '#2a4a72'; ctx.lineWidth = 0.4;
        const drawRing = (ring: number[][]) => {
          if (!ring.length) return;
          ctx.beginPath();
          const [x0,y0] = ll2px(ring[0][1], ring[0][0], W, H);
          ctx.moveTo(x0, y0);
          for (let i = 1; i < ring.length; i++) {
            const [x,y] = ll2px(ring[i][1], ring[i][0], W, H);
            ctx.lineTo(x, y);
          }
          ctx.closePath(); ctx.fill(); ctx.stroke();
        };
        for (const f of geo.features) {
          const { type, coordinates } = f.geometry;
          if (type === 'Polygon') drawRing((coordinates as number[][][])[0]);
          else if (type === 'MultiPolygon')
            for (const poly of coordinates as number[][][][]) drawRing(poly[0]);
        }
        drawPins();
      })
      .catch(() => drawPins());
  }, [employees, loading]);

  /* ── ResizeObserver: fires whenever the container gets real size ── */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const observer = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const { width, height } = e.contentRect;
      if (width < 10 || height < 10) return;
      drawMap(width, height);
    });

    observer.observe(wrap);

    /* also try immediately in case container already has size */
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (W >= 10 && H >= 10) drawMap(W, H);

    return () => observer.disconnect();
  }, [drawMap]); // drawMap is stable per [employees, loading] via useCallback

  /* hover */
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setMouse({ x: e.clientX, y: e.clientY });
    const hit = pins.current.find(p => Math.hypot(p.cx - mx, p.cy - my) <= p.r + 5);
    setHovered(hit?.group ?? null);
  };

  /* stats */
  const activeEmps = employees.filter(e => e.active !== false && e.status !== 'Ex-Employee' && e.status !== 'Ex-Contractor');
  const india  = activeEmps.filter(e => e.region === 'India');
  const usa    = activeEmps.filter(e => e.region === 'USA');
  const canada = activeEmps.filter(e => e.region === 'Canada');
  const cities = new Set(activeEmps.map(e => resolveLocation(e.location)?.coords.join(',')).filter(Boolean)).size;

  return (
    /* Use a fixed viewport height minus the sidebar header — works inside overflow-auto */
    <div className="flex flex-col" style={{ height: 'calc(100vh - 2px)', overflow: 'hidden' }}>

      {/* Header */}
      <div className="px-6 pt-5 pb-2 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">🌍 World Map</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {loading ? 'Loading…' : `${activeEmps.length} active employees across ${cities} locations`}
        </p>
      </div>

      {/* Stat chips */}
      <div className="px-6 pb-3 shrink-0 flex flex-wrap gap-2">
        {[
          { label:'Total Active', value:activeEmps.length, color:'#1e88e5' },
          { label:'India',        value:india.length,      color:'#f97316' },
          { label:'USA',          value:usa.length,        color:'#3b82f6' },
          { label:'Canada',       value:canada.length,     color:'#22c55e' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl px-4 py-2 shadow-sm border border-gray-100 flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <div>
              <div className="text-lg font-bold leading-none" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
        <div className="bg-white rounded-xl px-4 py-2 shadow-sm border border-gray-100 flex items-center gap-3 text-xs text-gray-500">
          <span className="font-semibold text-gray-600">Legend:</span>
          {Object.entries(RC).map(([r,c]) => (
            <span key={r} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: c }} />{r}
            </span>
          ))}
        </div>
      </div>

      {/* Canvas map — explicit flex-1 with overflow hidden */}
      <div
        ref={wrapRef}
        className="mx-6 mb-5 rounded-2xl overflow-hidden shadow-xl border border-slate-700 relative"
        style={{ flex: '1 1 0', minHeight: 0 }}
      >
        {loading ? (
          <div className="absolute inset-0 bg-slate-900 flex items-center justify-center">
            <div className="text-white/60 text-sm animate-pulse">Loading employee data…</div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{ display:'block', cursor: hovered ? 'pointer' : 'default' }}
            onMouseMove={onMouseMove}
            onMouseLeave={() => setHovered(null)}
          />
        )}

        {/* Hover tooltip */}
        {hovered && (
          <div
            className="fixed z-50 bg-gray-900 text-white rounded-xl px-3 py-2.5 shadow-2xl text-sm pointer-events-none border border-white/10"
            style={{ left: mouse.x + 14, top: mouse.y - 8 }}
          >
            <div className="font-semibold">{hovered.label}</div>
            <div className="text-white/60 text-xs mt-0.5">
              {hovered.employees.length} employee{hovered.employees.length !== 1 ? 's' : ''}
            </div>
            <div className="text-white/50 text-xs mt-1 max-w-xs leading-relaxed">
              {hovered.employees.slice(0,6).map(e => e.name).join(', ')}
              {hovered.employees.length > 6 ? ` +${hovered.employees.length - 6} more` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
