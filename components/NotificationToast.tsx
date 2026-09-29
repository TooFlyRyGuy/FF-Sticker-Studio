import React, { useEffect } from 'react';
import { NotificationItem } from '../types';

interface ToastProps {
  item: NotificationItem;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ item, onClose }) => {
  useEffect(() => {
    if (item.persistent) return;
    const timer = setTimeout(() => {
      onClose(item.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [item.id, item.persistent, onClose]);

  const styles = {
    success: {
      container: 'bg-app-surface border-emerald-500/50 text-emerald-400',
      icon: (
        <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      )
    },
    error: {
      container: 'bg-app-surface border-red-500/50 text-red-400',
      icon: (
        <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    },
    info: {
      container: 'bg-app-surface border-blue-500/50 text-blue-400',
      icon: (
        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  };

  const style = styles[item.type];

  const handleAction = () => {
    if (item.actionUrl) {
      const link = document.createElement('a');
      link.href = item.actionUrl;
      link.download = `batch-results-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    onClose(item.id);
  };

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border backdrop-blur-md shadow-2xl transition-all animate-slideIn ${style.container} w-80 max-w-[90vw] ${item.persistent ? 'ring-2 ring-app-accent/50' : ''}`}>
      <div className="flex-shrink-0 mt-0.5">{style.icon}</div>
      <div className="flex-1 text-xs font-mono uppercase tracking-wider leading-5">{item.message}</div>
      {item.actionLabel && (
        <button
          onClick={handleAction}
          className="flex-shrink-0 text-xs font-bold uppercase tracking-wider bg-app-accent hover:bg-app-accentHover text-white px-3 py-1.5 rounded transition-colors"
        >
          {item.actionLabel}
        </button>
      )}
      <button
        onClick={() => onClose(item.id)}
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10 rounded"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

interface NotificationContainerProps {
  notifications: NotificationItem[];
  removeNotification: (id: string) => void;
}

const NotificationContainer: React.FC<NotificationContainerProps> = ({ notifications, removeNotification }) => {
  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-3 pointer-events-none">
      <div className="flex flex-col gap-3 pointer-events-auto">
        {notifications.map((item) => (
          <Toast key={item.id} item={item} onClose={removeNotification} />
        ))}
      </div>
    </div>
  );
};

export default NotificationContainer;
