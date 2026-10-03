"use client";

import { AppHeader } from "@/components/AppHeader";
import { useBattle } from "@/components/BattleProvider";
import { useLanguage } from "@/components/LanguageProvider";
import {
  IncomingRallies,
  ReinforcementSchedule,
  ReinforcementSettings,
} from "@/components/ReinforcementPanel";
import { useReinforcementTiming } from "@/hooks/useReinforcementTiming";

export default function GarrisonPage() {
  const { t } = useLanguage();
  const { rallies, currentTime } = useBattle();
  const timing = useReinforcementTiming(rallies, currentTime);

  return (
    <main>
      <AppHeader />
      <section>
        <h2>{t("Your reinforcement setup")}</h2>
        <ReinforcementSettings timing={timing} />
      </section>

      <section>
        <h2>{t("When to send")}</h2>
        <ReinforcementSchedule timing={timing} />
      </section>

      <section>
        <h2>{t("Incoming rally schedule")}</h2>
        <IncomingRallies rallies={rallies} />
      </section>
    </main>
  );
}
