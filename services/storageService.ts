import { Folder, SavedPrompt } from '../types';

const STORAGE_KEYS = {
  FOLDERS: 'funframe_folders',
  PROMPTS: 'funframe_prompts',
};

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// --- Mode Management ---

// We are now strictly Local Only.
export const getStorageMode = () => 'local';

export const setStorageMode = async (mode: 'local') => {
  // No-op, strictly local
};

export const initStorage = async () => {
    // No initialization needed for local storage
};

// --- Folders ---

export const getFolders = async (): Promise<Folder[]> => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.FOLDERS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const saveFolder = async (name: string): Promise<Folder> => {
  const folders = await getFolders();
  const newFolder: Folder = { id: generateId(), name };
  folders.push(newFolder);
  localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
  return newFolder;
};

export const deleteFolder = async (id: string): Promise<void> => {
  const folders = (await getFolders()).filter(f => f.id !== id);
  localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
  
  // Move prompts in this folder to root
  const prompts = await getPrompts();
  const updatedPrompts = prompts.map(p => p.folderId === id ? { ...p, folderId: 'root' } : p);
  localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(updatedPrompts));
};

// --- Prompts ---

export const getPrompts = async (): Promise<SavedPrompt[]> => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PROMPTS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

export const savePrompt = async (prompt: Omit<SavedPrompt, 'updatedAt'> | Omit<SavedPrompt, 'id' | 'updatedAt'>): Promise<SavedPrompt> => {
  let prompts = await getPrompts();
  const timestamp = Date.now();
  
  let savedEntry: SavedPrompt;

  if ('id' in prompt) {
    // Update existing
    savedEntry = { ...prompt, updatedAt: timestamp } as SavedPrompt;
    prompts = prompts.map(p => p.id === prompt.id ? savedEntry : p);
  } else {
    // Create new
    savedEntry = { ...prompt, id: generateId(), updatedAt: timestamp } as SavedPrompt;
    prompts.push(savedEntry);
  }
  
  localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(prompts));
  return savedEntry;
};

export const deletePrompt = async (id: string): Promise<void> => {
  const prompts = (await getPrompts()).filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(prompts));
};