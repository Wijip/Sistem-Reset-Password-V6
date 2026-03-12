
import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { 
  Personnel, 
  ResetRequest, 
  SiteSettings, 
  Notification, 
  UserRole,
  RequestStatus,
  LogEntry
} from './types';
import { INITIAL_PERSONNEL, INITIAL_REQUESTS, INITIAL_LOGS } from './constants';
import Dashboard from './views/Dashboard';
import ResetRequests from './views/ResetRequests';
import PersonnelData from './views/PersonnelData';
import Reports from './views/Reports';
import Logs from './views/Logs';
import Settings from './views/Settings';
import Login from './views/Login';
import UserDashboard from './views/UserDashboard';
import PublicResetForm from './views/PublicResetForm';
import Sidebar from './components/Sidebar';
import MobileTopbar from './components/MobileTopbar';
import Toast from './components/Toast';

const ProtectedRoute: React.FC<React.PropsWithChildren<{ 
  currentUser: Personnel | null, 
  superAdminOnly?: boolean,
  anyAdminOnly?: boolean,
  allowUser?: boolean
}>> = ({ children, currentUser, superAdminOnly = false, anyAdminOnly = false, allowUser = false }) => {
  if (!currentUser) return <Navigate to="/login" replace />;
  
  if (superAdminOnly && currentUser.role !== UserRole.SUPERADMIN) return <Navigate to="/" replace />;
  
  if (anyAdminOnly && currentUser.role === UserRole.USER && !allowUser) return <Navigate to="/" replace />;
  
  return <>{children}</>;
};

const DATA_VERSION = 'v2.8'; // Increment this to force data update for all users

const App: React.FC = () => {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => {
    const saved = localStorage.getItem('SITE_SETTINGS');
    return saved ? JSON.parse(saved) : { 
      name: 'Polda Jatim', 
      logo: '/img/BIDTIK.webp',
      loginTitle: 'Reset Password Email Polri',
      loginSubtitle: 'Bid Tik Polda Jatim',
      requestsTitle: 'Manajemen Reset Password',
      requestsSubtitle: 'PANTAU DAN EKSEKUSI PERMOHONAN AKSES PERSONEL',
      darkMode: false
    };
  });

  // Fetch initial data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pRes, rRes, lRes] = await Promise.all([
          fetch('/api/personnel'),
          fetch('/api/requests'),
          fetch('/api/logs')
        ]);
        
        if (pRes.ok) setPersonnel(await pRes.json());
        if (rRes.ok) setRequests(await rRes.json());
        if (lRes.ok) setLogs(await lRes.json());
      } catch (error) {
        console.error('Failed to fetch data from API:', error);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (siteSettings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [siteSettings.darkMode]);

  // Apply dark mode class immediately on mount if enabled in settings
  useLayoutEffect(() => {
    const saved = localStorage.getItem('SITE_SETTINGS');
    if (saved) {
      const settings = JSON.parse(saved);
      if (settings.darkMode) {
        document.documentElement.classList.add('dark');
      }
    }
  }, []);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUser, setCurrentUser] = useState<Personnel | null>(() => {
    const saved = localStorage.getItem('session_personel');
    return saved ? JSON.parse(saved) : null;
  });

  const [toasts, setToasts] = useState<{id: string, message: string, type: 'success' | 'error'}[]>([]);

  useEffect(() => {
    localStorage.setItem('SITE_SETTINGS', JSON.stringify(siteSettings));
  }, [siteSettings]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('session_personel', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('session_personel');
    }
  }, [currentUser]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const addLog = useCallback(async (aktivitas: LogEntry['aktivitas'], keterangan: string) => {
    if (!currentUser) return;
    const newLog: LogEntry = {
      id: `L-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      waktu: Date.now(),
      user: {
        nama: currentUser.nama,
        role: currentUser.role === UserRole.SUPERADMIN ? 'Super Admin' : currentUser.role === UserRole.ADMIN ? 'Admin Polres' : 'Personel',
        initials: currentUser.nama.split(' ').map(n => n[0]).join('').toUpperCase()
      },
      aktivitas,
      keterangan,
      ipAddress: '10.12.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255)
    };
    
    setLogs(prev => [newLog, ...prev]);
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLog)
      });
    } catch (e) {
      console.error('Failed to save log to API');
    }
  }, [currentUser]);

  const handleLogout = () => {
    addLog('Sistem', 'Pengguna melakukan logout dari sistem');
    localStorage.removeItem('session_personel');
    setCurrentUser(null);
  };

  const addNotification = (title: string, body: string, type: 'request' | 'system' | 'personnel', refId?: string) => {
    const newNotif: Notification = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      body,
      time: Date.now(),
      read: false,
      type,
      refId
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const submitPublicRequest = async (nrp: string, alasan: string, dokumen_kta?: string, prioritas?: any) => {
    const person = personnel.find(p => p.nrp === nrp);
    if (!person) return { success: false, message: 'NRP tidak terdaftar dalam sistem.' };

    const newRequest: ResetRequest = {
      id: `REQ-${Math.floor(1000 + Math.random() * 9000)}`,
      nama: person.nama,
      pangkat: person.pangkat,
      nrp: person.nrp,
      jabatan: person.jabatan,
      kesatuan: person.kesatuan,
      waktu_iso: new Date().toISOString(),
      status: RequestStatus.MENUNGGU,
      alasan: alasan,
      dokumen_kta,
      prioritas: prioritas || 'Normal',
      createdAt: Date.now()
    };

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRequest)
      });
      
      if (res.ok) {
        setRequests(prev => [newRequest, ...prev]);
        addNotification('Permintaan Baru', `Pengajuan reset password dari NRP ${nrp}`, 'request', newRequest.id);
        return { success: true, message: 'Permintaan Anda telah dikirim ke Admin.' };
      }
      return { success: false, message: 'Gagal mengirim permintaan ke server.' };
    } catch (error) {
      return { success: false, message: 'Terjadi kesalahan koneksi.' };
    }
  };

  return (
    <HashRouter>
      <div className={`min-h-screen flex flex-col md:flex-row transition-colors duration-300 ${siteSettings.darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        {currentUser && (
          <>
            <Sidebar 
              siteSettings={siteSettings} 
              setSiteSettings={setSiteSettings}
              currentUser={currentUser} 
              onLogout={handleLogout} 
            />
            <MobileTopbar 
              siteSettings={siteSettings} 
              setSiteSettings={setSiteSettings}
              notifications={notifications} 
              currentUser={currentUser} 
            />
          </>
        )}

        <div className={`flex-1 flex flex-col min-w-0 ${currentUser ? 'pt-14 md:pt-0' : ''}`}>
          <Routes>
            <Route path="/login" element={<Login onLogin={(user) => { setCurrentUser(user); }} addLog={addLog} siteSettings={siteSettings} />} />
            <Route path="/request-reset" element={<PublicResetForm onSubmit={submitPublicRequest} siteSettings={siteSettings} />} />
            
            <Route path="/" element={
              <ProtectedRoute currentUser={currentUser}>
                {currentUser?.role === UserRole.SUPERADMIN ? (
                  <Dashboard requests={requests} personnel={personnel} showToast={showToast} currentUser={currentUser!} siteSettings={siteSettings} />
                ) : (
                  <Navigate to="/requests" replace />
                )}
              </ProtectedRoute>
            } />
            
            <Route path="/requests" element={
              <ProtectedRoute anyAdminOnly allowUser currentUser={currentUser}>
                <ResetRequests 
                  requests={requests} 
                  setRequests={setRequests} 
                  showToast={showToast}
                  addNotification={addNotification}
                  addLog={addLog}
                  siteSettings={siteSettings}
                  setSiteSettings={setSiteSettings}
                  currentUser={currentUser as Personnel}
                />
              </ProtectedRoute>
            } />
            
            <Route path="/personnel" element={
              <ProtectedRoute anyAdminOnly currentUser={currentUser}>
                <PersonnelData 
                  personnel={personnel} 
                  setPersonnel={setPersonnel} 
                  showToast={showToast}
                  addLog={addLog}
                  siteSettings={siteSettings}
                  currentUser={currentUser as Personnel}
                />
              </ProtectedRoute>
            } />

            <Route path="/reports" element={
              <ProtectedRoute anyAdminOnly currentUser={currentUser}>
                <Reports requests={requests} showToast={showToast} siteSettings={siteSettings} currentUser={currentUser as Personnel} />
              </ProtectedRoute>
            } />

            <Route path="/logs" element={
              <ProtectedRoute superAdminOnly currentUser={currentUser}>
                <Logs logs={logs} showToast={showToast} siteSettings={siteSettings} />
              </ProtectedRoute>
            } />
            
            <Route path="/settings" element={
              <ProtectedRoute anyAdminOnly currentUser={currentUser}>
                <Settings 
                  siteSettings={siteSettings} 
                  setSiteSettings={setSiteSettings} 
                  currentUser={currentUser as Personnel}
                  setCurrentUser={setCurrentUser}
                  showToast={showToast}
                  addLog={addLog}
                />
              </ProtectedRoute>
            } />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none print:hidden">
          {toasts.map(t => (
            <Toast key={t.id} message={t.message} type={t.type} />
          ))}
        </div>
      </div>
    </HashRouter>
  );
};

export default App;
