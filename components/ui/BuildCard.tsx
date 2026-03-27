"use client";

import Image from "next/image";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

interface AwardBadge {
  name: string;
  prize?: string;
}

interface BuildCardProps {
  name: string;
  description: string;
  techStack: string[];
  link?: string;
  isPrivate?: boolean;
  showAward?: boolean;
  awards?: AwardBadge[];
  subtitle?: string;
  date?: string;
  index: number;
  image?: string;
  icon?: string;
}

export default function BuildCard({
  name,
  description,
  techStack,
  link,
  isPrivate,
  awards,
  subtitle,
  date,
  index,
  image,
  icon,
}: BuildCardProps) {
  const hasAwards = awards && awards.length > 0;

  // Derive favicon URL from link if no icon provided
  const faviconUrl = icon
    ? icon
    : link
      ? `https://www.google.com/s2/favicons?domain=${new URL(link).hostname}&sz=32`
      : null;

  const cardContent = (
    <div className="group relative w-full aspect-[16/9] rounded-xl overflow-hidden border border-border bg-background">
      {/* Background image - clearer on hover */}
      {image && (
        <Image
          src={image}
          alt={`${name} preview`}
          fill
          className="object-cover object-center opacity-30 dark:opacity-20 transition-opacity duration-300 group-hover:opacity-80 dark:group-hover:opacity-60"
        />
      )}

      {/* Gradient overlay - loosens on hover to reveal image */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/60 to-background/20 transition-opacity duration-300 group-hover:opacity-40" />
      {/* Blur gradient - stronger blur at top where text lives, fades out toward bottom */}
      <div className="absolute inset-0 backdrop-blur-md [mask-image:linear-gradient(to_bottom,black_30%,transparent_70%)] transition-opacity duration-300 group-hover:opacity-0" />

      {/* Content - hides on hover only when there's a background image to reveal */}
      <div className={`relative z-10 h-full flex flex-col justify-between p-4 transition-opacity duration-300 ${image ? "group-hover:opacity-0" : ""}`}>
        {/* Top: favicon + title + description */}
        <div>
          <div className="flex items-center gap-2">
            {faviconUrl && (
              <Image
                src={faviconUrl}
                alt={`${name} icon`}
                width={20}
                height={20}
                className="rounded-sm shrink-0"
                unoptimized={faviconUrl.startsWith("http")}
              />
            )}
            <h3 className="font-semibold text-foreground text-base leading-tight">
              {name}
            </h3>
          </div>
          <p className="text-sm text-muted mt-1 line-clamp-2">{description}</p>
        </div>

        {/* Bottom - hides on hover so chips don't overlap */}
        <div className="flex items-end justify-between gap-2 transition-opacity duration-300 group-hover:opacity-0">
          {/* Bottom-left: subtitle + date chip */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(subtitle || date) && (
              <span className="text-xs px-2 py-1 rounded-md bg-background/80 backdrop-blur-sm text-foreground/80 border border-border/50">
                {subtitle}{subtitle && date && " · "}{date}
              </span>
            )}
            {isPrivate && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-background/80 backdrop-blur-sm border border-border/50 text-muted">
                private
              </span>
            )}
          </div>

          {/* Bottom-right: award badges */}
          {hasAwards && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {awards.map((award) => (
                <span
                  key={award.name}
                  title={award.prize ? `Prize: ${award.prize}` : undefined}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-foreground/5 dark:bg-foreground/10 backdrop-blur-sm border border-foreground/10 text-foreground/70"
                >
                  <span className="text-amber-500 text-[10px]">&#9670;</span>
                  {award.name}
                  {award.prize && (
                    <span className="text-foreground/40 ml-0.5">{award.prize}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hover: tech stack chips pinned to bottom-left */}
      {techStack.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pt-8 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="flex flex-wrap gap-1.5">
            {techStack.map((tech) => (
              <span
                key={tech}
                className="text-xs px-2 py-0.5 rounded-full bg-background/60 text-foreground/80 backdrop-blur-sm border border-border/40"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <FadeInOnScroll delay={index * 0.05}>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          {cardContent}
        </a>
      ) : (
        <div>{cardContent}</div>
      )}
    </FadeInOnScroll>
  );
}
