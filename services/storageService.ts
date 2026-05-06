import { Folder, SavedPrompt } from '../types';
import { supabase } from './supabaseClient';

export const getStorageMode = () => 'supabase';

export const setStorageMode = async (mode: 'supabase') => {};
export const initStorage = async () => {};

export const getPrompts = async (): Promise<SavedPrompt[]> => {
  const { data, error } = await supabase
    .from('prompts')
    .select('id, name, description, category, prompt_text, preview_image_url, is_active, usage_count, created_at, updated_at, tags, is_public, user_id')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching prompts:', error);
    return [];
  }
  return data as SavedPrompt[];
};

export const getPromptById = async (id: string): Promise<SavedPrompt | null> => {
  const { data, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching prompt by id:', error);
    return null;
  }
  return data as SavedPrompt;
};

export const savePrompt = async (prompt: Partial<SavedPrompt>): Promise<SavedPrompt> => {
  const { id, ...promptData } = prompt;

  if (id) {
    // Update existing
    const { data, error } = await supabase
      .from('prompts')
      .update({ ...promptData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("Could not update the prompt. You may not have permission, or it was deleted.");
    }
    return data[0] as SavedPrompt;
  } else {
    // Create new
    const { data, error } = await supabase
      .from('prompts')
      .insert({ ...promptData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("Could not save the prompt. You may not have permission.");
    }
    return data[0] as SavedPrompt;
  }
};

export const deletePrompt = async (id: string): Promise<void> => {
  const { error } = await supabase.from('prompts').delete().eq('id', id);
  if (error) throw error;
};

// Folders are just unique categories
export const getFolders = async (): Promise<Folder[]> => {
  const { data, error } = await supabase.from('prompts').select('category');
  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
  const categories = Array.from(new Set(data.map(p => p.category).filter(c => c && c !== 'root'))) as string[];
  categories.sort((a, b) => a.localeCompare(b));
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
