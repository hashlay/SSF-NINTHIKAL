import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, Printer, Download, RefreshCw, ClipboardCheck, 
  Users, Trophy, Award, BarChart2, BookOpen 
} from 'lucide-react';
import { User, UserRole, Category, Unit, Competition, Team } from '../types';

interface ReportsViewProps {
  user: User;
  token: string;
}

export default function ReportsView({ user, token }: ReportsViewProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Report Type selection: 'participants' | 'results' | 'scoreboard' | 'standings'
  const [reportType, setReportType] = useState<'participants' | 'results' | 'scoreboard' | 'standings'>('participants');

  // Query variables
  const [filterUnitId, setFilterUnitId] = useState(user.role === UserRole.UNIT_TEAM_LEADER ? (user.assignedUnitId || '') : '');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterCompId, setFilterCompId] = useState('');

  // Loaded Preview Data state
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchMasters = async () => {
    try {
      const [cRes, uRes, compRes, tRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/units'),
        fetch('/api/competitions'),
        fetch('/api/teams', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      const [cData, uData, compData, tData] = await Promise.all([cRes.json(), uRes.json(), compRes.json(), tRes.json()]);

      setCategories(cData);
      setUnits(uData);
      setCompetitions(compData);
      setTeams(tData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasters();
  }, []);

  // Fetch report data according to type and filters
  const loadReportData = async () => {
    setPreviewLoading(true);
    try {
      let url = '';
      if (reportType === 'participants') {
        url = `/api/participants?unitId=${filterUnitId}&categoryId=${filterCategoryId}`;
      } else if (reportType === 'results') {
        url = `/api/results?competitionId=${filterCompId}`;
      } else if (reportType === 'scoreboard') {
        url = `/api/scoreboard?unitId=${filterUnitId}&categoryId=${filterCategoryId}`;
      } else if (reportType === 'standings') {
        url = `/api/standings`;
      }

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch report data');
      }
      setPreviewData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [reportType, filterUnitId, filterCategoryId, filterCompId]);

  // Export Table Data to standard CSV format
  const handleExportCSV = () => {
    if (previewData.length === 0) return;

    let headers: string[] = [];
    let rows: any[] = [];

    if (reportType === 'participants') {
      headers = ['Chest No', 'Candidate Name', 'DOB', 'Unit', 'Category', 'Education', 'Phone'];
      rows = previewData.map(p => {
        const u = units.find(unit => unit.id === p.unitId)?.name || '';
        const c = categories.find(cat => cat.id === p.selectedCategoryId)?.name || '';
        return [p.profilePhoto, p.fullName, p.dob, u, c, p.educationStatus, p.phone || ''];
      });
    } else if (reportType === 'results') {
      headers = ['Candidate/Team Number', 'Unit', 'Judge 1 Mark', 'Judge 2', 'Total Mark', 'Rank', 'Status'];
      rows = previewData.map(r => {
        const u = units.find(unit => unit.id === r.unitId)?.name || '';
        let displayName = r.participantName;
        if (!displayName) {
          if (r.teamId) {
            const t = teams.find(team => team.id === r.teamId);
            if (t) {
              displayName = t.name ? `${t.name} (${t.members.map(m=>m.name).join(', ')})` : t.members.map(m=>m.name).join(', ');
            } else {
              displayName = r.teamNumber || 'Group Team';
            }
          } else {
            displayName = r.teamNumber || 'Group Team';
          }
        }
        return [displayName, u, r.judge1Mark, r.judge2Mark, r.totalMark, r.rank, r.status];
      });
    } else if (reportType === 'scoreboard') {
      headers = ['Standing', 'Chest No', 'Candidate Name', 'Unit', 'Category', 'Raw Marks'];
      rows = previewData.map(s => [s.rank, s.chestNumber, s.name, s.unitName, s.categoryName, s.overallMarks]);
    } else if (reportType === 'standings') {
      headers = ['Standing', 'Unit Code', 'Unit Name', '1st Places', '2nd Places', '3rd Places', 'Raw Marks', 'Official Points'];
      rows = previewData.map((s, idx) => [idx + 1, s.unitCode, s.unitName, s.firstPlaceCount, s.secondPlaceCount, s.thirdPlaceCount, s.overallMarks, s.overallPoints]);
    }

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportType}_report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger browser print action
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[50vh]">
        <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin mb-4" />
        <span className="text-slate-500 font-mono text-xs">Loading report engine...</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans">
      
      {/* 1. Report Selector Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
        {[
          { id: 'participants', label: 'Candidate Registry', icon: Users, desc: 'Candidate checklists' },
          { id: 'results', label: 'Event Result Sheet', icon: Trophy, desc: 'Score breakdowns' },
          { id: 'scoreboard', label: 'Ind Scoreboard', icon: Award, desc: 'Overall champion metrics' },
          { id: 'standings', label: 'Unit Medal Standings', icon: BarChart2, desc: 'Official championship list' }
        ].map((item) => {
          const Icon = item.icon;
          const isActive = reportType === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setReportType(item.id as any);
                setPreviewData([]);
              }}
              className={`p-5 rounded-3xl border-2 text-left transition-all flex flex-col justify-between h-36 ${
                isActive 
                  ? 'border-emerald-600 bg-emerald-50/10 ring-2 ring-emerald-500/10 shadow-md' 
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className={`h-10 w-10 rounded-2xl flex items-center justify-center ${isActive ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-display font-extrabold text-slate-800 text-sm leading-tight mt-3">{item.label}</h4>
                <p className="text-[10px] text-slate-400 mt-1 font-semibold">{item.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. Filter adjustments based on Selection */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap gap-4 items-center justify-between no-print">
        <div className="flex flex-wrap gap-3 items-center">
          
          {/* Unit filter */}
          {reportType !== 'standings' && reportType !== 'results' && user.role !== UserRole.UNIT_TEAM_LEADER && (
            <select
              value={filterUnitId}
              onChange={(e) => setFilterUnitId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold text-xs bg-slate-50"
            >
              <option value="">All Units</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}

          {/* Category filter */}
          {reportType !== 'standings' && reportType !== 'results' && (
            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold text-xs bg-slate-50"
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {/* Competition Selector for results sheet */}
          {reportType === 'results' && (
            <select
              value={filterCompId}
              onChange={(e) => setFilterCompId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold text-xs bg-slate-50 max-w-xs"
            >
              <option value="">Choose Competition Event</option>
              {competitions.map(c => {
                const catName = categories.find(cat => cat.id === c.categoryId)?.name || 'General';
                return <option key={c.id} value={c.id}>{c.name} ({catName})</option>;
              })}
            </select>
          )}

        </div>

        {/* Action triggers */}
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleExportCSV}
            disabled={previewData.length === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-xs transition-colors shadow-sm"
          >
            <Download className="h-4 w-4" />
            <span>CSV Export</span>
          </button>
          <button
            onClick={handlePrint}
            disabled={previewData.length === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold disabled:opacity-50 text-xs transition-colors shadow-md shadow-emerald-600/10"
          >
            <Printer className="h-4 w-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* 3. Printable sheet & layout */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-6 sm:p-10 relative overflow-hidden print-sheet">
        
        {/* Printable header */}
        <div className="flex flex-col items-center text-center pb-8 border-b border-dashed border-slate-300">
          <span className="font-display font-extrabold text-2xl tracking-wider text-slate-900 uppercase">SSF SAHITYOTSAV 2026</span>
          <span className="font-mono text-xs font-semibold text-emerald-700 tracking-widest uppercase mt-1">NINTHIKAL SECTOR COMITE</span>
          <h2 className="font-display font-bold text-slate-800 text-lg mt-4 uppercase">
            {reportType === 'participants' && 'Candidate Registrations Sheet'}
            {reportType === 'results' && 'Official Event Marks sheet'}
            {reportType === 'scoreboard' && 'Individual Champion Scoreboard'}
            {reportType === 'standings' && 'Official Unit Medal standings'}
          </h2>
          <span className="text-[10px] font-mono text-slate-400 mt-2 font-bold uppercase">
            REPORT GENERATED ON: {new Date().toLocaleDateString()} AT {new Date().toLocaleTimeString()}
          </span>
        </div>

        {previewLoading ? (
          <div className="py-24 text-center text-xs font-mono text-slate-400 animate-pulse">Querying report sheet entries...</div>
        ) : (
          <div className="mt-8 overflow-x-auto">
            {previewData.length > 0 ? (
              <table className="min-w-full divide-y divide-slate-200 text-xs print-table">
                
                {reportType === 'participants' && (
                  <>
                    <thead className="bg-slate-50 font-mono font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Chest No</th>
                        <th className="px-4 py-3 text-left">Candidate</th>
                        <th className="px-4 py-3 text-left">DOB</th>
                        <th className="px-4 py-3 text-left">Representing Unit</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-left">Education</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {previewData.map(p => {
                        const u = units.find(unit => unit.id === p.unitId)?.name || '';
                        const c = categories.find(cat => cat.id === p.selectedCategoryId)?.name || '';
                        return (
                          <tr key={p.id}>
                            <td className="px-4 py-3 font-mono font-bold text-slate-500">{p.profilePhoto}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">{p.fullName}</td>
                            <td className="px-4 py-3 font-mono">{p.dob}</td>
                            <td className="px-4 py-3">{u}</td>
                            <td className="px-4 py-3">{c}</td>
                            <td className="px-4 py-3 capitalize">{p.educationStatus.replace('_', ' ')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}

                {reportType === 'results' && (
                  <>
                    <thead className="bg-slate-50 font-mono font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Candidate Name / Team Number</th>
                        <th className="px-4 py-3 text-left">Unit</th>
                        <th className="px-4 py-3 text-right">Judge 1</th>
                        <th className="px-4 py-3 text-right">Judge 2</th>
                        <th className="px-4 py-3 text-right">Total Marks</th>
                        <th className="px-4 py-3 text-center">Rank</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {previewData.map(r => {
                        let u = units.find(unit => unit.id === r.unitId)?.name || '';
                        let displayName = r.participantName;
                        if (!displayName) {
                          if (r.teamId) {
                            const t = teams.find(team => team.id === r.teamId);
                            if (t) {
                              displayName = t.name ? `${t.name} (${t.members.map(m=>m.name).join(', ')})` : t.members.map(m=>m.name).join(', ');
                              if (!u && t.unitId) {
                                u = units.find(unit => unit.id === t.unitId)?.name || '';
                              }
                            } else {
                              displayName = r.teamNumber || 'Group Team';
                            }
                          } else {
                            displayName = r.teamNumber || 'Group Team';
                          }
                        }
                        
                        return (
                          <tr key={r.id}>
                            <td className="px-4 py-3 font-semibold text-slate-900">{displayName}</td>
                            <td className="px-4 py-3">{u}</td>
                            <td className="px-4 py-3 text-right font-mono">{r.judge1Mark}</td>
                            <td className="px-4 py-3 text-right font-mono">{r.judge2Mark}</td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700 font-mono">{r.totalMark}</td>
                            <td className="px-4 py-3 text-center font-bold text-amber-700 font-mono">Rank {r.rank || 'N/A'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </>
                )}

                {reportType === 'scoreboard' && (
                  <>
                    <thead className="bg-slate-50 font-mono font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Rank</th>
                        <th className="px-4 py-3 text-left">Chest No</th>
                        <th className="px-4 py-3 text-left">Candidate Name</th>
                        <th className="px-4 py-3 text-left">Unit</th>
                        <th className="px-4 py-3 text-left">Category</th>
                        <th className="px-4 py-3 text-right">Accumulated Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {previewData.map(s => (
                        <tr key={s.participantId}>
                          <td className="px-4 py-3 font-mono font-bold">#{s.rank}</td>
                          <td className="px-4 py-3 font-mono font-bold text-slate-500">{s.chestNumber}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                          <td className="px-4 py-3">{s.unitName}</td>
                          <td className="px-4 py-3">{s.categoryName}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-700 font-mono">{s.overallMarks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

                {reportType === 'standings' && (
                  <>
                    <thead className="bg-slate-50 font-mono font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Standing</th>
                        <th className="px-4 py-3 text-left">Unit Name</th>
                        <th className="px-4 py-3 text-center">First Places</th>
                        <th className="px-4 py-3 text-center">Second Places</th>
                        <th className="px-4 py-3 text-center">Third Places</th>
                        <th className="px-4 py-3 text-right">Raw Marks</th>
                        <th className="px-4 py-3 text-right">Official Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {previewData.map((s, idx) => (
                        <tr key={s.unitId}>
                          <td className="px-4 py-3 font-mono font-bold">#{idx + 1}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{s.unitName}</td>
                          <td className="px-4 py-3 text-center font-mono">{s.firstPlaceCount}</td>
                          <td className="px-4 py-3 text-center font-mono">{s.secondPlaceCount}</td>
                          <td className="px-4 py-3 text-center font-mono">{s.thirdPlaceCount}</td>
                          <td className="px-4 py-3 text-right font-mono">{s.overallMarks}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-700 font-mono">{s.overallPoints}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}

              </table>
            ) : (
              <div className="py-12 text-center text-slate-400 font-mono">No data matches report parameters</div>
            )}
          </div>
        )}

        {/* Print signatures row */}
        <div className="mt-16 pt-8 border-t border-dashed border-slate-200 grid grid-cols-2 gap-8 text-center text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider print-signatures">
          <div>
            <div className="h-10 border-b border-slate-300 w-40 mx-auto" />
            <span className="mt-2 block">SECTOR SAHITYOTSAV CHAIRMAN</span>
          </div>
          <div>
            <div className="h-10 border-b border-slate-300 w-40 mx-auto" />
            <span className="mt-2 block">GENERAL CONVENOR SIGNATURE</span>
          </div>
        </div>

      </div>

    </div>
  );
}
