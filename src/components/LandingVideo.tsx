"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { YOUTUBE_CHANNEL } from "@/lib/videoGuides";

// The one-minute tour, recorded from the demo with narration and music.
// Browsers only autoplay muted video, so it plays silently while on screen
// and "Sound on" restarts it with sound. People who prefer reduced motion
// start it themselves.
export function LandingVideo() {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  function soundOn() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.currentTime = 0;
    void video.play().catch(() => {});
  }

  return (
    <section className="landing-section landing-video-section">
      <p className="section-label">{t("One minute tour")}</p>
      <h2>{t("Watch a whole SvS run itself")}</h2>
      <p className="landing-video-lead">
        {t(
          "Recorded in the demo: the plan builds and publishes itself, coordinators call two enemy rallies, and the garrison gets its countdown to land between them.",
        )}
      </p>
      <div className="landing-video-frame">
        <video
          ref={videoRef}
          className="landing-video"
          poster="/video/overwatch-tour-poster.jpg"
          muted
          loop
          playsInline
          controls
          preload="none"
          aria-label={t("One minute tour of Overwatch")}
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        >
          <source src="/video/overwatch-tour.webm" type="video/webm" />
          <source src="/video/overwatch-tour.mp4" type="video/mp4" />
        </video>
      </div>
      {muted && (
          <button type="button" className="landing-video-sound" onClick={soundOn}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
            {t("Play with sound")}
          </button>
      )}
      <p className="landing-video-more">
        <Link href="/guides#videos">{t("Watch the video guides")}</Link>
        <span aria-hidden="true"> · </span>
        <a href={YOUTUBE_CHANNEL} target="_blank" rel="noopener noreferrer">
          {t("Our YouTube channel")}
        </a>
      </p>
    </section>
  );
}
