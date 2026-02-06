import { youtubeChannel } from "@/lib/content";
import { IconCluster } from "@/components/ui/IconCluster";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function YouTubeSection() {
  const youtubeIcon = [
    {
      src: "/icons/youtube.svg",
      alt: "YouTube",
      tooltipText: "YouTube",
      href: youtubeChannel,
    },
  ];

  return (
    <FadeInOnScroll>
      <section>
        <p className="text-xl leading-relaxed text-foreground/90">
          I make videos about CS, projects, and college life.{" "}
          <IconCluster items={youtubeIcon} />
        </p>
      </section>
    </FadeInOnScroll>
  );
}
