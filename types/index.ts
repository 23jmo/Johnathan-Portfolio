export interface Experience {
  title: string;
  company: string;
  logo: string;
  date: string;
  description: string;
  link?: string;
  logoScale?: number;
  logoBackground?: string;
}

export interface Project {
  name: string;
  language: string;
  description: string;
  link: string;
  logo: string;
  isPrivate?: boolean;
  techStack: string[];
  date?: string;
  image?: string;
}

export interface Hackathon {
  name: string;
  projectName: string;
  icon: string;
  link?: string;
  description: string;
  techStack: string[];
  isWinner?: boolean;
  awards?: { name: string; prize?: string }[];
  image?: string;
}

export interface Education {
  school: string;
  logo: string;
  degree: string;
  gpa: string;
  date: string;
  link?: string;
  logoBackground?: string;
  logoScale?: number;
}

export interface SocialLink {
  name: string;
  url: string;
  icon: string;
}

export interface Award {
  title: string;
  description: string;
  icon?: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  content: string;
}

export interface NotesDoc {
  slug: string;
  title: string;
  date: string;
  tags?: string[];
  summary?: string;
  draft?: boolean;
  content: string;
}

export interface TocItem {
  id: string;
  text: string;
  depth: number;
}

/* ── Scroll-to-AI-Chat ─────────────────────────────────────────── */

/** A grounded source the AI can cite — maps a stable id to a destination. */
export interface Source {
  id: string;
  label: string;
  /** In-site anchor (e.g. "/#projects") or external URL. */
  href: string;
  /** Whether href points off-site (controls target/rel + icon). */
  external?: boolean;
}

/** A citation attached to an assistant message, referencing a Source by id. */
export interface Citation {
  /** Inline marker number, e.g. the `2` in `[2]`. */
  n: number;
  sourceId: string;
  label: string;
  href: string;
  external?: boolean;
}

/** An inline YouTube video rendered in a chat message. */
export interface ChatYouTubeVideo {
  videoId: string;
  title: string;
  thumbnail?: string;
  viewCount?: string;
}

/** One message in the chat transcript. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** Markdown text content (assistant streams into this). */
  content: string;
  citations?: Citation[];
  /** Raw A2UI JSONL surfaces emitted by the assistant, if any. */
  a2uiSurfaces?: string[];
  /** YouTube videos rendered inline (via the render_youtube tool). */
  youtube?: ChatYouTubeVideo[];
  /** True while the assistant message is still streaming. */
  pending?: boolean;
  /**
   * What the assistant is doing right now, driven by real tool-call events off
   * the stream rather than a timer — so the thinking copy never claims work
   * that isn't happening.
   */
  thinkingStage?: ThinkingStage;
  /**
   * A2UI surfaces the model has announced but not yet delivered. The route
   * buffers tool arguments until the model stops talking, so this window can
   * last seconds; each outstanding surface renders a skeleton in its place.
   */
  pendingSurfaceCount?: number;
}

/** Coarse description of the assistant's current work, for the indicator copy. */
export type ThinkingStage = "thinking" | "sources" | "videos" | "surface";

/** The page the user warped in from — becomes the context chip. */
export interface PageContext {
  /** Human label, e.g. "Projects" or "Notes — From C to C++". */
  title: string;
  /** Pathname the chip links back to. */
  path: string;
}

/* ── A2UI (generative UI) ──────────────────────────────────────── */

/** A single declared component node in an A2UI surface (adjacency-list form). */
export interface A2UINode {
  id: string;
  component: string;
  props?: Record<string, unknown>;
  /** Child node ids, resolved against the surface's node map. */
  children?: string[];
}

/** Parsed state of one A2UI surface: node map + bound data model. */
export interface A2UIState {
  nodes: Record<string, A2UINode>;
  dataModel: Record<string, unknown>;
  /** Root node id (defaults to "root"). */
  rootId: string;
}

/** An action emitted by an A2UI component (e.g. a button) back to the agent. */
export interface A2UIAction {
  /** Send this text as a new chat turn. */
  sendMessage?: string;
  /** Navigate to this href instead (external or in-site). */
  href?: string;
}

export interface SpotifyTrack {
  isPlaying: boolean;
  title?: string;
  artist?: string;
  albumImageUrl?: string;
  songUrl?: string;
  progressMs?: number;
  durationMs?: number;
}

export interface SpotifyData {
  current: SpotifyTrack;
  previous?: SpotifyTrack;
}
