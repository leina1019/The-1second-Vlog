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

  /**
   * オフラインレンダリング:
   * 1. 1コマずつ画像を生成して ffmpeg.wasm の仮想FSに書き込む (rendering)
   * 2. 全画像を MP4 にエンコードする (encoding)
   */
  const handleExport = async () => {
    if (isExporting || !isReady) return;

    setIsExporting(true);
    setIsPlaying(false);
    setExportPhase("rendering");
    setExportProgress(0);
    setError(null);
    setExportBlob(null);

    const fps = 30;
    const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = 720; // モバイル向けバランス
    offscreenCanvas.height = 1280;

    try {
      const ffmpeg = await loadFFmpeg();

      // 1. レンダリング
      for (let i = 0; i < totalFrames; i++) {
        const frameTime = i / fps;
        await renderFrame(frameTime, offscreenCanvas);

        const blob = await new Promise<Blob | null>(res => offscreenCanvas.toBlob(res, 'image/jpeg', 0.85));
        if (!blob) throw new Error("Frame error");

        const fileName = `f${i.toString().padStart(5, '0')}.jpg`;
        await ffmpeg.writeFile(fileName, await fetchFile(blob));

        setExportProgress(Math.round((i / totalFrames) * 50));
      }

      // 2. エンコード
      setExportPhase("encoding");
      await ffmpeg.exec([
        "-framerate", fps.toString(),
        "-i", "f%05d.jpg",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "ultrafast",
        "-crf", "23",
        "out.mp4"
      ]);

      const data = await ffmpeg.readFile("out.mp4");
      const mp4Blob = new Blob([data], { type: "video/mp4" });
      setExportBlob(mp4Blob);

      // 掃除
      for (let i = 0; i < totalFrames; i++) {
        await ffmpeg.deleteFile(`f${i.toString().padStart(5, '0')}.jpg`);
      }

      if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        triggerDownload(mp4Blob, `vlog-${Date.now()}.mp4`);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
      setError("作成中に問題が発生しました。もう一度お試しください。");
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
        await navigator.share({
          files: [file],
          title: 'The 1s Vlog.',
        });
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
    <div className="space-y-6 relative">
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

      <div className="relative aspect-[9/16] max-h-[65vh] mx-auto bg-black rounded-[2.5rem] overflow-hidden border-[6px] border-[#1a1a1a] shadow-2xl group">
        <canvas ref={canvasRef} width={1080} height={1920} className="w-full h-full object-cover" />

        {/* 状態オーバーレイ */}
        <AnimatePresence>
          {(isExporting || !isReady) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl z-30"
            >
              <Loader2 className="w-10 h-10 text-[var(--color-accent)] animate-spin mb-6" />
              <p className="text-white text-xs font-bold tracking-[0.2em] uppercase opacity-80 mb-6">
                {!isReady ? "Media Loading" : exportPhase === "rendering" ? "Perfect Rendering" : "Optimizing MP4"}
              </p>
              {isExporting && (
                <div className="w-48">
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-2">
                    <motion.div className="h-full bg-[var(--color-accent)]" animate={{ width: `${exportProgress}%` }} transition={{ duration: 0.3 }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-white/40">
                    <span>{exportPhase === 'rendering' ? 'RENDER' : 'ENCODE'}</span>
                    <span>{exportProgress}%</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 再生ボタン */}
        {isReady && !isPlaying && !isExporting && (
          <div className="absolute inset-0 flex items-center justify-center cursor-pointer z-10" onClick={() => setIsPlaying(true)}>
            <motion.div whileTap={{ scale: 0.9 }} className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Play className="w-8 h-8 text-white fill-current ml-1" />
            </motion.div>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-4 bottom-20 bg-red-500/90 text-white p-4 rounded-2xl flex items-center gap-3 z-40 backdrop-blur-lg">
            <AlertCircle className="shrink-0" />
            <p className="text-xs font-bold">{error}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between bg-black/5 p-4 rounded-3xl border border-black/5">
          <button onClick={() => setIsPlaying(!isPlaying)} disabled={clips.length === 0 || isExporting}
            className="w-12 h-12 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-30"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-black/30 tracking-tight">Current Time</p>
            <p className="text-xl font-mono font-bold">{currentTime.toFixed(1)}s</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant={exportBlob ? "outline" : "accent"} onClick={handleExport} disabled={clips.length === 0 || isExporting} className="rounded-2xl h-14 font-bold">
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {exportBlob ? "作り直す" : "動画を作成"}
          </Button>
          <Button variant="accent" onClick={handleSaveToCameraRoll} disabled={!exportBlob || isExporting} className="rounded-2xl h-14 font-bold shadow-xl shadow-[var(--color-accent)]/20">
            <Share2 className="w-4 h-4 mr-2" />
            保存する
          </Button>
        </div>
      </div>
    </div>
  );
}
