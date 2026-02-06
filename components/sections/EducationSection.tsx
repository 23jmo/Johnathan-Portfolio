import { education, youtubeChannel } from "@/lib/content";
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
      scale: education[1].logoScale,
      backgroundColor: education[1].logoBackground,
    },
  ];

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
          I&apos;m studying <strong>{education[0].degree}</strong> at{" "}
          <strong>{education[0].school}</strong> <IconCluster items={columbiaIcon} />,
          previously at <strong>{education[1].school}</strong> <IconCluster items={umichIcon} />,
          and I make videos about CS, projects, and college life <IconCluster items={youtubeIcon} />.
        </p>
      </section>
    </FadeInOnScroll>
  );
}
