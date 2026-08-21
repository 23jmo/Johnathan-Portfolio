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
  CLOSE_FLY_SPRING,
  CLOSE_OVERLAP_TRIGGER,
  CLOSE_PROGRESS_SPRING,
  COMMIT_VELOCITY_MAX,
  FLY_OVERLAP_TRIGGER,
  FLY_SPRING,
  PROGRESS_SPRING,
  REVERSING_WATCHDOG_MS,
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
   * Spike the screen-framing glow, then spring it back to 0. Called on every
   * keystroke (small `strength`) and harder on space, so the Apple-Intelligence
   * border visibly reacts to typing. Spikes accumulate when typing fast. Also
   * fired at full strength on commit as the visual counterpart to playCommit().
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

  /**
   * Commit → two OVERLAPPED spring beats:
   *   1. `progress` → 1: finish warping the page into a COMPLETE circle.
   *   2. `fly` → 1: send that circle flying down + shrinking into the chip slot,
   *      launched the moment progress crosses FLY_OVERLAP_TRIGGER — NOT at
   *      numerical rest — so the circle never visibly stalls between beats.
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
      pulse(1); // visual commit flash to pair with the audio cue

      let flyStarted = false;
      const startFly = () => {
        if (flyStarted) return;
        flyStarted = true;
        flyRef.current = animate(fly, 1, {
          ...FLY_SPRING,
          onComplete: () => setPhase("chat"),
        });
      };

      // Carry the gesture's momentum into the commit spring so a fast flick
      // doesn't freeze-then-restart. Clamped: wheel deltas can spike velocity
      // to 10–20 units/s; negatives (easing back at release) carry nothing.
      const launchVelocity = Math.min(
        Math.max(progress.getVelocity(), 0),
        COMMIT_VELOCITY_MAX
      );

      // Immediate-commit path (full pull → ratio already ≥ trigger): the spring
      // below animates ~1→1 and may never fire onUpdate, so check up front.
      if (progress.get() >= FLY_OVERLAP_TRIGGER) startFly();

      warpRef.current = animate(progress, 1, {
        ...PROGRESS_SPRING,
        velocity: launchVelocity,
        // onUpdate dies with warpRef.current.stop(), so cancellation is free —
        // no subscription to clean up in close()/the next open()/unmount.
        onUpdate: (latest) => {
          if (latest >= FLY_OVERLAP_TRIGGER) startFly();
        },
        onComplete: startFly, // fallback; no-op if the overlap already fired
      });
    },
    [pathname, progress, fly, reducedMotion, pulse]
  );

  /**
   * Reverse the commit, also overlapped: fly the chip back toward center, and
   * once `fly` falls to CLOSE_OVERLAP_TRIGGER start unwarping the page too.
   * Phase flips to "idle" only when BOTH springs have completed — premature
   * idle would re-arm the gesture and unlock body scroll mid-frame.
   */
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

    let unwindStarted = false;
    let flyDone = false;
    let progressDone = false;
    const maybeIdle = () => {
      if (flyDone && progressDone) setPhase("idle");
    };
    const startUnwind = () => {
      if (unwindStarted) return;
      unwindStarted = true;
      warpRef.current = animate(progress, 0, {
        ...CLOSE_PROGRESS_SPRING,
        onComplete: () => {
          progressDone = true;
          maybeIdle();
        },
      });
    };

    // Closing mid-"warping" (fly still near 0) → unwind progress immediately.
    if (fly.get() <= CLOSE_OVERLAP_TRIGGER) startUnwind();

    flyRef.current = animate(fly, 0, {
      ...CLOSE_FLY_SPRING,
      onUpdate: (latest) => {
        if (latest <= CLOSE_OVERLAP_TRIGGER) startUnwind();
      },
      onComplete: () => {
        flyDone = true;
        startUnwind(); // fallback; no-op if the overlap already fired
        maybeIdle();
      },
    });
  }, [progress, fly, reducedMotion]);

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
      // Survives flushes, unlike textBuffer, so an error arriving mid-answer
      // can tell whether the visitor already sees partial text.
      let streamedText = "";

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
                case "text": {
                  const delta = String(event.value ?? "");
                  textBuffer += delta;
                  streamedText += delta;
                  scheduleFlush();
                  break;
                }
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
                case "error": {
                  // The route sends visitor-safe prose (never raw provider
                  // JSON). Lead with it when nothing streamed; otherwise
                  // append it as an aside after the partial answer.
                  const notice = String(event.message);
                  const hasPartialAnswer = streamedText.trim().length > 0;
                  textBuffer += hasPartialAnswer ? `\n\n_${notice}_` : notice;
                  scheduleFlush();
                  break;
                }
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

  // Exit backstop. "idle" normally arrives via close()'s two spring
  // onCompletes, but a spring interrupted mid-flight (HMR remount cleanup, a
  // stray value.stop(), a competing animation on the same value) would strand
  // the phase at "reversing" forever: body locked, gesture dead, warp styles
  // cooked on the page. Two independent recoveries:
  //   1. Promote to idle the moment both values are actually at rest —
  //      value-driven, so it works no matter which callback got dropped.
  //   2. A hard watchdog: reversing may never outlive REVERSING_WATCHDOG_MS
  //      (normal exit is ~350–550ms); past it, force both values to 0 and
  //      exit. The forced set() also fires the change events PageWarp needs
  //      to clear its inline styles.
  useEffect(() => {
    if (phase !== "reversing") return;
    const settle = () => {
      if (progress.get() <= 0.001 && fly.get() <= 0.001) setPhase("idle");
    };
    settle();
    const unsubProgress = progress.on("change", settle);
    const unsubFly = fly.on("change", settle);
    const watchdog = window.setTimeout(() => {
      warpRef.current?.stop();
      flyRef.current?.stop();
      progress.set(0);
      fly.set(0);
      setPhase("idle");
    }, REVERSING_WATCHDOG_MS);
    return () => {
      unsubProgress();
      unsubFly();
      window.clearTimeout(watchdog);
    };
  }, [phase, progress, fly]);

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
