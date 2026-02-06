# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack
- Next.js 16+ (App Router) with TypeScript
- Tailwind CSS v4 with dark mode (class-based via `@custom-variant`, managed by next-themes)
- framer-motion for scroll animations
- next-mdx-remote + gray-matter for MDX blog
- Deployed on Vercel with serverless API routes

## Commands
- `npm run dev` — Start development server (localhost:3000)
- `npm run build` — Production build
- `npm run lint` — ESLint

## Project Structure
- `app/` — Next.js App Router (pages, layouts, API routes)
- `app/api/spotify/` — Serverless Spotify API proxy
- `app/blog/` — Blog listing and individual post pages
- `components/sections/` — Page section components (Hero, Experience, Projects, etc.)
- `components/ui/` — Reusable UI primitives (InlineLogo, ThemeToggle, CustomCursor, etc.)
- `lib/content.ts` — All site content data (experiences, projects, education, socials)
- `lib/spotify.ts` — Spotify API helpers (token refresh, now-playing, recently-played)
- `lib/blog.ts` — Blog post filesystem reader (MDX + frontmatter)
- `content/blog/` — MDX blog posts with YAML frontmatter
- `types/index.ts` — Shared TypeScript interfaces

## Key Patterns
- Content is centralized in `lib/content.ts` — update there for any experience/project/social changes
- Blog posts are `.mdx` files in `content/blog/` with frontmatter (title, date, excerpt)
- Dark mode uses CSS custom properties in `globals.css` (`:root` for light, `.dark` for dark)
- Tailwind v4 config is done via `@theme` and `@custom-variant` in `globals.css` (no tailwind.config.ts)
- Spotify widget polls `/api/spotify/now-playing` every 30s from the client
- All section components are server components except SpotifyNowPlaying, ThemeToggle, CustomCursor

## Environment Variables
Required in `.env.local` (see `.env.example`):
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`

## Constraints
- Do not run `npm run dev` or `npm start` without being asked
- Confirm absolute file paths before any write operations
- Use descriptive variable names
