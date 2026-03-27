# TAB-44: Build Improvements Spec

## Overview
Comprehensive update to the portfolio's projects and hackathons sections: rename/update existing entries, add new projects, enhance hackathon award display with Devpost-style badges, and add screenshot thumbnails to all cards with live URLs.

---

## 1. Project Content Changes

### 1.1 Rename Mojo → Argue
- **Name:** `Argue`
- **Language:** `Swift, TypeScript` (multi-language)
- **Description:** `AI-powered screen time negotiation app — set limits through conversation, not restriction.` (sourced from landing page)
- **Link:** `https://argue-landing.vercel.app/`
- **isPrivate:** `false` (remove private flag)
- **Tech Stack:** `Swift, SwiftUI, TypeScript, Chrome Extension` (update to reflect iOS, Mac, Chrome platforms)
- **Date:** `2026` (updated from 2024)
- **Position:** Move to top of projects list (was 3rd)

### 1.2 Add Tabby (New)
- **Name:** `Tabby`
- **Language:** `Swift`
- **Description:** `Universal AI autocomplete for macOS — Cursor-like ghost text in every text field.`
- **Link:** `https://www.tabby-ai.com/`
- **isPrivate:** `false`
- **Tech Stack:** `Swift, macOS, Next.js` (app + website stacks combined)
- **Date:** `2026`
- **Position:** 1st in project list (above Argue)

### 1.3 Add drafted.college (New)
- **Name:** `drafted.college`
- **Language:** `TypeScript`
- **Description:** `AI-powered college essay editing platform — real-time feedback and draft management.`
- **Link:** `https://drafted.college`
- **isPrivate:** `false`
- **Tech Stack:** `TypeScript, Next.js, AI`
- **Date:** `2026`
- **Position:** 2nd in project list (after Tabby, before Argue)

### 1.4 Final Project Order
1. Tabby (new)
2. drafted.college (new)
3. Argue (renamed from Mojo, moved to top)
4. linkedin-semantic (existing)
5. typr (existing)
6. Comicgen (existing, stays private)

---

## 2. Hackathon Changes

### 2.1 Rename Spatial Computing → Orby
- **projectName:** `Orby` (was `Spatial Computing`)
- Everything else stays the same (name, icon, description, techStack, isWinner)

### 2.2 Add Award Badges
Replace the current `isWinner: boolean` + 🏆 emoji system with a new `awards?: string[]` field on the `Hackathon` interface. Award badges will render as Devpost-style pill badges using the portfolio's accent color.

**Award data per hackathon:**

| Hackathon | Project | Awards |
|-----------|---------|--------|
| DevFest 2026 | Opticon | `["Best Computer Use", "Best Use of K2 Think"]` |
| TreeHacks 2026 | Mira | `["Future of Commerce"]` |
| TreeHacks 2025 | OmNom | `["Most Creative Hack"]` |
| Bootstrapping Reality 2025 | Orby | `["Winner"]` (generic) |

### 2.3 Award Badge Design
- Styled as small pill badges (similar to existing tech stack pills)
- Use the portfolio's **accent color** consistently (no multi-color)
- Positioned near the hackathon name/subtitle area to be visible but not overpowering
- Fully replace the 🏆 emoji — no trophy icon, just the named badges
- Distinguish from tech stack pills visually (e.g., slightly different style like outline/filled variant)

---

## 3. Screenshot Thumbnails

### 3.1 BuildCard Component Update
Add optional `image?: string` prop to `BuildCard` for a thumbnail screenshot. Display as a small thumbnail (approx 120×80px) beside the existing text content, matching the portfolio's existing border/shadow patterns.

### 3.2 TypeScript Interface Updates
- `Project` interface: add `image?: string`
- `Hackathon` interface: add `image?: string` and `awards?: string[]`
- Keep `isWinner?: boolean` for backwards compatibility (or remove if fully replaced)

### 3.3 Screenshots to Capture
Capture hero/landing section screenshots from these live URLs:

**Projects:**
| Project | URL | Image path |
|---------|-----|------------|
| Tabby | https://www.tabby-ai.com/ | `/images/projects/tabby.png` |
| drafted.college | https://drafted.college | `/images/projects/drafted.png` |
| Argue | https://argue-landing.vercel.app/ | `/images/projects/argue.png` |
| linkedin-semantic | https://github.com/23jmo/linkedin-semantic | `/images/projects/linkedin-semantic.png` |
| typr | https://playtypr.com | `/images/projects/typr.png` |

**Hackathons (from Devpost):**
| Project | URL | Image path |
|---------|-----|------------|
| Opticon | https://devpost.com/software/opticon | `/images/hackathons/opticon.png` |
| Mira | https://devpost.com/software/mira-3xqlos | `/images/hackathons/mira.png` |
| OmNom | https://devpost.com/software/omnom-hg16v3 | `/images/hackathons/omnom.png` |

*Orby has no live URL — no screenshot.*
*Comicgen is private — no screenshot.*

### 3.4 Image Style
- Match existing portfolio patterns for borders/shadows
- Rounded corners consistent with other UI elements
- Responsive: scale appropriately on mobile (possibly stack below text on small screens)

---

## 4. Files to Modify

| File | Changes |
|------|---------|
| `types/index.ts` | Add `image?: string` to Project, add `awards?: string[]` and `image?: string` to Hackathon |
| `lib/content.ts` | Update Mojo→Argue, add Tabby + drafted.college, reorder projects, rename Spatial Computing→Orby, add awards arrays, add image paths |
| `components/ui/BuildCard.tsx` | Add `image` prop, render thumbnail, replace 🏆 with award badges, add `awards` prop |
| `components/sections/HackathonCardList.tsx` | Pass `awards` and `image` props to BuildCard |
| `components/sections/ProjectCardList.tsx` | Pass `image` prop to BuildCard |
| `public/images/projects/` | New directory with captured screenshots |
| `public/images/hackathons/` | New directory with captured screenshots |

---

## 5. Out of Scope
- No changes to the "Me" view IconCluster components
- No changes to the awards array in content.ts (those are standalone awards like Perfect PSAT)
- No changes to experiences, education, or social links
- No changes to blog or Spotify sections

---

## 6. Verification
1. Run `npm run build` to ensure no TypeScript errors
2. Visual check: all 6 projects display in correct order with correct data
3. Visual check: hackathon award badges render as accent-colored pills
4. Visual check: screenshot thumbnails display beside card text
5. Visual check: responsive layout works on mobile (thumbnails stack or hide)
6. Verify all external links work (Argue, Tabby, drafted.college, Devpost pages)
