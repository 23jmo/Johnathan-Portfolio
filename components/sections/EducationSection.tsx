import { education } from "@/lib/content";
import { IconCluster } from "@/components/ui/IconCluster";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function EducationSection() {
  const columbiaIcon = [
    {
      src: education[0].logo,
      alt: education[0].school,
      tooltipText: `${education[0].school} — ${education[0].gpa} GPA`,
      href: education[0].link,
    },
  ];

  const umichIcon = [
    {
      src: education[1].logo,
      alt: education[1].school,
      tooltipText: `${education[1].school} — ${education[1].gpa} GPA`,
      href: education[1].link,
      scale: 0.6,
    },
  ];

  return (
    <FadeInOnScroll>
      <section>
        <p className="text-xl leading-relaxed text-foreground/90">
          I&apos;m studying <IconCluster items={columbiaIcon} />
          <strong>{education[0].degree}</strong> at{" "}
          <strong>{education[0].school}</strong>.
          Previously at <IconCluster items={umichIcon} />
          <strong>{education[1].school}</strong>.
        </p>
      </section>
    </FadeInOnScroll>
  );
}
