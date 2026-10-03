"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import {
  demoBattleStatus,
  demoEndBattle,
  demoStartBattleNow,
} from "@/lib/demo/controls";
import { exitDemo, isDemoMode, resetDemo } from "@/lib/demo/mode";

// Shown on every page while the private demo is on.
export function DemoBanner() {
  const { t } = useLanguage();
  const [active, setActive] = useState(false);
  const [battle, setBattle] = useState<"active" | "scheduled">("scheduled");

  useEffect(() => {
    const checkId = window.setTimeout(() => {
      const demo = isDemoMode();
      setActive(demo);
      if (demo) setBattle(demoBattleStatus());
    }, 0);
    return () => window.clearTimeout(checkId);
  }, []);

  if (!active) return null;

  return (
    <div className="demo-banner" role="status">
      <strong>{t("Private demo")}</strong>
      <span>
        {t(
          "Fake players and data that live only in this browser. Nothing is saved to your state.",
        )}
      </span>
      <div className="demo-banner-actions">
        {battle === "scheduled" ? (
          <button
            type="button"
            onClick={() => {
              demoStartBattleNow();
              window.location.reload();
            }}
          >
            {t("Start the battle now")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              demoEndBattle("win");
              window.location.reload();
            }}
          >
            {t("End the battle")}
          </button>
        )}
        <button
          type="button"
          className="secondary-link"
          onClick={() => {
            if (window.confirm(t("Reset the demo to its starting data?"))) {
              resetDemo();
            }
          }}
        >
          {t("Reset demo")}
        </button>
        <button type="button" className="secondary-link" onClick={exitDemo}>
          {t("Exit demo")}
        </button>
      </div>
    </div>
  );
}
