import React from 'react';
import { promptForApiKey } from '../services/geminiService';

const Header: React.FC = () => {
  const handleChangeKey = async () => {
    await promptForApiKey();
  };

  return (
    <header className="border-b border-app-border bg-app-bg/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-app-accent flex items-center justify-center shadow-lg shadow-app-accent/20">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-app-bg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-xl font-display tracking-wide text-white uppercase flex items-baseline gap-2">
            Prompt Studio
            <span className="text-[10px] font-mono text-app-muted tracking-widest hidden sm:inline">BY FUN FRAME PHOTO</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleChangeKey}
            className="text-[10px] uppercase tracking-wider font-bold bg-app-surface hover:bg-app-border text-app-text px-3 py-1.5 rounded border border-app-border flex items-center gap-1.5 transition-colors"
          >
            <span className="text-app-accent">🔑</span>
            Change API Key
          </button>
          <div className="text-xs font-mono text-app-muted uppercase tracking-widest hidden md:block">
            Powered by Gemini
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;