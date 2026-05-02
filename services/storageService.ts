import { Folder, SavedPrompt } from '../types';
import { supabase } from './supabaseClient';

export const getStorageMode = () => 'supabase';

export const setStorageMode = async (mode: 'supabase') => {};
export const initStorage = async () => {};

export const getPrompts = async (): Promise<SavedPrompt[]> => {
  const { data, error } = await supabase
    .from('prompts')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching prompts:', error);
    return [];
  }
  return data as SavedPrompt[];
};

export const savePrompt = async (prompt: Partial<SavedPrompt>): Promise<SavedPrompt> => {
  const { id, ...promptData } = prompt;

  if (id) {
    // Update existing
    const { data, error } = await supabase
      .from('prompts')
      .update({ ...promptData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as SavedPrompt;
  } else {
    // Create new
    const { data, error } = await supabase
      .from('prompts')
      .insert({ ...promptData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error) throw error;
    return data as SavedPrompt;
  }
};

export const deletePrompt = async (id: string): Promise<void> => {
  const { error } = await supabase.from('prompts').delete().eq('id', id);
  if (error) throw error;
};

// Folders are just unique categories
export const getFolders = async (): Promise<Folder[]> => {
  const prompts = await getPrompts();
  const categories = Array.from(new Set(prompts.map(p => p.category).filter(c => c && c !== 'root'))) as string[];
  return categories.map(c => ({ id: c, name: c }));
};

export const saveFolder = async (name: string): Promise<Folder> => {
  // We can't save an empty folder to a DB without a folders table, 
  // but we can return it as an active session folder or ignore it until a prompt is saved.
  return { id: name, name };
};

export const deleteFolder = async (id: string): Promise<void> => {
  // Option: delete all prompts in that category, or rename them. Let's just nullify their category (or set to 'root')
  await supabase
    .from('prompts')
    .update({ category: 'root', updated_at: new Date().toISOString() })
    .eq('category', id);
};
