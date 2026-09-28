import React from 'react';
import { supabase } from '../services/supabaseClient';

const Header: React.FC = () => {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('isAuthenticated');
    window.location.reload();
  };

  return (
    <header className="border-b border-app-border bg-app-bg/80 backdrop-blur-md sticky top-0 z-40 w-full">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-[#052e16] flex items-center justify-center shadow-lg border border-[#22c55e]/30 flex-shrink-0">
             <span className="text-[#22c55e] font-sans font-black text-xs sm:text-sm tracking-[-0.15em] ml-0.5 sm:ml-1">PS</span>
          </div>
          <span className="text-base sm:text-xl font-display tracking-wide text-white uppercase flex items-baseline gap-1.5 sm:gap-2 truncate">
            Prompt Studio
            <span className="text-[9px] sm:text-[10px] font-mono text-app-muted tracking-widest hidden xs:inline">BY FUN FRAME PHOTO</span>
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div className="text-[10px] sm:text-xs font-mono text-app-muted uppercase tracking-widest hidden md:block">
            Powered by Gemini
          </div>
          <button
            onClick={handleLogout}
            className="text-[10px] sm:text-xs font-mono text-app-muted hover:text-white uppercase tracking-widest border border-app-border px-3 py-1.5 rounded hover:bg-app-surface transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
