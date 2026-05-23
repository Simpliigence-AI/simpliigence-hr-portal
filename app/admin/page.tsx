'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface BackupLog {
  id: string;
  label: string | null;
  storage_path: string;
  size_bytes: number | null;
  created_by: string;
  created_at: string;
}

const TABLES = [
  'employees', 'performance_reviews', 'monthly_reviews', 'onboarding_checklists',
  'engagement_connects', 'recognition_awards', 'policies', 'hr_actions',
  'action_activity', 'action_attachments',
];

function fmtBytes(b: number | null) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

export default function AdminPage() {
  const [logs,       setLogs]       = useState<BackupLog[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [backing,    setBacking]    = useState(false);
  const [restoring,  setRestoring]  = useState<string | null>(null);
  const [progress,   setProgress]   = useState('');
  const [restoreFile,setRestoreFile]= useState<File | null>(null);
  const [confirm,    setConfirm]    = useState<BackupLog | null>(null);

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    setLoading(true);
    const { data } = await supabase.from('backup_log').select('*').order('created_at', { ascending: false });
    setLogs((data ?? []) as BackupLog[]);
    setLoading(false);
  }

  async function createBackup() {
    setBacking(true);
    setProgress('Collecting data from all tables…');
    try {
      const backup: Record<string, unknown[]> = { _meta: { created_at: new Date().toISOString(), tables: TABLES } as never };
      for (const table of TABLES) {
        setProgress(`Exporting ${table}…`);
        const { data } = await supabase.from(table).select('*');
        backup[table] = data ?? [];
      }
      setProgress('Uploading to storage…');
      const json   = JSON.stringify(backup, null, 2);
      const blob   = new Blob([json], { type: 'application/json' });
      const path   = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const { error } = await supabase.storage.from('hr-backups').upload(path, blob);
      if (error) throw error;

      setProgress('Logging backup…');
      await supabase.from('backup_log').insert({
        label: `Auto backup — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        storage_path: path,
        size_bytes: blob.size,
        created_by: 'Manual',
      });

      // Also download a local copy
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = path; a.click();
      URL.revokeObjectURL(url);

      setProgress('✅ Backup complete!');
      await loadLogs();
    } catch (e) {
      setProgress(`❌ Error: ${(e as Error).message}`);
    }
    setBacking(false);
    setTimeout(() => setProgress(''), 4000);
  }

  async function restoreFromStorage(log: BackupLog) {
    setRestoring(log.id); setConfirm(null);
    setProgress(`Downloading backup from storage…`);
    try {
      const { data, error } = await supabase.storage.from('hr-backups').download(log.storage_path);
      if (error || !data) throw error ?? new Error('Download failed');
      const text   = await data.text();
      const backup = JSON.parse(text) as Record<string, unknown[]>;
      await restoreData(backup);
    } catch (e) {
      setProgress(`❌ Error: ${(e as Error).message}`);
    }
    setRestoring(null);
    setTimeout(() => setProgress(''), 5000);
  }

  async function restoreFromFile() {
    if (!restoreFile) return;
    setRestoring('file');
    setProgress('Reading backup file…');
    try {
      const text   = await restoreFile.text();
      const backup = JSON.parse(text) as Record<string, unknown[]>;
      await restoreData(backup);
    } catch (e) {
      setProgress(`❌ Error: ${(e as Error).message}`);
    }
    setRestoring(null);
    setRestoreFile(null);
    setTimeout(() => setProgress(''), 5000);
  }

  async function restoreData(backup: Record<string, unknown[]>) {
    for (const table of TABLES) {
      if (!backup[table] || backup[table].length === 0) continue;
      setProgress(`Restoring ${table} (${backup[table].length} rows)…`);
      const chunks = [];
      for (let i = 0; i < backup[table].length; i += 100) chunks.push(backup[table].slice(i, i + 100));
      for (const chunk of chunks) {
        await supabase.from(table).upsert(chunk as never[], { ignoreDuplicates: false });
      }
    }
    setProgress('✅ Restore complete! Reload the page to see changes.');
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Backup & Restore</h1>
      <p className="text-sm text-gray-500 mb-6">All HR Portal data is backed up to Supabase Storage. Backups are also downloaded as JSON files you can keep locally.</p>

      {/* Status bar */}
      {progress && (
        <div className={cn('mb-5 px-4 py-3 rounded-xl text-sm font-medium',
          progress.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' :
          progress.startsWith('❌') ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200')}>
          {!progress.startsWith('✅') && !progress.startsWith('❌') && <span className="mr-2 animate-spin inline-block">⏳</span>}
          {progress}
        </div>
      )}

      {/* Create backup */}
      <div className="bg-white border rounded-2xl p-5 mb-6 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-1">Create Backup</h2>
        <p className="text-sm text-gray-500 mb-4">
          Exports all {TABLES.length} tables to a JSON file. Stores a copy in Supabase Storage and also downloads it to your computer.
        </p>
        <div className="flex items-center gap-3">
          <button onClick={createBackup} disabled={backing}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {backing ? '⏳ Backing up…' : '💾 Create Backup Now'}
          </button>
          <span className="text-xs text-gray-400">Tables: {TABLES.join(', ')}</span>
        </div>
      </div>

      {/* Restore from file */}
      <div className="bg-white border rounded-2xl p-5 mb-6 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-1">Restore from File</h2>
        <p className="text-sm text-gray-500 mb-4">Upload a previously downloaded JSON backup file to restore data.</p>
        <div className="flex gap-3 items-center">
          <label className="flex-1 flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-300 transition-colors text-sm text-gray-500">
            <span>📂</span>
            {restoreFile ? restoreFile.name : 'Choose backup .json file…'}
            <input type="file" accept=".json" className="hidden"
              onChange={e => setRestoreFile(e.target.files?.[0] ?? null)} />
          </label>
          <button onClick={restoreFromFile} disabled={!restoreFile || restoring === 'file'}
            className="px-4 py-2.5 bg-orange-500 text-white text-sm rounded-xl font-semibold hover:bg-orange-600 disabled:opacity-50">
            {restoring === 'file' ? '⏳ Restoring…' : '↩ Restore'}
          </button>
        </div>
        <p className="text-xs text-red-500 mt-2">⚠️ This will upsert all records. Existing data matching IDs will be overwritten.</p>
      </div>

      {/* Backup history */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Backup History ({logs.length})</h2>
          <button onClick={loadLogs} className="text-xs text-blue-600 hover:underline">Refresh</button>
        </div>
        {loading && <div className="p-6 text-sm text-gray-400 text-center">Loading…</div>}
        {!loading && logs.length === 0 && (
          <div className="p-6 text-sm text-gray-400 text-center">No backups yet. Create your first backup above.</div>
        )}
        {logs.map(log => (
          <div key={log.id} className="flex items-center gap-4 px-5 py-3.5 border-b last:border-0 hover:bg-gray-50">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{log.label ?? log.storage_path}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {new Date(log.created_at).toLocaleString()} · {fmtBytes(log.size_bytes)} · by {log.created_by}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setConfirm(log)} disabled={!!restoring}
                className="px-3 py-1.5 text-xs bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 font-medium disabled:opacity-50">
                ↩ Restore
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm restore modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-2">Confirm Restore</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to restore from <strong>{confirm.label ?? confirm.storage_path}</strong>?
              This will overwrite existing data matching the backup IDs.
            </p>
            <div className="flex gap-3">
              <button onClick={() => restoreFromStorage(confirm)}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600">
                Yes, Restore
              </button>
              <button onClick={() => setConfirm(null)}
                className="px-5 py-2.5 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
