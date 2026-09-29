import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Copy } from 'lucide-react';

import Header from './components/Header';
import Button from './components/Button';
import NotificationContainer from './components/NotificationToast';
import ImageUpload from './components/ImageUpload';
import PromptLibrary from './components/PromptLibrary';

import PromptAssistant from './components/PromptAssistant';
import PromptEditor from './components/PromptEditor';
import Login from './components/Login';
import { stripBase64Prefix, getMimeType, getMimeTypeFromBase64, compressImageBase64, fileToBase64 } from './utils/imageUtils';
import { generateEditedImage, generatePromptMetadata } from './services/geminiService';
import { savePrompt, initStorage, getFolders, getPromptById } from './services/storageService';
import { supabase } from './services/supabaseClient';
import { AspectRatio, ImageSize, ModelType, ProcessingState, NotificationItem, NotificationType, SavedPrompt, Folder, BatchJob } from './types';
import { PromptCustomField } from './components/PromptVariableBuilder';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  
  // Image State
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [refStrength, setRefStrength] = useState<number>(50);

  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  
  // Controls
  const [prompt, setPrompt] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [imageSize, setImageSize] = useState<ImageSize>(ImageSize.ONE_K);
  const [selectedModel, setSelectedModel] = useState<ModelType>(ModelType.FLASH_3_1);
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ processed: number; total: number } | null>(null);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState<boolean>(false);
  const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Saved Prompts Management
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [activePromptName, setActivePromptName] = useState<string>("");
  const [activePromptCategory, setActivePromptCategory] = useState<string>("");
  const [isNewCategory, setIsNewCategory] = useState<boolean>(true);
  const [activePromptDescription, setActivePromptDescription] = useState<string>("");
  const [activePromptTags, setActivePromptTags] = useState<string>("");
  const [activePromptCustomFields, setActivePromptCustomFields] = useState<PromptCustomField[]>([]);
  const [activePromptIsPublic, setActivePromptIsPublic] = useState<boolean>(true);
  const [activePromptPreviewUrl, setActivePromptPreviewUrl] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{name?: boolean, description?: boolean, category?: boolean}>({});
  
  const [categories, setCategories] = useState<Folder[]>([]);

  // Processing State
  const [status, setStatus] = useState<ProcessingState>({
    isLoading: false,
    error: null,
    progress: ''
  });

  // Notifications State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Notification Helper
  const addNotification = useCallback((type: NotificationType, message: string) => {
    const id = Date.now().toString() + Math.random().toString();
    setNotifications(prev => [...prev, { id, type, message }]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleBatchProcess = async () => {
    if (!prompt.trim()) {
      addNotification('error', 'Please enter a prompt before processing a batch.');
      return;
    }
    if (batchFiles.length === 0) {
      addNotification('error', 'Please select images for batch processing.');
      return;
    }

    setIsBatchSubmitting(true);
    addNotification('info', `Preparing ${batchFiles.length} images for batch processing...`);

    try {
      const filesWithBase64 = await Promise.all(
        batchFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          return { name: file.name, base64: stripBase64Prefix(base64), mimeType: getMimeType(file) };
        })
      );

      const refRawBase64 = referenceImage ? stripBase64Prefix(referenceImage) : undefined;
      const refMimeType = referenceFile ? getMimeType(referenceFile) : (referenceImage ? getMimeTypeFromBase64(referenceImage) : undefined);

      const response = await fetch('/api/batch/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: filesWithBase64,
          prompt,
          model: selectedModel,
          aspectRatio,
          imageSize,
          referenceImageBase64: refRawBase64,
          referenceMimeType: refMimeType,
          refStrength: referenceImage ? refStrength : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start batch');
      }

      const { jobId } = await response.json();
      setBatchJobId(jobId);
      setBatchProgress({ processed: 0, total: batchFiles.length });
      addNotification('info', `Batch submitted — we'll notify you when your files are ready for download.`);

      startBatchPolling(jobId);
    } catch (error: any) {
      addNotification('error', error.message || 'Failed to submit batch.');
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  const startBatchPolling = useCallback((jobId: string) => {
    if (batchPollRef.current) clearInterval(batchPollRef.current);

    const poll = async () => {
      try {
        const { data, error } = await supabase
          .from('batch_jobs')
          .select('id, status, total_files, processed_files, failed_files, result_zip_path')
          .eq('id', jobId)
          .maybeSingle();

        if (error || !data) return;

        const job = data as BatchJob;
        setBatchProgress({ processed: job.processed_files, total: job.total_files });

        if (job.status === 'completed') {
          if (batchPollRef.current) clearInterval(batchPollRef.current);
          batchPollRef.current = null;
          setBatchJobId(null);
          setBatchProgress(null);
          setBatchFiles([]);

          const succeeded = job.processed_files - job.failed_files;
          const failedNote = job.failed_files > 0 ? ` (${job.failed_files} skipped)` : '';
          const zipUrl = job.result_zip_path
            ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/batch-results/${job.result_zip_path}`
            : null;

          addNotification({
            id: `batch-done-${jobId}`,
            type: 'success',
            message: `Your batch of ${job.total_files} images is ready! ${succeeded} succeeded${failedNote}.`,
            persistent: true,
            actionLabel: 'Download All',
            actionUrl: zipUrl || undefined,
          } as any);
        } else if (job.status === 'failed') {
          if (batchPollRef.current) clearInterval(batchPollRef.current);
          batchPollRef.current = null;
          setBatchJobId(null);
          setBatchProgress(null);
          addNotification('error', 'Batch processing failed. Please try again.');
        }
      } catch (e) {
 // ignore polling errors
      }
    };

    poll();
    batchPollRef.current = setInterval(poll, 30000);
  }, [addNotification]);

  useEffect(() => {
    return () => {
      if (batchPollRef.current) clearInterval(batchPollRef.current);
    };
  }, []);

  useEffect(() => {
    const checkPendingBatches = async () => {
      const { data } = await supabase
        .from('batch_jobs')
        .select('id, status, total_files, processed_files, failed_files, result_zip_path')
        .eq('status', 'processing')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const job = data as BatchJob;
        setBatchJobId(job.id);
        setBatchProgress({ processed: job.processed_files, total: job.total_files });
        startBatchPolling(job.id);
      }
    };
    checkPendingBatches();
  }, [startBatchPolling]);

  useEffect(() => {
    const init = async () => {
      try {
        await initStorage();
        const loadedFolders = await getFolders();
        setCategories(loadedFolders);
      } catch (e) {
        console.error("Error checking initialization:", e);
      } finally {
        setInitialCheckDone(true);
      }
    };
    init();
  }, []);

  const handleSourceChange = (file: File, base64: string) => {
    setSourceFile(file);
    setSourceImage(base64);
    addNotification('info', 'Source image uploaded.');
  };

  const handleReferenceChange = (file: File, base64: string) => {
    setReferenceFile(file);
    setReferenceImage(base64);
    addNotification('info', 'Reference image uploaded.');
  };

  const handleReferenceRemove = () => {
    setReferenceFile(null);
    setReferenceImage(null);
  };

  const handleUploadError = (message: string) => {
    addNotification('error', message);
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  const handleAssistantApply = (newPrompt: string) => {
      setPrompt(newPrompt);
      addNotification('success', 'Prompt updated from Assistant!');
  };

  const handleCopyPrompt = () => {
    if (prompt) {
      navigator.clipboard.writeText(prompt);
      addNotification('success', 'Prompt copied to clipboard!');
    }
  };

  const handleSelectPrompt = async (savedPrompt: SavedPrompt) => {
    try {
      setValidationErrors({});
      const fullPrompt = await getPromptById(savedPrompt.id) || savedPrompt;
      setPrompt(fullPrompt.prompt_text || (fullPrompt as any).prompt || "");
      setActivePromptId(fullPrompt.id);
      setActivePromptName(fullPrompt.name || "");
      const cat = fullPrompt.category && fullPrompt.category !== 'root' ? fullPrompt.category : "";
      setActivePromptCategory(cat);
      setIsNewCategory(!cat);
      setActivePromptDescription(fullPrompt.description || "");
      setActivePromptTags(Array.isArray(fullPrompt.tags) ? fullPrompt.tags.join(', ') : (typeof fullPrompt.tags === 'string' ? fullPrompt.tags : ""));
      setActivePromptCustomFields((fullPrompt as any).custom_fields || []);
      setActivePromptIsPublic(fullPrompt.is_public ?? true);
      setActivePromptPreviewUrl(fullPrompt.preview_image_url || null);
      setReferenceImage(fullPrompt.reference_image_url || null);
      setReferenceFile(null); // Clear file as we have a URL/bas64 string
      setGeneratedImage(null); // Clear previously generated image when exploring newly loaded prompts
      setIsLibraryOpen(false);
      addNotification('success', `Loaded "${fullPrompt.name}"`);
    } catch (e) {
      console.error(e);
      addNotification('error', "Failed to load prompt details from server.");
    }
  };

  const handleAutoFillOrClearMetadata = async () => {
    const hasContent = prompt || activePromptName || activePromptDescription || activePromptCategory || activePromptTags;
    
    setValidationErrors({});
    
    if (hasContent) {
      setPrompt("");
      setActivePromptName("");
      setActivePromptDescription("");
      setActivePromptCategory("");
      setIsNewCategory(true);
      setActivePromptTags("");
      setActivePromptId(null);
      setGeneratedImage(null);
      setActivePromptPreviewUrl(null);
      addNotification("success", "Cleared prompt and metadata.");
    } else {
      if (!prompt.trim()) {
        addNotification("error", "Please write a prompt first to generate metadata.");
        return;
      }
      setStatus({ isLoading: true, error: null, progress: 'Generating metadata...' });
      try {
        const metadata = await generatePromptMetadata(prompt);
        if (metadata.name) setActivePromptName(metadata.name);
        if (metadata.description) setActivePromptDescription(metadata.description);
        if (metadata.category) {
          setActivePromptCategory(metadata.category);
          // If the generated category matches an existing one, select it, else create new
          const existingCat = categories.find(c => c.name.toLowerCase() === metadata.category.toLowerCase());
          if (existingCat) {
            setActivePromptCategory(existingCat.name);
            setIsNewCategory(false);
          } else {
            setIsNewCategory(true);
          }
        }
        if (metadata.tags && metadata.tags.length > 0) setActivePromptTags(metadata.tags.join(', '));
        addNotification("success", "AI metadata generated!");
      } catch (e: any) {
         console.error(e);
         addNotification("error", "Failed to generate metadata.");
      } finally {
        setStatus({ isLoading: false, error: null, progress: undefined });
      }
    }
  };

  const handleSaveClick = async () => {
    if (!prompt.trim()) {
      addNotification('error', "Cannot save an empty prompt.");
      return;
    }
    
    let hasError = false;
    const errors: {name?: boolean, description?: boolean, category?: boolean} = {};
    if (!activePromptName.trim()) { errors.name = true; hasError = true; }
    if (!activePromptDescription.trim()) { errors.description = true; hasError = true; }
    if (!activePromptCategory.trim()) { errors.category = true; hasError = true; }
    
    setValidationErrors(errors);
    
    if (hasError) {
      addNotification('error', "Name, Description, and Category are required to save.");
      return;
    }

    const previewImage = generatedImage || activePromptPreviewUrl || null;

    try {
      setStatus({ isLoading: true, error: null, progress: 'Compressing images...' });
      
      const compressedPreview = await compressImageBase64(previewImage);
      const compressedReference = await compressImageBase64(referenceImage);

      const promptData: Partial<SavedPrompt> = {
        name: activePromptName,
        prompt_text: prompt,
        description: activePromptDescription,
        tags: activePromptTags.split(',').map(tag => tag.trim()).filter(t => t),
        custom_fields: activePromptCustomFields,
        category: activePromptCategory,
        is_public: activePromptIsPublic,
        preview_image_url: compressedPreview,
        reference_image_url: compressedReference,
        user_id: !activePromptIsPublic ? (await supabase.auth.getUser()).data.user?.id : null
      };

      if (activePromptId) {
        await savePrompt({
          id: activePromptId,
          ...promptData
        });
        addNotification('success', `Updated "${activePromptName}"`);
      } else {
        const newPrompt = await savePrompt(promptData);
        setActivePromptId(newPrompt.id);
        addNotification('success', `Saved "${activePromptName}"`);
      }
      
      // Update categories if new
      if (promptData.category && promptData.category !== 'root' && !categories.find(c => c.name === promptData.category)) {
        setCategories(prev => {
          const newCategories = [...prev, { id: promptData.category!, name: promptData.category! }];
          return newCategories.sort((a, b) => a.name.localeCompare(b.name));
        });
      }

      setActivePromptPreviewUrl(previewImage);
    } catch (e: any) {
      console.error(e);
      addNotification('error', `Failed to save prompt: ${e.message || 'Unknown error'}`);
    } finally {
      setStatus({ isLoading: false, error: null, progress: undefined });
    }
  };

  const handleSaveAsNewClick = async () => {
    if (!prompt.trim()) {
      addNotification('error', "Cannot save an empty prompt.");
      return;
    }
    
    let hasError = false;
    const errors: {name?: boolean, description?: boolean, category?: boolean} = {};
    if (!activePromptName.trim()) { errors.name = true; hasError = true; }
    if (!activePromptDescription.trim()) { errors.description = true; hasError = true; }
    if (!activePromptCategory.trim()) { errors.category = true; hasError = true; }
    
    setValidationErrors(errors);
    
    if (hasError) {
      addNotification('error', "Name, Description, and Category are required to save.");
      return;
    }

    const newName = activePromptName ? `${activePromptName} (Copy)` : "New Prompt";
    setActivePromptName(newName);
    
    const previewImage = generatedImage || activePromptPreviewUrl || null;

    try {
      setStatus({ isLoading: true, error: null, progress: 'Compressing images...' });
      
      const compressedPreview = await compressImageBase64(previewImage);
      const compressedReference = await compressImageBase64(referenceImage);

      const promptData: Partial<SavedPrompt> = {
        name: newName,
        prompt_text: prompt,
        description: activePromptDescription,
        tags: activePromptTags.split(',').map(tag => tag.trim()).filter(t => t),
        custom_fields: activePromptCustomFields,
        category: activePromptCategory,
        is_public: activePromptIsPublic,
        preview_image_url: compressedPreview,
        reference_image_url: compressedReference,
        user_id: !activePromptIsPublic ? (await supabase.auth.getUser()).data.user?.id : null
      };

      const newPrompt = await savePrompt(promptData);
      setActivePromptId(newPrompt.id);
      addNotification('success', `Saved "${newName}"`);
      
      // Update categories if new
      if (promptData.category && promptData.category !== 'root' && !categories.find(c => c.name === promptData.category)) {
        setCategories(prev => {
          const newCategories = [...prev, { id: promptData.category!, name: promptData.category! }];
          return newCategories.sort((a, b) => a.name.localeCompare(b.name));
        });
      }

      setActivePromptPreviewUrl(previewImage);
    } catch (e: any) {
      console.error(e);
      addNotification('error', `Failed to save prompt: ${e.message || 'Unknown error'}`);
    } finally {
      setStatus({ isLoading: false, error: null, progress: undefined });
    }
  };

  const handleGenerate = async () => {
    if (!prompt) {
      addNotification('error', "Please enter a prompt to generate an image.");
      return;
    }

    setStatus({ isLoading: true, error: null, progress: 'Generating...' });

    try {
      const rawBase64 = sourceImage ? stripBase64Prefix(sourceImage) : undefined;
      const mimeType = sourceFile ? getMimeType(sourceFile) : (sourceImage ? getMimeTypeFromBase64(sourceImage) : undefined);
      
      const refRawBase64 = referenceImage ? stripBase64Prefix(referenceImage) : undefined;
      const refMimeType = referenceFile ? getMimeType(referenceFile) : (referenceImage ? getMimeTypeFromBase64(referenceImage) : undefined);

      const resultImage = await generateEditedImage({
        imageBase64: rawBase64,
        mimeType: mimeType,
        referenceImageBase64: refRawBase64,
        referenceMimeType: refMimeType,
        refStrength: referenceImage ? refStrength : undefined,
        prompt,
        aspectRatio,
        imageSize,
        model: selectedModel
      });

      setGeneratedImage(resultImage);
      
      if (!activePromptId && (!activePromptName || !activePromptDescription)) {
        setStatus({ isLoading: true, error: null, progress: 'Generating suggested metadata...' });
        const metadata = await generatePromptMetadata(prompt);
        if (metadata.name && !activePromptName) setActivePromptName(metadata.name);
        if (metadata.description && !activePromptDescription) setActivePromptDescription(metadata.description);
        if (metadata.tags.length > 0 && !activePromptTags) setActivePromptTags(metadata.tags.join(', '));
      }

      setStatus({ isLoading: false, error: null, progress: 'Complete' });
      addNotification('success', 'Image generated successfully!');
    } catch (error: any) {
      setStatus({ isLoading: false, error: null, progress: '' });
      
      if (error.message === 'API_KEY_INVALID') {
        addNotification('error', "API Key invalid or expired. Please select a valid API key.");
      } else if (error.message === 'API_KEY_LEAKED') {
        addNotification('error', "Your API key was reported as leaked. Please select a different, secure API key.");
      } else if (error.message === 'API_KEY_PERMISSION_DENIED') {
        addNotification('error', "Permission denied. Ensure your selected API key is from a project with billing enabled and has access to this model.");
      } else if (error.message === 'API_KEY_QUOTA_EXCEEDED') {
        addNotification('error', "Quota exceeded for high-fidelity models. These models require a paid API key with billing enabled. Try switching to the 2.5 Flash model or check your Google Cloud project billing.");
      } else {
        addNotification('error', error.message || "An unexpected error occurred.");
      }
    }
  };

  const handleDownload = () => {
    if (generatedImage) {
      try {
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `fun-frame-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addNotification('success', 'Download started.');
      } catch (e) {
        addNotification('error', 'Failed to initiate download.');
      }
    }
  };

  if (!initialCheckDone) {
    return <div className="min-h-screen bg-app-bg flex items-center justify-center text-app-muted font-mono text-sm tracking-widest uppercase">Initializing...</div>;
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-app-bg text-app-text font-sans selection:bg-app-accent/30 w-full overflow-x-hidden">
      <Header />
      <NotificationContainer notifications={notifications} removeNotification={removeNotification} />

      <PromptLibrary 
        isOpen={isLibraryOpen} 
        onClose={() => setIsLibraryOpen(false)} 
        onSelectPrompt={handleSelectPrompt} 
      />

      <PromptAssistant
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        currentPrompt={prompt}
        onApplyPrompt={handleAssistantApply}
      />

      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 w-full">
          {/* Controls Column */}
          <div className="space-y-4 sm:space-y-6 w-full min-w-0">
            {/* The Prompt */}
            <div className="bg-app-surface rounded-xl border border-app-border p-4 sm:p-6 shadow-2xl shadow-black/50 space-y-4 relative w-full min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="bg-app-bg w-6 h-6 sm:w-7 sm:h-7 rounded flex items-center justify-center text-xs font-mono text-app-accent border border-app-border flex-shrink-0">01</span>
                  <h2 className="text-base sm:text-lg font-semibold text-white">The Prompt</h2>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <button
                    onClick={() => setIsAssistantOpen(true)}
                    className="text-[10px] uppercase tracking-wider font-bold bg-app-accent hover:bg-app-accentHover text-white px-2.5 sm:px-3 py-1.5 rounded flex items-center gap-1 shadow-md shadow-app-accent/20 transition-colors"
                    title="AI Prompt Assistant"
                  >
                    ✨ Assistant
                  </button>
                  <button
                    onClick={handleCopyPrompt}
                    className="text-[10px] uppercase tracking-wider font-bold bg-app-bg hover:bg-app-border/80 text-app-text px-2.5 py-1.5 rounded border border-app-border transition-colors flex items-center gap-1"
                    title="Copy Prompt"
                  >
                    <Copy size={12} />
                    <span className="hidden xs:inline">Copy</span>
                  </button>
                  <button
                    onClick={() => setIsLibraryOpen(true)}
                    className="text-[10px] uppercase tracking-wider font-bold bg-app-bg hover:bg-app-border/80 text-app-text px-2.5 sm:px-3 py-1.5 rounded border border-app-border transition-colors"
                  >
                    Library
                  </button>
                </div>
              </div>
              
              <div className="w-full">
                {activePromptId && (
                  <div className="mb-2 text-[10px] text-app-accent bg-app-accent/10 px-2 py-0.5 rounded border border-app-accent/20 inline-block truncate max-w-full">
                    Editing: {activePromptName}
                  </div>
                )}
                <PromptEditor
                  promptText={prompt}
                  onPromptTextChange={setPrompt}
                  customFields={activePromptCustomFields}
                  onCustomFieldsChange={setActivePromptCustomFields}
                />
              </div>
            </div>

            {/* Upload Images */}
            <div className="bg-app-surface rounded-xl border border-app-border p-4 sm:p-6 shadow-2xl shadow-black/50 w-full min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4 flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                    <span className="bg-app-bg w-6 h-6 sm:w-7 sm:h-7 rounded flex items-center justify-center text-xs font-mono text-app-accent border border-app-border flex-shrink-0">02</span>
                    Upload Images
                </div>
                <button
                    onClick={() => setIsBatchMode(!isBatchMode)}
                    className={`px-2 py-1 text-[10px] font-mono uppercase rounded ${isBatchMode ? 'bg-app-accent text-white' : 'bg-app-surface text-app-muted border border-app-border'}`}
                >
                    {isBatchMode ? 'Batch: ON' : 'Batch: OFF'}
                </button>
              </h2>
              <div className="space-y-4 w-full">
                <ImageUpload 
                  label={isBatchMode ? "Select Folder / Images" : "Source Image"} 
                  image={sourceImage}
                  onImageChange={handleSourceChange}
                  onBatchImagesChange={(files) => {
                      setBatchFiles(files);
                      addNotification('info', `Selected ${files.length} images for batch processing.`);
                  }}
                  onError={handleUploadError}
                  required
                  isBatchMode={isBatchMode}
                />
                {isBatchMode && batchFiles.length > 0 && (
                    <div className="space-y-2">
                        {batchProgress && (
                            <div className="w-full bg-app-bg border border-app-border rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-mono uppercase tracking-wider text-app-muted">
                                        {batchJobId ? 'Processing' : 'Submitting'}...
                                    </span>
                                    <span className="text-xs font-mono text-app-accent">
                                        {batchProgress.processed} / {batchProgress.total}
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-app-border rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-app-accent transition-all duration-500"
                                        style={{ width: `${batchProgress.total > 0 ? (batchProgress.processed / batchProgress.total) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        )}
                        <button
                            onClick={handleBatchProcess}
                            disabled={isBatchSubmitting || !!batchJobId}
                            className="w-full py-2 bg-app-accent text-white font-semibold rounded-lg text-xs uppercase disabled:opacity-50 disabled:cursor-not-allowed hover:bg-app-accentHover transition-colors"
                        >
                            {isBatchSubmitting ? 'Submitting...' : batchJobId ? 'Processing...' : `Process ${batchFiles.length} Images`}
                        </button>
                    </div>
                )}
                <ImageUpload 
                  label="Reference Image (Optional)" 
                  image={referenceImage}
                  onImageChange={handleReferenceChange}
                  onError={handleUploadError}
                  onRemove={handleReferenceRemove}
                />
              </div>
            </div>

            {/* Configuration */}
            <div className="bg-app-surface rounded-xl border border-app-border p-4 sm:p-6 shadow-2xl shadow-black/50 space-y-4 sm:space-y-6 w-full min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2 sm:gap-3">
                <span className="bg-app-bg w-6 h-6 sm:w-7 sm:h-7 rounded flex items-center justify-center text-xs font-mono text-app-accent border border-app-border flex-shrink-0">03</span>
                Configuration
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
                <div className="col-span-1 sm:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted">Model</label>
                  </div>
                  <select 
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as ModelType)}
                    className="w-full bg-app-bg border border-app-border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-white focus:ring-1 focus:ring-app-accent focus:border-app-accent outline-none transition-all text-xs sm:text-sm"
                  >
                    <option value={ModelType.FLASH}>Nano Banana 2.5 Flash (Fast & Free)</option>
                    <option value={ModelType.FLASH_3_1}>Gemini 3.1 Flash (High Quality)</option>
                    <option value={ModelType.PRO}>Nano Banana 3.0 Pro (High Fidelity)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1.5">Aspect Ratio</label>
                  <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                    className="w-full bg-app-bg border border-app-border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-white focus:ring-1 focus:ring-app-accent focus:border-app-accent outline-none transition-all text-xs sm:text-sm"
                  >
                    <option value={AspectRatio.SQUARE}>1:1 (Square)</option>
                    <option value={AspectRatio.THREE_TWO}>3:2 (Photo / Landscape)</option>
                    <option value={AspectRatio.TWO_THREE}>2:3 (Photo / Portrait)</option>
                    <option value={AspectRatio.LANDSCAPE}>16:9 (Landscape)</option>
                    <option value={AspectRatio.PORTRAIT}>9:16 (Portrait)</option>
                    <option value={AspectRatio.STANDARD_LANDSCAPE}>4:3 (Standard)</option>
                    <option value={AspectRatio.STANDARD_PORTRAIT}>3:4 (Standard)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1.5">Quality</label>
                  <select 
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as ImageSize)}
                    className="w-full bg-app-bg border border-app-border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-white focus:ring-1 focus:ring-app-accent focus:border-app-accent outline-none transition-all text-xs sm:text-sm"
                  >
                    <option value={ImageSize.ONE_K}>1K (Fast)</option>
                    <option value={ImageSize.TWO_K}>2K (High Quality)</option>
                    <option value={ImageSize.FOUR_K}>4K (Ultra)</option>
                  </select>
                </div>
              </div>

              {referenceImage && (
                <div className="bg-app-bg/50 p-3 sm:p-4 rounded-lg border border-app-border">
                  <div className="flex justify-between mb-2 sm:mb-3">
                    <label className="text-xs font-mono uppercase tracking-wider text-app-muted">Reference Influence</label>
                    <span className="text-xs font-mono font-bold text-app-accent">{refStrength}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={refStrength}
                    onChange={(e) => setRefStrength(parseInt(e.target.value))}
                    className="w-full h-2 bg-app-border rounded-lg appearance-none cursor-pointer accent-app-accent"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Results Column */}
          <div className="space-y-4 sm:space-y-6 w-full min-w-0">
            <Button 
              onClick={handleGenerate} 
              isLoading={status.isLoading}
              disabled={!prompt}
              className="w-full bg-app-accent hover:bg-app-accentHover text-white font-semibold tracking-wide uppercase text-base sm:text-lg rounded-xl py-3.5 sm:py-4 shadow-xl shadow-app-accent/20 transition-all active:scale-[0.98]"
            >
              {status.isLoading ? 'Generating...' : 'Generate Image'}
            </Button>

            <div className="bg-app-surface rounded-xl border border-app-border p-4 sm:p-6 shadow-2xl shadow-black/50 min-h-[400px] sm:min-h-[500px] flex flex-col w-full min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
                <span className="bg-app-bg w-6 h-6 sm:w-7 sm:h-7 rounded flex items-center justify-center text-xs font-mono text-app-accent border border-app-border flex-shrink-0">04</span>
                Result
              </h2>

              <div className="flex-grow flex items-center justify-center bg-app-bg rounded-lg border border-app-border relative overflow-hidden min-h-[260px] sm:min-h-[400px]">
                {status.isLoading && (
                   <div className="absolute inset-0 z-20 bg-app-bg/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 sm:gap-4 animate-fadeIn p-4 text-center">
                     <div className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-app-accent border-t-transparent rounded-full animate-spin"></div>
                     <p className="text-app-accent font-mono text-xs uppercase tracking-widest animate-pulse">{status.progress || 'Processing...'}</p>
                   </div>
                )}

                {generatedImage ? (
                  <img 
                    src={generatedImage} 
                    alt="Generated" 
                    className={`max-w-full max-h-[500px] sm:max-h-[600px] object-contain shadow-2xl transition-all duration-300 ${status.isLoading ? 'scale-95 opacity-50 blur-sm' : 'animate-fadeIn'}`} 
                  />
                ) : (
                   !status.isLoading && (
                    <div className="text-center p-6 sm:p-8 opacity-30 font-mono text-xs uppercase tracking-widest">
                      <p>Awaiting Input</p>
                    </div>
                   )
                )}
              </div>

              <div className="mt-4 sm:mt-6 flex flex-col gap-3 sm:gap-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs sm:text-sm font-semibold text-white uppercase tracking-wider font-mono">Prompt Metadata</h3>
                  <button 
                    onClick={handleAutoFillOrClearMetadata}
                    className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-app-accent hover:text-white transition-colors bg-app-accent/10 hover:bg-app-accent/20 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded border border-app-accent/20 flex items-center gap-1.5"
                  >
                    <span>✨</span>
                    {(prompt || activePromptName || activePromptDescription || activePromptCategory || activePromptTags) ? 'Clear All' : 'Auto-fill'}
                  </button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Name <span className="text-red-400">*</span></label>
                    <input 
                      type="text" 
                      value={activePromptName} 
                      onChange={(e) => {
                        setActivePromptName(e.target.value);
                        if (validationErrors.name) setValidationErrors(prev => ({ ...prev, name: false }));
                      }}
                      placeholder="e.g., Cyberpunk Cityscape"
                      className={`w-full bg-app-bg border ${validationErrors.name ? 'border-red-500 bg-red-500/5' : 'border-app-border'} rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-xs sm:text-sm transition-colors`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Category <span className="text-red-400">*</span></label>
                    <div className="flex flex-col xs:flex-row gap-2">
                      <select
                        value={isNewCategory ? "_new_" : activePromptCategory}
                        onChange={(e) => {
                          if (validationErrors.category) setValidationErrors(prev => ({ ...prev, category: false }));
                          if (e.target.value === "_new_") {
                            setIsNewCategory(true);
                            setActivePromptCategory("");
                          } else {
                            setIsNewCategory(false);
                            setActivePromptCategory(e.target.value);
                          }
                        }}
                        className={`bg-app-bg border ${validationErrors.category && !isNewCategory ? 'border-red-500 bg-red-500/5' : 'border-app-border'} rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-xs sm:text-sm transition-colors ${isNewCategory ? 'w-full xs:w-[130px]' : 'w-full'}`}
                      >
                       <option value="_new_">+ Create New...</option>
                       {activePromptCategory && !categories.find(c => c.name === activePromptCategory) && !isNewCategory && (
                          <option value={activePromptCategory}>{activePromptCategory}</option>
                       )}
                       {categories.map(c => (
                         <option key={c.id} value={c.name}>{c.name}</option>
                       ))}
                      </select>
                      
                      {isNewCategory && (
                        <input 
                          type="text" 
                          value={activePromptCategory} 
                          onChange={(e) => {
                            setActivePromptCategory(e.target.value);
                            if (validationErrors.category) setValidationErrors(prev => ({ ...prev, category: false }));
                          }}
                          placeholder="New category name"
                          className={`w-full flex-1 min-w-0 bg-app-bg border ${validationErrors.category && isNewCategory ? 'border-red-500 bg-red-500/5' : 'border-app-border'} rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-xs sm:text-sm transition-colors`}
                        />
                      )}
                    </div>
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Description <span className="text-red-400">*</span></label>
                    <textarea 
                      value={activePromptDescription} 
                      onChange={(e) => {
                        setActivePromptDescription(e.target.value);
                        if (validationErrors.description) setValidationErrors(prev => ({ ...prev, description: false }));
                      }}
                      placeholder="Briefly describe what this prompt does..."
                      className={`w-full bg-app-bg border ${validationErrors.description ? 'border-red-500 bg-red-500/5' : 'border-app-border'} rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-xs sm:text-sm resize-none min-h-[60px] transition-colors`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Tags (comma separated)</label>
                    <input 
                      type="text" 
                      value={activePromptTags} 
                      onChange={(e) => setActivePromptTags(e.target.value)}
                      placeholder="e.g., neon, futuristic"
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-xs sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Visibility</label>
                    <div className="flex bg-app-bg border border-app-border rounded-lg overflow-hidden h-[36px] sm:h-[38px]">
                      <button
                        className={`flex-1 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${activePromptIsPublic ? 'bg-app-accent text-white font-bold' : 'text-app-muted hover:bg-app-surface'}`}
                        onClick={() => setActivePromptIsPublic(true)}
                      >
                        Public
                      </button>
                      <button
                        className={`flex-1 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${!activePromptIsPublic ? 'bg-amber-600 text-white font-bold' : 'text-app-muted hover:bg-app-surface'}`}
                        onClick={() => setActivePromptIsPublic(false)}
                      >
                        Private
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 sm:justify-between mt-2 pt-4 border-t border-app-border">
                  <div className="flex flex-col xs:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                    <Button 
                      onClick={handleSaveClick}
                      variant="primary"
                      className="w-full xs:w-auto text-xs py-2.5 sm:py-3"
                    >
                      {activePromptId ? 'Update Prompt' : 'Save New Prompt'}
                    </Button>
                    {activePromptId && (
                      <Button 
                        onClick={handleSaveAsNewClick}
                        variant="secondary"
                        className="w-full xs:w-auto text-xs py-2.5 sm:py-3"
                      >
                        Save As New
                      </Button>
                    )}
                  </div>
                  <Button 
                    onClick={handleDownload} 
                    disabled={!generatedImage || status.isLoading}
                    variant="secondary"
                    className="w-full sm:w-auto text-xs py-2.5 sm:py-3"
                  >
                    Download Result
                  </Button>
                </div>
              </div>
             </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;