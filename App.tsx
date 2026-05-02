import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Button from './components/Button';
import NotificationContainer from './components/NotificationToast';
import ImageUpload from './components/ImageUpload';
import PromptLibrary from './components/PromptLibrary';

import PromptAssistant from './components/PromptAssistant';
import { stripBase64Prefix, getMimeType } from './utils/imageUtils';
import { generateEditedImage, promptForApiKey, generatePromptMetadata } from './services/geminiService';
import { savePrompt, initStorage, getFolders } from './services/storageService';
import { AspectRatio, ImageSize, ModelType, ProcessingState, NotificationItem, NotificationType, SavedPrompt, Folder } from './types';

const App: React.FC = () => {
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
  const [selectedModel, setSelectedModel] = useState<ModelType>(ModelType.PRO);

  // Saved Prompts Management
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [activePromptName, setActivePromptName] = useState<string>("");
  const [activePromptCategory, setActivePromptCategory] = useState<string>("");
  const [isNewCategory, setIsNewCategory] = useState<boolean>(true);
  const [activePromptDescription, setActivePromptDescription] = useState<string>("");
  const [activePromptTags, setActivePromptTags] = useState<string>("");
  const [activePromptIsPublic, setActivePromptIsPublic] = useState<boolean>(true);
  const [activePromptPreviewUrl, setActivePromptPreviewUrl] = useState<string | null>(null);
  
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

  const handleSelectPrompt = (savedPrompt: SavedPrompt) => {
    setPrompt(savedPrompt.prompt_text);
    setActivePromptId(savedPrompt.id);
    setActivePromptName(savedPrompt.name);
    const cat = savedPrompt.category && savedPrompt.category !== 'root' ? savedPrompt.category : "";
    setActivePromptCategory(cat);
    setIsNewCategory(!cat);
    setActivePromptDescription(savedPrompt.description || "");
    setActivePromptTags((savedPrompt.tags || []).join(", "));
    setActivePromptIsPublic(savedPrompt.is_public ?? true);
    setActivePromptPreviewUrl(savedPrompt.preview_image_url || null);
    setGeneratedImage(null); // Clear previously generated image when exploring newly loaded prompts
    setIsLibraryOpen(false);
    addNotification('success', `Loaded "${savedPrompt.name}"`);
  };

  const handleSaveClick = async () => {
    if (!prompt.trim()) {
      addNotification('error', "Cannot save an empty prompt.");
      return;
    }
    if (!activePromptName.trim() || !activePromptDescription.trim() || !activePromptCategory.trim()) {
      addNotification('error', "Name, Description, and Category are required to save.");
      return;
    }

    const previewImage = generatedImage || activePromptPreviewUrl || null;

    try {
      const promptData: Partial<SavedPrompt> = {
        name: activePromptName,
        prompt_text: prompt,
        description: activePromptDescription,
        tags: activePromptTags.split(',').map(tag => tag.trim()).filter(t => t),
        category: activePromptCategory,
        is_public: activePromptIsPublic,
        preview_image_url: previewImage,
        user_id: !activePromptIsPublic ? "274f2dd5-9843-4518-872d-88c2e0f225f5" : null
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
      if (promptData.category && !categories.find(c => c.name === promptData.category)) {
        setCategories(prev => [...prev, { id: promptData.category!, name: promptData.category! }]);
      }

      setActivePromptPreviewUrl(previewImage);
    } catch (e: any) {
      console.error(e);
      addNotification('error', `Failed to save prompt: ${e.message || 'Unknown error'}`);
    }
  };

  const handleSaveAsNewClick = async () => {
    if (!prompt.trim()) {
      addNotification('error', "Cannot save an empty prompt.");
      return;
    }
    
    // We update the name slightly if it was a copy, but they should be able to edit it.
    // If they hit Save As New, maybe we just set activePromptId = null and let them hit Save, OR we do the save here immediately.
    // Since the form is inline, "Save New" could just copy to a new record.
    setActivePromptId(null);
    const newName = activePromptName ? `${activePromptName} (Copy)` : "New Prompt";
    setActivePromptName(newName);
    
    // Wait for the user to be ready to save? Or save immediately? 
    // They asked "REQUIRE Name, Description and visibility fields when saving prompts."
    // If we just clear the ID and rename, they can review and hit Save.
    addNotification('info', `Ready to save as "${newName}". Review and click Save.`);
  };

  const handleGenerate = async () => {
    if (!prompt) {
      addNotification('error', "Please enter a prompt to generate an image.");
      return;
    }

    setStatus({ isLoading: true, error: null, progress: 'Generating...' });

    try {
      const rawBase64 = sourceImage ? stripBase64Prefix(sourceImage) : undefined;
      const mimeType = sourceFile ? getMimeType(sourceFile) : undefined;
      
      const refRawBase64 = referenceImage ? stripBase64Prefix(referenceImage) : undefined;
      const refMimeType = referenceFile ? getMimeType(referenceFile) : undefined;

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
      
      if (!activePromptName || !activePromptDescription) {
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

  return (
    <div className="min-h-screen bg-app-bg text-app-text font-sans selection:bg-app-accent/30">
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Controls Column */}
          <div className="space-y-6">
            <div className="bg-app-surface rounded-xl border border-app-border p-6 shadow-2xl shadow-black/50">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-3">
                <span className="bg-app-bg w-7 h-7 rounded flex items-center justify-center text-xs font-mono text-app-accent border border-app-border">01</span>
                Upload Images
              </h2>
              <div className="space-y-4">
                <ImageUpload 
                  label="Source Image" 
                  image={sourceImage}
                  onImageChange={handleSourceChange}
                  onError={handleUploadError}
                  required
                />
                <ImageUpload 
                  label="Reference Image (Optional)" 
                  image={referenceImage}
                  onImageChange={handleReferenceChange}
                  onError={handleUploadError}
                  onRemove={handleReferenceRemove}
                />
              </div>
            </div>

            <div className="bg-app-surface rounded-xl border border-app-border p-6 shadow-2xl shadow-black/50 space-y-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-3">
                <span className="bg-app-bg w-7 h-7 rounded flex items-center justify-center text-xs font-mono text-app-accent border border-app-border">02</span>
                Configuration
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted">Model</label>
                    {(selectedModel === ModelType.PRO || selectedModel === ModelType.FLASH_3_1) && (
                      <button 
                        onClick={() => promptForApiKey()}
                        className="text-[10px] uppercase tracking-wider font-bold text-app-accent hover:text-app-accentHover transition-colors flex items-center gap-1"
                      >
                        <span>🔑</span>
                        Change Key
                      </button>
                    )}
                  </div>
                  <select 
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as ModelType)}
                    className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-2.5 text-white focus:ring-1 focus:ring-app-accent focus:border-app-accent outline-none transition-all text-sm"
                  >
                    <option value={ModelType.FLASH}>Nano Banana 2.5 Flash (Fast & Free)</option>
                    <option value={ModelType.FLASH_3_1}>Gemini 3.1 Flash Preview (High Quality)</option>
                    <option value={ModelType.PRO}>Nano Banana 3.0 Pro (High Fidelity - Paid Key Required)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-2">Aspect Ratio</label>
                  <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                    className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-2.5 text-white focus:ring-1 focus:ring-app-accent focus:border-app-accent outline-none transition-all text-sm"
                  >
                    <option value={AspectRatio.SQUARE}>1:1 (Square)</option>
                    <option value={AspectRatio.LANDSCAPE}>16:9 (Landscape)</option>
                    <option value={AspectRatio.PORTRAIT}>9:16 (Portrait)</option>
                    <option value={AspectRatio.STANDARD_LANDSCAPE}>4:3 (Standard)</option>
                    <option value={AspectRatio.STANDARD_PORTRAIT}>3:4 (Standard)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-2">Quality</label>
                  <select 
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as ImageSize)}
                    className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-2.5 text-white focus:ring-1 focus:ring-app-accent focus:border-app-accent outline-none transition-all text-sm"
                  >
                    <option value={ImageSize.ONE_K}>1K (Fast)</option>
                    <option value={ImageSize.TWO_K}>2K (High Quality)</option>
                    <option value={ImageSize.FOUR_K}>4K (Ultra)</option>
                  </select>
                </div>
              </div>

              {referenceImage && (
                <div className="bg-app-bg/50 p-4 rounded-lg border border-app-border">
                  <div className="flex justify-between mb-3">
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-mono uppercase tracking-wider text-app-muted flex items-center gap-2">
                    Prompt
                    {activePromptId && (
                      <span className="ml-2 text-[10px] text-app-accent bg-app-accent/10 px-2 py-0.5 rounded border border-app-accent/20">
                        Editing: {activePromptName}
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <button
                        onClick={() => setIsAssistantOpen(true)}
                        className="text-[10px] uppercase tracking-wider font-bold bg-app-accent hover:bg-app-accentHover text-white px-3 py-1.5 rounded flex items-center gap-1 shadow-md shadow-app-accent/20 transition-colors"
                        title="AI Prompt Assistant"
                    >
                        ✨ Prompt Assistant
                    </button>
                    <button 
                      onClick={() => setIsLibraryOpen(true)}
                      className="text-[10px] uppercase tracking-wider font-bold bg-app-border hover:bg-app-border/80 text-app-text px-3 py-1.5 rounded border border-app-border transition-colors"
                    >
                      Library
                    </button>
                  </div>
                </div>
                <textarea
                  value={prompt}
                  onChange={handlePromptChange}
                  placeholder={referenceImage ? "Describe how you want to modify the source image using the reference..." : "Describe how you want to modify the image..."}
                  className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-app-accent focus:border-app-accent outline-none min-h-[120px] resize-none text-sm font-mono"
                />
              </div>

              <Button 
                onClick={handleGenerate} 
                isLoading={status.isLoading}
                disabled={!prompt}
                className="w-full bg-app-accent hover:bg-app-accentHover text-white font-semibold tracking-wide uppercase text-sm rounded-lg py-3 transition-colors"
              >
                {status.isLoading ? 'Generating...' : 'Generate Image'}
              </Button>
            </div>
          </div>

          {/* Results Column */}
          <div className="space-y-6">
             <div className="bg-app-surface rounded-xl border border-app-border p-6 shadow-2xl shadow-black/50 min-h-[500px] flex flex-col">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-3">
                <span className="bg-app-bg w-7 h-7 rounded flex items-center justify-center text-xs font-mono text-app-accent border border-app-border">03</span>
                Result
              </h2>

              <div className="flex-grow flex items-center justify-center bg-app-bg rounded-lg border border-app-border relative overflow-hidden">
                {status.isLoading && (
                   <div className="absolute inset-0 z-20 bg-app-bg/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 animate-fadeIn">
                     <div className="w-12 h-12 border-2 border-app-accent border-t-transparent rounded-full animate-spin"></div>
                     <p className="text-app-accent font-mono text-xs uppercase tracking-widest animate-pulse">{status.progress || 'Processing...'}</p>
                   </div>
                )}

                {generatedImage ? (
                  <img 
                    src={generatedImage} 
                    alt="Generated" 
                    className={`max-w-full max-h-[600px] object-contain shadow-2xl transition-all duration-300 ${status.isLoading ? 'scale-95 opacity-50 blur-sm' : 'animate-fadeIn'}`} 
                  />
                ) : (
                   !status.isLoading && (
                    <div className="text-center p-8 opacity-30 font-mono text-xs uppercase tracking-widest">
                      <p>Awaiting Input</p>
                    </div>
                   )
                )}
              </div>

              <div className="mt-6 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Name <span className="text-red-400">*</span></label>
                    <input 
                      type="text" 
                      value={activePromptName} 
                      onChange={(e) => setActivePromptName(e.target.value)}
                      placeholder="e.g., Cyberpunk Cityscape"
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Category <span className="text-red-400">*</span></label>
                    <div className="flex gap-2">
                      <select
                        value={isNewCategory ? "_new_" : activePromptCategory}
                        onChange={(e) => {
                          if (e.target.value === "_new_") {
                            setIsNewCategory(true);
                            setActivePromptCategory("");
                          } else {
                            setIsNewCategory(false);
                            setActivePromptCategory(e.target.value);
                          }
                        }}
                        className={`bg-app-bg border border-app-border rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-sm ${isNewCategory ? 'w-[140px]' : 'w-full'}`}
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
                          onChange={(e) => setActivePromptCategory(e.target.value)}
                          placeholder="New category"
                          className="flex-1 min-w-0 bg-app-bg border border-app-border rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-sm"
                        />
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Description <span className="text-red-400">*</span></label>
                    <textarea 
                      value={activePromptDescription} 
                      onChange={(e) => setActivePromptDescription(e.target.value)}
                      placeholder="Briefly describe what this prompt does..."
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-sm resize-none min-h-[60px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Tags (comma separated)</label>
                    <input 
                      type="text" 
                      value={activePromptTags} 
                      onChange={(e) => setActivePromptTags(e.target.value)}
                      placeholder="e.g., neon, futuristic"
                      className="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Visibility</label>
                    <div className="flex bg-app-bg border border-app-border rounded-lg overflow-hidden h-[38px]">
                      <button
                        className={`flex-1 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${activePromptIsPublic ? 'bg-app-accent text-white' : 'text-app-muted hover:bg-app-surface'}`}
                        onClick={() => setActivePromptIsPublic(true)}
                      >
                        Public
                      </button>
                      <button
                        className={`flex-1 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${!activePromptIsPublic ? 'bg-amber-600 text-white' : 'text-app-muted hover:bg-app-surface'}`}
                        onClick={() => setActivePromptIsPublic(false)}
                      >
                        Private
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between mt-2 pt-4 border-t border-app-border">
                  <div className="flex gap-3">
                    <Button 
                      onClick={handleSaveClick}
                      variant="primary"
                    >
                      {activePromptId ? 'Update Prompt' : 'Save New Prompt'}
                    </Button>
                    {activePromptId && (
                      <Button 
                        onClick={handleSaveAsNewClick}
                        variant="secondary"
                      >
                        Save As New
                      </Button>
                    )}
                  </div>
                  <Button 
                    onClick={handleDownload} 
                    disabled={!generatedImage || status.isLoading}
                    variant="secondary"
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