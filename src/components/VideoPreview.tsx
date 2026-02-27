import { useRef, useEffect, useState, useCallback } from "react";
import { VideoClip, TitleSettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Play, Pause, Download, Loader2, CheckCircle2, Share2 } from "lucide-react";
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
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function VideoPreview({ clips, titleSettings }: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);

  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const activeClipIdRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const exportTimeRef = useRef<number>(0);
  const isProcessingFrameRef = useRef<boolean>(false);

  // Refベースの状態参照でクロージャの陳腐化を防止
  const isExportingRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);

  // FFmpegインスタンス
  const ffmpegRef = useRef<FFmpeg | null>(null);

  // stateとrefを同期させる
  useEffect(() => {
    isExportingRef.current = isExporting;
  }, [isExporting]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const totalDuration = clips.reduce((acc, clip) => acc + clip.clipDuration, 0);

  // FFmpegのロード
  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      console.log(message);
    });

    ffmpeg.on("progress", ({ progress }) => {
      setConvertProgress(Math.round(progress * 100));
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  // 動画のプリロードとreadiness確認
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
          if (loadedCount === totalClips) {
            setIsReady(true);
          }
          video.removeEventListener("canplaythrough", onCanPlay);
        };
        video.addEventListener("canplaythrough", onCanPlay);

        videoElementsRef.current.set(clip.id, video);
      } else {
        loadedCount++;
        if (loadedCount === totalClips) {
          setIsReady(true);
        }
      }
    });

    return () => {
      // アンマウント時のクリーンアップ
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
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 4;
        ctx.fillStyle = "white";
        ctx.fillText(text.toUpperCase(), centerX, height * 0.92);
        break;

      case "camcorder":
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.font = `${height * 0.04}px "JetBrains Mono", monospace`;
        ctx.fillStyle = "#FFD700";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 2;
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
        ctx.font = `italic 500 ${height * 0.055}px "Cormorant Garamond", serif`;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.letterSpacing = "6px";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 4;
        ctx.fillText(text, centerX, height - barHeight / 2);
        break;
      }

      case "magazine":
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `italic 700 ${height * 0.14}px "Playfair Display", serif`;
        ctx.fillStyle = "white";
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 20;
        ctx.fillText(text, centerX, centerY);
        ctx.font = `italic 400 ${height * 0.035}px "Cormorant Garamond", serif`;
        ctx.letterSpacing = "4px";
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText("Vlog Series // Vol. 01", centerX, centerY + height * 0.12);
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX - width * 0.1, centerY + height * 0.15);
        ctx.lineTo(centerX + width * 0.1, centerY + height * 0.15);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }, [titleSettings]);

  // フレーム描画
  const renderFrame = useCallback(async (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (clips.length === 0) {
      ctx.fillStyle = "#333";
      ctx.font = "20px Inter";
      ctx.textAlign = "center";
      ctx.fillText("No clips selected", canvas.width / 2, canvas.height / 2);
      return;
    }

    let timeAccumulator = 0;
    let activeClip: VideoClip | null = null;
    let clipLocalTime = 0;

    for (const clip of clips) {
      if (time >= timeAccumulator && time < timeAccumulator + clip.clipDuration) {
        activeClip = clip;
        clipLocalTime = time - timeAccumulator;
        break;
      }
      timeAccumulator += clip.clipDuration;
    }

    if (activeClip) {
      const video = videoElementsRef.current.get(activeClip.id);
      if (video) {
        const expectedTime = activeClip.startTime + clipLocalTime;

        if (activeClipIdRef.current !== activeClip.id || Math.abs(video.currentTime - expectedTime) > 0.05) {
          if (activeClipIdRef.current && activeClipIdRef.current !== activeClip.id) {
            const prevVideo = videoElementsRef.current.get(activeClipIdRef.current);
            if (prevVideo) prevVideo.pause();
          }
          video.currentTime = expectedTime;
          activeClipIdRef.current = activeClip.id;

          if (isExportingRef.current) {
            await new Promise<void>((resolve) => {
              const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
              };
              video.addEventListener('seeked', onSeeked);
              setTimeout(resolve, 150); // モバイル向けに少し長めに待機
            });
          }
        }

        if (!isExportingRef.current && isPlayingRef.current && video.paused) {
          video.play().catch(e => console.error("Play error", e));
        } else if (isExportingRef.current) {
          video.pause();
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;
        if (vWidth && vHeight) {
          const scale = Math.min(canvas.width / vWidth, canvas.height / vHeight);
          const w = vWidth * scale;
          const h = vHeight * scale;
          const x = (canvas.width - w) / 2;
          const y = (canvas.height - h) / 2;
          ctx.drawImage(video, x, y, w, h);
        }
        drawText(ctx, canvas.width, canvas.height);
      }
    } else {
      if (activeClipIdRef.current) {
        const prevVideo = videoElementsRef.current.get(activeClipIdRef.current);
        if (prevVideo) prevVideo.pause();
        activeClipIdRef.current = null;
      }
    }
  }, [clips, drawText]);

  // アニメーションループ
  const animate = useCallback(async (timestamp: number) => {
    if (isProcessingFrameRef.current) return;
    isProcessingFrameRef.current = true;

    try {
      if (!startTimeRef.current) startTimeRef.current = timestamp;

      let elapsed: number;
      if (isExportingRef.current) {
        elapsed = exportTimeRef.current;
        exportTimeRef.current += (1 / 30);
      } else {
        elapsed = (timestamp - startTimeRef.current) / 1000;
      }

      if (elapsed >= totalDuration) {
        if (isExportingRef.current) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
          }
          return;
        } else {
          startTimeRef.current = timestamp;
          elapsed = 0;
        }
      }

      setCurrentTime(elapsed);
      await renderFrame(elapsed);

      if (isPlayingRef.current || isExportingRef.current) {
        requestRef.current = requestAnimationFrame(animate);
      }
    } finally {
      isProcessingFrameRef.current = false;
    }
  }, [totalDuration, renderFrame]);

  useEffect(() => {
    if (isPlaying || isExporting) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      startTimeRef.current = 0;
      videoElementsRef.current.forEach(v => v.pause());
      activeClipIdRef.current = null;
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, isExporting, animate]);

  useEffect(() => {
    if (!isPlaying) renderFrame(0);
  }, [clips, isPlaying, renderFrame]);

  // エクスポート処理（WebM生成 -> MP4変換）
  const handleExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsExporting(true);
    setIsPlaying(false);
    setCurrentTime(0);
    exportTimeRef.current = 0;
    startTimeRef.current = 0;
    isProcessingFrameRef.current = false;

    const stream = canvas.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: 8000000
    });

    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      setIsExporting(false);
      setIsConverting(true);
      setConvertProgress(0);

      try {
        const webmBlob = new Blob(chunksRef.current, { type: "video/webm" });
        const ffmpeg = await loadFFmpeg();

        await ffmpeg.writeFile("input.webm", await fetchFile(webmBlob));

        // WebM -> MP4 変換 (H.264 / AAC)
        // iPhone互換性を最大化するために yuv420p を指定
        await ffmpeg.exec([
          "-i", "input.webm",
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          "-preset", "ultrafast",
          "output.mp4"
        ]);

        const data = await ffmpeg.readFile("output.mp4");
        const mp4Blob = new Blob([data], { type: "video/mp4" });
        setExportBlob(mp4Blob);

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (!isMobile) {
          triggerDownload(mp4Blob, `vlog-${Date.now()}.mp4`);
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 4000);
        }
      } catch (err) {
        console.error("Conversion error:", err);
        // Fallback: 変換失敗時はWebMをそのまま出す
        const webmBlob = new Blob(chunksRef.current, { type: "video/webm" });
        setExportBlob(webmBlob);
      } finally {
        setIsConverting(false);
      }
    };

    mediaRecorder.start();
  };

  const handleSaveToCameraRoll = async () => {
    if (!exportBlob) return;
    const isMp4 = exportBlob.type.includes("mp4");
    const fileName = `vlog-${Date.now()}.${isMp4 ? "mp4" : "webm"}`;
    const file = new File([exportBlob], fileName, { type: exportBlob.type });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'The 1s Vlog.',
          text: '最高の1秒が繋がりました！',
        });
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 4000);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          triggerDownload(exportBlob, fileName);
        }
      }
    } else {
      triggerDownload(exportBlob, fileName);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
    }
  };

  return (
    <div className="space-y-4 relative">
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-[var(--color-accent)] rounded-2xl p-4 shadow-xl flex items-center gap-3 min-w-[280px]"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center text-[var(--color-accent)] shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-display font-bold text-[var(--color-text)]">保存しました！</p>
              <p className="text-[10px] text-[var(--color-text-muted)] font-display italic">カメラロールを確認してください</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative aspect-video bg-black rounded-3xl overflow-hidden border border-[var(--color-border)] shadow-2xl group">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full object-contain"
        />

        {/* 進捗・ステータスオーバーレイ */}
        <AnimatePresence>
          {(isExporting || isConverting || !isReady) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md z-30"
            >
              <div className="w-12 h-12 relative flex items-center justify-center mb-4">
                <Loader2 className="w-full h-full text-[var(--color-accent)] animate-spin" />
                {isConverting && (
                  <span className="absolute text-[10px] font-bold text-white">{convertProgress}%</span>
                )}
              </div>
              <p className="text-white text-sm font-display font-medium tracking-widest uppercase">
                {!isReady ? "Loading Media..." : isExporting ? "Recording..." : "Optimizing for Mobile..."}
              </p>
              {isConverting && (
                <div className="w-48 h-1 bg-white/20 rounded-full mt-4 overflow-hidden">
                  <motion.div
                    className="h-full bg-[var(--color-accent)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${convertProgress}%` }}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 再生ボタンオーバーレイ */}
        {isReady && !isPlaying && !isExporting && !isConverting && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-all cursor-pointer z-10"
            onClick={() => setIsPlaying(true)}
          >
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="w-20 h-20 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white shadow-2xl"
            >
              <Play className="w-10 h-10 ml-1.5" />
            </motion.div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={clips.length === 0 || isExporting || isConverting}
            className="w-10 h-10 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center text-[var(--color-text)] disabled:opacity-30 active:scale-90 transition-transform"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
          <div className="text-xs font-mono font-medium text-[var(--color-text-muted)] tabular-nums">
            {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
          </div>
        </div>

        <div className="flex gap-2">
          {exportBlob && (
            <Button
              variant="accent"
              onClick={handleSaveToCameraRoll}
              className="rounded-full px-6 shadow-lg shadow-[var(--color-accent)]/20 animate-in fade-in zoom-in duration-300"
            >
              <Share2 className="w-4 h-4 mr-2" />
              保存 / 共有
            </Button>
          )}

          <Button
            variant={exportBlob ? "outline" : "accent"}
            onClick={handleExport}
            disabled={clips.length === 0 || isExporting || isConverting}
            className={cn("rounded-full px-6", !exportBlob && "shadow-lg shadow-[var(--color-accent)]/20")}
          >
            {isExporting || isConverting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {isExporting ? "録画中..." : isConverting ? "変換中..." : exportBlob ? "作り直す" : "動画を作成"}
          </Button>
        </div>
      </div>
    </div>
  );
}
