import React, { useState, useEffect } from 'react';
import { 
  Users, ClipboardList, Trophy, Users2, Award, 
  TrendingUp, Star, ListCollapse, CheckCircle, RefreshCw,
  Mic, BookOpen
} from 'lucide-react';
import { User, UserRole } from '../types';

interface DashboardViewProps {
  user: User;
  token: string;
}

export default function DashboardView({ user, token }: DashboardViewProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch dashboard statistics');
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[50vh]">
        <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin mb-4" />
        <span className="text-slate-500 font-mono text-xs">Loading dashboard analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-800 m-6">
        <h3 className="font-semibold text-lg">Error loading statistics</h3>
        <p className="text-sm mt-1">{error}</p>
        <button 
          onClick={fetchStats}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Calculate results entered completion percentage
  const totalResultsExpected = stats.resultsEntered + stats.resultsPending;
  const completionPercentage = totalResultsExpected > 0 
    ? Math.round((stats.resultsEntered / totalResultsExpected) * 100) 
    : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans">
      
      {/* 1. Quick Stats Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Participants */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 font-semibold text-xs uppercase tracking-wider font-mono">Total Participants</span>
            <h3 className="text-3xl font-display font-extrabold text-slate-800 mt-1">{stats.totalParticipants}</h3>
            {user.role === UserRole.UNIT_TEAM_LEADER && (
              <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">Registered in your unit</span>
            )}
          </div>
          <div className="h-12 w-12 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center shadow-inner">
            <Users className="h-6 w-6" />
          </div>
        </div>

        {/* Total Competitions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 font-semibold text-xs uppercase tracking-wider font-mono">Competitions Masters</span>
            <h3 className="text-3xl font-display font-extrabold text-slate-800 mt-1">{stats.totalCompetitions}</h3>
            <span className="text-[10px] text-slate-400 font-semibold mt-1 block">Total active programs</span>
          </div>
          <div className="h-12 w-12 bg-blue-50 text-blue-700 rounded-xl flex items-center justify-center shadow-inner">
            <ClipboardList className="h-6 w-6" />
          </div>
        </div>

        {/* Individual Registrations */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 font-semibold text-xs uppercase tracking-wider font-mono">Individual Registrations</span>
            <h3 className="text-3xl font-display font-extrabold text-slate-800 mt-1">{stats.individualRegistrations}</h3>
            <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">Maximum 3 per person</span>
          </div>
          <div className="h-12 w-12 bg-amber-50 text-amber-700 rounded-xl flex items-center justify-center shadow-inner">
            <Award className="h-6 w-6" />
          </div>
        </div>

        {/* Group Teams */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 font-semibold text-xs uppercase tracking-wider font-mono">Group Teams</span>
            <h3 className="text-3xl font-display font-extrabold text-slate-800 mt-1">{stats.groupTeamsCount}</h3>
            <span className="text-[10px] text-purple-600 font-semibold mt-1 block">Maximum 2 per person</span>
          </div>
          <div className="h-12 w-12 bg-purple-50 text-purple-700 rounded-xl flex items-center justify-center shadow-inner">
            <Users2 className="h-6 w-6" />
          </div>
        </div>

      </div>

      {/* 2. Top Performers Bento Preview Row (Only for non-unit leaders or if data is available) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Leading Unit Standings Spot */}
        <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 p-6 rounded-3xl text-white shadow-lg shadow-emerald-950/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="bg-emerald-800 text-emerald-200 text-[10px] px-2.5 py-1 rounded-full font-mono font-bold tracking-widest uppercase">Leaderboard Spot</span>
              <Trophy className="h-6 w-6 text-amber-400 animate-bounce" />
            </div>
            <div className="mt-6">
              <span className="text-emerald-300 font-semibold text-xs">LEADING SECTOR UNIT</span>
              <h2 className="text-3xl font-display font-extrabold text-white mt-1">
                {stats.leadingUnit ? stats.leadingUnit.unitName : 'TBD'}
              </h2>
              <div className="flex gap-4 mt-4 font-mono text-xs">
                <div>
                  <span className="text-emerald-400">Total Marks:</span>
                  <span className="text-white font-bold ml-1">{stats.leadingUnit ? stats.leadingUnit.overallMarks : 0}</span>
                </div>
                <div>
                  <span className="text-emerald-400">R1 Placements:</span>
                  <span className="text-white font-bold ml-1">{stats.leadingUnit ? stats.leadingUnit.firstPlaceCount : 0}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-emerald-800/50 flex justify-between items-center text-xs text-emerald-300 font-semibold">
            <span>Standings reflect raw judges' totals</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
        </div>

        {/* Top Individual Spot */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-3xl text-white shadow-lg shadow-slate-950/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="bg-slate-800 text-slate-300 text-[10px] px-2.5 py-1 rounded-full font-mono font-bold tracking-widest uppercase">Champion Spot</span>
              <Star className="h-6 w-6 text-amber-400 animate-pulse" />
            </div>
            <div className="mt-6">
              <span className="text-slate-400 font-semibold text-xs">TOP PERFORMANCE INDIVIDUAL</span>
              <h2 className="text-2xl font-display font-extrabold text-white mt-1 truncate">
                {stats.topIndividual ? stats.topIndividual.name : 'TBD'}
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-1 uppercase">
                {stats.topIndividual ? `${stats.topIndividual.unitName} • ${stats.topIndividual.categoryName}` : '-'}
              </p>
              <div className="flex gap-4 mt-4 font-mono text-xs">
                <div>
                  <span className="text-slate-400">Overall Score:</span>
                  <span className="text-amber-400 font-bold ml-1">{stats.topIndividual ? stats.topIndividual.overallMarks : 0}</span>
                </div>
                <div>
                  <span className="text-slate-400">Events Completed:</span>
                  <span className="text-white font-bold ml-1">{stats.topIndividual ? stats.topIndividual.totalEvents : 0}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-slate-800/50 flex justify-between items-center text-xs text-slate-400 font-semibold">
            <span>Includes individual & group contributions</span>
            <CheckCircle className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        {/* Results Progression Tracker */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-slate-400 font-semibold text-xs uppercase tracking-wider font-mono">Result Entry Completion</span>
            <div className="mt-4 flex items-baseline justify-between">
              <h3 className="text-4xl font-display font-extrabold text-slate-800">{completionPercentage}%</h3>
              <span className="text-xs text-slate-400 font-semibold font-mono">
                {stats.resultsEntered} / {totalResultsExpected}
              </span>
            </div>
            
            {/* Elegant visual bar */}
            <div className="w-full bg-slate-100 h-3 rounded-full mt-4 overflow-hidden relative border border-slate-200/50">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-xs font-semibold font-mono mt-4">
            <div className="flex items-center gap-1.5 text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Published: {stats.resultsEntered}</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-600">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>Pending: {stats.resultsPending}</span>
            </div>
          </div>
        </div>

      </div>

      {/* 2.5 Top On-Stage & Off-Stage Individual Performers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Top On-Stage Performer */}
        <div className="bg-gradient-to-br from-indigo-950 to-slate-900 p-6 rounded-3xl text-white shadow-lg shadow-indigo-950/10 flex flex-col justify-between border border-indigo-900/50">
          <div>
            <div className="flex items-center justify-between">
              <span className="bg-indigo-800 text-indigo-200 text-[10px] px-2.5 py-1 rounded-full font-mono font-bold tracking-widest uppercase">On-Stage Champion</span>
              <Mic className="h-5 w-5 text-amber-400 animate-pulse" />
            </div>
            <div className="mt-6">
              <span className="text-indigo-300 font-semibold text-xs">TOP PERFORMANCE INDIVIDUAL (ON-STAGE)</span>
              <h2 className="text-2xl font-display font-extrabold text-white mt-1 truncate">
                {stats.topIndividualOnStage ? stats.topIndividualOnStage.name : 'TBD'}
              </h2>
              <p className="text-xs text-indigo-200/70 font-mono mt-1 uppercase">
                {stats.topIndividualOnStage ? `${stats.topIndividualOnStage.unitName} • ${stats.topIndividualOnStage.categoryName}` : '-'}
              </p>
              <div className="flex gap-4 mt-4 font-mono text-xs">
                <div>
                  <span className="text-indigo-300">On-Stage Score:</span>
                  <span className="text-amber-400 font-bold ml-1">{stats.topIndividualOnStage ? stats.topIndividualOnStage.overallMarks : 0}</span>
                </div>
                <div>
                  <span className="text-indigo-300">Events Completed:</span>
                  <span className="text-white font-bold ml-1">{stats.topIndividualOnStage ? stats.topIndividualOnStage.totalEvents : 0}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-indigo-900/50 flex justify-between items-center text-xs text-indigo-300 font-semibold">
            <span>Stage performances, speech, recitation etc.</span>
            <CheckCircle className="h-4 w-4 text-indigo-400" />
          </div>
        </div>

        {/* Top Off-Stage Performer */}
        <div className="bg-gradient-to-br from-teal-950 to-slate-900 p-6 rounded-3xl text-white shadow-lg shadow-teal-950/10 flex flex-col justify-between border border-teal-900/50">
          <div>
            <div className="flex items-center justify-between">
              <span className="bg-teal-800 text-teal-200 text-[10px] px-2.5 py-1 rounded-full font-mono font-bold tracking-widest uppercase">Off-Stage Champion</span>
              <BookOpen className="h-5 w-5 text-amber-400" />
            </div>
            <div className="mt-6">
              <span className="text-teal-300 font-semibold text-xs">TOP PERFORMANCE INDIVIDUAL (OFF-STAGE)</span>
              <h2 className="text-2xl font-display font-extrabold text-white mt-1 truncate">
                {stats.topIndividualOffStage ? stats.topIndividualOffStage.name : 'TBD'}
              </h2>
              <p className="text-xs text-teal-200/70 font-mono mt-1 uppercase">
                {stats.topIndividualOffStage ? `${stats.topIndividualOffStage.unitName} • ${stats.topIndividualOffStage.categoryName}` : '-'}
              </p>
              <div className="flex gap-4 mt-4 font-mono text-xs">
                <div>
                  <span className="text-teal-300">Off-Stage Score:</span>
                  <span className="text-amber-400 font-bold ml-1">{stats.topIndividualOffStage ? stats.topIndividualOffStage.overallMarks : 0}</span>
                </div>
                <div>
                  <span className="text-teal-300">Events Completed:</span>
                  <span className="text-white font-bold ml-1">{stats.topIndividualOffStage ? stats.topIndividualOffStage.totalEvents : 0}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-teal-900/50 flex justify-between items-center text-xs text-teal-300 font-semibold">
            <span>Written, arts, drawing, essay contests etc.</span>
            <CheckCircle className="h-4 w-4 text-teal-400" />
          </div>
        </div>

      </div>

      {/* 3. Detailed visual bar charts / distribution tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Distribution of registrations by Sector Units */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <h4 className="font-display font-bold text-slate-800 text-base">Registrations by Sector Unit</h4>
          <div className="space-y-3 pt-2">
            {stats.participantsByUnit.map((item: any) => {
              // Calculate width fraction relative to max
              const maxCount = Math.max(...stats.participantsByUnit.map((u: any) => u.count)) || 1;
              const barWidth = (item.count / maxCount) * 100;
              return (
                <div key={item.unitId} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span>{item.unitName}</span>
                    <span className="font-mono">{item.count} participants</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-100">
                    <div 
                      className="bg-emerald-600 h-full rounded-full transition-all" 
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Distribution by Category */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <h4 className="font-display font-bold text-slate-800 text-base">Registrations by Category</h4>
          <div className="space-y-3 pt-2">
            {stats.participantsByCategory.map((item: any) => {
              const maxCount = Math.max(...stats.participantsByCategory.map((c: any) => c.count)) || 1;
              const barWidth = (item.count / maxCount) * 100;
              return (
                <div key={item.categoryId} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span>{item.categoryName}</span>
                    <span className="font-mono">{item.count}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-100">
                    <div 
                      className="bg-amber-500 h-full rounded-full transition-all" 
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 4. Recent Logs and Registrations grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Registered Participants */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-6 pb-2 border-b border-slate-100/60">
            <h4 className="font-display font-bold text-slate-800 text-base">Recent Registrations</h4>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.recentRegistrations.length > 0 ? (
              stats.recentRegistrations.map((p: any) => (
                <div key={p.id} className="p-4 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                  <div>
                    <h5 className="text-sm font-semibold text-slate-800">{p.fullName}</h5>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {p.unitName} • {p.categoryName}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">No recent registrations found</div>
            )}
          </div>
        </div>

        {/* Recent Results Published */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="p-6 pb-2 border-b border-slate-100/60">
            <h4 className="font-display font-bold text-slate-800 text-base">Recent Results Updates</h4>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.recentResults.length > 0 ? (
              stats.recentResults.map((r: any) => (
                <div key={r.id} className="p-4 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                  <div>
                    <h5 className="text-sm font-semibold text-slate-800 truncate max-w-[180px] sm:max-w-xs">{r.competitionName}</h5>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.participantName} ({r.unitName}) • {r.categoryName}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-emerald-600 block">{r.totalMark} marks</span>
                    <span className="text-[10px] font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Rank {r.rank || 'N/A'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">No results entered yet</div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
