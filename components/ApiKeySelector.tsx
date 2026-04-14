import React, { useState } from 'react';
import { promptForApiKey, checkApiKeySelection } from '../services/geminiService';

interface ApiKeySelectorProps {
  onKeySelected: () => void;
}

const ApiKeySelector: React.FC<ApiKeySelectorProps> = ({ onKeySelected }) => {
  const [isChecking, setIsChecking] = useState(false);

  const handleConnect = async () => {
    setIsChecking(true);
    try {
      await promptForApiKey();
      // According to guidelines, assume success after triggering openSelectKey
      // However, for better UX, we can check briefly or just proceed.
      // The instruction says: "assume the key selection was successful... Do not add delay"
      onKeySelected();
    } catch (error) {
      console.error("Failed to select key", error);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="bg-slate-900 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full">
        <div className="mb-6 bg-primary-600/20 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto text-4xl">
          🔑
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Authentication Required</h2>
        <p className="text-slate-400 mb-8">
          To use the Nano Banana Pro (Gemini 3 Pro) model for high-fidelity image editing, you must select a paid API key.
        </p>
        
        <button
          onClick={handleConnect}
          disabled={isChecking}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isChecking ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </>
          ) : (
            'Select API Key'
          )}
        </button>
        
        <div className="mt-6 text-sm text-slate-500">
           Need help? <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">View Billing Documentation</a>
        </div>
      </div>
    </div>
  );
};

export default ApiKeySelector;
