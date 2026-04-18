/**
 * File Uploader Component — LIVE MODE (real API calls, no demo).
 */

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { apiUploadFile, apiStartProcessing } from '../../services/api';

interface FileUploaderProps {
  projectId: string;
  onUploadComplete?: (files: any[]) => void;
  onProcessStart?: (jobId: string) => void;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'complete' | 'error';
  error?: string;
  result?: any;
  previewUrl?: string;
}

const ACCEPTED_FORMATS = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/tiff': ['.tiff', '.tif'],
  'application/pdf': ['.pdf'],
};

export default function FileUploader({
  projectId,
  onUploadComplete,
  onProcessStart,
}: FileUploaderProps) {
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [processError, setProcessError] = useState('');

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setIsUploading(true);
      setProcessError('');

      const uploadingFiles: UploadingFile[] = acceptedFiles.map((file) => ({
        file,
        progress: 0,
        status: 'uploading' as const,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      }));
      setFiles((prev) => [...prev, ...uploadingFiles]);

      const results: any[] = [];
      for (const file of acceptedFiles) {
        try {
          setFiles((prev) =>
            prev.map((f) =>
              f.file === file ? { ...f, progress: 50 } : f
            )
          );

          const result = await apiUploadFile(projectId, file);
          results.push(result);

          setFiles((prev) =>
            prev.map((f) =>
              f.file === file ? { ...f, progress: 100, status: 'complete', result } : f
            )
          );
        } catch (error: any) {
          setFiles((prev) =>
            prev.map((f) =>
              f.file === file ? { ...f, status: 'error', error: error.message } : f
            )
          );
        }
      }

      setIsUploading(false);
      if (results.length > 0) onUploadComplete?.(results);
    },
    [projectId, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FORMATS,
    maxSize: 100 * 1024 * 1024,
    multiple: true,
  });

  const handleProcess = async () => {
    setProcessError('');
    try {
      const data = await apiStartProcessing(projectId);
      onProcessStart?.(data.id);
    } catch (error: any) {
      setProcessError(error.message || 'Failed to start processing');
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? 'border-blue-500 bg-blue-500/5'
            : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
        }`}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
            isDragActive ? 'bg-blue-500/10' : 'bg-white/5'
          }`}>
            <svg className={`w-8 h-8 ${isDragActive ? 'text-blue-400' : 'text-white/30'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <div>
            <p className="text-lg font-medium text-white/80">
              {isDragActive ? 'Drop files here' : 'Upload floor plan files'}
            </p>
            <p className="text-sm text-white/40 mt-1">
              Drag & drop or click to browse
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {['JPG', 'PNG', 'TIFF', 'PDF'].map((fmt) => (
                <span key={fmt} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/30 ring-1 ring-white/5">
                  {fmt}
                </span>
              ))}
              <span className="text-[10px] text-white/20">Max 100MB</span>
            </div>
          </div>
        </div>
      </div>

      {/* Uploaded files list */}
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Uploaded Files</h3>
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-xl border border-white/[0.06]"
            >
              {f.previewUrl ? (
                <img src={f.previewUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-white/30 uppercase">
                  {f.file.name.split('.').pop()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/70 truncate">{f.file.name}</p>
                <p className="text-xs text-white/30">{(f.file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>

              <div>
                {f.status === 'uploading' && (
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${f.progress}%` }} />
                    </div>
                    <span className="text-xs text-white/30">{f.progress}%</span>
                  </div>
                )}
                {f.status === 'complete' && (
                  <span className="text-emerald-400 text-xs font-medium flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Uploaded
                  </span>
                )}
                {f.status === 'error' && (
                  <span className="text-red-400 text-xs">✗ {f.error}</span>
                )}
              </div>
            </div>
          ))}

          {processError && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {processError}
            </div>
          )}

          {/* Process button */}
          {files.some((f) => f.status === 'complete') && (
            <button
              className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
              onClick={handleProcess}
              disabled={isUploading}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Start Processing Pipeline
            </button>
          )}
        </div>
      )}
    </div>
  );
}
