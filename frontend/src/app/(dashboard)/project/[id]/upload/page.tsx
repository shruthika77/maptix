"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, FileType, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export default function UploadFlowPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
      'application/json': ['.json']
    }
  });

  const removeFile = (name: string) => {
    setFiles(files.filter(f => f.name !== name));
  };

  const handleUpload = () => {
    if (files.length === 0) return;
    
    setUploading(true);
    setProgress(0);
    setIsSuccess(false);

    // Simulate upload and processing
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setUploading(false);
          setIsSuccess(true);
          toast.success("Files processed successfully!");
          return 100;
        }
        return prev + 5;
      });
    }, 100);
  };

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-6 md:p-12 items-center justify-center">
      
      <div className="text-center max-w-2xl mx-auto mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-3 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Import Floor Plans</h1>
        <p className="text-muted-foreground text-lg">
          Upload images, architectural PDFs, or structured JSON data. Our spatial engine will automatically convert them into interactive 3D models and wayfinding graphs.
        </p>
      </div>

      <div className="w-full max-w-3xl space-y-6">
        <div 
          {...getRootProps()} 
          className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 ease-out cursor-pointer p-12 flex flex-col items-center justify-center text-center group
            ${isDragActive ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-white/20 bg-white/[0.02] hover:border-primary/50 hover:bg-white/[0.04]'}`}
        >
          <input {...getInputProps()} />
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className={`p-4 rounded-full bg-background/80 shadow-2xl mb-4 transition-transform duration-300 ${isDragActive ? 'scale-110 shadow-primary/20 bg-primary/20' : ''}`}>
            <UploadCloud className={`w-8 h-8 ${isDragActive ? 'text-primary' : 'text-slate-400'}`} />
          </div>
          <h3 className="text-xl font-semibold mb-2">
            {isDragActive ? "Drop files now..." : "Drag & drop files here"}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            Supported formats: PNG, JPG, PDF, JSON up to 50MB
          </p>
          <Button variant="secondary" className="px-8 shadow-xl pointer-events-none relative z-10">
            Browse Files
          </Button>
        </div>

        <AnimatePresence>
          {files.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white/[0.02] border border-white/10 rounded-xl p-6"
            >
              <h4 className="font-medium text-sm text-slate-300 mb-4">Selected Files</h4>
              <div className="space-y-3 mb-6">
                {files.map((file) => (
                  <div key={file.name} className="flex items-center justify-between bg-black/20 rounded-lg p-3 border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-md">
                        <FileType className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-none mb-1">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    {!uploading && !isSuccess && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => removeFile(file.name)}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    {isSuccess && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    )}
                  </div>
                ))}
              </div>

              {uploading && (
                <div className="mb-6 space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Processing Floor Plans...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-white/10">
                <Button 
                  size="lg" 
                  disabled={uploading || isSuccess}
                  onClick={handleUpload}
                  className="w-full sm:w-auto mt-2 font-medium shadow-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20"
                >
                  {isSuccess ? "Processing Complete" : uploading ? "Converting..." : "Start Processing Engine"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
