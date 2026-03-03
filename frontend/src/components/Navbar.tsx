'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { 
  Router as RouterIcon, LogOut, Settings, User, Bell, 
  Info, AlertTriangle, AlertCircle, Sun, Moon, Menu, X
} from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function Navbar() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fetchData = async () => {
    try {
      const [alertsRes, countRes, userRes] = await Promise.all([
        api.get('/alerts/?limit=5'),
        api.get('/alerts/unread-count'),
        api.get('/users/me')
      ]);
      setAlerts(alertsRes.data);
      setUnreadCount(countRes.data.count);
      setCurrentUser(userRes.data);
    } catch (err: any) {
      console.error('Navbar fetchData failed:', err.message || err);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  const markAllRead = async () => {
    try {
      await api.post('/alerts/mark-all-read');
      setUnreadCount(0);
      fetchAlerts();
    } catch (err: any) {
      console.error('Failed to mark alerts as read:', err.message || err);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await api.get('/alerts/?limit=5');
      setAlerts(res.data);
    } catch (err: any) {
      console.error('Failed to fetch alerts:', err.message || err);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white/60 dark:bg-dark-900/60 backdrop-blur-md border-b border-slate-200 dark:border-white/10 px-6 py-3 flex items-center justify-between transition-colors duration-300">
      <div
        className="flex items-center gap-3 cursor-pointer group"
        onClick={() => router.push('/routers')}
      >
        <div className="bg-primary/20 p-2 rounded-xl group-hover:bg-primary/30 transition-colors duration-300">
          <RouterIcon className="w-6 h-6 text-primary shadow-glow" />
        </div>
        <span className="font-black text-xl tracking-tighter text-slate-900 dark:text-slate-50">
          VyOS <span className="text-primary">Dashy</span>
        </span>
      </div>

      {/* Desktop Actions */}
      <div className="hidden md:flex items-center gap-4">
        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="p-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl transition-all"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button 
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
            }}
            className="p-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl transition-all relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 bg-danger text-white text-[10px] font-black w-4 h-4 flex items-center justify-center rounded-full border-2 border-white dark:border-dark-900">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-4 w-80 glass-modal p-4 shadow-2xl z-50">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-white/5">
                <h3 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Active Alerts</h3>
                <button onClick={markAllRead} className="text-[10px] text-primary hover:text-primary-hover font-black uppercase">Mark all read</button>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {alerts.length === 0 ? (
                  <p className="text-center py-6 text-xs text-slate-500 italic">No alerts found</p>
                ) : (
                  alerts.map((alert) => (
                    <div key={alert.id} className="flex gap-3 items-start group">
                      <div className={`mt-0.5 p-1.5 rounded-lg ${
                        alert.severity === 'critical' ? 'bg-danger/10 text-danger' : 
                        alert.severity === 'warning' ? 'bg-warning/10 text-warning' : 'bg-info/10 text-info'
                      }`}>
                        {alert.severity === 'critical' ? <AlertCircle className="w-3 h-3" /> : 
                         alert.severity === 'warning' ? <AlertTriangle className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] text-slate-800 dark:text-slate-200 leading-tight font-medium">{alert.message}</p>
                        <span className="text-[9px] text-slate-500 font-bold uppercase">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />

        {/* User Menu */}
        <div className="relative">
          <button 
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
            }}
            className="flex items-center gap-3 pl-2 group"
          >
            <div className="bg-slate-200 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-300 dark:border-white/5 group-hover:border-primary/50 transition-all">
              <User className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
            <div className="hidden lg:flex flex-col items-start">
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                {currentUser?.full_name?.split(' ')[0] || 'User'}
              </span>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">
                {currentUser?.role || 'Operator'}
              </span>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-4 w-56 glass-modal p-2 shadow-2xl z-50">
              <div className="p-3 border-b border-slate-200 dark:border-white/5 mb-2">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{currentUser?.email}</p>
                <p className="text-[10px] font-bold text-primary uppercase mt-1">{currentUser?.role} Account</p>
              </div>
              <button className="w-full flex items-center gap-3 p-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all">
                <Settings className="w-4 h-4" /> Account Settings
              </button>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-2.5 text-xs font-bold text-danger hover:bg-danger/10 rounded-xl transition-all mt-1"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Menu Toggle */}
      <button 
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl"
      >
        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="absolute top-full left-0 right-0 bg-white dark:bg-dark-900 border-b border-slate-200 dark:border-white/10 p-6 flex flex-col gap-6 md:hidden shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="bg-slate-200 dark:bg-slate-800 p-2 rounded-lg">
                 <User className="w-5 h-5 text-slate-500" />
               </div>
               <div>
                 <p className="text-sm font-black text-slate-900 dark:text-white">{currentUser?.full_name || 'User'}</p>
                 <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{currentUser?.role || 'Member'}</p>
               </div>
            </div>
            <button onClick={toggleTheme} className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg">
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => { router.push('/routers'); setIsMobileMenuOpen(false); }}
              className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5"
            >
              <RouterIcon className="w-6 h-6 text-primary mb-2" />
              <span className="text-[10px] font-black uppercase tracking-widest">Routers</span>
            </button>
            <button className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5">
              <Bell className="w-6 h-6 text-warning mb-2" />
              <span className="text-[10px] font-black uppercase tracking-widest">Alerts</span>
            </button>
          </div>

          <button 
            onClick={handleLogout}
            className="w-full btn-primary bg-danger hover:bg-danger/90 flex items-center justify-center gap-2 py-4"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
