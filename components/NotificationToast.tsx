import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Download, Info, X } from 'lucide-react';
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

  const config = {
    success: {
      container: 'bg-app-surface border-emerald-500/50',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />,
    },
    error: {
      container: 'bg-app-surface border-red-500/50',
      icon: <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />,
    },
    info: {
      container: 'bg-app-surface border-blue-500/50',
      icon: <Info className="w-5 h-5 text-blue-400 flex-shrink-0" />,
    },
  };

  const style = config[item.type] || config.info;

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
    <div className={`flex flex-col gap-2 p-3.5 rounded-lg border backdrop-blur-md shadow-2xl transition-all animate-slideIn ${style.container} w-[340px] max-w-[calc(100vw-32px)] ${item.persistent ? 'ring-2 ring-app-accent/50' : ''}`}>
      <div className="flex items-start gap-2.5">
        {style.icon}
        <p className="flex-1 text-xs font-mono leading-relaxed text-app-text break-words">{item.message}</p>
        <button
          onClick={() => onClose(item.id)}
          className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {(item.actionLabel || (item.secondaryActionLabel && item.onSecondaryAction)) && (
        <div className="flex items-center gap-2 pl-7">
          {item.secondaryActionLabel && item.onSecondaryAction && (
            <button
              onClick={item.onSecondaryAction}
              className="text-[10px] font-bold uppercase tracking-wider bg-transparent border border-app-border hover:bg-white/10 text-white px-2.5 py-1.5 rounded transition-colors"
            >
              {item.secondaryActionLabel}
            </button>
          )}
          {item.actionLabel && (
            <button
              onClick={handleAction}
              className="text-[10px] font-bold uppercase tracking-wider bg-app-accent hover:bg-app-accentHover text-white px-2.5 py-1.5 rounded transition-colors flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              {item.actionLabel}
            </button>
          )}
        </div>
      )}
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
      <div className="flex flex-col gap-3 pointer-events-auto items-end">
        {notifications.map((item) => (
          <Toast key={item.id} item={item} onClose={removeNotification} />
        ))}
      </div>
    </div>
  );
};

export default NotificationContainer;
