'use client';

import { useState } from 'react';

interface SyncResult {
  synced:  number;
  photos:  number;
  skipped: number;
  log:     string[];
  error?:  string;
}

export default function TeamsSyncPage() {
  const [running,  setRunning]  = useState(false);
  const [result,   setResult]   = useState<SyncResult | null>(null);

  async function runSync() {
    setRunning(true);
    setResult(null);
    try {
      const res  = await fetch('/api/teams-sync', { method: 'POST' });
      const data = await res.json() as SyncResult;
      setResult(data);
    } catch (e) {
      setResult({ synced: 0, photos: 0, skipped: 0, log: [], error: (e as Error).message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Microsoft Teams Sync</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pull profile photos and contact details from Microsoft 365 into the HR portal.
          Matches employees by display name or email address.
        </p>
      </div>

      {/* Pre-req checklist */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm">
        <div className="font-semibold text-blue-800 mb-2">📋 Requirements</div>
        <ul className="space-y-1 text-blue-700">
          <li>✓ Azure App Registration with <strong>Application</strong> (not delegated) permissions:</li>
          <li className="pl-4">• <code className="bg-blue-100 px-1 rounded">User.Read.All</code> — read all user profiles</li>
          <li className="pl-4">• <code className="bg-blue-100 px-1 rounded">ProfilePhoto.Read.All</code> — read profile photos</li>
          <li className="mt-2">✓ Three Vercel environment variables set:</li>
          <li className="pl-4">• <code className="bg-blue-100 px-1 rounded">AZURE_TENANT_ID</code></li>
          <li className="pl-4">• <code className="bg-blue-100 px-1 rounded">AZURE_CLIENT_ID</code></li>
          <li className="pl-4">• <code className="bg-blue-100 px-1 rounded">AZURE_CLIENT_SECRET</code></li>
          <li className="mt-2">✓ <code className="bg-blue-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> set in Vercel (for storage uploads)</li>
        </ul>
      </div>

      {/* Sync button */}
      <button
        onClick={runSync}
        disabled={running}
        className="flex items-center gap-2 px-6 py-3 bg-[#0078d4] hover:bg-[#106ebe] disabled:opacity-50 text-white font-medium rounded-xl transition-colors shadow-sm"
      >
        {running ? (
          <>
            <span className="animate-spin">⟳</span>
            Syncing…
          </>
        ) : (
          <>
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/c/c9/Microsoft_Office_Teams_%282018%E2%80%93present%29.svg"
              alt="Teams"
              className="w-5 h-5"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            Sync from Microsoft Teams
          </>
        )}
      </button>

      {/* Results */}
      {result && (
        <div className={`mt-6 rounded-xl border p-5 ${result.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          {result.error ? (
            <div>
              <div className="font-semibold text-red-700 mb-2">❌ Sync failed</div>
              <div className="text-sm text-red-600 font-mono bg-red-100 p-3 rounded-lg">{result.error}</div>
            </div>
          ) : (
            <div>
              <div className="font-semibold text-green-800 mb-3">✅ Sync complete</div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Employees synced', value: result.synced, color: 'text-green-700' },
                  { label: 'Photos uploaded',  value: result.photos, color: 'text-blue-700'  },
                  { label: 'No match / skipped', value: result.skipped, color: 'text-gray-600' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-lg p-3 border border-green-100 text-center">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Log */}
          {result.log.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-600 mb-1">Sync log</div>
              <div className="bg-gray-900 text-gray-200 rounded-lg p-3 text-xs font-mono space-y-1 max-h-48 overflow-y-auto">
                {result.log.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 border-t pt-6">
        <div className="text-sm font-semibold text-gray-700 mb-3">How it works</div>
        <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
          <li>Authenticates with Azure AD using client credentials (app-to-app, no user login needed)</li>
          <li>Pulls all enabled M365 users — name, email, job title, department, phone</li>
          <li>Matches each M365 user to a Simpliigence employee by email or display name</li>
          <li>Downloads each matched user's Teams profile photo</li>
          <li>Uploads photos to Supabase Storage (avatars bucket, public CDN)</li>
          <li>Updates employee records with photo URL, contact details, and sync timestamp</li>
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          Unmatched M365 accounts (guest users, service accounts, shared mailboxes) are skipped automatically.
          Re-running the sync is safe — it upserts rather than duplicating.
        </p>
      </div>
    </div>
  );
}
