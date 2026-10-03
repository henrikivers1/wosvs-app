"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { LandingPage } from "@/components/LandingPage";
import { useStates } from "@/components/StateProvider";
import { useLanguage } from "@/components/LanguageProvider";

export default function Home() {
  const { t } = useLanguage();
  const { activeMembership, signedIn, loadingStates } = useStates();

  if (signedIn === null || loadingStates) {
    return (
      <main>
        <AppHeader />
        <section className="loading-panel">
          <p>{t("Loading...")}</p>
        </section>
      </main>
    );
  }

  if (!signedIn) return <LandingPage />;

  // Members land on Overwatch (their SvS, vote and assignment); players
  // without a state on Account, where adding a WOS ID sends the join request.
  return (
    <main>
      <AppHeader />
      <RedirectTo href={activeMembership ? "/state/overwatch" : "/account"} />
      <section className="loading-panel">
        <p>{t("Loading...")}</p>
      </section>
    </main>
  );
}

function RedirectTo({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  return null;
}
