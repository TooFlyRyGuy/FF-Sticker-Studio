import React, { useState, useEffect } from 'react';
import { Folder } from '../types';
import { getFolders } from '../services/storageService';
import Button from './Button';

interface SavePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, folderId: string) => void;
  initialTitle?: string;
  initialFolderId?: string;
}

const SavePromptModal: React.FC<SavePromptModalProps> = ({ isOpen, onClose, onSave, initialTitle = '', initialFolderId = 'root' }) => {
  const [title, setTitle] = useState(initialTitle);
  const [folderId, setFolderId] = useState(initialFolderId);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchFolders = async () => {
        setIsLoading(true);
        try {
           const data = await getFolders();
           setFolders(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
      };

      fetchFolders();
      setTitle(initialTitle);
      setFolderId(initialFolderId);
    }
  }, [isOpen, initialTitle, initialFolderId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-app-bg/90 backdrop-blur-sm animate-fadeIn">
      <div className="bg-app-surface w-full max-w-md rounded-xl border border-app-border shadow-2xl p-6">
        <h3 className="text-sm font-mono uppercase tracking-wider font-bold text-white mb-4">Save Prompt</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Prompt Title</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Cyberpunk Cityscape"
              className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-2.5 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Folder</label>
            <select 
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              disabled={isLoading}
              className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-2.5 text-white focus:ring-1 focus:ring-app-accent outline-none disabled:opacity-50 font-mono text-sm"
            >
              <option value="root">Uncategorized</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button 
            variant="primary" 
            onClick={() => {
              if (title.trim()) onSave(title, folderId);
            }} 
            disabled={!title.trim() || isLoading}
            className="flex-1"
          >
            {isLoading ? 'Loading...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SavePromptModal;