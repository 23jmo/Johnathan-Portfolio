import { ctaLink } from "@/lib/content";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function CTAFooter() {
  return (
    <FadeInOnScroll>
      <section className="py-4">
        <p className="text-xl leading-relaxed text-foreground/90">
          Want to say hi? Want to sponsor a video? Need a dev for your company?{" "}
          <a
            href={ctaLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline underline-offset-2"
          >
            Let&apos;s chat &rarr;
          </a>
        </p>
      </section>
    </FadeInOnScroll>
  );
}
