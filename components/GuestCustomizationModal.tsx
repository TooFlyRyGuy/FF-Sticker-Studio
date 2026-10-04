import React, { useState, useEffect } from 'react';
import { PromptCustomField } from './PromptVariableBuilder';

interface GuestCustomizationModalProps {
  isOpen: boolean;
  fields: PromptCustomField[];
  promptTemplate: string;
  onGenerate: (filledPrompt: string) => void;
  onCancel: () => void;
}

const GuestCustomizationModal: React.FC<GuestCustomizationModalProps> = ({
  isOpen,
  fields,
  promptTemplate,
  onGenerate,
  onCancel,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      fields.forEach((f) => {
        if (f.type === 'checkbox') {
          initial[f.placeholder] = 'false';
        } else if (f.type === 'color') {
          initial[f.placeholder] = f.placeholder || '#000000';
        } else {
          initial[f.placeholder] = '';
        }
      });
      setValues(initial);
    }
  }, [isOpen, fields]);

  if (!isOpen) return null;

  const handleChange = (placeholder: string, value: string) => {
    setValues((prev) => ({ ...prev, [placeholder]: value }));
  };

  const buildFilledPrompt = () => {
    let result = promptTemplate;
    fields.forEach((f) => {
      const val = values[f.placeholder] ?? '';
      let replacement = val;
      if (f.type === 'checkbox') {
        replacement = val === 'true' ? (f.trueLabel || 'yes') : (f.falseLabel || 'no');
      }
      const regex = new RegExp(`\\{${f.placeholder}\\}`, 'g');
      result = result.replace(regex, replacement);
    });
    return result;
  };

  const missingRequired = fields.filter(
    (f) => f.required && f.type !== 'checkbox' && !values[f.placeholder]?.trim()
  );

  const handleGenerate = () => {
    if (missingRequired.length > 0) return;
    onGenerate(buildFilledPrompt());
  };

  const renderField = (field: PromptCustomField) => {
    const val = values[field.placeholder] ?? '';
    const baseInputClass =
      'w-full px-3 py-2 bg-black border border-app-border rounded text-white font-mono text-sm focus:outline-none focus:border-app-accent transition-colors';

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={val}
            onChange={(e) => handleChange(field.placeholder, e.target.value)}
            className={`${baseInputClass} min-h-[60px] resize-y`}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            value={val}
            onChange={(e) => handleChange(field.placeholder, e.target.value)}
            className={baseInputClass}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
      case 'select':
        return (
          <select
            value={val}
            onChange={(e) => handleChange(field.placeholder, e.target.value)}
            className={baseInputClass}
          >
            <option value="">-- Select --</option>
            {(field.options || []).filter(Boolean).map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case 'color':
        return (
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={val || '#000000'}
              onChange={(e) => handleChange(field.placeholder, e.target.value)}
              className="w-10 h-10 bg-transparent border border-app-border rounded cursor-pointer"
            />
            <span className="text-xs font-mono text-app-muted">{val || '#000000'}</span>
          </div>
        );
      case 'checkbox':
        return (
          <button
            onClick={() => handleChange(field.placeholder, val === 'true' ? 'false' : 'true')}
            className={`relative w-12 h-6 rounded-full transition-colors ${val === 'true' ? 'bg-app-accent' : 'bg-app-border'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${val === 'true' ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        );
      default:
        return (
          <input
            type="text"
            value={val}
            onChange={(e) => handleChange(field.placeholder, e.target.value)}
            className={baseInputClass}
            placeholder={`Enter ${field.label.toLowerCase()}`}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div className="bg-app-surface rounded-xl border border-app-border shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-app-border">
          <h2 className="text-lg font-bold text-white uppercase font-mono tracking-wider">Customize Your Photo</h2>
          <p className="text-xs text-app-muted mt-1 font-mono">Fill in the options below, then press Generate.</p>
        </div>

        <div className="p-5 space-y-4">
          {fields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <label className="block text-xs font-mono uppercase tracking-wider text-app-muted">
                {field.label}
                {field.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              {renderField(field)}
            </div>
          ))}
        </div>

        {missingRequired.length > 0 && (
          <div className="px-5 pb-2 text-xs text-red-400 font-mono">
            Please fill in all required fields.
          </div>
        )}

        <div className="p-5 border-t border-app-border flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-app-bg text-app-muted border border-app-border rounded font-mono uppercase text-xs hover:text-white hover:border-app-border/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={missingRequired.length > 0}
            className="px-5 py-2 bg-app-accent text-white rounded font-mono uppercase text-xs hover:bg-app-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuestCustomizationModal;
