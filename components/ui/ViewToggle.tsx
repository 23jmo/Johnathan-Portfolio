"use client";

import { motion } from "framer-motion";

interface ViewToggleProps {
  activeView: "me" | "builds";
  onViewChange: (view: "me" | "builds") => void;
}

export default function ViewToggle({
  activeView,
  onViewChange,
}: ViewToggleProps) {
  const tabs = [
    { key: "me" as const, label: "Me" },
    { key: "builds" as const, label: "Builds" },
  ];

  return (
    <div className="flex items-center gap-2">
      {tabs.map((tab, index) => (
        <span key={tab.key} className="flex items-center gap-2">
          {index > 0 && <span className="text-muted/40 text-sm">/</span>}
          <button
            onClick={() => onViewChange(tab.key)}
            className="relative pb-1 text-sm transition-colors duration-200"
          >
            <span
              className={
                activeView === tab.key
                  ? "text-foreground/80"
                  : "text-muted/60 hover:text-muted"
              }
            >
              {tab.label}
            </span>
            {activeView === tab.key && (
              <motion.div
                layoutId="viewToggleUnderline"
                className="absolute bottom-0 left-0 right-0 h-px bg-foreground/30"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        </span>
      ))}
    </div>
  );
}
