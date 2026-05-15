import { IconCluster } from "@/components/ui/IconCluster";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function HeroSection() {
  const avatarIcon = [
    {
      src: "/images/avatar.jpeg",
      alt: "Johnathan Mo",
      tooltipText: "Johnathan Mo",
      noRotation: true,
    },
  ];

  const columbiaIcon = [
    {
      src: "/images/logos/columbia.svg",
      alt: "Columbia",
      tooltipText: "Columbia University",
    },
  ];

  return (
    <FadeInOnScroll>
      <section className="space-y-6">
        <h1 className="text-3xl sm:text-4xl leading-snug tracking-tight">
          Hi, I&apos;m <IconCluster items={avatarIcon} size={48} />{" "}
          <strong>Johnathan Mo</strong>{" "}
          <span className="text-muted">(Jmo)</span>.
        </h1>
        <p className="text-lg sm:text-xl leading-relaxed text-foreground/90">
          I&apos;m a CS student at <IconCluster items={columbiaIcon} />
          <strong>Columbia University</strong>. I love building software that
          solves real problems — from AR surgery tools to typing games.
        </p>
        <hr className="mt-8 border-t border-border" />
      </section>
    </FadeInOnScroll>
  );
}
