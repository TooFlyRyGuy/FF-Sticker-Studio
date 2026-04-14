import React, { useState, useEffect } from 'react';
import { Folder, SavedPrompt } from '../types';
import { getFolders, saveFolder, deleteFolder, getPrompts, deletePrompt } from '../services/storageService';

interface PromptLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: SavedPrompt) => void;
}

const PromptLibrary: React.FC<PromptLibraryProps> = ({ isOpen, onClose, onSelectPrompt }) => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [loadedFolders, loadedPrompts] = await Promise.all([
        getFolders(),
        getPrompts()
      ]);
      setFolders(loadedFolders);
      setPrompts(loadedPrompts);
    } catch (e) {
      console.error("Failed to load library", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      setIsLoading(true);
      await saveFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreatingFolder(false);
      await loadData();
    }
  };

  const handleDeleteFolder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this folder?')) {
      setIsLoading(true);
      await deleteFolder(id);
      if (selectedFolderId === id) setSelectedFolderId('all');
      await loadData();
    }
  };

  const handleDeletePrompt = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this prompt?')) {
      setIsLoading(true);
      await deletePrompt(id);
      await loadData();
    }
  };

  const filteredPrompts = prompts.filter(p => {
    if (selectedFolderId === 'all') return true;
    if (selectedFolderId === 'root') return p.folderId === 'root' || !p.folderId;
    return p.folderId === selectedFolderId;
  }).sort((a, b) => b.updatedAt - a.updatedAt);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app-bg/90 backdrop-blur-sm animate-fadeIn">
      <div className="bg-app-surface w-full max-w-4xl h-[80vh] rounded-xl border border-app-border shadow-2xl flex overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-1/3 border-r border-app-border bg-app-bg flex flex-col">
          <div className="p-4 border-b border-app-border flex items-center justify-between">
            <h3 className="font-mono uppercase tracking-wider text-sm text-white">Folders</h3>
            <button 
              onClick={() => setIsCreatingFolder(true)}
              className="p-1 hover:bg-app-surface rounded text-app-accent"
              title="New Folder"
              disabled={isLoading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 relative">
            {isLoading && (
              <div className="absolute inset-0 bg-app-bg/60 z-10 flex items-center justify-center">
                 <div className="w-6 h-6 border-2 border-app-accent border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            
            <div 
              className={`p-2 rounded cursor-pointer flex items-center gap-2 ${selectedFolderId === 'all' ? 'bg-app-accent/20 text-app-accent' : 'text-app-muted hover:bg-app-surface'}`}
              onClick={() => setSelectedFolderId('all')}
            >
              <span className="text-xs font-mono uppercase tracking-wider">All Prompts</span>
            </div>
            
            <div 
              className={`p-2 rounded cursor-pointer flex items-center gap-2 ${selectedFolderId === 'root' ? 'bg-app-accent/20 text-app-accent' : 'text-app-muted hover:bg-app-surface'}`}
              onClick={() => setSelectedFolderId('root')}
            >
              <span className="text-xs font-mono uppercase tracking-wider">Uncategorized</span>
            </div>

            {folders.map(folder => (
              <div 
                key={folder.id}
                className={`p-2 rounded cursor-pointer flex items-center justify-between group ${selectedFolderId === folder.id ? 'bg-app-accent/20 text-app-accent' : 'text-app-muted hover:bg-app-surface'}`}
                onClick={() => setSelectedFolderId(folder.id)}
              >
                <div className="flex items-center gap-2 truncate">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="truncate text-xs font-mono uppercase tracking-wider">{folder.name}</span>
                </div>
                <button 
                  onClick={(e) => handleDeleteFolder(folder.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-all"
                  disabled={isLoading}
                >
                  &times;
                </button>
              </div>
            ))}
            
            {isCreatingFolder && (
              <div className="p-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Folder Name"
                  className="w-full bg-app-surface border border-app-border rounded px-2 py-1 text-xs font-mono uppercase tracking-wider text-white focus:border-app-accent outline-none"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') setIsCreatingFolder(false);
                  }}
                  onBlur={() => setIsCreatingFolder(false)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="w-2/3 flex flex-col bg-app-surface relative">
          <div className="p-4 border-b border-app-border flex items-center justify-between">
            <h3 className="font-mono uppercase tracking-wider text-sm text-white">
              {selectedFolderId === 'all' ? 'All Prompts' : 
               selectedFolderId === 'root' ? 'Uncategorized' : 
               folders.find(f => f.id === selectedFolderId)?.name || 'Prompts'}
            </h3>
            <button onClick={onClose} className="text-app-muted hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 gap-4 content-start">
            {filteredPrompts.length === 0 ? (
              <div className="text-center text-app-muted py-12 font-mono text-xs uppercase tracking-widest">
                <p>No prompts found.</p>
              </div>
            ) : (
              filteredPrompts.map(prompt => (
                <div 
                  key={prompt.id} 
                  className="bg-app-bg border border-app-border rounded-lg p-4 hover:border-app-accent transition-all cursor-pointer group flex flex-col gap-2"
                  onClick={() => onSelectPrompt(prompt)}
                >
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-mono uppercase tracking-wider text-xs font-bold text-app-accent truncate">{prompt.title}</h4>
                    <button 
                      onClick={(e) => handleDeletePrompt(prompt.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-app-muted hover:text-red-400 p-1"
                    >
                      &times;
                    </button>
                  </div>
                  <p className="text-sm text-app-muted line-clamp-2 font-mono">{prompt.content}</p>
                  <div className="text-[10px] text-app-muted mt-auto pt-2 font-mono uppercase tracking-widest">
                    {new Date(prompt.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptLibrary;