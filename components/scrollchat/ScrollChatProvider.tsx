"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  animate,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import type { ChatMessage, Citation, PageContext } from "@/types";
import {
  PROGRESS_SPRING,
  pageContextFromPath,
  type ScrollChatPhase,
} from "@/lib/scrollchat/state";
import { playCommit, playReverse } from "@/lib/scrollchat/audio";
import { getStoredName, storeName } from "@/lib/scrollchat/identity";

interface ScrollChatContextValue {
  phase: ScrollChatPhase;
  /** 0..1 gesture/warp progress; single source of truth, drives the warp. */
  progress: MotionValue<number>;
  /**
   * 0..1 "fly" progress, animated AFTER `progress` reaches 1 on commit. It sends
   * the completed page-circle down + shrinking into the chip slot — the second
   * beat of the commit ("teleport to a full circle, then fly into the chat").
   */
  fly: MotionValue<number>;
  /**
   * Transient 0..~1 energy that spikes on every keystroke (harder on space) and
   * springs back to 0. The screen-framing glow reads it to "pulse" while typing,
   * so the Apple-Intelligence border feels alive and responsive.
   */
  glowPulse: MotionValue<number>;
  pageContext: PageContext | null;
  reducedMotion: boolean;
  /** Commit the gesture (or the "Ask my AI" button) → warp into the chat. */
  open: (context?: PageContext) => void;
  /** Reverse out of the chat back to the page. */
  close: () => void;
  /** Spike the screen glow (call on keystroke; bigger `strength` on space). */
  pulse: (strength?: number) => void;

  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  userName: string | null;
  /** True until the visitor provides a name (the first-use gate). */
  needsName: boolean;
  setUserName: (name: string) => void;
  sendMessage: (text: string) => void;
}

const ScrollChatContext = createContext<ScrollChatContextValue | null>(null);

export function useScrollChat(): ScrollChatContextValue {
  const ctx = useContext(ScrollChatContext);
  if (!ctx) {
    throw new Error("useScrollChat must be used within <ScrollChatProvider>");
  }
  return ctx;
}

let messageSeq = 0;
const nextId = () => `m${++messageSeq}-${Math.round(performance.now())}`;

export default function ScrollChatProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion() ?? false;
  const progress = useMotionValue(0);
  const fly = useMotionValue(0);
  const glowPulse = useMotionValue(0);

  const [phase, setPhase] = useState<ScrollChatPhase>("idle");
  const [pageContext, setPageContext] = useState<PageContext | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [userName, setUserNameState] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);

  /** Handles to running springs so a re-trigger can hand off / cancel cleanly. */
  const warpRef = useRef<ReturnType<typeof animate> | null>(null);
  const flyRef = useRef<ReturnType<typeof animate> | null>(null);
  const glowDecayRef = useRef<ReturnType<typeof animate> | null>(null);

  // Load the stored name once on mount.
  useEffect(() => {
    const stored = getStoredName();
    setUserNameState(stored);
    setNeedsName(!stored);
  }, []);

  /**
   * Commit → two spring beats:
   *   1. `progress` → 1: finish warping the page into a COMPLETE circle.
   *   2. `fly` → 1: send that circle flying down + shrinking into the chip slot.
   * Phase flips to "chat" only once the circle has landed as the chip.
   */
  const open = useCallback(
    (context?: PageContext) => {
      warpRef.current?.stop();
      flyRef.current?.stop();
      setPageContext(context ?? pageContextFromPath(pathname ?? "/"));
      playCommit();

      if (reducedMotion) {
        progress.set(1);
        fly.set(1);
        setPhase("chat");
        return;
      }
      setPhase("warping");
      warpRef.current = animate(progress, 1, {
        ...PROGRESS_SPRING,
        onComplete: () => {
          flyRef.current = animate(fly, 1, {
            type: "spring",
            stiffness: 260,
            damping: 26,
            restDelta: 0.001,
            onComplete: () => setPhase("chat"),
          });
        },
      });
    },
    [pathname, progress, fly, reducedMotion]
  );

  /** Reverse the commit: fly the chip back to center, then unwarp to the page. */
  const close = useCallback(() => {
    warpRef.current?.stop();
    flyRef.current?.stop();
    playReverse();

    if (reducedMotion) {
      fly.set(0);
      progress.set(0);
      setPhase("idle");
      return;
    }
    setPhase("reversing");
    flyRef.current = animate(fly, 0, {
      type: "spring",
      stiffness: 300,
      damping: 30,
      restDelta: 0.001,
      onComplete: () => {
        warpRef.current = animate(progress, 0, {
          ...PROGRESS_SPRING,
          onComplete: () => setPhase("idle"),
        });
      },
    });
  }, [progress, fly, reducedMotion]);

  /**
   * Spike the screen-framing glow, then spring it back to 0. Called on every
   * keystroke (small `strength`) and harder on space, so the Apple-Intelligence
   * border visibly reacts to typing. Spikes accumulate when typing fast.
   */
  const pulse = useCallback(
    (strength = 0.35) => {
      glowDecayRef.current?.stop();
      glowPulse.set(Math.min(1.3, glowPulse.get() + strength));
      glowDecayRef.current = animate(glowPulse, 0, {
        type: "spring",
        stiffness: 170,
        damping: 20,
        restDelta: 0.002,
      });
    },
    [glowPulse]
  );

  const setUserName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    storeName(trimmed);
    setUserNameState(trimmed);
    setNeedsName(false);
  }, []);

  /**
   * Send a user message and stream the assistant's reply from /api/chat.
   * Text deltas are coalesced via rAF so we re-render at frame cadence rather
   * than once per token.
   */
  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMessage: ChatMessage = {
        id: nextId(),
        role: "user",
        content: trimmed,
      };
      const assistantId = nextId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        pending: true,
      };

      // Build the transcript to send (prior turns + this user turn).
      const priorTranscript = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      let textBuffer = "";
      let rafScheduled = false;

      const flush = () => {
        rafScheduled = false;
        if (!textBuffer) return;
        const chunk = textBuffer;
        textBuffer = "";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        );
      };

      const scheduleFlush = () => {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(flush);
      };

      const patchAssistant = (patch: (m: ChatMessage) => ChatMessage) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? patch(m) : m))
        );
      };

      (async () => {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: priorTranscript,
              name: userName,
              pageContext,
            }),
          });

          if (!res.body) throw new Error("No response stream");

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const block of events) {
              const line = block.trim();
              if (!line.startsWith("data:")) continue;
              const json = line.slice(5).trim();
              if (!json) continue;

              let event: Record<string, unknown>;
              try {
                event = JSON.parse(json);
              } catch {
                continue;
              }

              switch (event.type) {
                case "text":
                  textBuffer += String(event.value ?? "");
                  scheduleFlush();
                  break;
                case "citation": {
                  const citation: Citation = {
                    n: Number(event.n),
                    sourceId: String(event.sourceId),
                    label: String(event.label),
                    href: String(event.href),
                    external: Boolean(event.external),
                  };
                  patchAssistant((m) => ({
                    ...m,
                    citations: [...(m.citations ?? []), citation],
                  }));
                  break;
                }
                case "youtube":
                  patchAssistant((m) => ({
                    ...m,
                    youtube: (event.videos as ChatMessage["youtube"]) ?? [],
                  }));
                  break;
                case "a2ui":
                  patchAssistant((m) => ({
                    ...m,
                    a2uiSurfaces: [
                      ...(m.a2uiSurfaces ?? []),
                      String(event.surface ?? ""),
                    ],
                  }));
                  break;
                case "error":
                  textBuffer += `\n\n_(${String(event.message)})_`;
                  scheduleFlush();
                  break;
                case "done":
                default:
                  break;
              }
            }
          }
        } catch (err) {
          patchAssistant((m) => ({
            ...m,
            content:
              m.content ||
              "Sorry — I couldn't reach my brain just now. Try again in a moment.",
          }));
          void err;
        } finally {
          flush();
          patchAssistant((m) => ({ ...m, pending: false }));
          setIsStreaming(false);
        }
      })();
    },
    [isStreaming, messages, userName, pageContext]
  );

  // Publish high-level state + live handles for console diagnosis / QA
  // (window.__scrollchat.{state,progress,open,close}). The `progress` MotionValue
  // can be `.set(0..1)` to freeze the warp at any point for inspection.
  // DEV-ONLY: never expose these debug handles (incl. open/close) in production.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as Window & { __scrollchat?: Record<string, unknown> };
    w.__scrollchat = {
      ...(w.__scrollchat ?? {}),
      state: { phase, reducedMotion, progress: progress.get(), fly: fly.get() },
      progress,
      fly,
      glowPulse,
      open,
      close,
      pulse,
    };
  }, [phase, reducedMotion, progress, fly, glowPulse, open, close, pulse]);

  // Lock body scroll whenever the chat is engaged (any non-idle phase).
  useEffect(() => {
    const locked = phase !== "idle";
    document.body.classList.toggle("scrollchat-locked", locked);
    return () => {
      document.body.classList.remove("scrollchat-locked");
    };
  }, [phase]);

  useEffect(
    () => () => {
      warpRef.current?.stop();
      flyRef.current?.stop();
      glowDecayRef.current?.stop();
    },
    []
  );

  return (
    <ScrollChatContext.Provider
      value={{
        phase,
        progress,
        fly,
        glowPulse,
        pageContext,
        reducedMotion,
        open,
        close,
        pulse,
        messages,
        isStreaming,
        userName,
        needsName,
        setUserName,
        sendMessage,
      }}
    >
      {children}
    </ScrollChatContext.Provider>
  );
}
