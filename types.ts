export enum AspectRatio {
  SQUARE = '1:1',
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
  FLASH_3_1 = 'gemini-3.1-flash-image-preview',
  PRO = 'gemini-3-pro-image-preview'
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
}

export interface Folder {
  id: string;
  name: string;
}

export interface SavedPrompt {
  id: string;
  title: string;
  content: string;
  folderId: string;
  updatedAt: number;
}
