import React, { useState, useEffect } from 'react';
import { 
  Trophy, ClipboardCheck, Edit3, Trash2, CheckCircle2, 
  RefreshCw, AlertTriangle, ChevronRight, BookOpen, ToggleLeft, CheckCircle, Settings, CheckSquare, ShieldAlert, X
} from 'lucide-react';
import { User, UserRole, Category, Competition, Unit, ResultStatus, ParticipationType, Result, Participant } from '../types';

interface ResultEntryViewProps {
  user: User;
  token: string;
}

export default function ResultEntryView({ user, token }: ResultEntryViewProps) {
  // Master lists
  const [categories, setCategories] = useState<Category[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  // Workflow selectors
  const [selectedCatId, setSelectedCatId] = useState('');
  const [selectedStageType, setSelectedStageType] = useState('');
  const [selectedCompId, setSelectedCompId] = useState('');
  const [selectedComp, setSelectedComp] = useState<Competition | null>(null);

  // Registered candidates matching chosen event
  const [candidatesList, setCandidatesList] = useState<any[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  // Entered/Published results for selected event
  const [savedResults, setSavedResults] = useState<any[]>([]);

  // Active Result Form state (modal / entry sheet)
  const [activeCandidate, setActiveCandidate] = useState<any>(null); // participant or team
  const [j1Mark, setJ1Mark] = useState<number | ''>('');
  const [j2Mark, setJ2Mark] = useState<number | ''>('');
  const [resultStatus, setResultStatus] = useState<ResultStatus>(ResultStatus.PARTICIPATED);
  const [remarks, setRemarks] = useState('');
  const [overrideRank, setOverrideRank] = useState<number | ''>('');
  const [manualRankOverride, setManualRankOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [publishing, setPublishing] = useState(true);

  const [savingResult, setSavingResult] = useState(false);

  const [draftLoaded, setDraftLoaded] = useState(false);
  const [tempCandidateId, setTempCandidateId] = useState<string | null>(null);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const draftStr = localStorage.getItem(`result_draft_${user.id}`);
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft.selectedCatId) setSelectedCatId(draft.selectedCatId);
        if (draft.activeCandidateId) setTempCandidateId(draft.activeCandidateId);
        if (draft.j1Mark !== undefined) setJ1Mark(draft.j1Mark);
        if (draft.j2Mark !== undefined) setJ2Mark(draft.j2Mark);
        if (draft.resultStatus !== undefined) setResultStatus(draft.resultStatus);
        if (draft.remarks !== undefined) setRemarks(draft.remarks);
        if (draft.overrideRank !== undefined) setOverrideRank(draft.overrideRank);
        if (draft.manualRankOverride !== undefined) setManualRankOverride(draft.manualRankOverride);
        if (draft.overrideReason !== undefined) setOverrideReason(draft.overrideReason);
        if (draft.publishing !== undefined) setPublishing(draft.publishing);
      }
    } catch (err) {
      console.error('Failed to load result draft:', err);
    } finally {
      setDraftLoaded(true);
    }
  }, [user.id]);

  // Bind temp active candidate once candidates list is populated
  useEffect(() => {
    if (!tempCandidateId || candidatesList.length === 0) return;
    const found = candidatesList.find(c => c.id === tempCandidateId);
    if (found) {
      setActiveCandidate(found);
      setTempCandidateId(null); // clear after binding
    }
  }, [tempCandidateId, candidatesList]);

  // Save draft to localStorage whenever states change
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      const draft = {
        selectedCatId,
        activeCandidateId: activeCandidate ? activeCandidate.id : null,
        j1Mark,
        j2Mark,
        resultStatus,
        remarks,
        overrideRank,
        manualRankOverride,
        overrideReason,
        publishing
      };
      localStorage.setItem(`result_draft_${user.id}`, JSON.stringify(draft));
    } catch (err) {
      console.error('Failed to save result draft:', err);
    }
  }, [
    draftLoaded, selectedCatId, selectedStageType, selectedCompId, activeCandidate,
    j1Mark, j2Mark, resultStatus, remarks, overrideRank, manualRankOverride,
    overrideReason, publishing, user.id
  ]);

  const fetchMasters = async () => {
    try {
      const [cRes, compRes, uRes, pRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/competitions'),
        fetch('/api/units'),
        fetch('/api/participants', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      const [cData, compData, uData, pData] = await Promise.all([cRes.json(), compRes.json(), uRes.json(), pRes.json()]);

      setCategories(cData);
      setCompetitions(compData);
      setUnits(uData);
      setParticipants(pData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasters();
  }, []);

  // Fetch candidates and existing results when competition changes
  useEffect(() => {
    if (!selectedCompId) {
      setCandidatesList([]);
      setSavedResults([]);
      setSelectedComp(null);
      return;
    }

    const comp = competitions.find(c => c.id === selectedCompId);
    setSelectedComp(comp || null);

    const fetchEventData = async () => {
      setCandidatesLoading(true);
      try {
        // Fetch saved results for this competition
        const resRes = await fetch(`/api/results?competitionId=${selectedCompId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const resData = await resRes.json();
        setSavedResults(resData);

        // Fetch candidates (participants or teams)
        if (comp?.participationType === ParticipationType.INDIVIDUAL) {
          // Fetch participants registered in selected individual competition
          // In our setup, participant's directory can be filtered by category. We can also filter on server or load all.
          const partRes = await fetch(`/api/participants?categoryId=${selectedCatId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const partData = await partRes.json();
          setCandidatesList(partData);
        } else {
          // Fetch group teams registered in this competition
          const teamRes = await fetch(`/api/teams?competitionId=${selectedCompId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const teamData = await teamRes.json();
          setCandidatesList(teamData);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCandidatesLoading(false);
      }
    };

    fetchEventData();
  }, [selectedCompId]);

  // Open Marks entry card
  const handleOpenEntry = (candidate: any) => {
    setActiveCandidate(candidate);
    
    // Check if result already exists
    const existing = savedResults.find(r => 
      (selectedComp?.participationType === ParticipationType.INDIVIDUAL 
        ? r.participantId === candidate.id 
        : r.teamId === candidate.id)
    );

    if (existing) {
      setJ1Mark(existing.judge1Mark);
      setJ2Mark(existing.judge2Mark);
      setResultStatus(existing.status);
      setRemarks(existing.remarks || '');
      setManualRankOverride(!!existing.manualRankOverride);
      setOverrideRank(existing.rank || '');
      setOverrideReason(existing.manualRankOverrideReason || '');
      setPublishing(existing.publishedStatus);
    } else {
      setJ1Mark('');
      setJ2Mark('');
      setResultStatus(ResultStatus.PARTICIPATED);
      setRemarks('');
      setManualRankOverride(false);
      setOverrideRank('');
      setOverrideReason('');
      setPublishing(true);
    }
  };

  // Submit Result Entry
  const handleSubmitResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate) return;

    // Validate marks if status is participated
    if (resultStatus === ResultStatus.PARTICIPATED) {
      if (j1Mark === '' || j2Mark === '') {
        alert('Please enter marks for both judges');
        return;
      }
    }

    setSavingResult(true);

    // Check if edit or create
    const existing = savedResults.find(r => 
      (selectedComp?.participationType === ParticipationType.INDIVIDUAL 
        ? r.participantId === activeCandidate.id 
        : r.teamId === activeCandidate.id)
    );

    const payload = {
      categoryId: selectedCatId,
      competitionId: selectedCompId,
      participantId: selectedComp?.participationType === ParticipationType.INDIVIDUAL ? activeCandidate.id : undefined,
      teamId: selectedComp?.participationType === ParticipationType.GROUP ? activeCandidate.id : undefined,
      judge1Mark: resultStatus === ResultStatus.PARTICIPATED ? Number(j1Mark) : 0,
      judge2Mark: resultStatus === ResultStatus.PARTICIPATED ? Number(j2Mark) : 0,
      status: resultStatus,
      remarks,
      publishedStatus: publishing,
      manualRankOverride,
      manualRankOverrideReason: manualRankOverride ? overrideReason : undefined,
      overrideRank: (manualRankOverride && overrideRank !== '') ? Number(overrideRank) : undefined
    };

    try {
      let res;
      if (existing) {
        // Edit existing result
        res = await fetch(`/api/results/${existing.id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      } else {
        // Create fresh result
        res = await fetch('/api/results', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to enter results');

      // Refresh list
      setActiveCandidate(null);
      // Clear draft
      localStorage.removeItem(`result_draft_${user.id}`);
      // Trigger refresh of list entries
      const refreshRes = await fetch(`/api/results?competitionId=${selectedCompId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const refreshData = await refreshRes.json();
      setSavedResults(refreshData);

      alert('Result entered and scoreboards recalculated!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingResult(false);
    }
  };

  // Soft Delete existing result
  const handleDeleteResult = async (id: string) => {
    if (!confirm('Are you sure you want to delete this candidate result? All scoreboard and unit rankings will immediately recalculate.')) return;

    try {
      const res = await fetch(`/api/results/${id}/delete`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove result record');

      // Refresh
      const refreshRes = await fetch(`/api/results?competitionId=${selectedCompId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const refreshData = await refreshRes.json();
      setSavedResults(refreshData);

      alert('Result removed successfully');
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Bulk Announce/Un-announce
  const handleBulkAnnounce = async (announce: boolean) => {
    if (!selectedCompId) return;
    const actionText = announce ? 'announce' : 'un-announce';
    if (!confirm(`Are you sure you want to ${actionText} all results for this competition?`)) return;
    
    try {
      const res = await fetch('/api/results/announce', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ competitionId: selectedCompId, announce })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${actionText} results`);

      // Refresh
      const refreshRes = await fetch(`/api/results?competitionId=${selectedCompId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const refreshData = await refreshRes.json();
      setSavedResults(refreshData);
      
      alert(data.message);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[50vh]">
        <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin mb-4" />
        <span className="text-slate-500 font-mono text-xs">Loading result registry...</span>
      </div>
    );
  }

  // Filter competitions by selected category and stage type
  const filteredComps = competitions.filter(c => 
    c.categoryId === selectedCatId && 
    c.active && 
    (!selectedStageType || c.stageType === selectedStageType)
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto font-sans">
      
      {/* Category and Competition workflow selectors */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">1. Select Category</label>
          <select
            value={selectedCatId}
            onChange={(e) => {
              setSelectedCatId(e.target.value);
              setSelectedCompId('');
            }}
            className="mt-2 block w-full px-4 py-2.5 border border-slate-300 rounded-xl text-slate-700 font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Choose Category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedCatId && (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">2. Stage Placement</label>
            <select
              value={selectedStageType}
              onChange={(e) => {
                setSelectedStageType(e.target.value);
                setSelectedCompId('');
              }}
              className="mt-2 block w-full px-4 py-2.5 border border-slate-300 rounded-xl text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All Stages</option>
              <option value="on_stage">On-Stage Only</option>
              <option value="off_stage">Off-Stage Only</option>
            </select>
          </div>
        )}

        {selectedCatId && (
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">3. Select Competition Event</label>
            <select
              value={selectedCompId}
              onChange={(e) => setSelectedCompId(e.target.value)}
              className="mt-2 block w-full px-4 py-2.5 border border-slate-300 rounded-xl text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Choose Competition</option>
              {filteredComps.map(c => <option key={c.id} value={c.id}>{c.name} ({c.participationType})</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Registry Sheet list of registered participants/teams */}
      {selectedCompId && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden no-print">
          
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h4 className="font-display font-extrabold text-slate-800 text-base">{selectedComp?.name} Registry</h4>
              <p className="text-xs text-slate-400 mt-1 uppercase font-mono font-bold">
                {selectedComp?.participationType} Event • {selectedComp?.stageType.replace('_', ' ')}
              </p>
            </div>
            
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] px-3 py-1 rounded-xl font-mono font-semibold">
              Candidates Registered: {candidatesList.length}
            </div>
          </div>

          {candidatesLoading ? (
            <div className="p-12 text-center text-xs font-mono text-slate-400 animate-pulse">Loading candidate registrations...</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {candidatesList.length > 0 ? (
                candidatesList.map((candidate) => {
                  // Look up existing result record
                  const resRecord = savedResults.find(r => 
                    (selectedComp?.participationType === ParticipationType.INDIVIDUAL 
                      ? r.participantId === candidate.id 
                      : r.teamId === candidate.id)
                  );

                  const unit = units.find(u => u.id === candidate.unitId);

                  return (
                    <div key={candidate.id} className="p-5 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                      <div className="flex-1 overflow-hidden pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded border">
                            {selectedComp?.participationType === ParticipationType.INDIVIDUAL ? candidate.profilePhoto : candidate.teamNumber}
                          </span>
                          <h5 className="text-sm font-semibold text-slate-800">
                            {selectedComp?.participationType === ParticipationType.INDIVIDUAL ? (
                              candidate.fullName || 'Unknown Participant'
                            ) : (
                              <div className="flex flex-col">
                                <span>{candidate.teamName || 'Group Team'}</span>
                                <span className="text-[10px] text-slate-500 font-normal">
                                  {candidate.memberIds ? candidate.memberIds.map((mid: string) => participants.find(p => p.id === mid)?.fullName).filter(Boolean).join(', ') : ''}
                                </span>
                              </div>
                            )}
                          </h5>
                        </div>
                        <span className="text-xs font-semibold text-slate-500 mt-1 block font-mono">Representing Unit: {unit ? unit.name : 'Unknown'}</span>
                      </div>

                      <div className="flex items-center gap-4">
                        {resRecord ? (
                          <div className="text-right">
                            {resRecord.status === ResultStatus.PARTICIPATED ? (
                              <>
                                <span className="text-sm font-extrabold text-emerald-600 block">{resRecord.totalMark} marks</span>
                                <span className={`inline-block text-[9px] font-mono font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded uppercase mt-0.5 border border-amber-200`}>
                                  Rank {resRecord.rank || 'N/A'} {resRecord.manualRankOverride && ' (Overridden)'}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs font-bold text-rose-500 uppercase bg-rose-50 px-2.5 py-1 rounded font-mono border border-rose-200">
                                {resRecord.status.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400 font-mono italic">Not Evaluated</span>
                        )}

                        <div className="flex items-center gap-1.5 shrink-0 border-l pl-4 border-slate-100">
                          <button
                            onClick={() => handleOpenEntry(candidate)}
                            className="flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border px-3 py-1.5 rounded-xl shadow-sm transition-colors"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span>{resRecord ? 'Edit Marks' : 'Enter Marks'}</span>
                          </button>
                          
                          {resRecord && (
                            <button
                              onClick={() => handleDeleteResult(resRecord.id)}
                              className="p-1.5 rounded-xl hover:bg-rose-50 hover:text-rose-600 text-slate-400"
                              title="Delete Result"
                            >
                              <Trash2 className="h-4.5 w-4.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-12 text-center text-slate-400 text-sm font-mono">No registered participants/teams found for this event</div>
              )}
            </div>
          )}

          {/* Manage Announcements Section (Sector Team Only) */}
          {user.role !== UserRole.UNIT_TEAM_LEADER && savedResults.length > 0 && (
            <div className="bg-slate-50 border-t border-slate-200 p-5 no-print">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h4 className="font-display font-bold text-slate-800 text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-emerald-600" />
                    Manage Result Announcements
                  </h4>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">
                    Announced results will be immediately visible to Unit Team Leaders.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleBulkAnnounce(false)}
                    className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors"
                  >
                    Un-announce All
                  </button>
                  <button
                    onClick={() => handleBulkAnnounce(true)}
                    className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/10 rounded-xl text-xs font-bold transition-colors flex items-center gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Announce All Results
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* --- ENTRY MARKS SHEET DRAWER POPUP --- */}
      {activeCandidate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 animate-scale-up space-y-4">
            
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-bold text-slate-800 text-base">Enter Judges' Score</h3>
                  {draftLoaded && (
                    <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                      Draft Saved
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                  Candidate: {activeCandidate.fullName || activeCandidate.teamName}
                </span>
              </div>
              <button onClick={() => setActiveCandidate(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitResult} className="space-y-4 text-xs font-sans">
              
              {/* Status selectors */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Participation Status</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {[
                    { id: ResultStatus.PARTICIPATED, label: 'Participated' },
                    { id: ResultStatus.ABSENT, label: 'Absent' },
                    { id: ResultStatus.DISQUALIFIED, label: 'Disqualified' }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setResultStatus(item.id)}
                      className={`py-2 px-3 border rounded-xl font-bold text-[11px] text-center transition-all ${
                        resultStatus === item.id 
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800' 
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Marks inputs (Only if Status is Participated!) */}
              {resultStatus === ResultStatus.PARTICIPATED && (
                <div className="grid grid-cols-2 gap-4 animate-fade-in bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Judge 1 Mark</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0"
                      value={j1Mark}
                      onChange={(e) => setJ1Mark(e.target.value !== '' ? Number(e.target.value) : '')}
                      className="mt-1.5 block w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-sm shadow-inner"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Judge 2 Mark</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0"
                      value={j2Mark}
                      onChange={(e) => setJ2Mark(e.target.value !== '' ? Number(e.target.value) : '')}
                      className="mt-1.5 block w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-sm shadow-inner"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}

              {/* Manual Override Option */}
              {resultStatus === ResultStatus.PARTICIPATED && (
                <div className="border border-slate-200/80 rounded-2xl p-4 space-y-3 bg-white">
                  <label className="flex items-center gap-2.5 font-bold text-slate-700 uppercase tracking-wider text-[10px] font-mono cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manualRankOverride}
                      onChange={(e) => setManualRankOverride(e.target.checked)}
                      className="h-4 w-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                    />
                    Enable Manual Rank Override
                  </label>
                  
                  {manualRankOverride && (
                    <div className="space-y-3 animate-fade-in">
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Override Rank (1, 2, 3...)</label>
                          <input
                            type="number"
                            required
                            min="1"
                            value={overrideRank}
                            onChange={(e) => setOverrideRank(e.target.value !== '' ? Number(e.target.value) : '')}
                            className="mt-1.5 block w-full px-3 py-2 border rounded-xl text-slate-900 font-mono"
                            placeholder="E.g. 1"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Reason for Override</label>
                          <input
                            type="text"
                            required
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            className="mt-1.5 block w-full px-3 py-2 border rounded-xl text-slate-900"
                            placeholder="E.g. Decided by tie-breaker round"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Judges Remarks / Notes</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="mt-1.5 block w-full px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:outline-none"
                  rows={2}
                  placeholder="Optional remarks"
                />
              </div>

              <div className="flex justify-between items-center pt-3 border-t">
                {/* Publishing checkbox */}
                <label className="flex items-center gap-2 font-semibold text-slate-500 text-[11px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={publishing}
                    onChange={(e) => setPublishing(e.target.checked)}
                    className="h-4.5 w-4.5 text-emerald-600 border-slate-300 rounded"
                  />
                  Publish results instantly
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveCandidate(null)}
                    className="px-4 py-2 border rounded-xl font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingResult}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/10"
                  >
                    {savingResult ? 'Saving...' : 'Save Result'}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
