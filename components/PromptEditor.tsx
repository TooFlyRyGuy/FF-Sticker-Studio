import React, { useState, useEffect } from 'react';
import PromptVariableBuilder, { PromptCustomField } from './PromptVariableBuilder';

interface PromptEditorProps {
  promptText: string;
  onPromptTextChange: (text: string) => void;
  customFields?: PromptCustomField[];
  onCustomFieldsChange: (fields: PromptCustomField[]) => void;
  labelClassName?: string;
  textareaClassName?: string;
}

const PromptEditor: React.FC<PromptEditorProps> = ({
  promptText,
  onPromptTextChange,
  customFields = [],
  onCustomFieldsChange,
  labelClassName = "block text-sm font-bold text-slate-900 mb-2",
  textareaClassName = "w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-green-700 min-h-[120px] font-mono text-sm"
}) => {
  const [allowCustomization, setAllowCustomization] = useState(customFields.length > 0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    setAllowCustomization(customFields.length > 0);
  }, [customFields.length]);

  const toggleCustomization = () => {
    if (allowCustomization) {
      setAllowCustomization(false);
    } else {
      setIsModalOpen(true);
      setAllowCustomization(true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-2 border border-app-border rounded-lg bg-black">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">⚙️</span>
          <span className="font-bold text-white text-xs">Allow Guest Customization</span>
        </div>
        <button
          onClick={toggleCustomization}
          className={`relative w-8 h-4 rounded-full transition-colors ${allowCustomization ? 'bg-app-accent' : 'bg-app-border'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${allowCustomization ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-app-bg rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-app-border">
            <h2 className="text-xl font-bold mb-4 text-white uppercase font-mono">Prompt Variable Builder</h2>
            <PromptVariableBuilder
              fields={customFields}
              onChange={onCustomFieldsChange}
              promptText={promptText}
              onPromptTextChange={onPromptTextChange}
            />
            <button
              onClick={() => setIsModalOpen(false)}
              className="mt-4 px-4 py-2 bg-app-accent text-white rounded font-mono uppercase"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {!allowCustomization && (
        <div>
          <label className="block text-sm font-bold text-white mb-2">AI Prompt</label>
          <textarea
            value={promptText}
            onChange={(e) => onPromptTextChange(e.target.value)}
            className="w-full px-4 py-3 bg-black border-2 border-app-border rounded-lg focus:outline-none focus:border-app-accent min-h-[120px] font-mono text-sm text-white"
            placeholder="Enter your prompt here..."
          />
        </div>
      )}
    </div>
  );
};

export default PromptEditor;
