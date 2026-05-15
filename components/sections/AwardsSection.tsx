import { awards } from "@/lib/content";
import { IconCluster } from "@/components/ui/IconCluster";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function AwardsSection() {
  const awardItems = awards.map((award) => ({
    src: award.icon,
    alt: award.title,
    tooltipText: award.title,
    noRotation: true,
  }));

  return (
    <FadeInOnScroll>
      <section>
        <p className="text-xl leading-relaxed text-foreground/90">
          <IconCluster items={awardItems} />{" "}
          {awards.map((award, index) => (
            <span key={award.title}>
              {index > 0 && ", "}
              <strong>{award.title}</strong>
            </span>
          ))}
          .
        </p>
      </section>
    </FadeInOnScroll>
  );
}
