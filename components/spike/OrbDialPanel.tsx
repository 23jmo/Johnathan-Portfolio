"use client";

/**
 * SPIKE — the dial panel for the WebGL orb.
 *
 * Deliberately plain `<input>`s rather than the `dialkit` package the rest of
 * the repo uses. `dialkit` mounts its own floating panel into the layout, and
 * the spike covers the layout at `z-[10000]`; rendering the controls INSIDE the
 * spike's own stacking context sidesteps that entirely and keeps the page
 * self-contained.
 *
 * Values are lifted to the parent because the render loop reads them from a ref
 * every frame. A dial drag must not re-render sixty times a second, so the
 * parent mirrors state into a ref and the loop never touches React at all.
 */

import { useState } from "react";
import {
  ORB_COLOUR_DEFAULTS,
  ORB_DIAL_DEFAULTS,
  ORB_DIAL_GROUPS,
  type OrbColours,
  type OrbDialValues,
  formatDialKit,
} from "./orbDialKit";

export default function OrbDialPanel({
  values,
  colours,
  onChange,
  onColourChange,
  onReset,
}: {
  values: OrbDialValues;
  colours: OrbColours;
  onChange: (key: string, value: number) => void;
  onColourChange: (key: keyof OrbColours, value: string) => void;
  onReset: () => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>("Optics");
  const [copied, setCopied] = useState(false);

  const copyKit = async () => {
    try {
      await navigator.clipboard.writeText(formatDialKit(values, colours));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard access can be refused outright; the console is a fine
      // fallback for a dev-only panel and beats silently doing nothing.
      console.log(formatDialKit(values, colours));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  };

  const changedCount = Object.keys(ORB_DIAL_DEFAULTS).filter(
    (key) => values[key] !== ORB_DIAL_DEFAULTS[key]
  ).length;

  return (
    <div className="flex max-h-[calc(100vh-2rem)] w-72 flex-col overflow-hidden rounded-xl border border-border bg-background/85 font-mono text-[11px] text-foreground backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-semibold">orb dials</span>
        <span className="text-muted">
          {changedCount > 0 ? `${changedCount} moved` : "defaults"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {ORB_DIAL_GROUPS.map((group) => {
          const open = openGroup === group.title;
          return (
            <div key={group.title} className="border-b border-border/60">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-foreground/5"
                onClick={() => setOpenGroup(open ? null : group.title)}
              >
                <span>{group.title}</span>
                <span className="text-muted">{open ? "−" : "+"}</span>
              </button>

              {open && (
                <div className="px-3 pb-3">
                  <p className="mb-2 text-[10px] leading-snug text-muted">
                    {group.blurb}
                  </p>

                  {group.dials.map((spec) => {
                    const moved = values[spec.key] !== ORB_DIAL_DEFAULTS[spec.key];
                    return (
                      <label
                        key={spec.key}
                        className="mb-1.5 block"
                        title={spec.hint}
                      >
                        <span className="flex justify-between">
                          <span className={moved ? "text-foreground" : "text-muted"}>
                            {spec.label}
                          </span>
                          <span className={moved ? "text-foreground" : "text-muted"}>
                            {values[spec.key]}
                          </span>
                        </span>
                        <input
                          className="w-full"
                          type="range"
                          min={spec.min}
                          max={spec.max}
                          step={spec.step}
                          value={values[spec.key]}
                          onChange={(event) =>
                            onChange(spec.key, Number(event.target.value))
                          }
                        />
                      </label>
                    );
                  })}

                  {group.title === "Surface" && (
                    <div className="mt-2 space-y-1">
                      {(
                        Object.keys(ORB_COLOUR_DEFAULTS) as (keyof OrbColours)[]
                      ).map((key) => (
                        <label
                          key={key}
                          className="flex items-center justify-between"
                        >
                          <span className="text-muted">{key} colour</span>
                          <input
                            type="color"
                            className="h-5 w-10 cursor-pointer bg-transparent"
                            value={colours[key]}
                            onChange={(event) =>
                              onColourChange(key, event.target.value)
                            }
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          className="rounded border border-border px-2 py-1 hover:bg-foreground/5"
          onClick={copyKit}
        >
          {copied ? "copied" : "copy"}
        </button>
        <button
          type="button"
          className="rounded border border-border px-2 py-1 hover:bg-foreground/5"
          onClick={onReset}
        >
          reset
        </button>
      </div>
    </div>
  );
}
