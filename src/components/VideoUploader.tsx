import React, { useCallback } from "react";
import { useDropzone, DropzoneOptions } from "react-dropzone";
import { Upload, FileVideo } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoUploaderProps {
  onUpload: (files: File[]) => void;
  className?: string;
}

export function VideoUploader({ onUpload, className }: VideoUploaderProps) {
  const onDrop: DropzoneOptions['onDrop'] = useCallback(
    (acceptedFiles) => {
      onUpload(acceptedFiles);
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/*": [],
    },
  } as any);

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300",
        isDragActive
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
          : "border-[var(--color-border)] hover:border-[var(--color-text-muted)] hover:bg-[var(--color-surface)]",
        className
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center gap-4">
        <div className={cn(
            "p-4 rounded-full bg-[var(--color-surface)]",
            isDragActive && "text-[var(--color-accent)]"
        )}>
          {isDragActive ? <FileVideo className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
        </div>
        <div>
          <p className="text-lg font-medium">動画をドロップして追加</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 font-sans">
            またはクリックしてファイルを選択
          </p>
        </div>
      </div>
    </div>
  );
}
