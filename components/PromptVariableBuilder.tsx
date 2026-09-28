import React from 'react';

export type CustomFieldType = 'text' | 'textarea' | 'number' | 'select' | 'color' | 'checkbox';

export interface PromptCustomField {
  id: string;
  label: string;
  placeholder: string;
  type: CustomFieldType;
  options?: string[];
  aiGenerated?: boolean;
  aiPrompt?: string;
  required?: boolean;
  trueLabel?: string;
  falseLabel?: string;
}

interface PromptVariableBuilderProps {
  fields: PromptCustomField[];
  onChange: (fields: PromptCustomField[]) => void;
  promptText: string;
  onPromptTextChange: (text: string) => void;
}

const PromptVariableBuilder: React.FC<PromptVariableBuilderProps> = ({ fields, onChange, promptText, onPromptTextChange }) => {
  
  const fieldTypes: CustomFieldType[] = ['text', 'textarea', 'number', 'select', 'color', 'checkbox'];

  const addField = (type: CustomFieldType) => {
    const newField: PromptCustomField = {
      id: Date.now().toString(),
      label: 'New Field',
      placeholder: 'new_field',
      type
    };
    onChange((prevFields: PromptCustomField[]) => [...prevFields, newField]);
  };

  const updateField = (index: number, updates: Partial<PromptCustomField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    onChange(newFields);
  };

  const insertVariableAtCursor = (placeholder: string) => {
    const textarea = document.getElementById('prompt-template-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = promptText;
    const newText = text.substring(0, start) + `{${placeholder}}` + text.substring(end);
    onPromptTextChange(newText);
    
    setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + placeholder.length + 2, start + placeholder.length + 2);
    }, 0);
  };

  return (
    <div className="p-4 border border-app-border rounded-lg bg-app-bg space-y-4">
      <h3 className="text-sm font-bold text-white uppercase font-mono">Prompt Variable Builder</h3>
      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-1">Prompt Template</label>
        <textarea
          id="prompt-template-textarea"
          value={promptText}
          onChange={(e) => onPromptTextChange(e.target.value)}
          className="w-full h-24 p-2 bg-black border border-app-border rounded text-white font-mono text-sm"
          placeholder="Enter prompt text here..."
        />
        <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-xs text-app-muted mr-2">Add Variable:</span>
            {fields.map(f => (
                <button key={f.id} onClick={() => insertVariableAtCursor(f.placeholder)} className="px-2 py-0.5 bg-app-border rounded text-xs text-white hover:bg-app-accent">
                    {`{${f.placeholder}}`}
                </button>
            ))}
        </div>
      </div>
      <div>
        <h4 className="text-xs font-mono uppercase tracking-wider text-app-muted mb-2">Guest Input Fields</h4>
        <div className="space-y-4">
            {fields.map((field, index) => (
                <div key={field.id} className="p-3 bg-black border border-app-border rounded text-white text-xs font-mono space-y-2">
                    <div className="flex items-center gap-2">
                        <input 
                            value={field.label} 
                            onChange={(e) => {
                                const newLabel = e.target.value;
                                const newPlaceholder = newLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
                                updateField(index, { label: newLabel, placeholder: newPlaceholder || 'new_field' });
                            }}
                            className="bg-transparent border-b border-app-border focus:border-app-accent outline-none flex-grow" 
                            placeholder="Label" 
                        />
                        <input value={field.placeholder} onChange={(e) => updateField(index, { placeholder: e.target.value })} className="bg-transparent border-b border-app-border focus:border-app-accent outline-none w-20" placeholder="Placeholder" />
                        <select value={field.type} onChange={(e) => updateField(index, { type: e.target.value as CustomFieldType })} className="bg-app-bg text-white border border-app-border rounded p-1 text-xs">
                            {fieldTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button onClick={() => onChange(fields.filter(f => f.id !== field.id))} className="text-red-400 hover:text-red-300">✕</button>
                    </div>
                    {field.type === 'select' && (
                        <div className="space-y-1">
                            {(field.options || ['']).map((option, optIndex) => (
                                <div key={optIndex} className="flex gap-1">
                                    <input 
                                        value={option} 
                                        onChange={(e) => {
                                            const newOptions = [...(field.options || [])];
                                            newOptions[optIndex] = e.target.value;
                                            updateField(index, { options: newOptions });
                                        }}
                                        className="w-full bg-app-bg border border-app-border rounded p-1"
                                        placeholder={`Option ${optIndex + 1}`}
                                    />
                                    <button 
                                        onClick={() => {
                                            const newOptions = [...(field.options || [])];
                                            newOptions.splice(optIndex, 1);
                                            updateField(index, { options: newOptions });
                                        }}
                                        className="text-red-400 hover:text-red-300 px-2"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                            <button 
                                onClick={() => updateField(index, { options: [...(field.options || []), ''] })}
                                className="w-full px-2 py-1 bg-app-border rounded text-xs text-white hover:bg-app-accent"
                            >
                                + Add Option
                            </button>
                        </div>
                    )}
                    {field.type === 'color' && (
                        <div className="flex gap-2 items-center">
                            <label className="text-app-muted">Default Color:</label>
                            <input 
                                type="color"
                                value={field.placeholder || '#000000'}
                                onChange={(e) => updateField(index, { placeholder: e.target.value })}
                                className="bg-transparent"
                            />
                        </div>
                    )}
                    {(field.type === 'checkbox') && (
                        <div className="flex gap-2">
                            <input value={field.trueLabel || ''} onChange={(e) => updateField(index, { trueLabel: e.target.value })} className="w-1/2 bg-app-bg border border-app-border rounded p-1" placeholder="True Label" />
                            <input value={field.falseLabel || ''} onChange={(e) => updateField(index, { falseLabel: e.target.value })} className="w-1/2 bg-app-bg border border-app-border rounded p-1" placeholder="False Label" />
                        </div>
                    )}
                </div>
            ))}
        </div>
        <div className="mt-3 flex gap-2">
            {fieldTypes.map(type => (
                <button key={type} onClick={() => addField(type)} className="px-2 py-1 bg-app-border hover:bg-app-accent text-white rounded text-[10px] font-mono uppercase">+ {type}</button>
            ))}
        </div>
      </div>
    </div>
  );
};

export default PromptVariableBuilder;
