import React, { useState, useEffect } from 'react';
import { 
  UserPlus, Calendar, GraduationCap, ChevronRight, 
  ChevronLeft, ClipboardCheck, AlertTriangle, Check, RefreshCw, X
} from 'lucide-react';
import { User, UserRole, EducationStatus, Gender, Category, Competition, ParticipationType, StageType } from '../types';

interface RegistrationViewProps {
  user: User;
  token: string;
}

export default function RegistrationView({ user, token }: RegistrationViewProps) {
  // Master lists
  const [units, setUnits] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  // Form Steps: 1 = Unit, 2 = Participant Details, 3 = Category & Events, 4 = Review & Submit
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Participant Data Form State
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [gender, setGender] = useState<Gender>(Gender.MALE);
  const [educationStatus, setEducationStatus] = useState<EducationStatus>(EducationStatus.STUDENT);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Campus fields
  const [institution, setInstitution] = useState('');
  const [course, setCourse] = useState('');
  const [yearSemester, setYearSemester] = useState('');

  // Category Eligibility State
  const [eligibilityList, setEligibilityList] = useState<any[]>([]);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  // Competitions selected
  const [selectedComps, setSelectedComps] = useState<string[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<any>(null);
  const [forceSubmit, setForceSubmit] = useState(false);

  // Fetch initial master lists
  const fetchMasterLists = async () => {
    try {
      const [uRes, cRes, compRes] = await Promise.all([
        fetch('/api/units'),
        fetch('/api/categories'),
        fetch('/api/competitions')
      ]);

      const [uData, cData, compData] = await Promise.all([uRes.json(), cRes.json(), compRes.json()]);

      setUnits(uData.filter((u: any) => u.active));
      setCategories(cData.filter((c: any) => c.active));
      setCompetitions(compData.filter((c: any) => c.active));

      // Lock Unit Leader's unit automatically
      if (user.role === UserRole.UNIT_TEAM_LEADER) {
        setSelectedUnitId(user.assignedUnitId || '');
        setStep(2); // Jump straight to details
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterLists();
  }, []);

  const [draftLoaded, setDraftLoaded] = useState(false);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const draftStr = localStorage.getItem(`registration_draft_${user.id}`);
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft.fullName) setFullName(draft.fullName);
        if (draft.dob) setDob(draft.dob);
        if (draft.selectedUnitId && user.role !== UserRole.UNIT_TEAM_LEADER) setSelectedUnitId(draft.selectedUnitId);
        if (draft.gender) setGender(draft.gender);
        if (draft.educationStatus) setEducationStatus(draft.educationStatus);
        if (draft.selectedCategoryId) setSelectedCategoryId(draft.selectedCategoryId);
        if (draft.phone) setPhone(draft.phone);
        if (draft.guardianPhone) setGuardianPhone(draft.guardianPhone);
        if (draft.address) setAddress(draft.address);
        if (draft.notes) setNotes(draft.notes);
        if (draft.institution) setInstitution(draft.institution);
        if (draft.course) setCourse(draft.course);
        if (draft.yearSemester) setYearSemester(draft.yearSemester);
        if (draft.selectedComps) setSelectedComps(draft.selectedComps);
        if (draft.step) setStep(draft.step);
      }
    } catch (err) {
      console.error('Failed to load registration draft:', err);
    } finally {
      setDraftLoaded(true);
    }
  }, [user.id]);

  // Save draft to localStorage whenever states change
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      const draft = {
        fullName,
        dob,
        selectedUnitId: user.role === UserRole.UNIT_TEAM_LEADER ? undefined : selectedUnitId,
        gender,
        educationStatus,
        selectedCategoryId,
        phone,
        guardianPhone,
        address,
        notes,
        institution,
        course,
        yearSemester,
        selectedComps,
        step
      };
      localStorage.setItem(`registration_draft_${user.id}`, JSON.stringify(draft));
    } catch (err) {
      console.error('Failed to save registration draft:', err);
    }
  }, [
    draftLoaded, fullName, dob, selectedUnitId, gender, educationStatus,
    selectedCategoryId, phone, guardianPhone, address, notes,
    institution, course, yearSemester, selectedComps, step, user.id
  ]);

  // Recalculate eligibility when Education Status changes (and optionally DOB)
  useEffect(() => {
    if (!educationStatus) return;

    const checkEligibility = async () => {
      setEligibilityLoading(true);
      try {
        const res = await fetch('/api/participants/check-eligibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dob, educationStatus })
        });
        const data = await res.json();
        setEligibilityList(data);

        // Reset category selection and competition choice if no longer eligible
        const previouslySelected = data.find((e: any) => e.id === selectedCategoryId);
        if (!previouslySelected || !previouslySelected.eligible) {
          setSelectedCategoryId('');
          setSelectedComps([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setEligibilityLoading(false);
      }
    };

    checkEligibility();
  }, [dob, educationStatus]);

  // Reset selected categories / details if jumping backward
  const handleCategorySelect = (catId: string) => {
    setSelectedCategoryId(catId);
    setSelectedComps([]); // reset selected competitions upon category swap
  };

  // Select/Deselect individual and group competitions, enforcing 3 ind / 2 grp limits
  const handleCompToggle = (compId: string) => {
    const comp = competitions.find(c => c.id === compId);
    if (!comp) return;

    const isSelected = selectedComps.includes(compId);

    if (isSelected) {
      setSelectedComps(selectedComps.filter(id => id !== compId));
    } else {
      // Calculate limits
      const selectedModels = competitions.filter(c => selectedComps.includes(c.id));
      const individualCount = selectedModels.filter(c => c.participationType === ParticipationType.INDIVIDUAL).length;
      const groupCount = selectedModels.filter(c => c.participationType === ParticipationType.GROUP).length;

      if (comp.participationType === ParticipationType.INDIVIDUAL) {
        if (individualCount >= 3) {
          alert('Maximum 3 individual competitions reached.');
          return;
        }
      } else {
        if (groupCount >= 2) {
          alert('Maximum 2 group competitions reached.');
          return;
        }
      }
      setSelectedComps([...selectedComps, compId]);
    }
  };

  // Duplicate Check logic before Review step
  const handleNextToReview = async () => {
    if (!selectedCategoryId) {
      alert('Please select an eligible category');
      return;
    }
    if (selectedComps.length === 0) {
      alert('Please select at least one competition');
      return;
    }

    setStep(4);
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    setMessage(null);

    const payload = {
      fullName,
      dob,
      unitId: selectedUnitId,
      gender,
      educationStatus,
      selectedCategoryId,
      phone,
      guardianPhone,
      address,
      notes,
      institution: undefined,
      course: (educationStatus === EducationStatus.UNDERGRADUATE || educationStatus === EducationStatus.POSTGRADUATE) ? course : undefined,
      yearSemester: (educationStatus === EducationStatus.UNDERGRADUATE || educationStatus === EducationStatus.POSTGRADUATE) ? yearSemester : undefined,
      selectedCompetitionIds: selectedComps
    };

    try {
      const res = await fetch('/api/participants', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete registration');
      }

      setMessage({ type: 'success', text: `Participant registered successfully with Chest No: ${data.participant.profilePhoto}` });
      // Clear draft
      localStorage.removeItem(`registration_draft_${user.id}`);
      // Reset form
      setFullName('');
      setDob('');
      if (user.role !== UserRole.UNIT_TEAM_LEADER) setSelectedUnitId('');
      setGender(Gender.MALE);
      setEducationStatus(EducationStatus.STUDENT);
      setSelectedCategoryId('');
      setSelectedComps([]);
      setPhone('');
      setGuardianPhone('');
      setAddress('');
      setNotes('');
      setInstitution('');
      setCourse('');
      setYearSemester('');
      setDuplicateWarning(null);
      setForceSubmit(false);
      setStep(user.role === UserRole.UNIT_TEAM_LEADER ? 2 : 1);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[50vh]">
        <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin mb-4" />
        <span className="text-slate-500 font-mono text-xs">Loading registration wizard...</span>
      </div>
    );
  }

  // Filter competitions belonging to the active category
  const filteredCompetitions = competitions.filter(c => c.categoryId === selectedCategoryId);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto font-sans">
      
      {/* Step progress bar */}
      <div className="mb-8 border border-slate-200/60 bg-white p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 no-print">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-emerald-600" />
          <span className="font-display font-bold text-slate-800 text-sm">REGISTRATION STEPS</span>
          {draftLoaded && (
            <span className="ml-2 bg-emerald-50 text-emerald-700 text-[9px] font-bold font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              Draft Saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 md:gap-3">
          {[
            { s: 1, label: 'Unit' },
            { s: 2, label: 'Details' },
            { s: 3, label: 'Events' },
            { s: 4, label: 'Review' }
          ].map((item) => {
            // Skip step 1 for unit team leader
            if (item.s === 1 && user.role === UserRole.UNIT_TEAM_LEADER) return null;
            const isCompleted = step > item.s;
            const isActive = step === item.s;
            return (
              <React.Fragment key={item.s}>
                {item.s > (user.role === UserRole.UNIT_TEAM_LEADER ? 2 : 1) && (
                  <div className={`h-0.5 w-4 sm:w-10 ${isCompleted ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                )}
                <div className="flex items-center gap-1.5">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs ${
                    isActive 
                      ? 'bg-amber-500 text-slate-900 ring-4 ring-amber-100' 
                      : isCompleted ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}>
                    {isCompleted ? <Check className="h-3.5 w-3.5 stroke-[3px]" /> : item.s}
                  </div>
                  <span className={`hidden sm:inline text-xs font-semibold ${isActive ? 'text-slate-900 font-bold' : 'text-slate-400'}`}>
                    {item.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 shadow-sm ${
          message.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${message.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
            <Check className="h-4 w-4" />
          </div>
          <div>
            <h5 className="font-semibold text-sm">{message.type === 'success' ? 'Success' : 'Error'}</h5>
            <p className="text-xs mt-0.5 font-mono">{message.text}</p>
          </div>
        </div>
      )}

      {/* STEP 1: SELECT SECTOR UNIT (Super Admin / Sector team only) */}
      {step === 1 && user.role !== UserRole.UNIT_TEAM_LEADER && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="font-display font-bold text-slate-800 text-lg">Select Participant's Unit</h3>
            <p className="text-xs text-slate-400 mt-1">Which unit does the candidate represent?</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {units.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setSelectedUnitId(u.id);
                  setStep(2);
                }}
                className={`p-5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between h-32 hover:border-emerald-600 hover:shadow-lg ${
                  selectedUnitId === u.id 
                    ? 'border-emerald-600 bg-emerald-50/20 shadow-md ring-2 ring-emerald-500/20' 
                    : 'border-slate-200 bg-white'
                }`}
              >
                <span className="font-mono text-xs font-bold text-slate-400 uppercase tracking-widest">{u.code}</span>
                <span className="font-display font-extrabold text-slate-800 text-base">{u.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: PARTICIPANT DETAILS & DATE OF BIRTH */}
      {step === 2 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4 flex justify-between items-center">
            <div>
              <h3 className="font-display font-bold text-slate-800 text-lg">Participant Personal Details</h3>
              <p className="text-xs text-slate-400 mt-1">Enter correct birth records and educational status</p>
            </div>
            {user.role !== UserRole.UNIT_TEAM_LEADER && (
              <button 
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200"
              >
                Change Unit ({units.find(u => u.id === selectedUnitId)?.name})
              </button>
            )}
          </div>

          <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); setStep(3); }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Candidate's Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-2 block w-full px-4 py-2.5 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm shadow-sm"
                  placeholder="Enter full name"
                />
              </div>

              {/* Date of Birth */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-emerald-600" />
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="mt-2 block w-full px-4 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm shadow-sm font-mono"
                />
              </div>

              {/* Education Status */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <GraduationCap className="h-4.5 w-4.5 text-emerald-600" />
                  Education Status
                </label>
                <select
                  value={educationStatus}
                  onChange={(e) => setEducationStatus(e.target.value as EducationStatus)}
                  className="mt-2 block w-full px-4 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm shadow-sm"
                >
                  <option value={EducationStatus.STUDENT}>School/College Student</option>
                  <option value={EducationStatus.UNDERGRADUATE}>Undergraduate Course (UG)</option>
                  <option value={EducationStatus.POSTGRADUATE}>Postgraduate Course (PG)</option>
                </select>
              </div>

            </div>

            {/* Campus details (only if undergraduate/postgraduate) */}
            {(educationStatus === EducationStatus.UNDERGRADUATE || educationStatus === EducationStatus.POSTGRADUATE) && (
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Course / Stream</label>
                  <input
                    type="text"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    className="mt-2 block w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 sm:text-xs"
                    placeholder="E.g. BCA, B.Sc"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Year / Semester</label>
                  <input
                    type="text"
                    value={yearSemester}
                    onChange={(e) => setYearSemester(e.target.value)}
                    className="mt-2 block w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 sm:text-xs"
                    placeholder="E.g. 3rd Year / 6th Sem"
                  />
                </div>
              </div>
            )}

            {/* Optional contact details */}
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Phone Number (Optional)</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-2 block w-full px-4 py-2.5 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm shadow-sm"
                  placeholder="Participant phone number"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <span className="text-xs font-mono text-slate-400">Assigned Unit: {units.find(u => u.id === selectedUnitId)?.name || 'GEN'}</span>
              <button
                type="submit"
                disabled={!fullName}
                id="btn_to_events"
                className="flex items-center px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-md shadow-emerald-600/10"
              >
                Select Events & Category
                <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 3: ELIGIBILITY & EVENTS SELECTOR */}
      {step === 3 && (
        <div className="space-y-6">
          
          {/* ELIGIBLE CATEGORIES LIST */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
            <div>
              <h3 className="font-display font-bold text-slate-800 text-base">Select Competition Category</h3>
              <p className="text-xs text-slate-400 mt-1">Calculated according to age and education limits. Pick one enabled option.</p>
            </div>

            {eligibilityLoading ? (
              <div className="p-6 text-center text-xs text-slate-400 font-mono animate-pulse">Computing eligibility rules...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {eligibilityList.map((el) => (
                  <button
                    key={el.id}
                    type="button"
                    disabled={!el.eligible}
                    onClick={() => handleCategorySelect(el.id)}
                    className={`p-4 rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between ${
                      !el.eligible 
                        ? 'bg-slate-50 border-slate-200/60 opacity-50 cursor-not-allowed' 
                        : selectedCategoryId === el.id
                          ? 'border-emerald-600 bg-emerald-50/10 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {selectedCategoryId === el.id && (
                      <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                        <Check className="h-3 w-3 stroke-[3px]" />
                      </div>
                    )}
                    <span className="font-display font-bold text-slate-800 text-sm">{el.name}</span>
                    <span className={`text-[10px] font-mono mt-2 block font-semibold ${el.eligible ? 'text-emerald-600' : 'text-red-500'}`}>
                      {el.eligible ? '● Eligible to Register' : el.reason}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* EVENTS/PROGRAMS DIRECTORY SELECTOR */}
          {selectedCategoryId && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-display font-bold text-slate-800 text-base">Select Competitions</h3>
                  <p className="text-xs text-slate-400 mt-1">Select individual (max 3) and group (max 2) events</p>
                </div>
                <div className="flex gap-4 font-mono text-xs font-semibold text-slate-500 bg-slate-50 px-4 py-2 rounded-xl border">
                  <span>
                    Ind: <b className="text-emerald-700">{competitions.filter(c => selectedComps.includes(c.id) && c.participationType === ParticipationType.INDIVIDUAL).length}/3</b>
                  </span>
                  <span>
                    Grp: <b className="text-purple-700">{competitions.filter(c => selectedComps.includes(c.id) && c.participationType === ParticipationType.GROUP).length}/2</b>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-2 divide-y divide-slate-100">
                {filteredCompetitions.map((comp) => {
                  const isSelected = selectedComps.includes(comp.id);
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => handleCompToggle(comp.id)}
                      className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 w-full hover:bg-slate-50/50 ${
                        isSelected 
                          ? 'border-emerald-600 bg-emerald-50/10' 
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className={`mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="h-3 w-3 stroke-[3px]" />}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <span className="font-semibold text-slate-800 text-sm leading-tight block truncate">{comp.name}</span>
                        <div className="flex items-center gap-2 mt-1.5 font-mono text-[10px] font-bold">
                          <span className={`px-2 py-0.5 rounded uppercase ${
                            comp.participationType === ParticipationType.INDIVIDUAL 
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                              : 'bg-purple-50 text-purple-800 border border-purple-100'
                          }`}>
                            {comp.participationType}
                          </span>
                          <span className={`px-2 py-0.5 rounded uppercase ${
                            comp.stageType === StageType.ON_STAGE 
                              ? 'bg-amber-50 text-amber-800 border border-amber-100' 
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {comp.stageType.replace('_', ' ')}
                          </span>
                          {comp.duration > 0 && <span className="text-slate-400">{comp.duration} mins</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border">
            <button
              onClick={() => setStep(2)}
              className="flex items-center text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-50 px-4 py-2.5 border rounded-xl"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Candidate Profile
            </button>
            <button
              onClick={handleNextToReview}
              disabled={!selectedCategoryId || selectedComps.length === 0}
              id="btn_to_review"
              className="flex items-center px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 shadow-md shadow-emerald-600/10"
            >
              Review Registration
              <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          </div>

        </div>
      )}

      {/* STEP 4: REVIEW & FINAL CONFIRMATION */}
      {step === 4 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="font-display font-bold text-slate-800 text-lg">Verify Final Records</h3>
            <p className="text-xs text-slate-400 mt-1">Please double-check all candidate records before final submission</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans text-sm">
            <div className="space-y-4">
              <div>
                <span className="text-slate-400 text-xs font-bold block uppercase tracking-wider font-mono">Candidate Name</span>
                <span className="font-extrabold text-slate-800 text-base mt-1 block">{fullName}</span>
              </div>
              <div>
                <span className="text-slate-400 text-xs font-bold block uppercase tracking-wider font-mono">Representing Unit</span>
                <span className="font-extrabold text-slate-800 text-base mt-1 block">
                  {units.find(u => u.id === selectedUnitId)?.name || 'GEN'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 text-xs font-bold block uppercase tracking-wider font-mono">Date of Birth</span>
                  <span className="font-bold text-slate-700 mt-1 block font-mono">{dob || 'Not provided'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-xs font-bold block uppercase tracking-wider font-mono">Education</span>
                  <span className="font-bold text-slate-700 mt-1 block capitalize">{educationStatus.replace('_', ' ')}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-slate-400 text-xs font-bold block uppercase tracking-wider font-mono">Registered Category</span>
                <span className="inline-block bg-amber-100 border border-amber-200 text-amber-900 px-3 py-1 rounded-xl text-xs font-bold mt-1.5">
                  {categories.find(c => c.id === selectedCategoryId)?.name}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-xs font-bold block uppercase tracking-wider font-mono">Selected Competitions</span>
                <ul className="mt-2 space-y-1.5">
                  {competitions.filter(c => selectedComps.includes(c.id)).map(comp => (
                    <li key={comp.id} className="flex justify-between items-center font-mono text-xs font-semibold bg-slate-50 p-2 rounded-lg border">
                      <span>{comp.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${
                        comp.participationType === ParticipationType.INDIVIDUAL ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {comp.participationType}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-6 border-t border-slate-100">
            <button
              onClick={() => setStep(3)}
              className="flex items-center text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-50 px-4 py-2.5 border rounded-xl"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Adjust Programs
            </button>
            <button
              onClick={handleFinalSubmit}
              disabled={submitting}
              id="btn_submit_reg"
              className="flex items-center px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors shadow-md shadow-emerald-600/10"
            >
              {submitting ? 'Registering...' : 'Save & Register Candidate'}
              <ClipboardCheck className="h-4.5 w-4.5 ml-1.5" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
