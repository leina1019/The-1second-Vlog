import React, { useState, useRef, useEffect } from "react";
import { VideoClip } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTime, cn } from "@/lib/utils";
import { Trash2, Play, Pause } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ClipItemProps {
  clip: VideoClip;
  index: number;
  onUpdate: (id: string, updates: Partial<VideoClip>) => void;
  onRemove: (id: string) => void;
}

export function ClipItem({ clip, index, onUpdate, onRemove }: ClipItemProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrlRef = useRef<string | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: clip.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  const handlePlayPreview = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!videoUrlRef.current) {
      videoUrlRef.current = URL.createObjectURL(clip.file);
    }

    if (isPlaying) {
      if (videoRef.current) videoRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      // We need to wait for the next tick for the video element to be in DOM if we were lazy loading
    }
  };

  // Effect to handle play/pause and cleanup
  useEffect(() => {
    if (isPlaying && videoRef.current) {
      videoRef.current.currentTime = clip.startTime;
      videoRef.current.play().catch(console.error);

      const timer = setTimeout(() => {
        setIsPlaying(false);
      }, clip.clipDuration * 1000);

      return () => clearTimeout(timer);
    }
  }, [isPlaying, clip.startTime, clip.clipDuration]);

  useEffect(() => {
    return () => {
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current);
      }
    };
  }, []);

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        {...attributes}
        {...listeners}
        className="p-3 flex gap-3 items-center bg-white border-[var(--color-border)] overflow-hidden shadow-sm hover:shadow-md transition-shadow relative group cursor-default active:cursor-grabbing"
      >
        {/* Thumbnail / Preview - Fixed width for mobile */}
        <div className="relative w-24 h-24 md:w-32 md:h-24 bg-gray-900 rounded-lg overflow-hidden shrink-0 group border border-[var(--color-border)]">
          {isPlaying && videoUrlRef.current ? (
            <video
              ref={videoRef}
              src={videoUrlRef.current}
              className="w-full h-full object-cover"
              muted
              playsInline
              onEnded={() => setIsPlaying(false)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800">
              <Play className="w-6 h-6 text-white/20" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <button
              className="p-1.5 bg-white/80 rounded-full text-[var(--color-text)] backdrop-blur-sm active:scale-95 transition-transform shadow-sm hover:bg-white"
              onClick={handlePlayPreview}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
          <div className="absolute top-1 left-1 bg-[var(--color-text)] text-white text-[10px] font-display font-bold px-2 py-0.5 rounded shadow-sm">
            #{index + 1}
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 min-w-0 flex flex-col justify-between h-24 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm truncate text-[var(--color-text)]" title={clip.file.name}>
              {clip.file.name}
            </h3>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 -mr-1 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(clip.id);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Timeline Slider */}
          <div className="space-y-1.5 mt-auto">
            <div className="flex justify-between items-center text-[10px] text-[var(--color-text-muted)] font-display">
              <span className="bg-[var(--color-bg)] px-1.5 py-0.5 rounded border border-[var(--color-border)] font-medium">
                開始: {formatTime(clip.startTime)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, clip.duration - clip.clipDuration)}
              step={0.1}
              value={clip.startTime}
              onChange={(e) => onUpdate(clip.id, { startTime: parseFloat(e.target.value) })}
              onPointerDown={(e) => e.stopPropagation()} // Prevent drag when using slider
              className="w-full accent-[var(--color-accent)] h-1.5 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer touch-none"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
