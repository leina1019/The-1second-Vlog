import { useRef, useEffect, useState, useCallback } from "react";
import { VideoClip, TitleSettings, TextOverlayStyle } from "@/types";
import { Button } from "@/components/ui/button";
import { Play, Pause, Download, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

interface VideoPreviewProps {
  clips: VideoClip[];
  titleSettings: TitleSettings;
}

// ダウンロードFallbackヘルパー（重複排除）
function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function VideoPreview({ clips, titleSettings }: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);

  const requestRef = useRef<number>();
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

  // stateとrefを同期させる
  useEffect(() => {
    isExportingRef.current = isExporting;
  }, [isExporting]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const totalDuration = clips.reduce((acc, clip) => acc + clip.clipDuration, 0);

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

    // 削除されたクリップのクリーンアップ
    const currentIds = new Set(clips.map((c) => c.id));
    videoElementsRef.current.forEach((_, id) => {
      if (!currentIds.has(id)) {
        const video = videoElementsRef.current.get(id);
        if (video) {
          URL.revokeObjectURL(video.src);
          videoElementsRef.current.delete(id);
        }
      }
    });
  }, [clips]);

  // テキストオーバーレイ描画（useCallbackでメモ化）
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

  // フレーム描画（Refベースで状態参照）
  const renderFrame = useCallback(async (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // キャンバスクリア
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (clips.length === 0) {
      ctx.fillStyle = "#333";
      ctx.font = "20px Inter";
      ctx.textAlign = "center";
      ctx.fillText("No clips selected", canvas.width / 2, canvas.height / 2);
      return;
    }

    // 現在のクリップを特定
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

    // クリップ切り替え処理
    if (activeClip) {
      const video = videoElementsRef.current.get(activeClip.id);
      if (video) {
        const expectedTime = activeClip.startTime + clipLocalTime;

        // クリップが切り替わった場合、またはシーク位置がずれた場合
        if (activeClipIdRef.current !== activeClip.id || Math.abs(video.currentTime - expectedTime) > 0.05) {
          // 前のクリップを停止
          if (activeClipIdRef.current && activeClipIdRef.current !== activeClip.id) {
            const prevVideo = videoElementsRef.current.get(activeClipIdRef.current);
            if (prevVideo) prevVideo.pause();
          }

          // シーク
          video.currentTime = expectedTime;
          activeClipIdRef.current = activeClip.id;

          // エクスポート時はシーク完了を待機して滑らかさを保証（Refで参照）
          if (isExportingRef.current) {
            await new Promise<void>((resolve) => {
              const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
              };
              video.addEventListener('seeked', onSeeked);
              // 安全のためタイムアウト設定
              setTimeout(resolve, 100);
            });
          }
        }

        // プレビュー再生時のみ動画を再生（Refで参照）
        if (!isExportingRef.current && isPlayingRef.current && video.paused) {
          video.play().catch(e => console.error("Play error", e));
        } else if (isExportingRef.current) {
          video.pause();
        }

        // 高品質描画設定
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

  // アニメーションループ（Refベースで状態参照）
  const animate = useCallback(async (timestamp: number) => {
    if (isProcessingFrameRef.current) return;
    isProcessingFrameRef.current = true;

    try {
      if (!startTimeRef.current) startTimeRef.current = timestamp;

      let elapsed: number;
      if (isExportingRef.current) {
        // エクスポート時は決定論的な時間増分（30fps固定）
        elapsed = exportTimeRef.current;
        exportTimeRef.current += (1 / 30);
      } else {
        elapsed = (timestamp - startTimeRef.current) / 1000;
      }

      // 終了チェック
      if (elapsed >= totalDuration) {
        if (isExportingRef.current) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
          }
          return; // ループ停止
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

  // 再生/エクスポートの開始・停止制御
  useEffect(() => {
    if (isPlaying || isExporting) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      startTimeRef.current = 0;
      // 全動画を停止
      videoElementsRef.current.forEach(v => v.pause());
      activeClipIdRef.current = null;
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, isExporting, animate]);

  // 初期描画
  useEffect(() => {
    if (!isPlaying) {
      renderFrame(0);
    }
  }, [clips, isPlaying, renderFrame]);


  const handleExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsExporting(true);
    setIsPlaying(false);
    setCurrentTime(0);
    exportTimeRef.current = 0;
    startTimeRef.current = 0;
    isProcessingFrameRef.current = false;

    // MediaRecorderのセットアップ
    const mimeTypes = ["video/mp4", "video/webm;codecs=vp9", "video/webm"];
    const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || "";

    const stream = canvas.captureStream(30); // 30fpsでエクスポート
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: supportedMimeType,
      videoBitsPerSecond: 12000000
    });
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const mimeType = supportedMimeType || "video/mp4";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setExportBlob(blob);

      // 状態リセット
      videoElementsRef.current.forEach(v => v.pause());
      setIsExporting(false);

      // デスクトップでは即座にダウンロード
      // モバイルでは「保存する」ボタンでユーザージェスチャーを確保
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (!isMobile) {
        const extension = mimeType.includes("mp4") ? "mp4" : "webm";
        triggerDownload(blob, `vlog-${Date.now()}.${extension}`);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 4000);
      }
    };

    mediaRecorder.start();
  };

  const handleSaveToCameraRoll = async () => {
    if (!exportBlob) return;

    const mimeType = exportBlob.type || "video/mp4";
    const extension = mimeType.includes("mp4") ? "mp4" : "webm";
    const fileName = `vlog-${Date.now()}.${extension}`;
    const file = new File([exportBlob], fileName, { type: mimeType });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: '1s Vlog',
          text: 'Check out my vlog!',
        });
        setShowSuccess(true);
        setExportBlob(null);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Share failed:', error);
          // Fallbackダウンロード
          triggerDownload(exportBlob, fileName);
        }
      }
    } else {
      // デスクトップ/Fallback
      triggerDownload(exportBlob, fileName);
      setShowSuccess(true);
      setExportBlob(null);
    }

    setTimeout(() => setShowSuccess(false), 4000);
  };

  return (
    <div className="space-y-4 relative">
      {/* 完了ポップアップ */}
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
              <p className="text-sm font-display font-bold text-[var(--color-text)] tracking-tight">ダウンロード完了！</p>
              <p className="text-[10px] text-[var(--color-text-muted)] font-display italic">カメラロールを確認してください</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-[var(--color-border)] shadow-2xl">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full object-contain"
        />

        {/* ローディングオーバーレイ */}
        {!isReady && clips.length > 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-20">
            <Loader2 className="w-10 h-10 text-white animate-spin mb-2" />
            <p className="text-white text-xs font-medium">動画を読み込み中...</p>
          </div>
        )}

        {/* 再生オーバーレイ */}
        {isReady && !isPlaying && !isExporting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors cursor-pointer z-10" onClick={() => setIsPlaying(true)}>
            <div className="w-16 h-16 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white shadow-lg hover:scale-105 transition-transform">
              <Play className="w-8 h-8 ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* コントロール */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={clips.length === 0 || isExporting}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>
          <div className="text-xs font-display font-medium text-[var(--color-text-muted)] tracking-wider">
            {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
          </div>
        </div>

        <div className="flex gap-2">
          {exportBlob && (
            <Button
              variant="accent"
              onClick={handleSaveToCameraRoll}
              className="gap-2 animate-pulse"
            >
              <CheckCircle2 className="w-4 h-4" />
              保存する
            </Button>
          )}

          <Button
            variant={exportBlob ? "outline" : "accent"}
            onClick={handleExport}
            disabled={clips.length === 0 || isExporting}
            className="gap-2"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? "作成中..." : exportBlob ? "作り直す" : "動画を作成"}
          </Button>
        </div>
      </div>
    </div>
  );
}
