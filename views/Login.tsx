
import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Personnel, LogEntry, SiteSettings } from '../types';

interface LoginProps {
  onLogin: (user: Personnel) => void;
  addLog?: (aktivitas: LogEntry['aktivitas'], keterangan: string) => void;
  siteSettings: SiteSettings;
  currentUser?: Personnel | null;
}

const Login: React.FC<LoginProps> = ({ onLogin, addLog, siteSettings, currentUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [redirectToDashboard, setRedirectToDashboard] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Redirect if already logged in
  if (currentUser || redirectToDashboard) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      
          if (data.success) {
            onLogin(data.user);
            if (addLog) addLog('Login', `Pengguna ${data.user.nama} berhasil masuk ke sistem`);
            setRedirectToDashboard(true);
          } else {
            setError(data.message || 'Akses ditolak. Email atau kata sandi tidak valid.');
          }
    } catch (err) {
      setError('Terjadi kesalahan koneksi ke server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col md:flex-row font-sans overflow-hidden">
      
      {/* Bagian Kiri dengan Gambar Latar Belakang */}
      <div className="hidden md:flex md:w-[50%] lg:w-[55%] relative flex-col justify-between p-12 text-white overflow-hidden">
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-700 scale-105 hover:scale-100"
          style={{ backgroundImage: 'url("/img/polda_building.webp")' }}
        >
          {/* Overlay Biru Transparan */}
          <div className="absolute inset-0 bg-blue-900/60 mix-blend-multiply"></div>
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/90 via-blue-900/40 to-transparent"></div>
        </div>

        <div className="relative z-10 flex flex-col items-start gap-8 mt-20">
          {/* Logo Tanpa Frame - Lebih Clean */}
          <div className="w-32 h-32 flex items-center justify-center">
            <img 
              src={siteSettings.logo || "/img/BIDTIK.webp"} 
              alt="Logo Unit" 
              className="w-full h-full object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]" 
            />
          </div>
          
          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-tight leading-tight uppercase drop-shadow-lg max-w-lg">
              {siteSettings.loginTitle || 'Reset Password Email Polri'}
            </h1>
            <h2 className="text-2xl font-bold tracking-tight uppercase opacity-90 drop-shadow-md">
              {siteSettings.loginSubtitle || 'Bid Tik Polda Jatim'}
            </h2>
          </div>
          
          <div className="pl-6 border-l-4 border-sky-400/60 space-y-2 py-1">
            <p className="text-xl font-bold tracking-wider drop-shadow-md">MENGABDI DENGAN INTEGRASI</p>
            <p className="text-xl font-bold tracking-wider drop-shadow-md">MELAYANI DENGAN TEKNOLOGI</p>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between w-full opacity-70 text-[10px] font-black uppercase tracking-[0.3em]">
          <span>© 2026 {siteSettings.name} - Bid Tik</span>
          <span>V 1.0</span>
        </div>
      </div>

      {/* Bagian Kanan - Formulir Login */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 md:p-16 lg:p-24 bg-white shadow-[-20px_0_50px_rgba(0,0,0,0.05)]">
        <div className="w-full max-w-md space-y-12">
          <div className="text-center md:text-left">
            <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Login Panel</h2>
            <p className="text-slate-500 text-sm font-semibold leading-relaxed">
              Selamat datang kembali. Silakan masukkan kredensial akun Anda untuk mengakses sistem administrasi.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Email Personel</label>
                <div className="relative group">
                  <input 
                    type="email" 
                    className="w-full px-6 py-4 rounded-2xl border border-slate-100 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 font-bold text-slate-700 placeholder:text-slate-300 transition-all pr-14"
                    placeholder="Masukkan Email Dinas"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <span className="material-symbols-outlined absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">mail</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Kata Sandi</label>
                </div>
                <div className="relative group">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    className="w-full px-6 py-4 rounded-2xl border border-slate-100 bg-slate-50/50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 font-bold text-slate-700 placeholder:text-slate-300 transition-all pr-14"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="material-symbols-outlined absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="text-[11px] font-bold text-rose-600 bg-rose-50 p-4 rounded-2xl border border-rose-100 flex items-center gap-3 animate-pulse">
                <span className="material-symbols-outlined text-lg">warning</span>
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest text-white shadow-2xl shadow-blue-200 flex items-center justify-center gap-4 transition-all active:scale-[0.97] ${
                isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-300 hover:-translate-y-0.5'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  Masuk Ke Dashboard
                  <span className="material-symbols-outlined text-xl">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-4">
             <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
               <div className="flex items-center gap-2 mb-3">
                 <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Informasi Penting</p>
               </div>
               <p className="text-[11px] font-bold text-slate-600 leading-relaxed">
                 Gunakan email dinas yang sudah diverifikasi oleh Bid Tik. Jika belum memiliki akses, silakan hubungi pusat bantuan kami.
               </p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
