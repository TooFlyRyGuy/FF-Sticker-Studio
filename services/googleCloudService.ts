import { Folder, SavedPrompt } from '../types';
import { base64ToBlob } from '../utils/imageUtils';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// CONFIGURATION
let CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
let BUCKET_NAME = 'YOUR_BUCKET_NAME';

const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/storage/v1/rest'];
// Scope for GCS (Read/Write)
const SCOPES = 'https://www.googleapis.com/auth/devstorage.read_write';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

interface CloudState {
  isAuthenticated: boolean;
}

const state: CloudState = {
  isAuthenticated: false,
};

// --- Initialization ---

export const initGoogleCloud = async (): Promise<boolean> => {
  console.log("Initializing Google Cloud Storage Service...");

  // 1. Check LocalStorage for Config
  const storedClientId = localStorage.getItem('funframe_gcs_client_id');
  const storedBucket = localStorage.getItem('funframe_gcs_bucket');
  
  if (storedClientId) CLIENT_ID = storedClientId;
  if (storedBucket) BUCKET_NAME = storedBucket;

  // 2. Prompt if missing
  if (CLIENT_ID === 'YOUR_CLIENT_ID_HERE' || BUCKET_NAME === 'YOUR_BUCKET_NAME') {
    const clientIdInput = window.prompt("Google Cloud Storage Integration\n\nPlease enter your Google Cloud OAuth 2.0 Client ID:");
    const bucketInput = window.prompt("Please enter your Google Cloud Storage Bucket Name (CORS must be enabled):");
    
    if (clientIdInput && bucketInput) {
      CLIENT_ID = clientIdInput.trim();
      BUCKET_NAME = bucketInput.trim();
      localStorage.setItem('funframe_gcs_client_id', CLIENT_ID);
      localStorage.setItem('funframe_gcs_bucket', BUCKET_NAME);
    } else {
      console.warn("Google Cloud Integration: Credentials missing.");
      return false;
    }
  }

  return new Promise((resolve, reject) => {
    let attempts = 0;
    const checkScripts = () => {
      attempts++;
      if (attempts > 100) {
        reject(new Error("Google Scripts failed to load."));
        return;
      }

      if (window.gapi && window.google) {
        if (!gapiInited) {
            window.gapi.load('client', async () => {
            try {
                await window.gapi.client.init({
                    discoveryDocs: DISCOVERY_DOCS,
                });
                gapiInited = true;
                maybeResolve();
            } catch (error: any) {
                console.error("GAPI Init Error:", error);
                reject(new Error("Failed to initialize GAPI client"));
            }
            });
        }

        if (!gisInited) {
            try {
                tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: async (resp: any) => {
                         if (resp.error) console.error("Token Client Error:", resp);
                    },
                });
                gisInited = true;
                maybeResolve();
            } catch (e: any) {
                reject(new Error("Failed to initialize Google Identity Services"));
            }
        }
        
        if (gapiInited && gisInited) maybeResolve();
      } else {
        setTimeout(checkScripts, 100);
      }
    };
    
    const maybeResolve = () => {
      if (gapiInited && gisInited) {
          resolve(true);
      }
    };

    checkScripts();
  });
};

export const signInToGoogle = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("Google Identity not initialized."));
    
    tokenClient.callback = async (resp: any) => {
      if (resp.error) {
        if (resp.error === 'invalid_client' || resp.error === 'origin_mismatch') {
            if (window.confirm(`OAuth Error: ${resp.error}. Reset credentials?`)) {
                disconnectCloud();
                window.location.reload();
            }
        }
        reject(new Error(resp.error_description || resp.error));
      } else {
        state.isAuthenticated = true;
        resolve();
      }
    };

    if (window.gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
  });
};

export const signOutFromGoogle = () => {
  const token = window.gapi?.client?.getToken();
  if (token) {
    window.google?.accounts?.oauth2?.revoke(token.access_token, () => {});
    window.gapi?.client?.setToken(null);
  }
  state.isAuthenticated = false;
};

export const disconnectCloud = () => {
  signOutFromGoogle();
  localStorage.removeItem('funframe_gcs_client_id');
  localStorage.removeItem('funframe_gcs_bucket');
  CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
  BUCKET_NAME = 'YOUR_BUCKET_NAME';
};

export const isCloudAuthenticated = () => state.isAuthenticated;
export const getBucketUrl = () => `https://console.cloud.google.com/storage/browser/${BUCKET_NAME}`;

// --- GCS Operations ---

// GCS doesn't have real folders, but we simulate them with prefixes
const ROOT_PREFIX = 'prompts/';
const IMAGES_PREFIX = 'generated-images/';

// Helper to ensure path ends with slash
const ensureSlash = (str: string) => str.endsWith('/') ? str : str + '/';

export const listCloudFolders = async (): Promise<Folder[]> => {
  if (!state.isAuthenticated) throw new Error("Not authenticated");

  // We list objects in "prompts/" with delimiter "/" to find "subfolders"
  const response = await window.gapi.client.storage.objects.list({
    bucket: BUCKET_NAME,
    prefix: ROOT_PREFIX,
    delimiter: '/' 
  });

  const prefixes = response.result.prefixes || [];
  
  // Prefixes look like "prompts/foldername/"
  return prefixes.map((p: string) => {
    // extract "foldername" from "prompts/foldername/"
    const parts = p.split('/');
    const name = parts[parts.length - 2]; 
    return {
      id: name, // We use the name as ID for GCS simplicity
      name: name
    };
  });
};

export const createCloudFolder = async (name: string): Promise<Folder> => {
  if (!state.isAuthenticated) throw new Error("Not authenticated");

  // In GCS, we create a 0-byte object ending in / to verify existence in some UIs, 
  // or simply just start saving files there. Let's create a placeholder.
  const objectName = `${ROOT_PREFIX}${name}/.keep`;
  
  await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET_NAME}/o?uploadType=media&name=${encodeURIComponent(objectName)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${window.gapi.client.getToken().access_token}`,
      'Content-Type': 'text/plain'
    },
    body: ''
  });

  return { id: name, name };
};

export const deleteCloudFolder = async (folderName: string): Promise<void> => {
    // In GCS, "deleting a folder" means deleting all objects with that prefix.
    // For safety in this app, we will only delete if empty or handle logic in service wrapper.
    // For now, let's just mark it as done locally.
    // Implementing recursive delete is risky without user confirmation.
    console.warn("Folder deletion in GCS requires deleting all objects inside.");
};

export const listCloudPrompts = async (): Promise<SavedPrompt[]> => {
  if (!state.isAuthenticated) throw new Error("Not authenticated");

  // List all objects recursively under prompts/
  const response = await window.gapi.client.storage.objects.list({
    bucket: BUCKET_NAME,
    prefix: ROOT_PREFIX,
  });

  const items = response.result.items || [];
  const prompts: SavedPrompt[] = [];

  for (const item of items) {
    if (item.name.endsWith('/') || item.name.endsWith('.keep')) continue; // Skip folders placeholders

    // Name format: prompts/folderName/Title.json OR prompts/Title.json
    const relPath = item.name.substring(ROOT_PREFIX.length);
    const parts = relPath.split('/');
    
    let folderId = 'root';
    let title = '';

    if (parts.length > 1) {
        folderId = parts[0];
        title = parts[1].replace('.json', '');
    } else {
        title = parts[0].replace('.json', '');
    }

    // Fetch content
    try {
        // We can use the mediaLink or just fetch the content
        const contentRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET_NAME}/o/${encodeURIComponent(item.name)}?alt=media`, {
            headers: { 'Authorization': `Bearer ${window.gapi.client.getToken().access_token}` }
        });
        const jsonContent = await contentRes.json();
        
        prompts.push({
            id: item.name, // Use full path as ID
            title: jsonContent.title || title,
            content: jsonContent.content || '',
            folderId: folderId,
            updatedAt: new Date(item.updated).getTime()
        });
    } catch (e) {
        console.error("Failed to load prompt", item.name);
    }
  }

  return prompts;
};

export const saveCloudPrompt = async (prompt: Omit<SavedPrompt, 'updatedAt'> | Omit<SavedPrompt, 'id' | 'updatedAt'>): Promise<SavedPrompt> => {
  if (!state.isAuthenticated) throw new Error("Not authenticated");

  let folderPath = ROOT_PREFIX;
  if ('folderId' in prompt && prompt.folderId && prompt.folderId !== 'root') {
      folderPath += `${prompt.folderId}/`;
  }

  const fileName = `${prompt.title}.json`;
  const fullPath = `${folderPath}${fileName}`;
  
  const promptData = {
      title: prompt.title,
      content: prompt.content,
      folderId: prompt.folderId
  };

  await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET_NAME}/o?uploadType=media&name=${encodeURIComponent(fullPath)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${window.gapi.client.getToken().access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(promptData)
  });

  return {
      id: fullPath,
      title: prompt.title,
      content: prompt.content,
      folderId: prompt.folderId,
      updatedAt: Date.now()
  } as SavedPrompt;
};

export const deleteCloudFile = async (id: string) => {
    if (!state.isAuthenticated) throw new Error("Not authenticated");
    await window.gapi.client.storage.objects.delete({
        bucket: BUCKET_NAME,
        object: id
    });
};

export const saveCloudImage = async (base64Data: string, filename: string): Promise<string> => {
    if (!state.isAuthenticated) throw new Error("Not authenticated");
    
    const fullPath = `${IMAGES_PREFIX}${filename}`;
    const blob = base64ToBlob(base64Data, 'image/png');

    const res = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${BUCKET_NAME}/o?uploadType=media&name=${encodeURIComponent(fullPath)}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${window.gapi.client.getToken().access_token}`,
            'Content-Type': 'image/png'
        },
        body: blob
    });

    if (!res.ok) {
        throw new Error("Failed to upload image to Cloud Storage");
    }

    return fullPath;
};
