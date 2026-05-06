import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="border-b border-app-border bg-app-bg/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[#052e16] flex items-center justify-center shadow-lg border border-[#22c55e]/30">
             <span className="text-[#22c55e] font-sans font-black text-sm tracking-[-0.15em] ml-1">PS</span>
          </div>
          <span className="text-xl font-display tracking-wide text-white uppercase flex items-baseline gap-2">
            Prompt Studio
            <span className="text-[10px] font-mono text-app-muted tracking-widest hidden sm:inline">BY FUN FRAME PHOTO</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs font-mono text-app-muted uppercase tracking-widest hidden md:block">
            Powered by Gemini
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
