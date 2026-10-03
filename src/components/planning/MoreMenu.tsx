"use client";

import { useEffect, useRef } from "react";
import { useLanguage } from "@/components/LanguageProvider";

export type MoreMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

// A "⋯" button with the actions that are rarely needed.
export function MoreMenu({
  items,
  label,
}: {
  items: MoreMenuItem[];
  label?: string;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function close(event: PointerEvent | KeyboardEvent) {
      const menu = ref.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") menu.open = false;
        return;
      }
      if (!menu.contains(event.target as Node)) menu.open = false;
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="more-menu">
      <summary aria-label={label ?? t("More actions")}>
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className="more-menu-list" role="menu">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={item.danger ? "danger" : undefined}
            disabled={item.disabled}
            onClick={() => {
              if (ref.current) ref.current.open = false;
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
