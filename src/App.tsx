import { useState } from "react";
import { VideoUploader } from "@/components/VideoUploader";
import { ClipTimeline } from "@/components/ClipTimeline";
import { VideoPreview } from "@/components/VideoPreview";
import { VideoClip, TitleSettings, TEXT_STYLES } from "@/types";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Type, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function App() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [titleSettings, setTitleSettings] = useState<TitleSettings>({
    text: "",
    style: "simple",
  });
  const [showTitleSettings, setShowTitleSettings] = useState(false);

  const handleUpload = async (files: File[]) => {
    const newClips: VideoClip[] = [];

    for (const file of files) {
      const duration = await new Promise<number>((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          window.URL.revokeObjectURL(video.src);
          resolve(video.duration);
        };
        video.src = URL.createObjectURL(file);
      });

      newClips.push({
        id: uuidv4(),
        file,
        thumbnail: "",
        duration,
        startTime: 0,
        clipDuration: 1.0,
      });
    }

    setClips((prev) => [...prev, ...newClips]);
  };

  const handleUpdateClip = (id: string, updates: Partial<VideoClip>) => {
    setClips((prev) =>
      prev.map((clip) => (clip.id === id ? { ...clip, ...updates } : clip))
    );
  };

  const handleRemoveClip = (id: string) => {
    setClips((prev) => prev.filter((clip) => clip.id !== id));
  };

  const handleReorderClips = (newClips: VideoClip[]) => {
    setClips(newClips);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] font-sans pb-24">
      {/* Mobile Header */}
      <header className="sticky top-0 z-10 bg-[var(--color-bg)]/90 backdrop-blur-md border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between shadow-sm">
        <h1 className="text-2xl font-display font-bold tracking-tight text-[var(--color-text)] italic">
          The 1s Vlog<span className="text-[var(--color-accent)] not-italic">.</span>
        </h1>
        <div className="text-[10px] font-medium text-[var(--color-text-muted)] border border-[var(--color-border)] bg-white px-2 py-0.5 rounded-full">
          Free Edition
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {/* Preview Section */}
        <section className="sticky top-[61px] z-10 bg-[var(--color-bg)] pb-3 -mx-4 px-4 border-b border-[var(--color-border)] shadow-sm">
          <VideoPreview clips={clips} titleSettings={titleSettings} />
        </section>

        {/* Title Settings Toggle */}
        <section>
          <button
            className={cn(
              "w-full flex items-center justify-between p-4 bg-white rounded-2xl border transition-all duration-300 shadow-sm active:scale-[0.98]",
              showTitleSettings ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]" : "border-[var(--color-border)] hover:border-[var(--color-accent)]/50"
            )}
            onClick={() => setShowTitleSettings(!showTitleSettings)}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                showTitleSettings ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg)] text-[var(--color-accent)]"
              )}>
                <Type className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="block text-sm font-display italic font-bold text-[var(--color-text)] tracking-tight">Title Settings</span>
                <span className="block text-[10px] text-[var(--color-text-muted)] font-display uppercase tracking-widest">
                  {titleSettings.text ? titleSettings.text : "No title set"}
                </span>
              </div>
            </div>
            <div className="text-[var(--color-text-muted)]">
              {showTitleSettings ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </button>

          <AnimatePresence>
            {showTitleSettings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 p-4 bg-white rounded-xl border border-[var(--color-border)] space-y-4 overflow-hidden shadow-sm"
              >
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-1.5">タイトルテキスト</label>
                  <input
                    type="text"
                    placeholder="Vlogのタイトルを入力..."
                    value={titleSettings.text}
                    onChange={(e) => setTitleSettings({ ...titleSettings, text: e.target.value })}
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all placeholder:text-[var(--color-text-muted)]/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-muted)] block mb-1.5">スタイル</label>
                  <div className="grid grid-cols-3 gap-2">
                    {TEXT_STYLES.map((style) => (
                      <button
                        key={style.value}
                        onClick={() => setTitleSettings({ ...titleSettings, style: style.value })}
                        className={`text-xs py-2 rounded-lg border transition-all duration-200 ${titleSettings.style === style.value
                            ? "bg-[var(--color-text)] border-[var(--color-text)] text-white shadow-md transform scale-105"
                            : "bg-white border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                          }`}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Clip List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display italic text-lg text-[var(--color-text)]">Clips <span className="font-display not-italic text-sm text-[var(--color-text-muted)] ml-1">({clips.length})</span></h2>
          </div>

          <ClipTimeline
            clips={clips}
            onUpdate={handleUpdateClip}
            onRemove={handleRemoveClip}
            onReorder={handleReorderClips}
          />

          {/* Empty State */}
          {clips.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-[var(--color-border)] rounded-2xl bg-white/50">
              <div className="w-12 h-12 bg-[var(--color-bg)] rounded-full flex items-center justify-center mx-auto mb-3 text-[var(--color-text-muted)]">
                <Plus className="w-6 h-6" />
              </div>
              <p className="text-[var(--color-text)] font-medium text-sm mb-1">クリップがありません</p>
              <p className="text-xs text-[var(--color-text-muted)]">右下の「＋」から動画を追加してください</p>
            </div>
          )}
        </section>
      </main>

      {/* Floating Action Button for Upload */}
      <div className="fixed bottom-6 right-6 z-20">
        <div className="relative group">
          <VideoUploader
            onUpload={handleUpload}
            className="absolute inset-0 opacity-0 cursor-pointer w-16 h-16 z-10"
          />
          <div className="w-16 h-16 bg-[var(--color-accent)] rounded-full shadow-xl shadow-[var(--color-accent)]/30 flex items-center justify-center text-white group-hover:scale-105 group-active:scale-95 transition-all duration-300">
            <Plus className="w-8 h-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
