
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { SiteSettings, Notification, Personnel, UserRole } from '../types';

interface MobileTopbarProps {
  siteSettings: SiteSettings;
  setSiteSettings: React.Dispatch<React.SetStateAction<SiteSettings>>;
  notifications: Notification[];
  currentUser: Personnel;
}

const MobileTopbar: React.FC<MobileTopbarProps> = ({ siteSettings, setSiteSettings, notifications, currentUser }) => {
  const isDarkMode = siteSettings.darkMode;
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  const isSuperAdmin = currentUser.role === UserRole.SUPERADMIN;
  const isAdmin = currentUser.role === UserRole.ADMIN;
  const isUser = currentUser.role === UserRole.USER;
  const isAnyAdmin = isSuperAdmin || isAdmin;

  const toggleDarkMode = () => {
    setSiteSettings(prev => ({ ...prev, darkMode: !prev.darkMode }));
  };

  const navItems = [];

  if (isSuperAdmin) {
    navItems.push({ path: '/', icon: 'dashboard', label: 'Dashboard' });
    navItems.push({ path: '/settings', icon: 'settings', label: 'Pengaturan' });
    navItems.push({ path: '/requests', icon: 'lock_reset', label: 'Permintaan Reset' });
    navItems.push({ path: '/personnel', icon: 'group', label: 'Data Personel' });
    navItems.push({ path: '/reports', icon: 'analytics', label: 'Rekap Laporan' });
    navItems.push({ path: '/logs', icon: 'security_update_good', label: 'Log Sistem' });
  } else if (isAdmin) {
    navItems.push({ path: '/requests', icon: 'lock_reset', label: 'Permintaan Reset' });
    if (currentUser.nama === 'URYANDUKNIS') {
      navItems.push({ path: '/personnel', icon: 'group', label: 'Data User' });
      navItems.push({ path: '/reports', icon: 'analytics', label: 'Rekap Laporan' });
    }
  } else if (isUser) {
    navItems.push({ path: '/requests', icon: 'lock_reset', label: 'Permintaan Reset' });
  }

  return (
    <>
      <nav className={`md:hidden fixed inset-x-0 top-0 z-50 border-b h-14 flex items-center justify-between px-4 print:hidden transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsOpen(true)}
            className={`p-2 rounded-lg border transition-colors duration-300 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
          >
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>

          <div className="flex items-center gap-2">
            {siteSettings.logo ? (
              <div className="w-8 h-8 flex items-center justify-center">
                <img src={siteSettings.logo} alt="Logo" className="w-7 h-7 object-contain drop-shadow-sm" />
              </div>
            ) : (
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-blue-600 shadow-sm ${isDarkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
                <span className="material-symbols-outlined text-lg">local_police</span>
              </div>
            )}
            <span className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{siteSettings.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(isAdmin || isUser) && (
            <button 
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg border transition-colors duration-300 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-sky-400' : 'bg-white border-slate-200 text-slate-600'}`}
            >
              <span className="material-symbols-outlined text-xl">{isDarkMode ? 'light_mode' : 'dark_mode'}</span>
            </button>
          )}

          <button className={`relative p-2 rounded-lg border transition-colors duration-300 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-600'}`}>
            <span className="material-symbols-outlined text-xl">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Drawer Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-[60] md:hidden print:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside 
        className={`fixed inset-y-0 left-0 w-72 shadow-xl z-[70] transform transition-transform duration-300 md:hidden flex flex-col print:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}
      >
        <div className={`p-4 border-b flex items-center justify-between ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center">
               <img src={siteSettings.logo || ''} alt="Logo" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <div className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{siteSettings.name}</div>
              <div className="text-xs text-slate-500 font-medium">Admin Panel</div>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsOpen(false)}
              className={({ isActive }: { isActive: boolean }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? 'bg-sky-600 text-white font-bold'
                    : `font-medium ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'}`
                }`
              }
            >
              <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={`p-4 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <button className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm ${isDarkMode ? 'text-rose-400 border border-rose-900/50' : 'text-rose-600 border border-rose-100'}`}> 
            <span className="material-symbols-outlined text-lg">logout</span>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
};

export default MobileTopbar;
