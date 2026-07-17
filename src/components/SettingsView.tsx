import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, Database, Trash2, ShieldAlert, 
  RefreshCw, CheckCircle2, Download, Upload, AlertTriangle 
} from 'lucide-react';
import { User, UserRole } from '../types';

interface SettingsViewProps {
  user: User;
  token: string;
}

export default function SettingsView({ user, token }: SettingsViewProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings form states
  const [sectorName, setSectorName] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [ssfLogoUrl, setSsfLogoUrl] = useState('');
  const [sahityotsavLogoUrl, setSahityotsavLogoUrl] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(true);

  // Backup file uploading state
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSectorName(data.sectorName);
      setEventTitle(data.eventTitle);
      setSsfLogoUrl(data.ssfLogoUrl);
      setSahityotsavLogoUrl(data.sahityotsavLogoUrl);
      setRegistrationOpen(data.registrationOpen ?? true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sectorName, eventTitle, ssfLogoUrl, sahityotsavLogoUrl, registrationOpen })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update settings');

      alert('Branding and settings updated successfully!');
      window.location.reload(); // Refresh to propagate logo and title updates in sidebar & header!
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Export db backup trigger
  const handleDownloadBackup = async () => {
    try {
      const res = await fetch('/api/backup/export', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sahityotsav_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      alert('Failed to generate backup export file');
    }
  };

  // Restore DB state from file upload
  const handleRestoreBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupFile) return;

    if (!confirm('CRITICAL WARNING: Restoring a backup overrides the entire active database state! Are you absolutely sure?')) return;

    setRestoring(true);
    const formData = new FormData();
    formData.append('backup', backupFile);

    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore DB backup');

      alert('Database restored successfully! The app will refresh.');
      window.location.reload();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRestoring(false);
    }
  };

  // Complete DB reset wipes registrations
  const handleResetApp = async () => {
    if (!confirm('EXTREMELY DANGEROUS RESET: This deletes all candidate registrations, results, and team mappings! Only master configurations will remain. Do you want to continue?')) return;
    if (prompt('Please type "RESET SYSTEM" to confirm system wipe:') !== 'RESET SYSTEM') {
      alert('Reset cancelled due to incorrect confirmation string.');
      return;
    }

    try {
      const res = await fetch('/api/backup/reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Wipe operation failed');

      alert('System registrations reset successfully for a new Sahityotsav year!');
      window.location.reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[50vh]">
        <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin mb-4" />
        <span className="text-slate-500 font-mono text-xs">Loading settings console...</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto font-sans">
      
      {/* 1. Branding Settings */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
        <div className="border-b pb-4">
          <h3 className="font-display font-bold text-slate-800 text-lg">Event Visual Branding</h3>
          <p className="text-xs text-slate-400 mt-1">Configure sector names, title prefixes, and official SSF / Karnataka Sahityotsav vector logos URLs</p>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4 text-xs font-sans">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Sector Name</label>
              <input
                type="text"
                required
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                className="mt-1.5 block w-full px-3 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Event Title</label>
              <input
                type="text"
                required
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                className="mt-1.5 block w-full px-3 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">SSF Logo URL</label>
              <input
                type="text"
                required
                value={ssfLogoUrl}
                onChange={(e) => setSsfLogoUrl(e.target.value)}
                className="mt-1.5 block w-full px-3 py-2.5 border border-slate-300 rounded-xl text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Sahityotsav Logo URL</label>
              <input
                type="text"
                required
                value={sahityotsavLogoUrl}
                onChange={(e) => setSahityotsavLogoUrl(e.target.value)}
                className="mt-1.5 block w-full px-3 py-2.5 border border-slate-300 rounded-xl text-slate-900 font-mono"
              />
            </div>
          </div>

          {/* Registration Lock Toggle */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 className="font-semibold text-slate-800 text-xs">Sector Registration Window</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Toggle whether Unit Team Leaders can register candidates, edit details, or manage group teams.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={registrationOpen} 
                onChange={(e) => setRegistrationOpen(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              <span className="ml-2.5 text-xs font-bold font-mono uppercase text-slate-600">
                {registrationOpen ? 'ENABLED' : 'DISABLED'}
              </span>
            </label>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Updating...' : 'Save Branding'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 2. Backup & Disaster recovery */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
        <div className="border-b pb-4">
          <h3 className="font-display font-bold text-slate-800 text-lg">Backup & Restore Engine</h3>
          <p className="text-xs text-slate-400 mt-1">Export persistent DB dumps or restore state instantly for offline security and multi-device syncing</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Export Dump Box */}
          <div className="border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <h4 className="font-display font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Database className="h-4.5 w-4.5 text-emerald-600" />
                Export DB Dump
              </h4>
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                Download a fully compliant JSON backup dump file containing all units, categories, registered participants, and competition marks sheets.
              </p>
            </div>
            <button
              onClick={handleDownloadBackup}
              className="mt-6 flex items-center justify-center gap-1.5 w-full py-2 bg-slate-50 border hover:bg-slate-100 rounded-xl font-bold text-slate-700 text-xs shadow-sm transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Download JSON Dump</span>
            </button>
          </div>

          {/* Import Restore dump */}
          <div className="border border-slate-200 rounded-2xl p-5">
            <h4 className="font-display font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <Upload className="h-4.5 w-4.5 text-amber-600" />
              Restore DB Dump
            </h4>
            <form onSubmit={handleRestoreBackup} className="mt-4 space-y-4">
              <input
                type="file"
                required
                accept=".json"
                onChange={(e) => setBackupFile(e.target.files ? e.target.files[0] : null)}
                className="block w-full text-[11px] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 font-mono text-slate-500"
              />
              <button
                type="submit"
                disabled={restoring || !backupFile}
                className="flex items-center justify-center gap-1.5 w-full py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-bold text-xs shadow-md disabled:opacity-50"
              >
                {restoring ? 'Restoring DB...' : 'Restore Database'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* 3. System Reset Wipe option */}
      <div className="bg-red-50/50 p-6 rounded-3xl border border-red-200 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5 animate-pulse" />
          <div>
            <h3 className="font-display font-extrabold text-red-800 text-sm">Danger Zone / New Year Reset</h3>
            <p className="text-xs text-red-700 mt-1 leading-relaxed">
              To launch the Sahityotsav system for a new academic year or empty the records safely, you can wipe all active candidate registrations, results sheets, and team configurations. Master settings (units, categories, active users, competitions) will be preserved!
            </p>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            onClick={handleResetApp}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md shadow-red-600/15"
          >
            <Trash2 className="h-4 w-4" />
            <span>Reset Registration & Results</span>
          </button>
        </div>
      </div>

    </div>
  );
}
