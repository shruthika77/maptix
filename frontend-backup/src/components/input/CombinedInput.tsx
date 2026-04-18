import React, { useState } from 'react';
import FileUploader from '../upload/FileUploader';
import PromptGenerator from '../prompt/PromptGenerator';

interface CombinedInputProps {
  projectId: string;
  onUploadComplete?: (files: any[]) => void;
  onProcessStart?: (jobId: string) => void;
  onPromptGenerated?: (modelData: any) => void;
}

export default function CombinedInput({
  projectId,
  onUploadComplete,
  onProcessStart,
  onPromptGenerated,
}: CombinedInputProps) {
  const [mode, setMode] = useState<'upload' | 'prompt'>('upload');

  const MODE_TABS: { key: 'upload' | 'prompt'; label: string }[] = [
    { key: 'upload', label: 'Upload Image' },
    { key: 'prompt', label: 'Generate from Prompt' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* local tabs */}
      <div className="flex gap-1 mb-6 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1 w-fit mx-auto">
        {MODE_TABS.map((t) => (
          <button
            key={t.key}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              mode === t.key
                ? t.key === 'prompt'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                  : 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-white/40 hover:text-white/60'
            }`}
            onClick={() => setMode(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'upload' ? (
        <FileUploader
          projectId={projectId}
          onUploadComplete={onUploadComplete}
          onProcessStart={onProcessStart}
        />
      ) : (
        <PromptGenerator
          projectId={projectId}
          onGenerated={onPromptGenerated}
        />
      )}
    </div>
  );
}
