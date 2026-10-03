"use client";

import { useEffect, useRef } from "react";
import { useLanguage } from "@/components/LanguageProvider";

// The one-minute tour, recorded from the demo. Plays muted while it is on
// screen; people who prefer reduced motion start it themselves.
export function LandingVideo() {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);

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
        >
          <source src="/video/overwatch-tour.webm" type="video/webm" />
          <source src="/video/overwatch-tour.mp4" type="video/mp4" />
        </video>
      </div>
    </section>
  );
}
