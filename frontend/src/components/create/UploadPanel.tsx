"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, FileType, X, FileImage, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateStore } from "@/stores/createStore";
import { motion, AnimatePresence } from "framer-motion";

const FILE_ICONS: Record<string, typeof FileType> = {
  pdf: FileText,
  image: FileImage,
};

function getFileIcon(file: File) {
  if (file.type === "application/pdf") return FILE_ICONS.pdf;
  if (file.type.startsWith("image/")) return FILE_ICONS.image;
  return FileType;
}

export default function UploadPanel() {
  const { uploadedFiles, addFiles, removeFile } = useCreateStore();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      addFiles(acceptedFiles);
    },
    [addFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"],
      "application/pdf": [".pdf"],
    },
    maxSize: 50 * 1024 * 1024,
  });

  return (
    <div className="space-y-5">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 ease-out cursor-pointer group
          ${
            isDragActive
              ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
              : "border-white/15 bg-white/[0.02] hover:border-indigo-500/40 hover:bg-white/[0.03]"
          }
          ${uploadedFiles.length > 0 ? "p-8" : "p-12"}`}
      >
        <input {...getInputProps()} />
        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

        <div className="flex flex-col items-center justify-center text-center relative z-10">
          <div
            className={`p-4 rounded-2xl mb-4 transition-all duration-300 ${
              isDragActive
                ? "bg-indigo-500/20 scale-110 shadow-lg shadow-indigo-500/20"
                : "bg-white/5"
            }`}
          >
            <UploadCloud
              className={`w-8 h-8 transition-colors ${
                isDragActive ? "text-indigo-400" : "text-slate-400"
              }`}
            />
          </div>
          <h3 className="text-lg font-semibold mb-1.5">
            {isDragActive ? "Drop to upload" : "Upload Floor Plans"}
          </h3>
          <p className="text-sm text-muted-foreground mb-3 max-w-sm">
            Drag & drop PDF blueprints, scanned drawings, or photos.
            <br />
            <span className="text-xs text-white/30">
              PNG, JPG, PDF, TIFF — up to 50 MB
            </span>
          </p>
          <div className="flex items-center gap-1.5 mb-4 text-[10px] font-medium text-violet-400/70 bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 rounded-full">
            <span>🧠</span>
            <span>AI-enhanced analysis with OpenCV + Meta Llama 3</span>
          </div>
          <Button
            variant="secondary"
            className="px-6 pointer-events-none shadow-lg"
          >
            Browse Files
          </Button>
        </div>
      </div>

      {/* File List */}
      <AnimatePresence>
        {uploadedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {uploadedFiles.length} file{uploadedFiles.length > 1 ? "s" : ""}{" "}
              selected
            </p>
            {uploadedFiles.map((file, i) => {
              const Icon = getFileIcon(file);
              return (
                <motion.div
                  key={file.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 group/file"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-indigo-500/10 rounded-lg shrink-0">
                      <Icon className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 group-hover/file:opacity-100 text-slate-400 hover:text-white transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.name);
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
