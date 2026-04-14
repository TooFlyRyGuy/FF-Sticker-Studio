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
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const APP_ROOT_FOLDER_NAME = 'AI Prompts';
const IMAGES_FOLDER_NAME = 'Generated Images';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

interface DriveState {
  isAuthenticated: boolean;
  rootFolderId: string | null;
}

const state: DriveState = {
  isAuthenticated: false,
  rootFolderId: null,
};

// --- Initialization ---

export const initGoogleDrive = async (): Promise<boolean> => {
  console.log("Initializing Google Drive Service...");

  const storedClientId = localStorage.getItem('funframe_drive_client_id');
  if (storedClientId) {
    CLIENT_ID = storedClientId;
  }

  if (CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
    const userInput = window.prompt("Google Drive Integration\n\nPlease enter your Google Cloud OAuth 2.0 Client ID:");
    if (userInput && userInput.trim()) {
      CLIENT_ID = userInput.trim();
      localStorage.setItem('funframe_drive_client_id', CLIENT_ID);
    } else {
      console.warn("Google Drive Integration: CLIENT_ID is missing.");
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
                disconnectDrive();
                window.location.reload();
            }
        }
        reject(new Error(resp.error_description || resp.error));
      } else {
        state.isAuthenticated = true;
        try {
            await ensureRootFolder();
            resolve();
        } catch (e: any) {
            reject(new Error("Failed to access Drive folder: " + e.message));
        }
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
  state.rootFolderId = null;
};

export const disconnectDrive = () => {
  signOutFromGoogle();
  localStorage.removeItem('funframe_drive_client_id');
  CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
};

export const isDriveAuthenticated = () => state.isAuthenticated;

// --- Drive Operations ---

const ensureRootFolder = async () => {
  if (state.rootFolderId) return state.rootFolderId;

  const query = `name = '${APP_ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const response = await window.gapi.client.drive.files.list({
      q: query,
      fields: 'files(id)',
      spaces: 'drive',
  });

  const files = response.result.files;
  if (files && files.length > 0) {
      state.rootFolderId = files[0].id;
  } else {
      const createResponse = await window.gapi.client.drive.files.create({
      resource: {
          name: APP_ROOT_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
      });
      state.rootFolderId = createResponse.result.id;
  }
  return state.rootFolderId;
};

const ensureImagesFolder = async (): Promise<string> => {
  const rootId = await ensureRootFolder();
  const query = `'${rootId}' in parents and name = '${IMAGES_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  
  const response = await window.gapi.client.drive.files.list({
      q: query,
      fields: 'files(id)',
  });

  if (response.result.files && response.result.files.length > 0) {
      return response.result.files[0].id;
  }

  const createResponse = await window.gapi.client.drive.files.create({
      resource: {
          name: IMAGES_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootId]
      },
      fields: 'id'
  });
  return createResponse.result.id;
};

export const getDriveFolderUrl = async (): Promise<string | null> => {
    try {
        const id = await ensureRootFolder();
        return `https://drive.google.com/drive/folders/${id}`;
    } catch {
        return null;
    }
};

export const listDriveFolders = async (): Promise<Folder[]> => {
  if (!state.isAuthenticated) throw new Error("Not authenticated");
  const rootId = await ensureRootFolder();

  const query = `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const response = await window.gapi.client.drive.files.list({
    q: query,
    fields: 'files(id, name)',
  });

  return (response.result.files || []).map((f: any) => ({
    id: f.id,
    name: f.name
  }));
};

export const createDriveFolder = async (name: string): Promise<Folder> => {
  if (!state.isAuthenticated) throw new Error("Not authenticated");
  const rootId = await ensureRootFolder();

  const response = await window.gapi.client.drive.files.create({
    resource: {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootId]
    },
    fields: 'id, name'
  });

  return {
    id: response.result.id,
    name: response.result.name
  };
};

export const deleteDriveFile = async (fileId: string): Promise<void> => {
    if (!state.isAuthenticated) throw new Error("Not authenticated");
    await window.gapi.client.drive.files.update({
        fileId: fileId,
        resource: { trashed: true }
    });
};

export const listDrivePrompts = async (): Promise<SavedPrompt[]> => {
  if (!state.isAuthenticated) throw new Error("Not authenticated");
  const rootId = await ensureRootFolder();
  
  const folders = await listDriveFolders();
  let allPrompts: SavedPrompt[] = [];

  const fetchInFolder = async (folderId: string, mappedFolderId: string) => {
    const q = `'${folderId}' in parents and mimeType = 'application/json' and trashed = false`;
    const res = await window.gapi.client.drive.files.list({
      q: q,
      fields: 'files(id, name, modifiedTime)',
    });
    
    const files = res.result.files || [];
    const promptPromises = files.map(async (file: any) => {
        try {
            const contentRes = await window.gapi.client.drive.files.get({
                fileId: file.id,
                alt: 'media'
            });
            return {
                id: file.id,
                title: contentRes.result.title || file.name.replace('.json', ''),
                content: contentRes.result.content || '',
                folderId: mappedFolderId,
                updatedAt: new Date(file.modifiedTime).getTime()
            } as SavedPrompt;
        } catch { return null; }
    });

    return (await Promise.all(promptPromises)).filter(p => p !== null) as SavedPrompt[];
  };

  allPrompts = [...allPrompts, ...(await fetchInFolder(rootId, 'root'))];
  for (const folder of folders) {
      allPrompts = [...allPrompts, ...(await fetchInFolder(folder.id, folder.id))];
  }

  return allPrompts;
};

export const saveDrivePrompt = async (prompt: Omit<SavedPrompt, 'updatedAt'> | Omit<SavedPrompt, 'id' | 'updatedAt'>): Promise<SavedPrompt> => {
  if (!state.isAuthenticated) throw new Error("Not authenticated");
  const rootId = await ensureRootFolder();

  let parentId = rootId;
  let folderId = 'root';
  
  if ('folderId' in prompt && prompt.folderId && prompt.folderId !== 'root') {
      parentId = prompt.folderId;
      folderId = prompt.folderId;
  }

  const promptData = {
      title: prompt.title,
      content: prompt.content,
      folderId: folderId
  };

  if ('id' in prompt && prompt.id) {
      // Update
      await window.gapi.client.drive.files.update({
          fileId: prompt.id,
          resource: { name: `${prompt.title}.json` },
      });
      
       await window.gapi.client.request({
          path: `/upload/drive/v3/files/${prompt.id}`,
          method: 'PATCH',
          params: { uploadType: 'media' },
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promptData)
      });
      
      return { ...prompt, id: prompt.id, updatedAt: Date.now() } as SavedPrompt;
  } else {
      // Create (Multipart/Related)
      const metadata = {
          name: `${prompt.title}.json`,
          mimeType: 'application/json',
          parents: [parentId]
      };

      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";
      
      const body = delimiter +
          'Content-Type: application/json\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          JSON.stringify(promptData) +
          close_delim;

      const response = await window.gapi.client.request({
          path: '/upload/drive/v3/files',
          method: 'POST',
          params: { uploadType: 'multipart' },
          headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
          body: body
      });
      
      return {
          id: response.result.id,
          title: prompt.title,
          content: prompt.content,
          folderId: folderId,
          updatedAt: Date.now()
      };
  }
};

export const saveDriveImage = async (base64Data: string, filename: string): Promise<string> => {
    if (!state.isAuthenticated) throw new Error("Not authenticated");
    
    const imagesFolderId = await ensureImagesFolder();

    // 1. Create Metadata
    const createRes = await window.gapi.client.drive.files.create({
        resource: {
            name: filename,
            mimeType: 'image/png',
            parents: [imagesFolderId]
        },
        fields: 'id'
    });
    const fileId = createRes.result.id;

    // 2. Upload Content
    const blob = base64ToBlob(base64Data, 'image/png');
    const accessToken = window.gapi.client.getToken().access_token;
    
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'image/png'
        },
        body: blob
    });
    
    if (!res.ok) {
        try { await window.gapi.client.drive.files.delete({ fileId }); } catch {}
        throw new Error('Image upload failed');
    }
    
    return fileId;
};
