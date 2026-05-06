import React, { useRef, useState } from 'react';
import { validateImageFile, fileToBase64 } from '../utils/imageUtils';

interface ImageUploadProps {
  label: string;
  image: string | null;
  onImageChange: (file: File, base64: string) => void;
  onError: (message: string) => void;
  onRemove?: () => void;
  required?: boolean;
  className?: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ 
  label, 
  image, 
  onImageChange, 
  onError, 
  onRemove,
  required = false,
  className = ''
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const processFile = async (file: File) => {
    const error = validateImageFile(file);
    if (error) {
      onError(error);
      return;
    }

    setIsLoading(true);
    try {
      const base64 = await fileToBase64(file);
      onImageChange(file, base64);
    } catch (err) {
      onError('Failed to process image file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  return (
    <div className={className}>
      <h3 className="text-xs font-mono uppercase tracking-wider text-app-muted mb-2 flex items-center justify-between">
        {label}
        {required && <span className="text-[10px] text-app-accent bg-app-accent/10 px-2 py-0.5 rounded border border-app-accent/20">Required</span>}
      </h3>
      
      <div 
        className={`relative border border-dashed rounded-lg transition-all duration-300 min-h-[160px] flex flex-col items-center justify-center overflow-hidden group cursor-pointer
          ${isDragOver ? 'border-app-accent bg-app-accent/10' : 'border-app-border hover:border-app-accent/50 hover:bg-app-surface'}
          ${image ? 'border-app-accent/30 bg-app-bg' : ''}
        `}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isLoading ? (
           <div className="flex flex-col items-center gap-3">
             <svg className="animate-spin h-8 w-8 text-app-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
             </svg>
             <p className="text-app-muted font-mono text-[10px] uppercase tracking-widest">Processing...</p>
           </div>
        ) : image ? (
          <>
            <img src={image} alt="Upload preview" className="max-h-[300px] w-full object-contain" />
            
            {/* Overlay for Replace Text */}
            <div className="absolute inset-0 bg-app-bg/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
              <p className="text-app-text font-mono text-xs uppercase tracking-widest flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-app-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Replace
              </p>
            </div>

            {/* Remove Button */}
            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-600 text-white rounded-full transition-colors z-10 shadow-lg backdrop-blur-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                title="Remove Image"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </>
        ) : (
          <div className="text-center p-6">
            <div className="mx-auto h-10 w-10 text-app-muted mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-app-text font-mono text-xs uppercase tracking-widest">Upload Image</p>
            <p className="text-app-muted text-[10px] mt-1 font-mono">JPG, PNG, WEBP</p>
          </div>
        )}
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden" 
          accept="image/png, image/jpeg, image/webp, image/heic"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
};

export default ImageUpload;