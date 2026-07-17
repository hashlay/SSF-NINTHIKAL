import React, { useState, useEffect } from 'react';
import { 
  History, ShieldAlert, Key, X, RefreshCw, Calendar, 
  Settings as SettingsIcon, ShieldAlert as ShieldIcon 
} from 'lucide-react';
import { User, UserRole } from './types';
import LoginView from './components/LoginView';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './components/DashboardView';
import RegistrationView from './components/RegistrationView';
import ParticipantsView from './components/ParticipantsView';
import TeamsView from './components/TeamsView';
import CompetitionsView from './components/CompetitionsView';
import ResultEntryView from './components/ResultEntryView';
import ScoreboardView from './components/ScoreboardView';
import StandingsView from './components/StandingsView';
import ReportsView from './components/ReportsView';
import UsersView from './components/UsersView';
import SettingsView from './components/SettingsView';
import RegisteredEventsView from './components/RegisteredEventsView';
import AnnouncedResultsView from './components/AnnouncedResultsView';
import Footer from './components/Footer';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [eventSettings, setEventSettings] = useState<any>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Audit Logs drawer states
  const [showLogs, setShowLogs] = useState(false);
  const [logsList, setLogsList] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Authenticate using existing token on refresh
  useEffect(() => {
    const fetchMe = async () => {
      if (!token) {
        setLoadingEvent(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/session', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.user) {
          setUser(data.user);
          // Set initial default tab depending on user privilege role
          if (data.user.role === UserRole.UNIT_TEAM_LEADER) {
            setActiveTab('registration');
          } else {
            setActiveTab('dashboard');
          }
        } else {
          // Token expired or invalid
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingEvent(false);
      }
    };

    fetchMe();
  }, [token]);

  const [loadingEvent, setLoadingEvent] = useState(true);

  // Fetch brand configurations
  const fetchEventConfig = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setEventSettings(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchEventConfig();
  }, []);

  const handleLoginSuccess = (userObj: User, tokenStr: string) => {
    setUser(userObj);
    setToken(tokenStr);
    localStorage.setItem('token', tokenStr);
    
    // Set appropriate initial tab
    if (userObj.role === UserRole.UNIT_TEAM_LEADER) {
      setActiveTab('registration');
    } else {
      setActiveTab('dashboard');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    setActiveTab('dashboard');
  };

  // Fetch operator audit histories
  const handleOpenLogs = async () => {
    setShowLogs(true);
    setLogsLoading(true);
    try {
      const res = await fetch('/api/audit-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setLogsList(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLogsLoading(false);
    }
  };

  if (loadingEvent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 font-sans">
        <RefreshCw className="h-10 w-10 text-emerald-600 animate-spin mb-4" />
        <span className="text-slate-500 font-mono text-xs">Authenticating operator credentials...</span>
      </div>
    );
  }

  // Not logged in yet
  if (!user || !token) {
    return (
      <LoginView 
        onLoginSuccess={handleLoginSuccess} 
        eventSettings={eventSettings} 
      />
    );
  }

  // Render correct dashboard content based on activeTab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView user={user} token={token} />;
      case 'registration':
        return <RegistrationView user={user} token={token} />;
      case 'participants':
        return <ParticipantsView user={user} token={token} />;
      case 'teams':
        return <TeamsView user={user} token={token} />;
      case 'registered-events':
        return <RegisteredEventsView user={user} token={token} />;
      case 'announced-results':
        return <AnnouncedResultsView user={user} token={token} />;
      case 'competitions':
        return <CompetitionsView user={user} token={token} />;
      case 'results':
        return <ResultEntryView user={user} token={token} />;
      case 'scoreboard':
        return <ScoreboardView user={user} token={token} />;
      case 'standings':
        return <StandingsView user={user} token={token} />;
      case 'reports':
        return <ReportsView user={user} token={token} />;
      case 'users':
        return <UsersView user={user} token={token} />;
      case 'settings':
        return <SettingsView user={user} token={token} />;
      default:
        return <DashboardView user={user} token={token} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Slider drawer navigation panel */}
      <Sidebar 
        user={user} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={handleLogout} 
        eventSettings={eventSettings}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
      />

      {/* Main app display window */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        <Header 
          user={user} 
          activeTab={activeTab} 
          setMobileOpen={setMobileSidebarOpen} 
          eventSettings={eventSettings}
          onShowLogs={user.role === UserRole.SUPER_ADMIN ? handleOpenLogs : undefined}
        />

        <main className="flex-1 pb-6">
          {renderTabContent()}
        </main>

        <Footer />
      </div>

      {/* --- SUPER ADMIN SLIDING AUDIT LOG PANEL --- */}
      {showLogs && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex justify-end no-print">
          <div className="bg-white w-full max-w-lg h-full p-6 overflow-y-auto shadow-2xl flex flex-col justify-between animate-slide-in">
            <div className="space-y-6">
              
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-display font-extrabold text-slate-800 text-base">System Operations Audit Logs</h3>
                </div>
                <button 
                  onClick={() => setShowLogs(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-slate-200/50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {logsLoading ? (
                <div className="py-24 text-center text-xs font-mono text-slate-400 animate-pulse">Querying operator log events...</div>
              ) : (
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {logsList.length > 0 ? (
                    logsList.map((log) => (
                      <div key={log.id} className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl text-xs space-y-1.5">
                        <div className="flex justify-between items-baseline">
                          <span className="font-bold text-slate-800">@{log.username}</span>
                          <span className="font-mono text-[9px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed font-mono text-[11px]">{log.action}</p>
                        {log.details && (
                          <div className="bg-white border rounded p-2 text-[9px] font-mono text-slate-400 break-all">
                            {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-slate-400 font-mono">No operations logged yet</div>
                  )}
                </div>
              )}

            </div>

            <button 
              onClick={() => setShowLogs(false)}
              className="mt-6 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors font-mono"
            >
              Close Operations Log
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
