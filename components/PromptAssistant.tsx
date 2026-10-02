import React, { useState } from 'react';
import Button from './Button';
import { generatePromptIdeas } from '../services/geminiService';

interface PromptAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt: string;
  onApplyPrompt: (newPrompt: string) => void;
}

const QUICK_ACTIONS = [
  { label: "Cinematic Scene", instruction: "Transform into a dramatic movie still — deep shadows, anamorphic lens flare, golden-hour or blue-hour lighting, cinematic color grade, wide-angle composition" },
  { label: "Fantasy / Epic", instruction: "Place subjects in a sweeping fantasy world — ancient ruins, magical atmosphere, dramatic storm clouds or aurora skies, epic scale, painterly style" },
  { label: "Illustrated / Cartoon", instruction: "Reimagine as an animated or illustrated artwork — choose from comic book ink and halftone, Pixar-style 3D animation, hand-drawn anime, graphic novel cel shading, or bold pop-art illustration" },
  { label: "Studio Portrait", instruction: "Refined studio portrait — seamless backdrop, Rembrandt or butterfly lighting, shallow depth of field, rich skin tones, fashion magazine aesthetic" },
  { label: "Vintage / Film", instruction: "Nostalgic analog film look — grain, light leaks, faded warm tones, 1970s or 1980s aesthetic, Kodachrome or Polaroid color palette" },
  { label: "Nature / Outdoors", instruction: "Immerse subjects in a dramatic natural environment — misty mountain peaks, golden meadow, dense forest, crashing ocean shore, natural dappled light" },
  { label: "Abstract / Artistic", instruction: "Painterly or illustrated interpretation — oil painting, watercolor, impressionist brushstrokes, bold color palette, artistic texture, gallery art style" },
  { label: "Dark & Moody", instruction: "Low-key dramatic atmosphere — near-black shadows, single hard rim light, desaturated tones with one accent color, fog or smoke, noir or gothic mood" }
];

const PromptAssistant: React.FC<PromptAssistantProps> = ({ isOpen, onClose, currentPrompt, onApplyPrompt }) => {
  const [instruction, setInstruction] = useState('');
  const [generatedPrompts, setGeneratedPrompts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async (customInstruction?: string) => {
    const activeInstruction = customInstruction || instruction;
    if (!activeInstruction && !currentPrompt) {
        setError("Please enter an instruction or have a starting prompt.");
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const ideas = await generatePromptIdeas(currentPrompt, activeInstruction || "Enhance and refine");
      setGeneratedPrompts(ideas);
    } catch (e: any) {
      setError(e.message || "Failed to generate ideas.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-app-bg/90 backdrop-blur-sm animate-fadeIn">
      <div className="bg-app-surface w-full max-w-2xl rounded-xl border border-app-border shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-app-border flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
             <div className="w-8 h-8 sm:w-10 sm:h-10 rounded bg-app-accent flex items-center justify-center shadow-lg shadow-app-accent/20 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 text-app-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
             </div>
             <div>
                <h3 className="text-xs sm:text-sm font-mono uppercase tracking-wider font-bold text-white">Prompt Assistant</h3>
                <p className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest text-app-muted">Powered by ChatGPT</p>
             </div>
          </div>
          <button onClick={onClose} className="text-app-muted hover:text-white transition-colors p-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
          
          {/* Input Section */}
          <div className="space-y-4">
            <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-2">
                    {currentPrompt ? 'How should we improve your prompt?' : 'What do you want to create?'}
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        placeholder={currentPrompt ? "e.g., Make it more dramatic, add blue lighting..." : "e.g., A futuristic city in the clouds..."}
                        className="w-full bg-app-bg border border-app-border rounded-lg pl-4 pr-12 py-3 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    />
                    <button 
                        onClick={() => handleGenerate()}
                        disabled={isLoading}
                        className="absolute right-2 top-2 p-1.5 bg-app-accent hover:bg-app-accentHover rounded text-white disabled:opacity-50"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Quick Actions */}
            <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-app-muted mb-2">
                    Quick Ideas
                </label>
                <div className="flex flex-wrap gap-2">
                    {QUICK_ACTIONS.map(action => (
                        <button
                            key={action.label}
                            onClick={() => {
                                setInstruction(action.instruction);
                                handleGenerate(action.instruction);
                            }}
                            disabled={isLoading}
                            className="text-[10px] font-mono uppercase tracking-wider bg-app-bg hover:bg-app-accent/20 hover:text-app-accent hover:border-app-accent/50 border border-app-border text-app-text px-3 py-1.5 rounded transition-all"
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
          </div>

          {/* Results Section */}
          <div className="space-y-4">
             {isLoading ? (
                 <div className="py-12 flex flex-col items-center justify-center space-y-4">
                    <div className="w-10 h-10 border-2 border-app-accent border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-app-muted font-mono text-[10px] uppercase tracking-widest animate-pulse">Consulting the creative muse...</p>
                 </div>
             ) : error ? (
                 <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-300 text-xs font-mono text-center">
                    {error}
                 </div>
             ) : generatedPrompts.length > 0 ? (
                 <div className="space-y-3">
                     <h4 className="text-[10px] font-mono uppercase tracking-widest text-app-muted">Generated Variations</h4>
                     {generatedPrompts.map((prompt, idx) => (
                         <div key={idx} className="group bg-app-bg hover:bg-app-surface border border-app-border hover:border-app-accent/50 rounded-lg p-4 transition-all">
                             <p className="text-app-text text-sm mb-3 leading-relaxed font-mono">
                                 {prompt}
                             </p>
                             <div className="flex justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                                 <button
                                    onClick={() => {
                                        onApplyPrompt(prompt);
                                        onClose();
                                    }}
                                    className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 bg-app-accent hover:bg-app-accentHover text-white px-3 py-1.5 rounded transition-colors shadow-lg shadow-app-accent/20"
                                 >
                                    <span>Use Idea</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                 </button>
                             </div>
                         </div>
                     ))}
                 </div>
             ) : (
                <div className="py-8 text-center text-app-muted text-xs font-mono uppercase tracking-widest">
                    Enter an instruction or pick a style to generate prompt ideas.
                </div>
             )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default PromptAssistant;
