import React, { useState, useEffect } from 'react';
import { 
  Folder as FolderIcon, 
  FolderPlus, 
  Search, 
  X, 
  Plus, 
  Trash2, 
  Filter, 
  Tag as TagIcon, 
  ChevronDown, 
  SlidersHorizontal,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
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
  const [isMobileCategoryOpen, setIsMobileCategoryOpen] = useState(false);
  
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
      const [loadedFolders, promptResult] = await Promise.all([
        getFolders(),
        getPrompts()
      ]);
      setFolders(loadedFolders);
      setPrompts(promptResult.prompts);
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
    // Replaced confirm() with direct deletion because modals are blocked in this sandbox
    setIsLoading(true);
    await deletePrompt(id);
    await loadData();
    setIsLoading(false);
  };

  const allTags = Array.from(new Set((Array.isArray(prompts) ? prompts : []).flatMap(p => p.tags || []))).map(t => String(t)).sort((a, b) => a.localeCompare(b));

  // Count prompts per category
  const getPromptCount = (folderId: string) => {
    if (folderId === 'all') return prompts.length;
    if (folderId === 'root') return prompts.filter(p => !p.category || p.category === 'root').length;
    return prompts.filter(p => p.category === folderId).length;
  };

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

  const getCategoryTitle = () => {
    if (selectedFolderId === 'all') return 'All Prompts';
    if (selectedFolderId === 'root') return 'Uncategorized';
    return folders.find(f => f.id === selectedFolderId)?.name || 'Prompts';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 bg-app-bg/90 backdrop-blur-sm animate-fadeIn">
      <div className="bg-app-surface w-full max-w-6xl h-full sm:h-[92vh] md:h-[88vh] sm:rounded-xl border-0 sm:border border-app-border shadow-2xl flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Desktop Sidebar (Hidden on Mobile) */}
        <aside className="hidden md:flex md:w-56 lg:w-64 border-r border-app-border bg-app-bg flex-col flex-shrink-0">
          <div className="p-4 border-b border-app-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-app-accent" />
              <h3 className="font-mono uppercase tracking-wider text-xs font-bold text-white">Categories</h3>
            </div>
            <button 
              onClick={() => setIsCreatingFolder(true)}
              className="p-1.5 hover:bg-app-surface text-app-accent hover:text-white rounded border border-transparent hover:border-app-border transition-colors flex items-center gap-1 text-[10px] font-mono uppercase"
              title="New Category"
              disabled={isLoading}
            >
              <Plus size={14} />
              <span>Add</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1 relative scrollbar-thin">
            {isLoading && (
              <div className="absolute inset-0 bg-app-bg/60 z-10 flex items-center justify-center">
                 <div className="w-6 h-6 border-2 border-app-accent border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            
            <div 
              className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${selectedFolderId === 'all' ? 'bg-app-accent/20 text-app-accent font-semibold border border-app-accent/30' : 'text-app-muted hover:bg-app-surface hover:text-white'}`}
              onClick={() => setSelectedFolderId('all')}
            >
              <div className="flex items-center gap-2 truncate">
                <FolderIcon size={14} className="flex-shrink-0" />
                <span className="text-xs font-mono uppercase tracking-wider truncate">All Prompts</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-app-bg border border-app-border/80 text-app-muted">
                {getPromptCount('all')}
              </span>
            </div>
            
            <div 
              className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${selectedFolderId === 'root' ? 'bg-app-accent/20 text-app-accent font-semibold border border-app-accent/30' : 'text-app-muted hover:bg-app-surface hover:text-white'}`}
              onClick={() => setSelectedFolderId('root')}
            >
              <div className="flex items-center gap-2 truncate">
                <FolderIcon size={14} className="flex-shrink-0" />
                <span className="text-xs font-mono uppercase tracking-wider truncate">Uncategorized</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-app-bg border border-app-border/80 text-app-muted">
                {getPromptCount('root')}
              </span>
            </div>

            <div className="pt-2 pb-1 px-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-app-muted/70">Custom Folders</span>
            </div>

            {folders.map(folder => (
              <div 
                key={folder.id}
                className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between group transition-colors ${selectedFolderId === folder.id ? 'bg-app-accent/20 text-app-accent font-semibold border border-app-accent/30' : 'text-app-muted hover:bg-app-surface hover:text-white'}`}
                onClick={() => setSelectedFolderId(folder.id)}
              >
                <div className="flex items-center gap-2 truncate min-w-0 pr-1">
                  <FolderIcon size={14} className="flex-shrink-0" />
                  <span className="truncate text-xs font-mono uppercase tracking-wider">{folder.name}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-app-bg border border-app-border/80 text-app-muted">
                    {getPromptCount(folder.id)}
                  </span>
                  <button 
                    onClick={(e) => handleDeleteFolder(folder.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-app-muted hover:text-red-400 rounded transition-all"
                    title="Delete Category"
                    disabled={isLoading}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
            
            {isCreatingFolder && (
              <div className="p-2 bg-app-surface rounded-lg border border-app-accent/50 mt-1">
                <input
                  autoFocus
                  type="text"
                  placeholder="Category Name..."
                  className="w-full bg-app-bg border border-app-border rounded px-2.5 py-1.5 text-xs font-mono uppercase tracking-wider text-white focus:border-app-accent outline-none"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') setIsCreatingFolder(false);
                  }}
                  onBlur={() => {
                    if (!newFolderName.trim()) setIsCreatingFolder(false);
                  }}
                />
                <div className="flex justify-end gap-1.5 mt-2">
                  <button
                    onClick={() => setIsCreatingFolder(false)}
                    className="px-2 py-1 text-[10px] font-mono text-app-muted hover:text-white rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateFolder}
                    className="px-2.5 py-1 text-[10px] font-mono uppercase font-bold bg-app-accent hover:bg-app-accentHover text-white rounded"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            <div className="p-3 mt-4 border-t border-app-border">
              <div className="flex items-center gap-1.5 mb-2">
                <TagIcon size={12} className="text-app-accent" />
                <h4 className="font-mono uppercase tracking-wider text-[11px] font-bold text-white">Filter by Tag</h4>
              </div>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="w-full bg-app-surface border border-app-border rounded-lg px-2.5 py-2 text-xs font-mono tracking-wider text-white focus:border-app-accent outline-none transition-colors"
              >
                <option value="all">All Tags ({prompts.length})</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>#{tag}</option>
                ))}
              </select>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-app-surface min-w-0 h-full overflow-hidden">
          
          {/* Header Bar */}
          <div className="p-3 sm:p-4 border-b border-app-border bg-app-surface flex flex-col gap-2.5 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-md bg-app-accent/20 border border-app-accent/30 text-app-accent flex-shrink-0">
                  <FolderIcon size={16} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-mono uppercase tracking-wider text-xs sm:text-sm font-bold text-white truncate">
                    {getCategoryTitle()}
                  </h3>
                  <p className="text-[10px] font-mono text-app-muted truncate hidden sm:block">
                    {filteredPrompts.length} prompt{filteredPrompts.length === 1 ? '' : 's'} available
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Mobile Categories Sheet Trigger */}
                <button
                  onClick={() => setIsMobileCategoryOpen(true)}
                  className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-app-bg border border-app-border hover:border-app-accent text-xs font-mono text-white transition-colors"
                  title="Filter Categories"
                >
                  <SlidersHorizontal size={14} className="text-app-accent" />
                  <span className="hidden xs:inline">Categories</span>
                  <span className="text-[10px] px-1 py-0.2 rounded bg-app-accent/20 text-app-accent font-bold">
                    {selectedFolderId === 'all' ? 'All' : selectedFolderId === 'root' ? 'Uncat' : '1'}
                  </span>
                </button>

                {/* Close Button */}
                <button 
                  onClick={onClose} 
                  className="p-1.5 rounded-lg hover:bg-app-bg text-app-muted hover:text-white transition-colors"
                  title="Close Library"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Search & Tag Filter Bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative min-w-0">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search prompts by name, description, #tag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-app-bg border border-app-border rounded-lg pl-9 pr-8 py-2 text-xs sm:text-sm text-white focus:border-app-accent focus:ring-1 focus:ring-app-accent outline-none placeholder:text-app-muted/60 transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-app-muted hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Mobile Tag Dropdown */}
              <div className="md:hidden flex-shrink-0">
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="bg-app-bg border border-app-border rounded-lg px-2 py-2 text-xs font-mono text-white focus:border-app-accent outline-none max-w-[110px] truncate"
                  title="Filter Tag"
                >
                  <option value="all">Tags (All)</option>
                  {allTags.map(tag => (
                    <option key={tag} value={tag}>#{tag}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mobile Category Quick Pills (Scrollable horizontally) */}
            <div className="md:hidden flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar scrollbar-none">
              <button
                onClick={() => setSelectedFolderId('all')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono uppercase whitespace-nowrap flex-shrink-0 transition-colors ${selectedFolderId === 'all' ? 'bg-app-accent text-white font-bold' : 'bg-app-bg border border-app-border text-app-muted hover:text-white'}`}
              >
                All ({getPromptCount('all')})
              </button>
              <button
                onClick={() => setSelectedFolderId('root')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono uppercase whitespace-nowrap flex-shrink-0 transition-colors ${selectedFolderId === 'root' ? 'bg-app-accent text-white font-bold' : 'bg-app-bg border border-app-border text-app-muted hover:text-white'}`}
              >
                Uncategorized ({getPromptCount('root')})
              </button>
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-mono uppercase whitespace-nowrap flex-shrink-0 transition-colors ${selectedFolderId === folder.id ? 'bg-app-accent text-white font-bold' : 'bg-app-bg border border-app-border text-app-muted hover:text-white'}`}
                >
                  {folder.name} ({getPromptCount(folder.id)})
                </button>
              ))}
              <button
                onClick={() => setIsMobileCategoryOpen(true)}
                className="px-2 py-1 rounded-full text-[11px] font-mono uppercase whitespace-nowrap flex-shrink-0 bg-app-bg border border-dashed border-app-border text-app-accent hover:text-white flex items-center gap-1"
              >
                <Plus size={12} />
                <span>New</span>
              </button>
            </div>
          </div>

          {/* Cards Grid Scrollable Container */}
          <div className="flex-1 overflow-y-auto min-h-0 bg-app-bg/40 p-3 sm:p-4 md:p-6 scrollbar-thin" id="prompt-library-scroll">
            {isLoading && prompts.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-mono uppercase tracking-widest text-app-muted">Loading prompt library...</p>
              </div>
            ) : displayedPrompts.length === 0 ? (
              <div className="text-center py-16 px-4 bg-app-surface/40 rounded-xl border border-dashed border-app-border/80">
                <div className="w-12 h-12 rounded-full bg-app-bg border border-app-border flex items-center justify-center mx-auto mb-3 text-app-muted">
                  <Search size={20} />
                </div>
                <h4 className="font-mono text-sm font-bold text-white mb-1">No prompts found</h4>
                <p className="text-xs text-app-muted max-w-sm mx-auto mb-4">
                  {searchQuery || selectedTag !== 'all' || selectedFolderId !== 'all'
                    ? "Try adjusting your search query, clearing tag filters, or selecting a different category."
                    : "Your prompt library is empty. Save prompts from the main editor to build your collection."}
                </p>
                {(searchQuery || selectedTag !== 'all' || selectedFolderId !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedTag('all');
                      setSelectedFolderId('all');
                    }}
                    className="px-4 py-2 bg-app-bg border border-app-border hover:border-app-accent rounded-lg text-xs font-mono uppercase text-white transition-colors"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6 content-start">
                {displayedPrompts.map(prompt => (
                  <div 
                    key={prompt.id} 
                    className="bg-app-surface border border-app-border rounded-xl overflow-hidden hover:border-app-accent/80 transition-all cursor-pointer group flex flex-col shadow-md shadow-black/30 hover:shadow-xl hover:shadow-black/50"
                    onClick={() => onSelectPrompt(prompt)}
                  >
                    {/* Preview Image */}
                    <div className="relative w-full aspect-[4/3] sm:aspect-square bg-app-bg border-b border-app-border overflow-hidden">
                      {prompt.preview_image_url ? (
                        <img 
                          src={prompt.preview_image_url} 
                          alt={prompt.name || 'Prompt preview'} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-app-muted/40 gap-2">
                          <ImageIcon size={32} />
                          <span className="text-[10px] font-mono uppercase tracking-widest">No Preview</span>
                        </div>
                      )}
                      
                      {/* Category Badge overlay on image */}
                      {prompt.category && prompt.category !== 'root' && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-md rounded border border-white/10 text-[9px] font-mono uppercase text-white/90">
                          {prompt.category}
                        </div>
                      )}

                      {/* Delete button (accessible on both mobile and desktop) */}
                      <button 
                        onClick={(e) => handleDeletePrompt(prompt.id, e)}
                        className="absolute top-2 right-2 opacity-80 md:opacity-0 md:group-hover:opacity-100 bg-red-600/90 hover:bg-red-600 text-white p-1.5 rounded-lg shadow-lg transition-all z-20"
                        title="Delete Prompt"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Card Info */}
                    <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="font-mono uppercase tracking-wider text-xs sm:text-sm font-bold text-white group-hover:text-app-accent transition-colors truncate mb-1">
                          {prompt.name || 'Untitled Prompt'}
                        </h4>
                        <p className="text-xs text-app-text/90 line-clamp-2 sm:line-clamp-3 font-sans leading-relaxed mb-2.5">
                          {prompt.description || <span className="italic text-app-muted opacity-70">No description provided.</span>}
                        </p>
                      </div>

                      {/* Tags */}
                      {prompt.tags && prompt.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-2 border-t border-app-border/40">
                          {prompt.tags.slice(0, 4).map((tag, i) => (
                            <span 
                              key={i} 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSearchQuery(tag);
                              }}
                              className="text-[9px] font-mono px-1.5 py-0.5 bg-app-bg border border-app-border/80 rounded text-app-muted hover:text-app-accent hover:border-app-accent transition-colors"
                            >
                              #{tag}
                            </span>
                          ))}
                          {prompt.tags.length > 4 && (
                            <span className="text-[9px] font-mono px-1 py-0.5 text-app-muted">
                              +{prompt.tags.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Load More Pagination */}
            {displayedPrompts.length < filteredPrompts.length && (
              <div className="p-4 sm:p-6 flex justify-center border-t border-app-border bg-app-surface/30 mt-6 rounded-xl">
                <button
                  onClick={() => setDisplayedCount(prev => prev + 24)}
                  className="px-6 py-2.5 bg-app-bg hover:bg-app-surface border border-app-border hover:border-app-accent rounded-lg text-xs sm:text-sm font-mono text-white transition-all shadow-md"
                >
                  Load More ({filteredPrompts.length - displayedPrompts.length} remaining)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Categories Modal / Drawer Sheet */}
        {isMobileCategoryOpen && (
          <div className="md:hidden fixed inset-0 z-60 flex flex-col justify-end bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-app-surface border-t border-app-border rounded-t-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-slideUp">
              
              {/* Drawer Header */}
              <div className="p-4 border-b border-app-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-app-accent" />
                  <h3 className="font-mono uppercase tracking-wider text-sm font-bold text-white">Categories</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsCreatingFolder(true)}
                    className="px-2.5 py-1 bg-app-accent hover:bg-app-accentHover text-white rounded text-xs font-mono uppercase flex items-center gap-1"
                  >
                    <Plus size={14} />
                    <span>New</span>
                  </button>
                  <button 
                    onClick={() => setIsMobileCategoryOpen(false)}
                    className="p-1 text-app-muted hover:text-white rounded"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="p-3 overflow-y-auto space-y-1.5 flex-1 max-h-[60vh]">
                {isCreatingFolder && (
                  <div className="p-3 bg-app-bg rounded-xl border border-app-accent mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-app-accent font-bold block mb-1.5">
                      Create New Category
                    </span>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Category Name..."
                      className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-xs font-mono uppercase text-white focus:border-app-accent outline-none"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder();
                        if (e.key === 'Escape') setIsCreatingFolder(false);
                      }}
                    />
                    <div className="flex justify-end gap-2 mt-2.5">
                      <button
                        onClick={() => setIsCreatingFolder(false)}
                        className="px-3 py-1 text-xs font-mono text-app-muted hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateFolder}
                        className="px-3 py-1 bg-app-accent text-white rounded-lg text-xs font-mono uppercase font-bold"
                      >
                        Save Category
                      </button>
                    </div>
                  </div>
                )}

                <div 
                  className={`p-3 rounded-xl cursor-pointer flex items-center justify-between ${selectedFolderId === 'all' ? 'bg-app-accent/20 text-app-accent border border-app-accent/40 font-bold' : 'bg-app-bg border border-app-border text-white'}`}
                  onClick={() => {
                    setSelectedFolderId('all');
                    setIsMobileCategoryOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <FolderIcon size={16} />
                    <span className="text-xs font-mono uppercase tracking-wider">All Prompts</span>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-app-surface text-app-muted">
                    {getPromptCount('all')}
                  </span>
                </div>

                <div 
                  className={`p-3 rounded-xl cursor-pointer flex items-center justify-between ${selectedFolderId === 'root' ? 'bg-app-accent/20 text-app-accent border border-app-accent/40 font-bold' : 'bg-app-bg border border-app-border text-white'}`}
                  onClick={() => {
                    setSelectedFolderId('root');
                    setIsMobileCategoryOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <FolderIcon size={16} />
                    <span className="text-xs font-mono uppercase tracking-wider">Uncategorized</span>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-app-surface text-app-muted">
                    {getPromptCount('root')}
                  </span>
                </div>

                {folders.map(folder => (
                  <div 
                    key={folder.id}
                    className={`p-3 rounded-xl cursor-pointer flex items-center justify-between ${selectedFolderId === folder.id ? 'bg-app-accent/20 text-app-accent border border-app-accent/40 font-bold' : 'bg-app-bg border border-app-border text-white'}`}
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      setIsMobileCategoryOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2.5 truncate min-w-0 pr-2">
                      <FolderIcon size={16} className="flex-shrink-0" />
                      <span className="text-xs font-mono uppercase tracking-wider truncate">{folder.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-app-surface text-app-muted">
                        {getPromptCount(folder.id)}
                      </span>
                      <button 
                        onClick={(e) => handleDeleteFolder(folder.id, e)}
                        className="p-1.5 text-app-muted hover:text-red-400 rounded hover:bg-red-500/20"
                        title="Delete Category"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Drawer Footer */}
              <div className="p-3 border-t border-app-border bg-app-bg flex justify-end">
                <button
                  onClick={() => setIsMobileCategoryOpen(false)}
                  className="w-full py-2.5 bg-app-surface border border-app-border rounded-lg text-xs font-mono uppercase text-white font-bold"
                >
                  Done
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default PromptLibrary;
