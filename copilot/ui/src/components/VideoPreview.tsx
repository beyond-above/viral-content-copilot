import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { 
  Play, Pause, Volume2, ChevronDown, ChevronUp, Loader2, 
  RefreshCw, XCircle, Film, Music, CheckCircle, AlertTriangle, Info,
  Download 
} from 'lucide-react';

interface VideoPreviewProps {
  jobId: string | null;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: string;
  progressPct: number;
  stepMessage: string;
  topic: string;
  imageUrls: string[];
  audioUrl: string | null;
  audioDuration: number;
  editList: any | null;
  error: string | null;
  warnings?: string[];
  onCancel: () => void;
  onRetry: () => void;
  onDirectStart: (topic: string) => void;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({
  jobId,
  status,
  currentStep,
  progressPct,
  stepMessage,
  topic,
  imageUrls,
  audioUrl,
  audioDuration,
  editList,
  error,
  warnings = [],
  onCancel,
  onRetry,
  onDirectStart
}) => {
  const [directTopic, setDirectTopic] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  
  // Custom HTML5 Audio Player State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [imageLoaded, setImageLoaded] = useState<Record<number, boolean>>({});

  // Video Assembly State
  const [isAssembling, setIsAssembling] = useState(false);
  const [assemblyProgress, setAssemblyProgress] = useState(0);
  const [assembledVideoUrl, setAssembledVideoUrl] = useState<string | null>(null);
  const [assemblyError, setAssemblyError] = useState<string | null>(null);

  // Clean up object URLs on unmount or URL/images changes
  useEffect(() => {
    if (assembledVideoUrl) {
      URL.revokeObjectURL(assembledVideoUrl);
      setAssembledVideoUrl(null);
    }
    setIsAssembling(false);
    setAssemblyProgress(0);
    setAssemblyError(null);
  }, [audioUrl, imageUrls]);

  // Reset audio state when URL changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
    }
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => console.error("Play failed:", err));
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration || audioDuration || 0);
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const vol = parseFloat(e.target.value);
    audioRef.current.volume = vol;
    setVolume(vol);
  };

  const formatTime = (timeSecs: number) => {
    const mins = Math.floor(timeSecs / 60);
    const secs = Math.floor(timeSecs % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAssembleVideo = async () => {
    if (!audioUrl || !imageUrls || imageUrls.length === 0) {
      setAssemblyError("Missing audio or scene images.");
      return;
    }

    setIsAssembling(true);
    setAssemblyProgress(0);
    setAssemblyError(null);
    setAssembledVideoUrl(null);

    const canvas = document.createElement('canvas');
    // Solid 9:16 vertical resolution (540x960 is extremely snappy and lightweight)
    canvas.width = 540;
    canvas.height = 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setAssemblyError("Could not initialize 2D context.");
      setIsAssembling(false);
      return;
    }

    let audioCtx: AudioContext | null = null;
    let animationFrameId: number | null = null;
    let audio: HTMLAudioElement | null = null;
    let recorder: MediaRecorder | null = null;

    try {
      // 1. Preload all images
      setAssemblyProgress(5);
      const loadedImages: HTMLImageElement[] = [];
      for (let i = 0; i < imageUrls.length; i++) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imageUrls[i];
        await new Promise((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => {
            console.warn(`Failed to load image at index ${i}: ${imageUrls[i]}`);
            resolve(false);
          };
        });
        loadedImages.push(img);
        setAssemblyProgress(Math.floor(5 + (i / imageUrls.length) * 15)); // up to 20%
      }

      // 2. Setup Audio and Web Audio API
      audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.src = audioUrl;
      
      // Wait for audio metadata to load
      await new Promise((resolve, reject) => {
        audio!.onloadedmetadata = () => resolve(true);
        audio!.onerror = () => reject(new Error("Failed to load audio track."));
        // Timeout after 10s
        setTimeout(() => resolve(false), 10000);
      });

      const totalDuration = audio.duration || audioDuration || 10;
      const imgDuration = totalDuration / loadedImages.length;

      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioCtx.resume();

      const source = audioCtx.createMediaElementSource(audio);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      // We do not connect source to audioCtx.destination, so it renders silently to user!

      // 3. Combine Canvas and Audio Streams
      const canvasStream = canvas.captureStream(30); // 30 FPS
      const combinedStream = new MediaStream();
      canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
      dest.stream.getAudioTracks().forEach(track => combinedStream.addTrack(track));

      // 4. Initialize MediaRecorder
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];
      let selectedMimeType = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      recorder = new MediaRecorder(combinedStream, selectedMimeType ? { mimeType: selectedMimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      const recordPromise = new Promise<string>((resolve, reject) => {
        recorder!.onstop = () => {
          try {
            const blob = new Blob(chunks, { type: selectedMimeType || 'video/webm' });
            const url = URL.createObjectURL(blob);
            resolve(url);
          } catch (err) {
            reject(err);
          }
        };
        recorder!.onerror = (e) => reject(e);
      });

      // 5. Start Recording and Playing
      recorder.start();
      audio.currentTime = 0;
      await audio.play();

      setAssemblyProgress(25);

      // Render loop helper to draw scaled centered images
      const drawScaledImage = (context: CanvasRenderingContext2D, imgElement: HTMLImageElement, scaleFactor: number) => {
        if (!imgElement || !imgElement.complete || imgElement.naturalWidth === 0) return;

        const canvasAspect = canvas.width / canvas.height;
        const imgAspect = imgElement.naturalWidth / imgElement.naturalHeight;

        let drawWidth = canvas.width;
        let drawHeight = canvas.height;
        let offsetX = 0;
        let offsetY = 0;

        if (imgAspect > canvasAspect) {
          drawWidth = canvas.height * imgAspect;
          offsetX = (canvas.width - drawWidth) / 2;
        } else {
          drawHeight = canvas.width / imgAspect;
          offsetY = (canvas.height - drawHeight) / 2;
        }

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        context.save();
        context.translate(centerX, centerY);
        context.scale(scaleFactor, scaleFactor);
        context.translate(-centerX, -centerY);
        context.drawImage(imgElement, offsetX, offsetY, drawWidth, drawHeight);
        context.restore();
      };

      // Render loop
      const draw = () => {
        if (!ctx || !audio || !recorder) return;

        const curTime = audio.currentTime;
        const imgIndex = Math.min(
          Math.floor(curTime / imgDuration),
          loadedImages.length - 1
        );

        const frameTime = curTime % imgDuration;
        const frameProgress = frameTime / imgDuration; // 0.0 to 1.0 over segment
        const scale = 1.15 - (frameProgress * 0.25); // Subtle Ken Burns zoom-out (1.15 down to 0.90)

        ctx.fillStyle = '#0a0a0f'; // Dark premium background
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const img = loadedImages[imgIndex];

        if (img && img.complete && img.naturalWidth > 0) {
          const transitionDuration = 0.4; // 0.4s smooth crossfade
          const remainingTime = imgDuration - frameTime;
          const isTransitioning = remainingTime < transitionDuration && imgIndex < loadedImages.length - 1;

          if (isTransitioning) {
            const nextImg = loadedImages[imgIndex + 1];
            const alpha = (transitionDuration - remainingTime) / transitionDuration;

            // Draw current frame fading out
            ctx.save();
            ctx.globalAlpha = 1 - alpha;
            drawScaledImage(ctx, img, scale);
            ctx.restore();

            // Draw next frame fading in
            if (nextImg && nextImg.complete && nextImg.naturalWidth > 0) {
              ctx.save();
              ctx.globalAlpha = alpha;
              const nextFrameProgress = (transitionDuration - remainingTime) / imgDuration;
              drawScaledImage(ctx, nextImg, 1.15 - (nextFrameProgress * 0.25));
              ctx.restore();
            }
          } else {
            // Draw normally
            ctx.save();
            drawScaledImage(ctx, img, scale);
            ctx.restore();
          }
        } else {
          // Text fallback
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 24px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Scene ${imgIndex + 1}`, canvas.width / 2, canvas.height / 2);
        }

        // Draw watermark / HUD
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(15, canvas.height - 50, 110, 30);
        ctx.fillStyle = '#10b981'; // Green active dot
        ctx.beginPath();
        ctx.arc(30, canvas.height - 35, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`SCENE 0${imgIndex + 1}`, 42, canvas.height - 31);

        // Update progress bar
        const progress = Math.min(Math.floor(25 + (curTime / totalDuration) * 74), 99);
        setAssemblyProgress(progress);

        if (curTime < totalDuration && !audio.ended) {
          animationFrameId = requestAnimationFrame(draw);
        } else {
          audio.pause();
          recorder.stop();
          if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close();
          }
        }
      };

      draw();

      const videoUrl = await recordPromise;
      setAssembledVideoUrl(videoUrl);
      setAssemblyProgress(100);
      setIsAssembling(false);

    } catch (err: any) {
      console.error("Assembly failed:", err);
      setAssemblyError(err.message || "An error occurred during video assembly.");
      setIsAssembling(false);
      setAssemblyProgress(0);
      if (audio) audio.pause();
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-gray-100 flex flex-col h-full min-h-[600px] transition-all duration-300">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
        <div>
          <h2 className="text-md font-bold text-gray-900 flex items-center gap-2">
            <Film className="text-indigo-600" size={18} />
            Active Video Project
          </h2>
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mt-0.5">
            {jobId ? `Job ID: ${jobId.slice(0, 8)}...` : 'No active project'}
          </p>
        </div>
        {status !== 'idle' && (
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            status === 'completed' ? 'bg-green-50 text-green-700 border border-green-100' :
            status === 'failed' ? 'bg-red-50 text-red-700 border border-red-100' :
            status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
            'bg-indigo-50 text-indigo-700 border border-indigo-100 animate-pulse'
          }`}>
            {status}
          </span>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* State: Idle / Start Directly */}
        {status === 'idle' && (
          <div className="h-full flex flex-col justify-center items-center text-center py-12 space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 animate-bounce">
              <Film size={32} />
            </div>
            <div className="max-w-sm">
              <h3 className="text-sm font-bold text-gray-900">Create Video Instantly</h3>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Refine a prompt in the viral copilot chat, or enter a topic below to generate vertical reels, custom AI narration, and crossfaded scenes.
              </p>
            </div>
            <div className="w-full max-w-sm flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
              <input
                type="text"
                placeholder="Enter topic (e.g., Summer foods)"
                value={directTopic}
                onChange={(e) => setDirectTopic(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && directTopic.trim() && onDirectStart(directTopic.trim())}
                className="flex-1 bg-transparent px-3 py-2 text-xs focus:outline-none"
              />
              <button
                onClick={() => directTopic.trim() && onDirectStart(directTopic.trim())}
                disabled={!directTopic.trim()}
                className="bg-indigo-600 text-white text-xs px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                Generate
              </button>
            </div>
          </div>
        )}

        {/* State: Queued / Running (Progress State) */}
        {(status === 'queued' || status === 'running') && (
          <div className="space-y-6 py-6">
            {/* Live Progress Bar */}
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 shadow-inner">
              <div className="flex justify-between text-xs font-bold text-gray-800 mb-2">
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin text-indigo-600" size={14} />
                  {stepMessage || 'Generating Assets...'}
                </span>
                <span className="text-indigo-600 font-black">{progressPct}%</span>
              </div>
              
              {/* Outer bar */}
              <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Steps Checklist */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Factory Pipeline Status</h4>
              <div className="space-y-3 bg-white border border-gray-100 rounded-xl p-4">
                {[
                  { name: 'Scripting', key: 'script', triggerPct: 10, label: 'Writing script and scene plans' },
                  { name: 'Scene Design', key: 'images', triggerPct: 35, label: 'Generating premium 9:16 scene cards' },
                  { name: 'Narration Track', key: 'tts', triggerPct: 75, label: 'Synthesizing voiceover assets' },
                  { name: 'Final Rendering', key: 'completed', triggerPct: 100, label: 'Assembling audio & crossfades' }
                ].map((step, idx) => {
                  const isDone = progressPct > step.triggerPct || (progressPct === 100);
                  const isActive = progressPct >= step.triggerPct && progressPct < (idx < 3 ? [10, 35, 75, 100][idx+1] : 101);
                  
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      <div className={`mt-0.5 rounded-full p-0.5 flex-shrink-0 ${
                        isDone ? 'bg-green-100 text-green-600' :
                        isActive ? 'bg-indigo-100 text-indigo-600 animate-pulse' :
                        'bg-gray-100 text-gray-300'
                      }`}>
                        <CheckCircle size={14} fill={isDone ? 'currentColor' : 'none'} className={isDone ? 'text-white' : ''} />
                      </div>
                      <div>
                        <p className={`text-xs font-bold ${isActive ? 'text-indigo-600' : isDone ? 'text-gray-800' : 'text-gray-400'}`}>
                          {step.name}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{step.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cancel Button */}
            <div className="pt-4 flex justify-center">
              <button
                onClick={onCancel}
                className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-red-600 bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-100 px-5 py-2.5 rounded-xl transition-all"
              >
                <XCircle size={16} />
                Cancel Production
              </button>
            </div>
          </div>
        )}

        {/* State: Completed (Show Assets) */}
        {status === 'completed' && (
          <div className="space-y-6">
            {/* Warnings Section (Replicated frames alert) */}
            {warnings && warnings.length > 0 && (
              <div className="bg-amber-50/75 border border-amber-200/60 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed text-amber-900">
                  <p className="font-bold text-amber-800">Automatic Scene Safety Adjustment</p>
                  <ul className="mt-1 space-y-1 list-disc list-inside">
                    {warnings.map((w, idx) => {
                      const match = w.match(/frame_(\d+)_replicated_from_(\d+)/);
                      const displayMsg = match 
                        ? `Scene ${match[1]} prompt triggered Vertex AI safety filters, and has been gracefully replaced with a replica of Scene ${match[2]} to ensure a continuous video.`
                        : w;
                      return (
                        <li key={idx} className="marker:text-amber-600">{displayMsg}</li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}

            {/* Video Assembler Card */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Film size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Browser Video Assembler</h4>
                    <p className="text-[10px] text-slate-400 font-medium">Stitch scene keyframes with voiceover slideshow</p>
                  </div>
                </div>
                {assembledVideoUrl && (
                  <a
                    href={assembledVideoUrl}
                    download="viral_video_reel.webm"
                    className="p-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white transition-all shadow-md shadow-emerald-500/10 border border-emerald-400/20 flex items-center gap-1.5 text-xs font-bold"
                  >
                    <Download size={14} />
                    <span>Download Video</span>
                  </a>
                )}
              </div>

              {/* Action State: Idle / Ready */}
              {!isAssembling && !assembledVideoUrl && (
                <div className="text-center py-4 space-y-3">
                  <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                    Compile your generated keyframes and soundtrack into a vertical video reel entirely in your browser. Each image appears for exactly one-sixth of the total narration.
                  </p>
                  <button
                    onClick={handleAssembleVideo}
                    className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.01] shadow-lg shadow-indigo-100"
                  >
                    <Film size={16} />
                    Assemble Video Slideshow
                  </button>
                </div>
              )}

              {/* Action State: Assembling (Progress) */}
              {isAssembling && (
                <div className="py-4 space-y-3.5">
                  <div className="flex justify-between items-center text-xs font-bold text-indigo-900">
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin text-indigo-600" size={14} />
                      Stitching and mixing soundtrack...
                    </span>
                    <span>{assemblyProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${assemblyProgress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-center text-slate-400 italic">
                    Please keep this browser tab active for optimal recording speed and quality.
                  </p>
                </div>
              )}

              {/* Action State: Complete (Show Video Player) */}
              {assembledVideoUrl && (
                <div className="space-y-4">
                  <div className="relative aspect-[9/16] bg-black rounded-xl overflow-hidden border border-slate-900 shadow-md max-w-[280px] mx-auto group">
                    <video
                      src={assembledVideoUrl}
                      controls
                      autoPlay
                      loop
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAssembleVideo}
                      className="flex-1 py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <RefreshCw size={14} />
                      Re-assemble Video
                    </button>
                  </div>
                </div>
              )}

              {/* Error State */}
              {assemblyError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-700">
                  <AlertTriangle className="shrink-0 mt-0.5" size={14} />
                  <div className="text-[10px] leading-relaxed">
                    <p className="font-bold">Assembly failed</p>
                    <p className="mt-0.5">{assemblyError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Audio Section: HTML5 Audio Player */}
            {audioUrl && (
              <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                      <Music size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">Voiceover Soundtrack</h4>
                      <p className="text-[10px] text-slate-400">Custom synthesized AI narration track</p>
                    </div>
                  </div>
                  <a
                    href={audioUrl}
                    download="narration.mp3"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 bg-slate-800 hover:bg-indigo-600 rounded-xl text-slate-300 hover:text-white transition-all border border-slate-700/50 hover:border-indigo-500 shadow-md flex items-center justify-center gap-1.5 text-xs font-bold shrink-0"
                    title="Download Audio"
                  >
                    <Download size={14} />
                    <span>Download</span>
                  </a>
                </div>

                <audio
                  ref={audioRef}
                  src={audioUrl}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleAudioEnded}
                  className="hidden"
                />

                {/* Scrubber Progress Bar */}
                <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                  <span>{formatTime(currentTime)}</span>
                  <input
                    type="range"
                    min="0"
                    max={duration || 1}
                    step="0.1"
                    value={currentTime}
                    onChange={handleScrub}
                    className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span>{formatTime(duration)}</span>
                </div>

                {/* Control Panel */}
                <div className="flex items-center justify-between mt-4 pt-2 border-t border-slate-800">
                  <button
                    onClick={togglePlay}
                    className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-full transition-all hover:scale-105 shadow-lg shadow-indigo-600/30"
                  >
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                  </button>

                  <div className="flex items-center gap-2">
                    <Volume2 size={16} className="text-slate-400" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={handleVolumeChange}
                      className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Images Grid Section */}
            {imageUrls && imageUrls.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Film size={14} />
                  Scene Keyframes (9:16 Aspect)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {imageUrls.map((url, index) => {
                    const loaded = imageLoaded[index];
                    return (
                      <div key={index} className="relative aspect-[9/16] bg-gray-100 rounded-xl overflow-hidden border border-gray-100 shadow-sm group">
                        {/* Skeleton Loader */}
                        {!loaded && (
                          <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse flex flex-col justify-center items-center text-center">
                            <Loader2 className="animate-spin text-gray-300 mb-1" size={18} />
                            <span className="text-[9px] font-bold text-gray-400">Rendering frame {index + 1}</span>
                          </div>
                        )}
                        <img
                          src={url}
                          alt={`Scene Keyframe ${index + 1}`}
                          onLoad={() => setImageLoaded(prev => ({ ...prev, [index]: true }))}
                          className={`w-full h-full object-cover transition-all duration-700 ease-in-out group-hover:scale-105 ${
                            loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                          }`}
                        />
                        {/* Floating Hover Download Button */}
                        {loaded && (
                          <a
                            href={url}
                            download={`scene_frame_${index + 1}.png`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-2.5 right-2.5 p-2 bg-black/60 hover:bg-indigo-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-md border border-white/15 hover:border-indigo-400 flex items-center justify-center shadow-lg"
                            title={`Download Frame ${index + 1}`}
                          >
                            <Download size={14} />
                          </a>
                        )}
                        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-md">
                          F{index + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Optional Collapsible Debug/Edit List Panel */}
            {editList && (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Info size={14} />
                    FFmpeg Edit List & Animation JSON
                  </span>
                  {showDebug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {showDebug && (
                  <div className="p-4 bg-gray-900 text-green-400 font-mono text-[10px] overflow-x-auto max-h-60 border-t border-gray-100">
                    <pre>{JSON.stringify(editList, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Generate Another Button */}
            <div className="pt-4 flex justify-center">
              <button
                onClick={onRetry}
                className="flex items-center gap-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-100 hover:shadow-indigo-200"
              >
                <RefreshCw size={14} />
                Generate New Project
              </button>
            </div>
          </div>
        )}

        {/* State: Failed / Error */}
        {status === 'failed' && (
          <div className="h-full flex flex-col justify-center items-center text-center py-12 space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
              <AlertTriangle size={32} />
            </div>
            <div className="max-w-sm">
              <h3 className="text-sm font-bold text-gray-900">Production Failed</h3>
              {error === 'image_upstream_429' || (error && error.includes('429')) ? (
                <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl mt-3 text-left">
                  <p className="text-[11px] font-bold text-orange-800 flex items-center gap-1.5">
                    <Info size={14} />
                    Vertex Imagen rate-limit
                  </p>
                  <p className="text-[10px] text-orange-600 mt-1 leading-relaxed">
                    Google Cloud Vertex AI prediction quota exceeded. High concurrent traffic on Imagen image generator. Retries exhausted.
                  </p>
                </div>
              ) : error === 'image_safety_filtered' || (error && error.includes('safety_filtered')) ? (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mt-3 text-left animate-fade-in">
                  <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-600" />
                    Google Safety Filter Blocked Image
                  </p>
                  <p className="text-[10px] text-amber-700 mt-1 leading-relaxed">
                    {error === 'image_safety_filtered_all' 
                      ? "Google's content safety filters blocked every single generated scene prompt for this topic. Since no scenes could be visualized without triggering the safety filters, video generation had to be aborted."
                      : "Google's safety filters blocked one or more generated scene prompts. This usually happens when topics combine sensitive combinations of terms, or reference minors (like \"students\") with uniform/clothing, or portray job losses."}
                  </p>
                  <p className="text-[10px] text-amber-800 mt-2 font-semibold">
                    💡 Tip: Try rephrasing the topic to use terms like "young adults", "creatives", or "professionals" instead of "students" or "artists losing jobs".
                  </p>
                </div>
              ) : (
                <p className="text-xs text-red-500 mt-2 leading-relaxed bg-red-50/50 p-3 rounded-lg border border-red-100/50">
                  {error || stepMessage || 'Could not finalize content creation.'}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onRetry}
                className="text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded-xl transition-all"
              >
                Start Over
              </button>
              <button
                onClick={onCancel} // This clears state
                className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 rounded-xl transition-all shadow-md"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* State: Cancelled */}
        {status === 'cancelled' && (
          <div className="h-full flex flex-col justify-center items-center text-center py-12 space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-500">
              <XCircle size={32} />
            </div>
            <div className="max-w-sm">
              <h3 className="text-sm font-bold text-gray-900">Project Terminated</h3>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                The video creation process has been canceled. Feel free to launch a new run anytime!
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-6 py-2.5 rounded-xl transition-all shadow-md"
            >
              Back to Editor
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPreview;
