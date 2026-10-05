"use client";

import Image from "next/image";
import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { type VideoGuide, youtubeUrl } from "@/lib/videoGuides";

// A YouTube thumbnail that turns into the privacy-enhanced player on play,
// so nothing loads from YouTube until someone asks for the video.
export function VideoGuidePlayer({ video }: { video: VideoGuide }) {
  const { t } = useLanguage();
  const [playing, setPlaying] = useState(false);
  const title = t(video.title);

  return (
    <article className="video-guide">
      <div className="video-guide-frame">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="video-guide-poster"
            onClick={() => setPlaying(true)}
            aria-label={t("Play video: {title}", { title })}
          >
            <Image
              src={`https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`}
              alt=""
              fill
              sizes="(max-width: 760px) 100vw, 50vw"
              unoptimized
            />
            <span className="video-guide-play" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path d="M8 5v14l11-7z" fill="currentColor" />
              </svg>
            </span>
            <span className="video-guide-length">{video.length}</span>
          </button>
        )}
      </div>
      <h3>{title}</h3>
      <p>{t(video.description)}</p>
      <a href={youtubeUrl(video.youtubeId)} target="_blank" rel="noopener noreferrer">
        {t("Watch on YouTube")}
      </a>
    </article>
  );
}
