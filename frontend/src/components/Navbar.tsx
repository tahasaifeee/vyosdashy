'use client';

import { useRouter } from 'next/navigation';
import { Router as RouterIcon, LogOut } from 'lucide-react';

export default function Navbar() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => router.push('/routers')}
      >
        <RouterIcon className="w-6 h-6 text-blue-600" />
        <span className="font-semibold text-gray-900 dark:text-white">VyOS UI Manager</span>
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-500 transition"
      >
        <LogOut className="w-4 h-4" />
        Logout
      </button>
    </nav>
  );
}
