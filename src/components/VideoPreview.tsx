import { useRef, useEffect, useState, useCallback } from "react";
import { VideoClip, TitleSettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Play, Pause, Download, Loader2, CheckCircle2, Share2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

interface VideoPreviewProps {
  clips: VideoClip[];
  titleSettings: TitleSettings;
}

// ダウンロードFallbackヘルパー
function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

export function VideoPreview({ clips, titleSettings }: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<"rendering" | "encoding" | "idle">("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const activeClipIdRef = useRef<string | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const totalDuration = clips.reduce((acc, clip) => acc + clip.clipDuration, 0);

  // FFmpegのロード
  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;

    // Coreのバージョンと互換性を確保
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    const ffmpeg = new FFmpeg();

    ffmpeg.on("progress", ({ progress }) => {
      // エンコードフェーズ: 50% -> 100%
      if (exportPhase === "encoding") {
        setExportProgress(50 + Math.round(progress * 50));
      }
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  // 動画のプリロード
  useEffect(() => {
    let loadedCount = 0;
    const totalClips = clips.length;

    if (totalClips === 0) {
      setIsReady(true);
      return;
    }

    setIsReady(false);
    clips.forEach((clip) => {
      if (!videoElementsRef.current.has(clip.id)) {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(clip.file);
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";

        const onCanPlay = () => {
          loadedCount++;
          if (loadedCount === totalClips) setIsReady(true);
          video.removeEventListener("canplaythrough", onCanPlay);
        };
        video.addEventListener("canplaythrough", onCanPlay);
        videoElementsRef.current.set(clip.id, video);
      } else {
        loadedCount++;
        if (loadedCount === totalClips) setIsReady(true);
      }
    });

    return () => {
      videoElementsRef.current.forEach(v => URL.revokeObjectURL(v.src));
    };
  }, [clips]);

  // テキストオーバーレイ描画
  const drawText = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const { text, style } = titleSettings;
    if (!text || style === "none") return;

    ctx.save();
    const centerX = width / 2;
    const centerY = height / 2;

    switch (style) {
      case "simple":
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `bold ${height * 0.08}px "Inter", sans-serif`;
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 12;
        ctx.fillStyle = "white";
        ctx.fillText(text, centerX, centerY);
        break;

      case "minimal":
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.font = `300 ${height * 0.045}px "Inter", sans-serif`;
        ctx.letterSpacing = "6px";
        ctx.fillStyle = "white";
        ctx.fillText(text.toUpperCase(), centerX, height * 0.92);
        break;

      case "camcorder":
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.font = `${height * 0.04}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "#FFD700";
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
        ctx.fillText(`REC  ${timeStr}`, width * 0.06, height * 0.88);
        ctx.fillText(dateStr, width * 0.06, height * 0.94);
        ctx.textAlign = "right";
        ctx.fillText(text.toUpperCase(), width * 0.94, height * 0.94);
        break;

      case "cinematic": {
        const barHeight = height * 0.12;
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, barHeight);
        ctx.fillRect(0, height - barHeight, width, barHeight);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `italic 500 ${height * 0.05}px "Inter", serif`;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.letterSpacing = "6px";
        ctx.fillText(text, centerX, height - barHeight / 2);
        break;
      }

      case "magazine":
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `italic 700 ${height * 0.12}px "serif"`;
        ctx.fillStyle = "white";
        ctx.fillText(text, centerX, centerY);
        break;
    }
    ctx.restore();
  }, [titleSettings]);

  // フレーム描画
  const renderFrame = useCallback(async (time: number, targetCanvas?: HTMLCanvasElement) => {
    const canvas = targetCanvas || canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let timeAccumulator = 0;
    let activeClip: VideoClip | null = null;
    let clipLocalTime = 0;

    for (const clip of clips) {
      if (time >= timeAccumulator && (time < timeAccumulator + clip.clipDuration || time === totalDuration)) {
        activeClip = clip;
        clipLocalTime = Math.min(time - timeAccumulator, clip.clipDuration - 0.01);
        break;
      }
      timeAccumulator += clip.clipDuration;
    }

    if (activeClip) {
      const video = videoElementsRef.current.get(activeClip.id);
      if (video) {
        const expectedTime = activeClip.startTime + clipLocalTime;

        // プレビュー時
        if (!targetCanvas) {
          if (Math.abs(video.currentTime - expectedTime) > 0.1) {
            video.currentTime = expectedTime;
          }
          if (isPlayingRef.current && video.paused) {
            video.play().catch(() => { });
          }
        }
        // エクスポート時（厳密なフレーム同期）
        else {
          video.currentTime = expectedTime;
          await new Promise<void>((resolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              resolve();
            };
            video.addEventListener('seeked', onSeeked);
            setTimeout(resolve, 250); // モバイル環境での遅延を考慮
          });
        }

        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;
        if (vWidth && vHeight) {
          const canvasRatio = canvas.width / canvas.height;
          const videoRatio = vWidth / vHeight;

          let drawW, drawH, drawX, drawY;
          if (videoRatio > canvasRatio) {
            drawH = canvas.height;
            drawW = vWidth * (canvas.height / vHeight);
            drawX = (canvas.width - drawW) / 2;
            drawY = 0;
          } else {
            drawW = canvas.width;
            drawH = vHeight * (canvas.width / vWidth);
            drawX = 0;
            drawY = (canvas.height - drawH) / 2;
          }
          ctx.drawImage(video, drawX, drawY, drawW, drawH);
        }
        drawText(ctx, canvas.width, canvas.height);
      }
    }
  }, [clips, drawText, totalDuration]);

  // アニメーションループ
  const animate = useCallback(async (timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    let elapsed = (timestamp - startTimeRef.current) / 1000;

    if (elapsed >= totalDuration) {
      startTimeRef.current = timestamp;
      elapsed = 0;
    }

    setCurrentTime(elapsed);
    await renderFrame(elapsed);

    if (isPlayingRef.current) {
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [totalDuration, renderFrame]);

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      startTimeRef.current = 0;
      videoElementsRef.current.forEach(v => v.pause());
    }
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isPlaying, animate]);

  useEffect(() => { if (!isPlaying) renderFrame(0); }, [clips, isPlaying, renderFrame]);

  // 再生位置の変更（シーク機能）
  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    if (!isPlaying) {
      // 停止中の時はその瞬間のフレームを強制描画
      setTimeout(() => renderFrame(time), 0);
    }
    // 再生中の場合は、animateループが次のフレームで自動的に正しい位置を拾う
    if (isPlaying) {
      startTimeRef.current = performance.now() - (time * 1000);
    }
  }, [isPlaying, renderFrame]);

  useEffect(() => {
    if (isReady && !isPlaying) {
      // ロード完了時に初回フレームを確実に描画
      const timer = setTimeout(() => renderFrame(0), 100);
      return () => clearTimeout(timer);
    }
  }, [isReady, isPlaying, renderFrame, clips]);

  useEffect(() => {
    setExportBlob(null);
    setCurrentTime(0); // クリップ変更時は0秒に戻す
  }, [clips, titleSettings]);

  /**
   * 統合された保存アクション:
   * 1. 動画が未作成ならレンダリング（rendering -> encoding）を開始
   * 2. 完了後、または既に作成済みの場合は、即座に共有メニュー（カメラロール保存）を開く
   */
  const handleMainAction = async () => {
    if (isExporting || !isReady) return;

    if (exportBlob) {
      handleSaveToCameraRoll();
      return;
    }

    // エクスポート開始
    setIsExporting(true);
    setIsPlaying(false);
    setExportPhase("rendering");
    setExportProgress(0);
    setError(null);

    const fps = 30;
    const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = 1280;
    offscreenCanvas.height = 720;

    try {
      const ffmpeg = await loadFFmpeg();

      for (let i = 0; i < totalFrames; i++) {
        const frameTime = i / fps;
        await renderFrame(frameTime, offscreenCanvas);
        const blob = await new Promise<Blob | null>(res => offscreenCanvas.toBlob(res, 'image/jpeg', 0.85));
        if (!blob) throw new Error("Frame error");
        const fileName = `f${i.toString().padStart(5, '0')}.jpg`;
        await ffmpeg.writeFile(fileName, await fetchFile(blob));
        setExportProgress(Math.round((i / totalFrames) * 50));
      }

      setExportPhase("encoding");
      await ffmpeg.exec(["-framerate", fps.toString(), "-i", "f%05d.jpg", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-crf", "23", "out.mp4"]);

      const data = await ffmpeg.readFile("out.mp4");
      const mp4Blob = new Blob([data], { type: "video/mp4" });
      setExportBlob(mp4Blob);

      for (let i = 0; i < totalFrames; i++) {
        await ffmpeg.deleteFile(`f${i.toString().padStart(5, '0')}.jpg`);
      }

      // 書き出し完了後、自動で保存/共有をトリガー
      const fileName = `vlog-${Date.now()}.mp4`;
      const file = new File([mp4Blob], fileName, { type: "video/mp4" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'The 1s Vlog.' });
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        triggerDownload(mp4Blob, fileName);
      }

    } catch (err) {
      console.error(err);
      setError("作成中に問題が発生しました。");
    } finally {
      setIsExporting(false);
      setExportPhase("idle");
    }
  };

  const handleSaveToCameraRoll = async () => {
    if (!exportBlob) return;
    const fileName = `vlog-${Date.now()}.mp4`;
    const file = new File([exportBlob], fileName, { type: "video/mp4" });

    if (navigator.share && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'The 1s Vlog.' });
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } catch {
        triggerDownload(exportBlob, fileName);
      }
    } else {
      triggerDownload(exportBlob, fileName);
    }
  };

  return (
    <div className="space-y-4 relative">
      <AnimatePresence>
        {showSuccess && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-black text-white rounded-full px-6 py-2 shadow-2xl flex items-center gap-2 border border-white/20"
          >
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs font-bold">保存しました！</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative aspect-video max-h-[60vh] mx-auto bg-black rounded-[2rem] overflow-hidden border-4 border-white shadow-xl group">
        <canvas ref={canvasRef} width={1280} height={720} className="w-full h-full object-contain" />

        <AnimatePresence>
          {(isExporting || !isReady) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-30"
            >
              <Loader2 className="w-10 h-10 text-[var(--color-accent)] animate-spin mb-4" />
              <p className="text-white text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">
                {!isReady ? "Preparing Media" : exportPhase === "rendering" ? "Rendering Frames" : "Encoding Video"}
              </p>
              {isExporting && (
                <div className="w-40 mt-4">
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-[var(--color-accent)]" animate={{ width: `${exportProgress}%` }} transition={{ duration: 0.3 }} />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!isPlaying && !isExporting && isReady && (
          <div className="absolute inset-0 flex items-center justify-center cursor-pointer z-10" onClick={() => setIsPlaying(true)}>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white shadow-2xl">
              <Play className="w-6 h-6 fill-current ml-1" />
            </motion.div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* 大人可愛いコントロールパネル */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-[2.5rem] border border-black/5 shadow-sm space-y-4">
          <div className="flex items-center gap-5">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={clips.length === 0 || isExporting}
              className="w-12 h-12 rounded-full bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90 flex items-center justify-center text-white shadow-lg shadow-[var(--color-accent)]/20 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            <div className="flex-1 space-y-2">
              <input
                type="range"
                min={0}
                max={totalDuration || 1}
                step={0.01}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-black/5 rounded-full appearance-none cursor-pointer accent-[var(--color-accent)] transition-all"
                style={{
                  background: `linear-gradient(to right, var(--color-accent) ${(currentTime / (totalDuration || 1)) * 100}%, #eee 0%)`
                }}
              />
              <div className="flex justify-between items-center text-[10px] font-bold font-mono tracking-tighter text-black/30 px-0.5">
                <span className={currentTime > 0 ? "text-[var(--color-accent)]" : ""}>{currentTime.toFixed(1)}s</span>
                <span>{totalDuration.toFixed(1)}s</span>
              </div>
            </div>
          </div>
        </div>

        <Button
          variant="accent"
          onClick={handleMainAction}
          disabled={clips.length === 0 || isExporting}
          className="w-full h-14 rounded-[2rem] font-bold shadow-xl shadow-[var(--color-accent)]/30 text-base active:scale-95 transition-transform"
        >
          {isExporting ? <Loader2 className="w-5 h-5 mr-3 animate-spin" /> : exportBlob ? <Share2 className="w-5 h-5 mr-3" /> : <Download className="w-5 h-5 mr-3" />}
          {isExporting ? "作成中..." : "動画を保存する"}
        </Button>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="p-4 bg-red-50 text-red-500 rounded-2xl flex items-center gap-3 border border-red-100"
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-[11px] font-bold leading-tight">{error}</p>
        </motion.div>
      )}
    </div>
  );
}
