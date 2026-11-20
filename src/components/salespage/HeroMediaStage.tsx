import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, X } from 'lucide-react';

export type HeroVideoFitMode = 'auto' | 'portrait' | 'contain' | 'cover';

export type ParsedHeroVideo =
  | { type: 'none' }
  | { type: 'youtube'; id: string; rawUrl: string; isShortHint: boolean }
  | { type: 'vimeo'; id: string; rawUrl: string; isShortHint: boolean }
  | { type: 'direct'; src: string; rawUrl: string; isShortHint: boolean };

export function parseHeroVideoUrl(urlRaw?: string): ParsedHeroVideo {
  const url = (urlRaw || '').trim();
  if (!url) return { type: 'none' };

  // YouTube patterns: watch?v=, youtu.be/, embed/, shorts/
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i
  );
  if (ytMatch?.[1]) {
    const isShortHint = /youtube\.com\/shorts\//i.test(url);
    return { type: 'youtube', id: ytMatch[1], rawUrl: url, isShortHint };
  }

  // Vimeo patterns: vimeo.com/123456789 or player.vimeo.com/video/123456789
  const vimeoMatch = url.match(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/i);
  if (vimeoMatch?.[1]) {
    return { type: 'vimeo', id: vimeoMatch[1], rawUrl: url, isShortHint: false };
  }

  // Direct MP4 / WebM / M4V / OGG / MOV CDN URLs
  if (/^https?:\/\/.+/i.test(url) || url.startsWith('/')) {
    return { type: 'direct', src: url, rawUrl: url, isShortHint: false };
  }

  return { type: 'none' };
}

export function getHeroVideoSourceLabel(urlRaw?: string): string | null {
  const parsed = parseHeroVideoUrl(urlRaw);
  if (parsed.type === 'youtube') {
    return parsed.isShortHint
      ? 'YouTube Shorts Portrait 9:16 (0% beban server — otomatis bingkai portrait tanpa terpotong)'
      : 'YouTube (0% beban server — streaming via CDN YouTube)';
  }
  if (parsed.type === 'vimeo') return 'Vimeo (0% beban server — streaming via CDN Vimeo)';
  if (parsed.type === 'direct') return 'Direct Video CDN (MP4 / WebM — otomatis deteksi Portrait/Landscape)';
  return null;
}

interface HeroVideoEmbedProps {
  video: Exclude<ParsedHeroVideo, { type: 'none' }>;
  posterSrc: string;
  autoplayBackground: boolean;
  isPaused: boolean;
  isMuted: boolean;
  fillMode: 'contain' | 'cover' | 'portrait-stage';
  onDirectError?: () => void;
  onDetectedOrientation?: (isPortrait: boolean) => void;
}

const HeroVideoEmbed: React.FC<HeroVideoEmbedProps> = ({
  video,
  posterSrc,
  autoplayBackground,
  isPaused,
  isMuted,
  fillMode,
  onDirectError,
  onDetectedOrientation,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [iframeReady, setIframeReady] = useState(false);

  useEffect(() => {
    setIframeReady(false);
  }, [video.rawUrl, autoplayBackground, fillMode]);

  // Sync play/pause + auto-pause when scrolled out of viewport to save bandwidth/battery
  useEffect(() => {
    const el = videoRef.current;
    if (!el || video.type !== 'direct') return;

    if (isPaused) {
      el.pause();
      return;
    }

    if (autoplayBackground) {
      el.play().catch(() => {});
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && !isPaused) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [video.type, isPaused, autoplayBackground]);

  useEffect(() => {
    if (videoRef.current && video.type === 'direct') {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted, video.type]);

  const handleIframeLoad = () => {
    if (!autoplayBackground) {
      setIframeReady(true);
      return;
    }
    // Wait briefly so YouTube/Vimeo clears its initial title/spinner overlay before revealing
    window.setTimeout(() => setIframeReady(true), 900);
  };

  if (video.type === 'youtube') {
    const src = autoplayBackground
      ? `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&mute=1&loop=1&playlist=${video.id}&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&cc_load_policy=0`
      : `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;

    // Overscan top & bottom by ~68px each inside overflow-hidden frame to completely hide
    // YouTube's top title bar & bottom YouTube watermark while preserving aspect ratio
    const iframeClass = !autoplayBackground
      ? 'w-full h-full border-0'
      : fillMode === 'portrait-stage'
      ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%+76px)] h-[calc(100%+136px)] max-w-none pointer-events-none border-0 transition-opacity duration-500'
      : fillMode === 'contain'
      ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%+242px)] h-[calc(100%+136px)] max-w-none pointer-events-none border-0 transition-opacity duration-500'
      : 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[calc(100%+242px)] min-h-[calc(100%+140px)] aspect-video w-auto h-auto max-w-none pointer-events-none border-0 transition-opacity duration-500';

    return (
      <iframe
        src={src}
        title="Video Hero Guestly"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={handleIframeLoad}
        className={`${iframeClass} ${autoplayBackground ? (iframeReady ? 'opacity-100' : 'opacity-0') : ''}`}
      />
    );
  }

  if (video.type === 'vimeo') {
    const src = autoplayBackground
      ? `https://player.vimeo.com/video/${video.id}?background=1&autoplay=1&muted=1&loop=1&dnt=1&title=0&byline=0&portrait=0`
      : `https://player.vimeo.com/video/${video.id}?autoplay=1&dnt=1&title=0&byline=0&portrait=0`;

    const iframeClass = !autoplayBackground
      ? 'w-full h-full border-0'
      : fillMode === 'portrait-stage'
      ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%+76px)] h-[calc(100%+136px)] max-w-none pointer-events-none border-0 transition-opacity duration-500'
      : fillMode === 'contain'
      ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%+242px)] h-[calc(100%+136px)] max-w-none pointer-events-none border-0 transition-opacity duration-500'
      : 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[calc(100%+242px)] min-h-[calc(100%+140px)] aspect-video w-auto h-auto max-w-none pointer-events-none border-0 transition-opacity duration-500';

    return (
      <iframe
        src={src}
        title="Video Hero Guestly"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
        onLoad={handleIframeLoad}
        className={`${iframeClass} ${autoplayBackground ? (iframeReady ? 'opacity-100' : 'opacity-0') : ''}`}
      />
    );
  }

  const videoObjectClass =
    fillMode === 'contain' || fillMode === 'portrait-stage'
      ? 'w-full h-full object-contain'
      : 'w-full h-full object-cover object-[50%_20%]';

  return (
    <video
      ref={videoRef}
      src={video.src}
      poster={posterSrc}
      autoPlay={autoplayBackground || !isPaused}
      muted={isMuted}
      loop={autoplayBackground}
      controls={!autoplayBackground}
      playsInline
      preload="metadata"
      onLoadedMetadata={(e) => {
        const el = e.currentTarget;
        if (el.videoWidth > 0 && el.videoHeight > 0 && onDetectedOrientation) {
          onDetectedOrientation(el.videoHeight > el.videoWidth);
        }
      }}
      onError={onDirectError}
      className={videoObjectClass}
    />
  );
};

interface HeroBackgroundMediaProps {
  posterSrc: string;
  fallbackPosterSrc: string;
  videoUrl?: string;
  videoMode: 'autoplay' | 'click';
  videoFit?: HeroVideoFitMode;
  layoutMode?: 'split' | 'fullbg';
  onOpenLightbox: () => void;
  showPlayTrigger?: boolean;
  controlsPosition?: 'bottom-right' | 'top-right';
  children?: React.ReactNode;
}

export const HeroMediaSurface: React.FC<HeroBackgroundMediaProps> = ({
  posterSrc,
  fallbackPosterSrc,
  videoUrl,
  videoMode,
  videoFit = 'auto',
  layoutMode = 'split',
  onOpenLightbox,
  showPlayTrigger = true,
  controlsPosition = 'bottom-right',
}) => {
  const parsed = parseHeroVideoUrl(videoUrl);
  const [imgSrc, setImgSrc] = useState(posterSrc || fallbackPosterSrc);
  const [imgFailed, setImgFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [detectedPortrait, setDetectedPortrait] = useState<boolean>(
    parsed.type !== 'none' ? parsed.isShortHint : false
  );

  useEffect(() => {
    setImgSrc(posterSrc || fallbackPosterSrc);
    setImgFailed(false);
  }, [posterSrc, fallbackPosterSrc]);

  useEffect(() => {
    setVideoFailed(false);
    setIsPaused(false);
    setIsMuted(true);
    setDetectedPortrait(parsed.type !== 'none' ? parsed.isShortHint : false);
  }, [videoUrl, videoMode, parsed.type, parsed.type !== 'none' ? parsed.isShortHint : false]);

  const hasVideo = parsed.type !== 'none' && !videoFailed;
  const shouldAutoplayBg = hasVideo && videoMode === 'autoplay';

  // Resolve effective framing mode:
  // - portrait-stage: 9:16 centered showcase over blurred ambient backdrop (0% crop)
  // - contain: full uncropped frame over blurred ambient backdrop
  // - cover: full-bleed fill (face-safe upper-center focus for direct video)
  const effectiveFillMode: 'portrait-stage' | 'contain' | 'cover' = (() => {
    if (videoFit === 'portrait') return 'portrait-stage';
    if (videoFit === 'contain') return 'contain';
    if (videoFit === 'cover') return 'cover';
    // Auto mode:
    if (detectedPortrait) return 'portrait-stage';
    // In Split mode, avoid aggressive cropping by defaulting to uncropped fit;
    // in Full Background mode, fill cleanly edge-to-edge.
    return layoutMode === 'fullbg' ? 'cover' : 'contain';
  })();

  const usesAmbientBackdrop =
    shouldAutoplayBg && (effectiveFillMode === 'portrait-stage' || effectiveFillMode === 'contain');

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#1D161A]">
      {/* Poster Image Layer (crisp when no autoplay video, or blurred ambient fill behind portrait/contain video) */}
      {!imgFailed ? (
        <img
          src={imgSrc}
          alt="Suasana penyambutan tamu resepsi menggunakan Guestly"
          referrerPolicy="no-referrer"
          onError={() => {
            if (imgSrc !== fallbackPosterSrc) {
              setImgSrc(fallbackPosterSrc);
            } else {
              setImgFailed(true);
            }
          }}
          className={
            usesAmbientBackdrop
              ? 'w-full h-full object-cover scale-110 blur-2xl opacity-55 transition-all duration-500'
              : 'w-full h-full object-cover object-[50%_22%]'
          }
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-[#3A1724] via-[#1B1418] to-[#2B1720]" />
      )}

      {/* Subtle ambient vignette when showing portrait/contain video so sides look rich & editorial */}
      {usesAmbientBackdrop && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#2B121B]/65 via-[#181316]/55 to-[#181316]/75"
        />
      )}

      {/* Ambient Autoplay Background Video Layer */}
      {shouldAutoplayBg && (
        <>
          {effectiveFillMode === 'portrait-stage' ? (
            <div
              className={`absolute inset-0 flex items-center p-3 sm:p-4 ${
                layoutMode === 'fullbg'
                  ? 'justify-center lg:justify-end lg:pr-[9%]'
                  : 'justify-center'
              }`}
            >
              <div className="relative h-full max-h-full aspect-[9/16] max-w-full rounded-xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/20">
                <HeroVideoEmbed
                  video={parsed}
                  posterSrc={imgSrc}
                  autoplayBackground={true}
                  isPaused={isPaused}
                  isMuted={isMuted}
                  fillMode="portrait-stage"
                  onDirectError={() => setVideoFailed(true)}
                  onDetectedOrientation={(isPortrait) => setDetectedPortrait(isPortrait)}
                />
              </div>
            </div>
          ) : effectiveFillMode === 'contain' ? (
            <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-3">
              <div
                className={`relative overflow-hidden rounded-xl bg-black/80 shadow-xl ring-1 ring-white/15 ${
                  parsed.type === 'direct'
                    ? 'w-full h-full'
                    : 'w-full max-h-full aspect-video'
                }`}
              >
                <HeroVideoEmbed
                  video={parsed}
                  posterSrc={imgSrc}
                  autoplayBackground={true}
                  isPaused={isPaused}
                  isMuted={isMuted}
                  fillMode="contain"
                  onDirectError={() => setVideoFailed(true)}
                  onDetectedOrientation={(isPortrait) => setDetectedPortrait(isPortrait)}
                />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 overflow-hidden">
              <HeroVideoEmbed
                video={parsed}
                posterSrc={imgSrc}
                autoplayBackground={true}
                isPaused={isPaused}
                isMuted={isMuted}
                fillMode="cover"
                onDirectError={() => setVideoFailed(true)}
                onDetectedOrientation={(isPortrait) => setDetectedPortrait(isPortrait)}
              />
            </div>
          )}
        </>
      )}

      {/* Ambient Controls for Autoplay Direct Video */}
      {shouldAutoplayBg && parsed.type === 'direct' && (
        <div
          className={`absolute z-20 flex items-center gap-1.5 ${
            controlsPosition === 'top-right' ? 'top-3.5 right-3.5' : 'bottom-4 right-4'
          }`}
        >
          <button
            type="button"
            aria-label={isPaused ? 'Putar video' : 'Jeda video'}
            onClick={() => setIsPaused((p) => !p)}
            className="w-9 h-9 rounded-lg bg-[#181316]/72 hover:bg-[#181316]/90 backdrop-blur-md border border-white/15 text-white inline-flex items-center justify-center transition-colors"
          >
            {isPaused ? <Play className="w-4 h-4 fill-white" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            type="button"
            aria-label={isMuted ? 'Aktifkan suara' : 'Bisukan suara'}
            onClick={() => setIsMuted((m) => !m)}
            className="w-9 h-9 rounded-lg bg-[#181316]/72 hover:bg-[#181316]/90 backdrop-blur-md border border-white/15 text-white inline-flex items-center justify-center transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      )}

      {/* Facade Play Trigger for Click-to-Play Mode */}
      {hasVideo && videoMode === 'click' && showPlayTrigger && (
        <button
          type="button"
          onClick={onOpenLightbox}
          aria-label="Putar video preview Guestly"
          className="group absolute inset-0 z-10 flex items-center justify-center bg-[#181316]/20 hover:bg-[#181316]/32 transition-colors focus-visible:outline-none"
        >
          <span className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-[#181316]/78 group-hover:bg-[#8C3A50] backdrop-blur-md border border-white/25 text-white text-[14px] font-semibold shadow-lg transition-all duration-200 group-hover:scale-[1.03]">
            <Play className="w-4 h-4 fill-white shrink-0" />
            <span>Putar Video</span>
          </span>
        </button>
      )}
    </div>
  );
};

interface HeroVideoLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl?: string;
  posterSrc: string;
  videoFit?: HeroVideoFitMode;
  title?: string;
}

export const HeroVideoLightbox: React.FC<HeroVideoLightboxProps> = ({
  isOpen,
  onClose,
  videoUrl,
  posterSrc,
  videoFit = 'auto',
  title = 'Video Preview Guestly',
}) => {
  const parsed = parseHeroVideoUrl(videoUrl);
  const [detectedPortrait, setDetectedPortrait] = useState<boolean>(
    parsed.type !== 'none' ? parsed.isShortHint : false
  );

  useEffect(() => {
    setDetectedPortrait(parsed.type !== 'none' ? parsed.isShortHint : false);
  }, [videoUrl, parsed.type, parsed.type !== 'none' ? parsed.isShortHint : false]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || parsed.type === 'none') return null;

  const isPortraitModal = videoFit === 'portrait' || (videoFit === 'auto' && detectedPortrait);

  return (
    <div
      className="fixed inset-0 z-[70] bg-[#140F12]/88 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className={`relative w-full rounded-2xl overflow-hidden bg-black border border-white/15 shadow-2xl flex flex-col ${
          isPortraitModal ? 'max-w-[380px] sm:max-w-[420px]' : 'max-w-4xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-[#181316] border-b border-white/10 shrink-0 gap-3">
          <span className="text-[13px] font-medium text-[#E5DFE2] truncate">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup video"
            className="w-8 h-8 rounded-lg text-[#C7BFC3] hover:text-white hover:bg-white/10 inline-flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={`w-full bg-black ${
            isPortraitModal ? 'aspect-[9/16] max-h-[80vh]' : 'aspect-video'
          }`}
        >
          <HeroVideoEmbed
            video={parsed}
            posterSrc={posterSrc}
            autoplayBackground={false}
            isPaused={false}
            isMuted={false}
            fillMode={isPortraitModal ? 'portrait-stage' : 'contain'}
            onDetectedOrientation={(isPortrait) => setDetectedPortrait(isPortrait)}
          />
        </div>
      </div>
    </div>
  );
};
