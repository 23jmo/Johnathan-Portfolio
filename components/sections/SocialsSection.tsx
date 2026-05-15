import { socialLinks } from "@/lib/content";
import { IconCluster } from "@/components/ui/IconCluster";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function SocialsSection() {
  const clusterItems = socialLinks.map((social) => ({
    src: social.icon,
    alt: social.name,
    tooltipText: social.name,
    href: social.url,
  }));

  return (
    <FadeInOnScroll>
      <section>
        <p className="text-xl leading-relaxed text-foreground/90">
          I also post sometimes on <IconCluster items={clusterItems} />
        </p>
        <hr className="mt-8 border-t border-border" />
      </section>
    </FadeInOnScroll>
  );
}
