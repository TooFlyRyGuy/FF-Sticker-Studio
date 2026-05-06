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
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [displayedCount, setDisplayedCount] = useState(24);
  
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    // Reset pagination when folder or search changes
    setDisplayedCount(24);
  }, [selectedFolderId, selectedTag, searchQuery]);

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
    if (confirm('Delete this category?')) {
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

  const allTags = Array.from(new Set(prompts.flatMap(p => p.tags || []))).map(t => String(t)).sort((a, b) => a.localeCompare(b));

  const filteredPrompts = prompts.filter(p => {
    // Check folder
    if (selectedFolderId !== 'all') {
      if (selectedFolderId === 'root' && p.category && p.category !== 'root') return false;
      if (selectedFolderId !== 'root' && p.category !== selectedFolderId) return false;
    }
    
    // Check tag
    if (selectedTag !== 'all') {
      if (!p.tags || !p.tags.includes(selectedTag)) return false;
    }

    // Check search query
    if (searchQuery.trim()) {
      const sq = searchQuery.toLowerCase();
      const matchName = (p.name || '').toLowerCase().includes(sq);
      const matchDesc = (p.description || '').toLowerCase().includes(sq);
      const matchTags = (p.tags || []).some(t => t.toLowerCase().includes(sq));
      if (!matchName && !matchDesc && !matchTags) return false;
    }

    return true;
  }).sort((a, b) => {
    const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return timeB - timeA;
  });

  const displayedPrompts = filteredPrompts.slice(0, displayedCount);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app-bg/90 backdrop-blur-sm animate-fadeIn">
      <div className="bg-app-surface w-full max-w-6xl h-[85vh] rounded-xl border border-app-border shadow-2xl flex overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-64 border-r border-app-border bg-app-bg flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-app-border flex items-center justify-between">
            <h3 className="font-mono uppercase tracking-wider text-sm text-white">Categories</h3>
            <button 
              onClick={() => setIsCreatingFolder(true)}
              className="p-1 hover:bg-app-surface rounded text-app-accent"
              title="New Category"
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
                  placeholder="Category Name"
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

            <div className="p-4 mt-2 border-t border-app-border">
              <h3 className="font-mono uppercase tracking-wider text-sm text-white mb-2">Tags</h3>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="w-full bg-app-surface border border-app-border rounded-lg px-2 py-2 text-xs font-mono tracking-wider text-white focus:border-app-accent outline-none"
              >
                <option value="all">All Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-app-surface relative overflow-hidden">
          <div className="p-4 border-b border-app-border flex items-center justify-between gap-4">
            <h3 className="font-mono uppercase tracking-wider text-sm text-white flex-shrink-0">
              {selectedFolderId === 'all' ? 'All Prompts' : 
               selectedFolderId === 'root' ? 'Uncategorized' : 
               folders.find(f => f.id === selectedFolderId)?.name || 'Prompts'}
            </h3>
            
            <div className="flex-1 max-w-md relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search prompts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-app-bg border border-app-border rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-app-accent focus:ring-1 focus:ring-app-accent outline-none"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted hover:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <button onClick={onClose} className="text-app-muted hover:text-white flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 bg-app-bg/50" id="prompt-library-scroll">
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 content-start">
              {displayedPrompts.length === 0 ? (
                <div className="text-center text-app-muted py-12 font-mono text-xs uppercase tracking-widest col-span-full">
                  <p>No prompts found.</p>
                </div>
              ) : (
                displayedPrompts.map(prompt => (
                  <div 
                    key={prompt.id} 
                    className="bg-app-surface border border-app-border rounded-lg overflow-hidden hover:border-app-accent transition-all cursor-pointer group flex flex-col shadow-sm hover:shadow-MD shadow-black/20"
                    onClick={() => onSelectPrompt(prompt)}
                  >
                  {/* Preview Image */}
                  <div className="relative w-full pt-[100%] bg-app-surface border-b border-app-border overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                        {prompt.preview_image_url ? (
                            <img src={prompt.preview_image_url} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-app-muted opacity-50 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        )}
                        <button 
                          onClick={(e) => handleDeletePrompt(prompt.id, e)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-md transition-all z-20"
                          title="Delete Prompt"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4 flex-1 flex flex-col">
                    <h4 className="font-mono uppercase tracking-wider text-sm font-bold text-app-accent truncate mb-1">{prompt.name}</h4>
                    <p className="text-xs text-app-text line-clamp-3 font-sans leading-relaxed mb-3">
                        {prompt.description || <span className="italic text-app-muted opacity-70">No description provided.</span>}
                    </p>
                    {prompt.tags && prompt.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-auto pt-2 border-t border-app-border/50">
                        {prompt.tags.map((tag, i) => (
                           <span 
                             key={i} 
                             onClick={(e) => {
                               e.stopPropagation();
                               setSearchQuery(tag);
                             }}
                             className="text-[9px] px-1.5 py-0.5 bg-app-bg border border-app-border rounded-sm text-app-muted hover:text-white hover:border-app-accent hover:bg-app-accent/20 cursor-pointer transition-colors"
                           >
                             #{tag}
                           </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                ))
              )}
            </div>
            
            {displayedPrompts.length < filteredPrompts.length && (
              <div className="p-6 flex justify-center border-t border-app-border bg-app-surface/50">
                <button
                  onClick={() => setDisplayedCount(prev => prev + 24)}
                  className="px-6 py-2 bg-app-surface border border-app-border hover:border-app-accent rounded-lg text-sm font-mono text-white transition-colors"
                >
                  Load More ({filteredPrompts.length - displayedPrompts.length} remaining)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptLibrary;