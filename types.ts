export enum AspectRatio {
  SQUARE = '1:1',
  THREE_TWO = '3:2',
  TWO_THREE = '2:3',
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16',
  STANDARD_LANDSCAPE = '4:3',
  STANDARD_PORTRAIT = '3:4'
}

export enum ImageSize {
  ONE_K = '1K',
  TWO_K = '2K',
  FOUR_K = '4K'
}

export enum ModelType {
  FLASH = 'gemini-2.5-flash-image',
  FLASH_3_1 = 'gemini-3.1-flash-image',
  PRO = 'gemini-3-pro-image'
}

export interface ProcessingState {
  isLoading: boolean;
  error: string | null;
  progress: string;
}

export interface GeneratedImage {
  url: string;
  timestamp: number;
}

export type NotificationType = 'success' | 'error' | 'info';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  persistent?: boolean;
  actionLabel?: string;
  actionUrl?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export interface BatchJob {
  id: string;
  status: string;
  total_files: number;
  processed_files: number;
  failed_files: number;
  result_zip_path: string | null;
  error_message: string | null;
  gemini_batch_name: string | null;
  batch_api_state: string | null;
  created_at: string;
}

export interface BatchLogEntry {
  id: string;
  file_name: string;
  status: string;
  reason: string | null;
  output_file_name: string | null;
}

export interface Folder {
  id: string;
  name: string;
}

export interface SavedPromptReferenceImage {
  url: string;
  strength: number;
}

export interface SavedPrompt {
  id: string;
  name: string;
  description?: string;
  category: string;
  prompt_text: string;
  preview_image_url?: string | null;
  reference_image_url?: string | null;
  reference_strength?: number | null;
  reference_images?: SavedPromptReferenceImage[] | null;
  is_active?: boolean;
  usage_count?: number;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  is_public?: boolean;
  user_id?: string | null;
}

