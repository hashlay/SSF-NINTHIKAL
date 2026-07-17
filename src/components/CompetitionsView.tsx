import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, Search, Filter, RefreshCw, Eye, Medal, HelpCircle, ChevronDown, Layers, LayoutGrid
} from 'lucide-react';
import { User, UserRole, Category, Competition, ParticipationType, StageType } from '../types';

interface CompetitionsViewProps {
  user: User;
  token: string;
}

export default function CompetitionsView({ user, token }: CompetitionsViewProps) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // View mode: 'grouped' by category & stage type, or 'grid' for plain layout
  const [viewMode, setViewMode] = useState<'grouped' | 'grid'>('grouped');

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStageType, setSelectedStageType] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'code' | 'duration'>('name');

  // Selected Comp Details Popup Modal (shows counts, limits, status)
  const [selectedComp, setSelectedComp] = useState<any>(null);
  const [compDetails, setCompDetails] = useState<any>(null);
  const [compLoading, setCompLoading] = useState(false);

  const fetchCompsAndCats = async () => {
    setLoading(true);
    try {
      const [compRes, cRes] = await Promise.all([
        fetch('/api/competitions'),
        fetch('/api/categories')
      ]);

      const [compData, cData] = await Promise.all([compRes.json(), cRes.json()]);
      setCompetitions(compData);
      setCategories(cData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompsAndCats();
  }, []);

  // Fetch detailed registrations for selected competition
  const handleViewDetails = async (comp: Competition) => {
    setSelectedComp(comp);
    setCompDetails(null);
    setCompLoading(true);

    try {
      // In a real database, we could run specialized aggregates. Let's lookup via endpoint or simulate
      // We can query registrations or teams matching this competitionId
      const [regRes, resultsRes] = await Promise.all([
        fetch(`/api/participants`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/results?competitionId=${comp.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const [regData, resultsData] = await Promise.all([regRes.json(), resultsRes.json()]);

      // Filter based on participation type
      let registeredCount = 0;
      if (comp.participationType === ParticipationType.INDIVIDUAL) {
        // Since participants store selected categories, let's look at scoreboard placements which maps individual events
        const sbRes = await fetch(`/api/scoreboard`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const sbData = await sbRes.json();
        // Count how many participants have placement records containing this compId
        registeredCount = sbData.filter((entry: any) => 
          entry.placements.some((pl: any) => pl.compId === comp.id)
        ).length;
      } else {
        // Count group teams registered for this competition
        const teamRes = await fetch(`/api/teams?competitionId=${comp.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const teamData = await teamRes.json();
        registeredCount = teamData.length;
      }

      setCompDetails({
        registeredCount,
        resultsPublished: resultsData.length > 0,
        results: resultsData
      });
    } catch (e) {
      console.error(e);
    } finally {
      setCompLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[50vh]">
        <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin mb-4" />
        <span className="text-slate-500 font-mono text-xs">Loading competition master data...</span>
      </div>
    );
  }

  const filteredCompetitions = competitions.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategoryId ? c.categoryId === selectedCategoryId : true;
    const matchesType = selectedType ? c.participationType === selectedType : true;
    const matchesStageType = selectedStageType ? c.stageType === selectedStageType : true;
    return matchesSearch && matchesCategory && matchesType && matchesStageType && c.active;
  });

  const sortedCompetitions = [...filteredCompetitions].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'code') {
      return a.id.localeCompare(b.id);
    }
    if (sortBy === 'duration') {
      return (a.duration || 0) - (b.duration || 0);
    }
    return 0;
  });

  const renderCompCard = (comp: Competition, cat?: Category) => {
    return (
      <div key={comp.id} className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start border-b border-slate-100 pb-3">
            <div>
              <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {comp.id.replace('comp_', '').toUpperCase()}
              </span>
              <h4 className="font-display font-extrabold text-slate-800 text-sm leading-tight mt-1 truncate max-w-[200px]">{comp.name}</h4>
            </div>
            
            <button
              onClick={() => handleViewDetails(comp)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-50"
              title="Inspect Registrations"
            >
              <Eye className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4 font-mono text-[10px] font-bold">
            <span className={`px-2.5 py-0.5 rounded-md uppercase ${
              comp.participationType === ParticipationType.INDIVIDUAL 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                : 'bg-purple-50 text-purple-800 border border-purple-100'
            }`}>
              {comp.participationType}
            </span>
            <span className={`px-2.5 py-0.5 rounded-md uppercase ${
              comp.stageType === StageType.ON_STAGE 
                ? 'bg-amber-50 text-amber-800 border border-amber-100' 
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {comp.stageType.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="mt-6 pt-3 border-t border-slate-100 flex justify-between items-baseline text-[10px] font-mono font-bold text-slate-400">
          <span>CATEGORY: {cat?.name || 'General'}</span>
          {comp.duration > 0 && <span>DUR: {comp.duration} mins</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans">
      
      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row gap-4 justify-between items-center no-print">
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-stretch sm:items-center">
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4.5 w-4.5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search by code or program name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 self-center sm:self-auto shrink-0">
            <button
              onClick={() => setViewMode('grouped')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all uppercase font-mono ${
                viewMode === 'grouped'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Grouped
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all uppercase font-mono ${
                viewMode === 'grid'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 w-full lg:w-auto justify-end">
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-slate-700 focus:outline-none text-xs font-semibold bg-slate-50"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-slate-700 focus:outline-none text-xs font-semibold bg-slate-50"
          >
            <option value="">All Types</option>
            <option value={ParticipationType.INDIVIDUAL}>Individual Events</option>
            <option value={ParticipationType.GROUP}>Group Events</option>
          </select>

          <select
            value={selectedStageType}
            onChange={(e) => setSelectedStageType(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-slate-700 focus:outline-none text-xs font-semibold bg-slate-50"
          >
            <option value="">All Stages</option>
            <option value={StageType.ON_STAGE}>On-Stage Only</option>
            <option value={StageType.OFF_STAGE}>Off-Stage Only</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-slate-700 focus:outline-none text-xs font-semibold bg-slate-50 font-mono"
          >
            <option value="name">Sort: Alphabetical (A-Z)</option>
            <option value="code">Sort: Program Code</option>
            <option value="duration">Sort: Duration (Shortest)</option>
          </select>
        </div>
      </div>

      {/* Grid or Grouped list representation of Competitions */}
      {viewMode === 'grouped' ? (
        <div className="space-y-8">
          {categories
            .filter(cat => !selectedCategoryId || cat.id === selectedCategoryId)
            .map(cat => {
              const catComps = sortedCompetitions.filter(c => c.categoryId === cat.id);
              if (catComps.length === 0) return null;

              const onStageComps = catComps.filter(c => c.stageType === StageType.ON_STAGE);
              const offStageComps = catComps.filter(c => c.stageType === StageType.OFF_STAGE);

              return (
                <div key={cat.id} className="bg-slate-50/50 p-6 rounded-3xl border border-slate-200/60 shadow-xs space-y-5">
                  {/* Category Header */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse"></div>
                      <h3 className="font-display font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                        {cat.name}
                      </h3>
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 font-mono text-[9px] font-bold px-2 py-0.5 rounded-full">
                        {catComps.length} {catComps.length === 1 ? 'Program' : 'Programs'}
                      </span>
                    </div>
                  </div>

                  {/* On Stage and Off Stage Subsections */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* On-Stage Subsection */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-amber-50/60 border border-amber-100/60 px-3.5 py-1.5 rounded-xl">
                        <span className="font-display font-bold text-amber-800 text-[10px] uppercase tracking-wider font-mono">
                          On-Stage Events
                        </span>
                        <span className="bg-amber-100 text-amber-900 font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                          {onStageComps.length}
                        </span>
                      </div>

                      {onStageComps.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {onStageComps.map(comp => renderCompCard(comp, cat))}
                        </div>
                      ) : (
                        <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl text-[10px] font-mono text-slate-400 bg-white/60">
                          No on-stage programs found under this category
                        </div>
                      )}
                    </div>

                    {/* Off-Stage Subsection */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-slate-100/80 border border-slate-200 px-3.5 py-1.5 rounded-xl">
                        <span className="font-display font-bold text-slate-700 text-[10px] uppercase tracking-wider font-mono">
                          Off-Stage Events
                        </span>
                        <span className="bg-slate-200 text-slate-800 font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                          {offStageComps.length}
                        </span>
                      </div>

                      {offStageComps.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {offStageComps.map(comp => renderCompCard(comp, cat))}
                        </div>
                      ) : (
                        <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl text-[10px] font-mono text-slate-400 bg-white/60">
                          No off-stage programs found under this category
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

          {sortedCompetitions.length === 0 && (
            <div className="bg-white p-12 text-center text-slate-400 text-sm font-mono border border-slate-200 rounded-3xl">
              No competitions found matching filters
            </div>
          )}
        </div>
      ) : (
        /* Regular grid representation */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedCompetitions.length > 0 ? (
            sortedCompetitions.map((comp) => {
              const cat = categories.find(c => c.id === comp.categoryId);
              return renderCompCard(comp, cat);
            })
          ) : (
            <div className="col-span-full bg-white p-12 text-center text-slate-400 text-sm font-mono border border-slate-200 rounded-3xl">
              No competitions found matching filters
            </div>
          )}
        </div>
      )}

      {/* --- DETAILED COMP INSIGHTS MODAL --- */}
      {selectedComp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-scale-up space-y-4">
            
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <span className="font-mono text-[10px] font-bold text-slate-400 block uppercase">Program Details insights</span>
                <h3 className="font-display font-extrabold text-slate-800 text-base mt-1">{selectedComp.name}</h3>
              </div>
              <button onClick={() => setSelectedComp(null)} className="p-1 rounded-lg text-slate-400">
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>

            {compLoading ? (
              <div className="py-8 text-center text-xs font-mono text-slate-400 animate-pulse">Aggregating records counts...</div>
            ) : (
              <div className="space-y-4 text-xs font-sans">
                
                {/* Visual aggregates summary cards */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 block uppercase font-mono">Registered Count</span>
                    <span className="text-lg font-extrabold text-slate-800 mt-1 block">
                      {compDetails?.registeredCount} {selectedComp.participationType === ParticipationType.INDIVIDUAL ? 'Candidates' : 'Teams'}
                    </span>
                  </div>
                  <div className="border-l pl-3">
                    <span className="text-[9px] font-bold text-slate-400 block uppercase font-mono">Results status</span>
                    <span className={`text-xs font-extrabold mt-1.5 block uppercase ${
                      compDetails?.resultsPublished ? 'text-emerald-700 font-bold' : 'text-amber-600'
                    }`}>
                      {compDetails?.resultsPublished ? '● Published' : '○ Pending Entry'}
                    </span>
                  </div>
                </div>

                {/* Print Placement details list */}
                {compDetails?.resultsPublished && (
                  <div>
                    <h4 className="font-display font-bold text-slate-700 text-xs mb-2 uppercase tracking-wider font-mono">Published Standings</h4>
                    <ul className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {compDetails.results.map((r: any) => (
                        <li key={r.id} className="bg-slate-50 border p-2.5 rounded-xl flex justify-between items-center">
                          <div>
                            <span className="font-semibold text-slate-800 block">{r.participantName || r.teamNumber || 'Group Team'}</span>
                            <span className="text-[9px] font-mono text-slate-400 mt-0.5 block">Rank {r.rank || 'N/A'}</span>
                          </div>
                          <span className="font-bold text-emerald-600 font-mono">{r.totalMark} marks</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              </div>
            )}

            <button
              onClick={() => setSelectedComp(null)}
              className="mt-4 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors font-mono"
            >
              Close Details
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
