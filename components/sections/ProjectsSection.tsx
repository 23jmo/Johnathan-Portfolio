import { projects } from "@/lib/content";
import { IconCluster } from "@/components/ui/IconCluster";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

const projectColors = ["#3B82F6", "#10B981", "#F97316", "#A855F7"];

export default function ProjectsSection() {
  const clusterItems = projects.map((project, index) => ({
    src: project.logo || undefined,
    alt: project.name,
    tooltipText: `${project.name} — ${project.description}`,
    href: project.link || undefined,
    fallbackLetter: project.logo ? undefined : project.name[0].toUpperCase(),
    fallbackColor: project.logo
      ? undefined
      : projectColors[index % projectColors.length],
  }));

  return (
    <FadeInOnScroll>
      <section>
        <p className="text-xl leading-relaxed text-foreground/90">
          A few things I&apos;ve built: <IconCluster items={clusterItems} />
        </p>
      </section>
    </FadeInOnScroll>
  );
}
