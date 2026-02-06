import { experiences } from "@/lib/content";
import { IconCluster } from "@/components/ui/IconCluster";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function ExperienceSection() {
  const clusterItems = experiences.map((exp) => ({
    src: exp.logo,
    alt: exp.company,
    tooltipText: `${exp.title} @ ${exp.company}`,
    href: exp.link,
  }));

  return (
    <FadeInOnScroll>
      <section>
        <p className="text-xl leading-relaxed text-foreground/90">
          I&apos;ve built software across{" "}
          <IconCluster items={clusterItems} /> research labs, startups, and big
          tech.
        </p>
      </section>
    </FadeInOnScroll>
  );
}
