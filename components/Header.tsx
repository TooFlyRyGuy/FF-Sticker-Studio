import React, { useState, useRef, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { NotificationItem } from '../types';
import { supabase } from '../services/supabaseClient';

interface HeaderProps {
  notifications: NotificationItem[];
  onDismissNotification: (id: string) => void;
}

const typeStyles: Record<string, { dot: string; text: string }> = {
  success: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
  error: { dot: 'bg-red-500', text: 'text-red-400' },
  info: { dot: 'bg-blue-500', text: 'text-blue-400' },
};

const Header: React.FC<HeaderProps> = ({ notifications, onDismissNotification }) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('isAuthenticated');
    window.location.reload();
  };

  useEffect(() => {
    if (!isPanelOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPanelOpen]);

  const handleDownload = (item: NotificationItem) => {
    if (item.actionUrl) {
      const link = document.createElement('a');
      link.href = item.actionUrl;
      link.download = `batch-results-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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

          {/* Notification Bell */}
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setIsPanelOpen(!isPanelOpen)}
              className="relative text-app-muted hover:text-white transition-colors p-1.5 rounded hover:bg-app-surface"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-app-accent text-white text-[9px] font-bold rounded-full px-1">
                  {notifications.length}
                </span>
              )}
            </button>

            {/* Notification Panel */}
            {isPanelOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-24px)] bg-app-surface border border-app-border rounded-lg shadow-2xl overflow-hidden animate-fadeIn">
                <div className="flex items-center justify-between px-4 py-3 border-b border-app-border">
                  <span className="text-xs font-mono uppercase tracking-wider text-white">Notifications</span>
                  {notifications.length > 0 && (
                    <span className="text-[10px] font-mono text-app-muted">{notifications.length} active</span>
                  )}
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-8 h-8 text-app-border mx-auto mb-2" />
                      <p className="text-xs font-mono text-app-muted uppercase tracking-wider">No notifications</p>
                    </div>
                  ) : (
                    notifications.map((item) => {
                      const ts = typeStyles[item.type] || typeStyles.info;
                      return (
                        <div key={item.id} className="px-4 py-3 border-b border-app-border last:border-b-0 hover:bg-app-bg/50 transition-colors">
                          <div className="flex items-start gap-2.5">
                            <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${ts.dot}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-mono leading-relaxed text-app-text break-words">{item.message}</p>
                              <div className="flex items-center gap-2 mt-2">
                                {item.actionLabel && item.actionUrl && (
                                  <button
                                    onClick={() => handleDownload(item)}
                                    className="text-[10px] font-bold uppercase tracking-wider bg-app-accent hover:bg-app-accentHover text-white px-2.5 py-1 rounded transition-colors"
                                  >
                                    {item.actionLabel}
                                  </button>
                                )}
                                {item.secondaryActionLabel && item.onSecondaryAction && (
                                  <button
                                    onClick={() => {
                                      item.onSecondaryAction?.();
                                      setIsPanelOpen(false);
                                    }}
                                    className="text-[10px] font-bold uppercase tracking-wider border border-app-border hover:bg-white/10 text-white px-2.5 py-1 rounded transition-colors"
                                  >
                                    {item.secondaryActionLabel}
                                  </button>
                                )}
                                <button
                                  onClick={() => onDismissNotification(item.id)}
                                  className="text-[10px] font-mono text-app-muted hover:text-white uppercase tracking-wider ml-auto transition-colors"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
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
