import { hackathons } from "@/lib/content";
import { IconCluster } from "@/components/ui/IconCluster";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function HackathonsSection() {
  const hackathonItems = hackathons.map((h) => ({
    src: h.icon,
    alt: h.name,
    tooltipText: h.name,
    href: h.link,
    noRotation: true,
  }));

  return (
    <FadeInOnScroll>
      <section>
        <p className="text-xl leading-relaxed text-foreground/90">
          <strong>3x hackathon winner</strong>{" "}
          <IconCluster items={hackathonItems} />
        </p>
      </section>
    </FadeInOnScroll>
  );
}
